import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ParsedAttachment, ParsedMail } from "./api";

const CACHE_PREFIX = "cloudmail_mail_cache_v1";
const MAX_CACHED_MAILS = 80;

type MailCacheBox = "inbox" | "sent";

type MailCacheKeyInput = {
  workerUrl?: string;
  address?: string;
  box: MailCacheBox;
};

type SerializableAttachment = Pick<
  ParsedAttachment,
  "filename" | "mimeType" | "size"
>;

type SerializableMail = Omit<ParsedMail, "attachments"> & {
  attachments?: SerializableAttachment[];
};

type MailCachePayload = {
  updatedAt: string;
  mails: SerializableMail[];
};

function normalizeToken(value?: string) {
  return encodeURIComponent((value || "").trim().toLowerCase());
}

function buildCacheKey(input: MailCacheKeyInput) {
  return [
    CACHE_PREFIX,
    input.box,
    normalizeToken(input.workerUrl),
    normalizeToken(input.address),
  ].join(":");
}

function toSerializableMail(mail: ParsedMail): SerializableMail {
  return {
    ...mail,
    attachments: mail.attachments?.map(({ filename, mimeType, size }) => ({
      filename,
      mimeType,
      size,
    })),
  };
}

function toSerializableMails(mails: ParsedMail[]) {
  return mails.slice(0, MAX_CACHED_MAILS).map(toSerializableMail);
}

export async function readMailboxCache(
  keyInput: MailCacheKeyInput
): Promise<ParsedMail[]> {
  try {
    const raw = await AsyncStorage.getItem(buildCacheKey(keyInput));
    if (!raw) return [];

    const parsed = JSON.parse(raw) as MailCachePayload;
    if (!Array.isArray(parsed?.mails)) return [];

    return parsed.mails
      .filter((item) => item && typeof item.id === "number")
      .map((item) => ({
        ...item,
        raw: item.raw || "",
        createdAt: item.createdAt || item.date || new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export async function writeMailboxCache(
  keyInput: MailCacheKeyInput,
  mails: ParsedMail[]
) {
  const payload: MailCachePayload = {
    updatedAt: new Date().toISOString(),
    mails: toSerializableMails(mails),
  };

  await AsyncStorage.setItem(buildCacheKey(keyInput), JSON.stringify(payload));
}
