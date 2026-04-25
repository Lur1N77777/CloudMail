import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";

import type { ParsedMail } from "./api";
import { getMailBodyText, sanitizeMailHtml } from "./mail-parser";

type MailDownloadInput = Pick<ParsedMail, "id" | "subject" | "html" | "text" | "raw">;

export interface MailDownloadPayload {
  filename: string;
  content: string;
  extension: "html" | "txt";
  mimeType: string;
}

export interface MailDownloadResult extends MailDownloadPayload {
  uri?: string;
  localUri?: string;
  downloadUri?: string;
}

const DOWNLOAD_DIRECTORY_URI_KEY = "cloudmail_download_directory_uri";

function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function buildMailDownloadPayload(mail: MailDownloadInput): MailDownloadPayload {
  const htmlBody = sanitizeMailHtml(mail.html || "").trim();
  const textBody = getMailBodyText(mail).trim();
  const baseName = sanitizeFilenamePart(mail.subject || "") || `mail-${mail.id}`;

  if (htmlBody) {
    return {
      filename: `${baseName}.html`,
      content: htmlBody,
      extension: "html",
      mimeType: "text/html;charset=utf-8",
    };
  }

  return {
    filename: `${baseName}.txt`,
    content: textBody || "(无内容)",
    extension: "txt",
    mimeType: "text/plain;charset=utf-8",
  };
}

export async function downloadMailBody(mail: MailDownloadInput): Promise<MailDownloadResult> {
  return persistMailBody(mail, { saveToDownloads: true });
}

export async function shareMailBody(mail: MailDownloadInput): Promise<MailDownloadResult> {
  const result = await persistMailBody(mail, { saveToDownloads: false });

  if (Platform.OS === "web") {
    throw new Error("当前平台不支持系统分享");
  }

  const shareUri = result.localUri || result.uri;
  if (!shareUri) {
    throw new Error("未生成可分享的文件");
  }

  const Sharing = await import("expo-sharing");
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("当前设备不支持系统分享");
  }

  await Sharing.shareAsync(shareUri, {
    mimeType: normalizeMimeType(result.mimeType),
    dialogTitle: `分享 ${result.filename}`,
    UTI: result.extension === "html" ? "public.html" : "public.plain-text",
  });

  return result;
}

async function persistMailBody(
  mail: MailDownloadInput,
  options: { saveToDownloads: boolean }
): Promise<MailDownloadResult> {
  const payload = buildMailDownloadPayload(mail);

  if (Platform.OS === "web" && typeof document !== "undefined") {
    const blob = new Blob([payload.content], { type: payload.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return { ...payload };
  }

  const FileSystem = await import("expo-file-system/legacy");
  const localUri = await writeMailToLocalFile(FileSystem, payload);

  if (Platform.OS === "android" && options.saveToDownloads) {
    const directoryUri = await getAndroidDownloadDirectoryUri(FileSystem);
    const downloadUri = await createAndroidDownloadFileUri(
      FileSystem,
      directoryUri,
      payload.filename,
      payload.mimeType
    );

    await FileSystem.StorageAccessFramework.writeAsStringAsync(
      downloadUri,
      payload.content,
      {
        encoding: FileSystem.EncodingType.UTF8,
      }
    );

    return {
      ...payload,
      uri: downloadUri,
      localUri,
      downloadUri,
    };
  }

  return {
    ...payload,
    uri: localUri,
    localUri,
  };
}

export async function openMailFile(result: MailDownloadResult): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  const targetUri = result.localUri || result.uri;
  if (!targetUri) {
    throw new Error("未生成可打开的文件");
  }

  if (Platform.OS === "android") {
    const FileSystem = await import("expo-file-system/legacy");
    const IntentLauncher = await import("expo-intent-launcher");
    const contentUri = targetUri.startsWith("file://")
      ? await FileSystem.getContentUriAsync(targetUri)
      : targetUri;

    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      flags: 1,
      type: normalizeMimeType(result.mimeType),
    });
    return;
  }

  await Linking.openURL(targetUri);
}

async function getAndroidDownloadDirectoryUri(
  FileSystem: typeof import("expo-file-system/legacy")
): Promise<string> {
  const savedUri = await AsyncStorage.getItem(DOWNLOAD_DIRECTORY_URI_KEY);

  if (savedUri) {
    try {
      await FileSystem.StorageAccessFramework.readDirectoryAsync(savedUri);
      return savedUri;
    } catch {
      await AsyncStorage.removeItem(DOWNLOAD_DIRECTORY_URI_KEY).catch(() => undefined);
    }
  }

  const initialUri =
    FileSystem.StorageAccessFramework.getUriForDirectoryInRoot("Download");
  const permission =
    await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
      initialUri
    );

  if (!permission.granted) {
    throw new Error("未授予系统 Downloads 目录权限");
  }

  await AsyncStorage.setItem(
    DOWNLOAD_DIRECTORY_URI_KEY,
    permission.directoryUri
  );
  return permission.directoryUri;
}

async function createAndroidDownloadFileUri(
  FileSystem: typeof import("expo-file-system/legacy"),
  directoryUri: string,
  filename: string,
  mimeType: string
): Promise<string> {
  const attemptNames = buildAndroidDownloadNameCandidates(filename);
  let lastError: unknown;

  for (const name of attemptNames) {
    try {
      return await FileSystem.StorageAccessFramework.createFileAsync(
        directoryUri,
        name,
        mimeType
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("创建下载文件失败");
}

async function writeMailToLocalFile(
  FileSystem: typeof import("expo-file-system/legacy"),
  payload: MailDownloadPayload
): Promise<string> {
  const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!directory) {
    throw new Error("设备文件目录不可用");
  }

  const localUri = `${directory}${payload.filename}`;
  await FileSystem.writeAsStringAsync(localUri, payload.content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return localUri;
}

function buildAndroidDownloadNameCandidates(filename: string): string[] {
  const dotIndex = filename.lastIndexOf(".");
  const hasExtension = dotIndex > 0;
  const stem = hasExtension ? filename.slice(0, dotIndex) : filename;
  const extension = hasExtension ? filename.slice(dotIndex) : "";
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");

  return [
    filename,
    `${stem}-${timestamp}${extension}`,
    `${stem}-${Date.now()}${extension}`,
  ];
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim() || "application/octet-stream";
}
