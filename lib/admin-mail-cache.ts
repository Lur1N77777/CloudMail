import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ParsedAttachment, ParsedMail } from "./api";

/**
 * 持久化缓存：保存 admin 模式下的 inbox/sendbox/unknown/spam 列表
 * 软件被杀掉后再次打开时，先从这里读出来立即显示，再走增量刷新。
 */

const CACHE_PREFIX = "cloudmail_admin_mail_cache_v1";
const MAX_CACHED_MAILS = 120;

export type AdminMailCacheKind = "inbox" | "sendbox" | "unknown" | "spam";

type SummaryAttachment = Pick<ParsedAttachment, "filename" | "mimeType" | "size">;

type SummaryMail = {
  id: number;
  messageId?: string;
  from?: { name?: string; address?: string };
  to?: { name?: string; address?: string }[];
  subject?: string;
  preview?: string;
  date?: string;
  attachments?: SummaryAttachment[];
  raw: string;
  createdAt: string;
  sourcePrefix?: string;
  ownerAddress?: string;
  mailboxKind?: "inbox" | "sendbox" | "unknown";
  metadata?: string;
};

type AdminMailCachePayload = {
  updatedAt: string;
  count: number;
  offset: number;
  mails: SummaryMail[];
};

function normalizeToken(value?: string) {
  return encodeURIComponent((value || "default").trim().toLowerCase());
}

function buildCacheKey(kind: AdminMailCacheKind, workerScope?: string) {
  return [CACHE_PREFIX, kind, normalizeToken(workerScope)].join(":");
}

const PREVIEW_MAX_LEN = 200;

function truncatePreview(text?: string): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > PREVIEW_MAX_LEN
    ? clean.slice(0, PREVIEW_MAX_LEN) + "…"
    : clean;
}

function toSummaryMail(mail: ParsedMail): SummaryMail {
  return {
    id: mail.id,
    messageId: mail.messageId,
    from: mail.from,
    to: mail.to,
    subject: mail.subject,
    preview: truncatePreview(mail.text) || truncatePreview(mail.html),
    date: mail.date,
    attachments: mail.attachments?.map(({ filename, mimeType, size }) => ({
      filename,
      mimeType,
      size,
    })),
    raw: "",
    createdAt: mail.createdAt,
    sourcePrefix: mail.sourcePrefix,
    ownerAddress: mail.ownerAddress,
    mailboxKind: mail.mailboxKind,
    metadata: mail.metadata,
  };
}

function toSummaryMails(mails: ParsedMail[]) {
  return mails.slice(0, MAX_CACHED_MAILS).map(toSummaryMail);
}

export interface AdminMailCacheEntry {
  count: number;
  offset: number;
  mails: ParsedMail[];
}

export async function readAdminMailCache(
  kind: AdminMailCacheKind,
  workerScope?: string
): Promise<AdminMailCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(buildCacheKey(kind, workerScope));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AdminMailCachePayload;
    if (!Array.isArray(parsed?.mails)) return null;

    const mails = parsed.mails
      .filter((item) => item && typeof item.id === "number")
      .map((item) => ({
        ...item,
        raw: item.raw || "",
        createdAt: item.createdAt || item.date || new Date().toISOString(),
      })) as ParsedMail[];

    return {
      count: typeof parsed.count === "number" ? parsed.count : mails.length,
      offset: typeof parsed.offset === "number" ? parsed.offset : mails.length,
      mails,
    };
  } catch {
    return null;
  }
}

export async function writeAdminMailCache(
  kind: AdminMailCacheKind,
  workerScope: string | undefined,
  entry: AdminMailCacheEntry
) {
  const payload: AdminMailCachePayload = {
    updatedAt: new Date().toISOString(),
    count: entry.count,
    offset: entry.offset,
    mails: toSummaryMails(entry.mails),
  };

  await AsyncStorage.setItem(buildCacheKey(kind, workerScope), JSON.stringify(payload));
}

export async function clearAdminMailCache(
  kind: AdminMailCacheKind,
  workerScope?: string
) {
  await AsyncStorage.removeItem(buildCacheKey(kind, workerScope));
}
