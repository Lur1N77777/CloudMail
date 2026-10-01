import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ParsedAttachment, ParsedMail } from "./api";
import { parseMail } from "./mail-parser";

const CACHE_PREFIX = "cloudmail_mail_cache_v2";
const MAX_CACHED_MAILS = 120;
const PARSER_VERSION = 1;

type MailCacheBox = "inbox" | "sent";

type MailCacheKeyInput = {
  workerUrl?: string;
  address?: string;
  box: MailCacheBox;
};

type SummaryAttachment = Pick<ParsedAttachment, "filename" | "mimeType" | "size">;

type SummaryMail = {
  id: number;
  messageId?: string;
  from?: { name?: string; address?: string };
  to?: { name?: string; address?: string }[];
  subject?: string;
  preview?: string;
  text?: string;
  html?: string;
  date?: string;
  attachments?: SummaryAttachment[];
  raw: string;
  createdAt: string;
  sourcePrefix?: string;
  ownerAddress?: string;
  mailboxKind?: "inbox" | "sendbox" | "unknown";
  metadata?: string;
};

type MailCachePayload = {
  parserVersion?: number;
  updatedAt: string;
  mails: SummaryMail[];
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

function buildCandidateCacheKeys(input: MailCacheKeyInput) {
  const primaryKey = buildCacheKey(input);
  const keys = [primaryKey];
  if ((input.workerUrl || "").trim()) {
    const legacyWorkerKey = buildCacheKey({ ...input, workerUrl: "" });
    if (legacyWorkerKey !== primaryKey) keys.push(legacyWorkerKey);
  }
  return keys;
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
    text: mail.text,
    html: mail.html,
    date: mail.date,
    attachments: mail.attachments?.map(({ filename, mimeType, size }) => ({
      filename,
      mimeType,
      size,
    })),
    raw: mail.raw || "",
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

export async function readMailboxCache(
  keyInput: MailCacheKeyInput
): Promise<ParsedMail[]> {
  try {
    const [primaryKey, ...fallbackKeys] = buildCandidateCacheKeys(keyInput);
    let raw = await AsyncStorage.getItem(primaryKey);
    if (!raw) {
      for (const fallbackKey of fallbackKeys) {
        raw = await AsyncStorage.getItem(fallbackKey);
        if (raw) {
          await AsyncStorage.setItem(primaryKey, raw).catch(() => undefined);
          break;
        }
      }
    }
    if (!raw) return [];

    const parsed = JSON.parse(raw) as MailCachePayload;
    if (!Array.isArray(parsed?.mails)) return [];

    const mails: ParsedMail[] = parsed.mails
      .filter((item) => item && typeof item.id === "number")
      .map((item) => ({
        ...item,
        text: item.text || item.preview || undefined,
        html: item.html || undefined,
        raw: item.raw || "",
        createdAt: item.createdAt || item.date || new Date().toISOString(),
      }));

    if (parsed.parserVersion !== PARSER_VERSION) {
      // Keep cached IDs and sync anchors intact; repair bodies from their original MIME.
      const repaired = await Promise.all(mails.map(async (mail) => {
        if (!mail.raw) return mail;
        const decoded = await parseMail({
          id: mail.id,
          message_id: mail.messageId,
          source: "",
          raw: mail.raw,
          created_at: mail.createdAt,
          address: mail.ownerAddress,
          subject: mail.subject,
          metadata: mail.metadata,
        });
        return {
          ...mail,
          ...decoded,
          from: decoded.from || mail.from,
          to: decoded.to?.length ? decoded.to : mail.to,
          attachments: decoded.attachments || mail.attachments,
        };
      }));
      await writeMailboxCache(keyInput, repaired).catch(() => undefined);
      return repaired;
    }

    return mails;
  } catch {
    return [];
  }
}

export async function writeMailboxCache(
  keyInput: MailCacheKeyInput,
  mails: ParsedMail[]
) {
  const payload: MailCachePayload = {
    parserVersion: PARSER_VERSION,
    updatedAt: new Date().toISOString(),
    mails: toSummaryMails(mails),
  };

  await AsyncStorage.setItem(buildCacheKey(keyInput), JSON.stringify(payload));
}
