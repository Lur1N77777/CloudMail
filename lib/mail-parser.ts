import PostalMime from "postal-mime";

import type { ParsedAttachment, ParsedMail, RawMail } from "./api";

type Mailbox = NonNullable<ParsedMail["to"]>[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizePlainText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function decodeHeaderQuotedPrintableToBytes(value: string): Uint8Array {
  const normalized = value.replace(/_/g, " ");
  const bytes: number[] = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "=" && /[0-9A-Fa-f]{2}/.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(normalized.charCodeAt(index));
    }
  }

  return new Uint8Array(bytes);
}

function decodeMimeWords(value?: string): string {
  if (!value) return "";

  const normalized = value.replace(/(\?=)\s+(=\?)/g, "$1$2");
  const decoded = normalized.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (match, charset: string, encoding: string, payload: string) => {
      try {
        const bytes =
          encoding.toUpperCase() === "B"
            ? base64ToBytes(payload)
            : decodeHeaderQuotedPrintableToBytes(payload);
        return decodeBytesToText(bytes, charset);
      } catch {
        return match;
      }
    }
  );

  return normalizePlainText(decoded) || value;
}

function sanitizeMailHtml(html: string): string {
  if (!html) return "";

  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[^>]*>[\s\S]*?<\/embed>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1="#"');
}

export function stripHtmlToText(html: string): string {
  if (!html) return "";

  return normalizePlainText(
    decodeHtmlEntities(
      html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)>/gi, "\n")
        .replace(/<li[^>]*>/gi, "• ")
        .replace(/<\/td>\s*<td[^>]*>/gi, " | ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function looksLikeJsonPayload(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function looksLikeMimeSource(value?: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /(^|\n)(from|subject|to|date|content-type|mime-version):/i.test(trimmed);
}

function splitAddressHeader(value: string): string[] {
  const items: string[] = [];
  let current = "";
  let inQuote = false;
  let angleDepth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (char === '"' && value[index - 1] !== "\\") {
      inQuote = !inQuote;
      current += char;
      continue;
    }

    if (!inQuote) {
      if (char === "<") {
        angleDepth += 1;
      } else if (char === ">" && angleDepth > 0) {
        angleDepth -= 1;
      } else if ((char === "," || char === ";") && angleDepth === 0) {
        if (current.trim()) items.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) items.push(current.trim());
  return items;
}

function parseMailboxValue(value?: string): Mailbox | undefined {
  if (!value) return undefined;

  const cleaned = normalizePlainText(value.replace(/\s+/g, " "));
  if (!cleaned) return undefined;

  const angleMatch = cleaned.match(/^(.*?)(?:<([^>]+)>)/);
  if (angleMatch?.[2]) {
    const address = angleMatch[2].trim();
    const name = decodeMimeWords(angleMatch[1].replace(/^["']|["']$/g, "").trim());
    return {
      address,
      name: name && name !== address ? name : undefined,
    };
  }

  const addressMatch = cleaned.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (addressMatch?.[0]) {
    const address = addressMatch[0].trim();
    const name = decodeMimeWords(
      cleaned.replace(addressMatch[0], "").replace(/[<>()"']/g, "").trim()
    );
    return {
      address,
      name: name && name !== address ? name : undefined,
    };
  }

  return { name: decodeMimeWords(cleaned) };
}

function parseAddressList(value?: string): Mailbox[] {
  if (!value) return [];

  const seen = new Set<string>();
  const results: Mailbox[] = [];

  for (const item of splitAddressHeader(value)) {
    const mailbox = parseMailboxValue(item);
    const dedupeKey = mailbox?.address || mailbox?.name;
    if (!mailbox || !dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push(mailbox);
  }

  return results;
}

function extractHeaderValue(raw: string, headerName: string): string {
  const pattern = new RegExp(
    `^${headerName}:\\s*([\\s\\S]*?)(?:\\r?\\n(?![ \\t])|$)`,
    "im"
  );
  const match = raw.match(pattern);
  if (!match?.[1]) return "";
  return match[1].replace(/\r?\n[ \t]+/g, " ").trim();
}

function toArrayBuffer(value: unknown): ArrayBuffer | undefined {
  if (value instanceof ArrayBuffer) return value;

  if (typeof Uint8Array !== "undefined" && value instanceof Uint8Array) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    return copy.buffer;
  }

  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copy.buffer;
  }

  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
  }

  return undefined;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;

    const triple = (a << 16) | (b << 8) | c;

    output += chars[(triple >> 18) & 63];
    output += chars[(triple >> 12) & 63];
    output += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : "=";
    output += i + 2 < bytes.length ? chars[triple & 63] : "=";
  }

  return output;
}

function base64ToBytes(value: string): Uint8Array {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const cleaned = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = cleaned.padEnd(Math.ceil(cleaned.length / 4) * 4, "=");
  const output: number[] = [];

  for (let index = 0; index < padded.length; index += 4) {
    const c1 = chars.indexOf(padded[index] || "A");
    const c2 = chars.indexOf(padded[index + 1] || "A");
    const c3 = padded[index + 2] === "=" ? -1 : chars.indexOf(padded[index + 2] || "A");
    const c4 = padded[index + 3] === "=" ? -1 : chars.indexOf(padded[index + 3] || "A");

    if (c1 < 0 || c2 < 0 || c3 < -1 || c4 < -1) {
      throw new Error("Invalid base64 content");
    }

    const triple =
      (c1 << 18) |
      (c2 << 12) |
      ((c3 < 0 ? 0 : c3) << 6) |
      (c4 < 0 ? 0 : c4);

    output.push((triple >> 16) & 0xff);
    if (c3 >= 0) output.push((triple >> 8) & 0xff);
    if (c4 >= 0) output.push(triple & 0xff);
  }

  return new Uint8Array(output);
}

function splitHeaderAndBody(raw: string): { headersText: string; bodyText: string } {
  const separator = raw.match(/\r?\n\r?\n/);
  if (!separator) {
    return { headersText: "", bodyText: raw };
  }
  const index = raw.indexOf(separator[0]);
  return {
    headersText: raw.slice(0, index),
    bodyText: raw.slice(index + separator[0].length),
  };
}

function parseHeaders(headersText: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!headersText.trim()) return headers;

  const unfolded = headersText.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }
  return headers;
}

function parseHeaderParam(headerValue: string, name: string): string {
  const match = headerValue.match(
    new RegExp(`${name}\\s*=\\s*(?:"([^"]+)"|([^;]+))`, "i")
  );
  return (match?.[1] || match?.[2] || "").trim();
}

function decodeBytesToText(bytes: Uint8Array, charset?: string): string {
  const normalizedCharset = (charset || "utf-8").trim().replace(/^"|"$/g, "");
  try {
    return new TextDecoder(normalizedCharset as any).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return String.fromCharCode(...bytes);
    }
  }
}

function decodeQuotedPrintableToBytes(value: string): Uint8Array {
  const normalized = value.replace(/=\r?\n/g, "");
  const bytes: number[] = [];

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "=" && /[0-9A-Fa-f]{2}/.test(normalized.slice(index + 1, index + 3))) {
      bytes.push(parseInt(normalized.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(normalized.charCodeAt(index));
    }
  }

  return new Uint8Array(bytes);
}

function decodeMimeBody(
  bodyText: string,
  contentTransferEncoding: string,
  contentType: string
): string {
  const charset = parseHeaderParam(contentType, "charset") || "utf-8";
  const encoding = contentTransferEncoding.toLowerCase();

  if (encoding.includes("base64")) {
    try {
      return normalizePlainText(decodeBytesToText(base64ToBytes(bodyText), charset));
    } catch {
      return normalizePlainText(bodyText);
    }
  }

  if (encoding.includes("quoted-printable")) {
    return normalizePlainText(
      decodeBytesToText(decodeQuotedPrintableToBytes(bodyText), charset)
    );
  }

  return normalizePlainText(bodyText);
}

function looksLikeHeaderDump(text: string): boolean {
  const sample = text.slice(0, 600);
  return /(^|\n)(dkim-signature|return-path|received|content-type|mime-version|content-transfer-encoding):/i.test(
    sample
  );
}

function splitMultipartBody(bodyText: string, boundary: string): string[] {
  if (!boundary) return [];

  const normalized = bodyText.replace(/\r\n/g, "\n");
  const marker = `--${boundary}`;
  const endMarker = `--${boundary}--`;
  const segments: string[] = [];

  let cursor = normalized.indexOf(marker);
  while (cursor >= 0) {
    cursor += marker.length;
    if (normalized.startsWith("--", cursor)) break;
    if (normalized[cursor] === "\n") cursor += 1;
    const next = normalized.indexOf(`\n${marker}`, cursor);
    const end = next >= 0 ? next : normalized.indexOf(endMarker, cursor);
    const chunk = normalized.slice(cursor, end >= 0 ? end : undefined).trim();
    if (chunk) segments.push(chunk);
    if (next < 0) break;
    cursor = next + 1;
  }

  return segments;
}

function isAttachmentPart(headers: Record<string, string>): boolean {
  const disposition = headers["content-disposition"] || "";
  const contentType = headers["content-type"] || "";
  return /attachment/i.test(disposition) || /name\s*=/i.test(contentType);
}

function extractMimeContentFallback(raw: string): {
  html?: string;
  text?: string;
  headers: Record<string, string>;
} {
  const { headersText, bodyText } = splitHeaderAndBody(raw);
  const headers = parseHeaders(headersText);
  const contentType = headers["content-type"] || "";
  const transferEncoding = headers["content-transfer-encoding"] || "";

  if (/multipart\//i.test(contentType)) {
    const boundary = parseHeaderParam(contentType, "boundary");
    if (boundary) {
      let html = "";
      let text = "";
      for (const segment of splitMultipartBody(bodyText, boundary)) {
        const part = extractMimeContentFallback(segment);
        if (!html && part.html) html = part.html;
        if (!text && part.text) text = part.text;
        if (html && text) break;
      }
      return { html, text, headers };
    }
  }

  if (isAttachmentPart(headers)) {
    return { headers };
  }

  const decodedBody = decodeMimeBody(bodyText, transferEncoding, contentType);
  if (/text\/html/i.test(contentType)) {
    return {
      html: sanitizeMailHtml(decodedBody),
      text: stripHtmlToText(decodedBody),
      headers,
    };
  }

  if (/text\/plain/i.test(contentType)) {
    return {
      text: decodedBody,
      headers,
    };
  }

  if (/<[a-z][\s\S]*>/i.test(decodedBody)) {
    return {
      html: sanitizeMailHtml(decodedBody),
      text: stripHtmlToText(decodedBody),
      headers,
    };
  }

  return {
    text: decodedBody,
    headers,
  };
}

function replaceCidSources(
  html: string,
  attachments: ParsedAttachment[]
): string {
  if (!html || attachments.length === 0) return html;

  let nextHtml = html;
  for (const attachment of attachments) {
    const contentId = attachment.filename?.startsWith("cid:")
      ? attachment.filename.slice(4)
      : undefined;
    const bytes = attachment.content;
    if (!bytes) continue;

    const mimeType = attachment.mimeType || "application/octet-stream";
    const base64 = arrayBufferToBase64(bytes);
    const dataUri = `data:${mimeType};base64,${base64}`;

    if (contentId) {
      const escaped = contentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      nextHtml = nextHtml.replace(
        new RegExp(`cid:${escaped}`, "gi"),
        dataUri
      );
    }
  }

  return nextHtml;
}

function mapAttachments(rawAttachments: unknown[]): ParsedAttachment[] {
  return rawAttachments
    .map((attachment: any) => {
      const content = toArrayBuffer(attachment?.content);
      const filename =
        attachment?.filename ||
        attachment?.contentId ||
        attachment?.content_id ||
        "attachment";

      return {
        filename,
        mimeType:
          attachment?.mimeType ||
          attachment?.mime_type ||
          attachment?.content_type ||
          "application/octet-stream",
        content,
        size:
          attachment?.size ||
          (content ? content.byteLength : undefined),
      } satisfies ParsedAttachment;
    })
    .filter((attachment) => !!attachment.filename);
}

function parseSendPayload(rawMail: RawMail): ParsedMail | null {
  const rawContent = rawMail.raw || rawMail.source || "";
  if (!looksLikeJsonPayload(rawContent)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(rawContent);
  } catch {
    return null;
  }

  if (!isRecord(payload)) return null;

  const hasSendLikeShape =
    payload.version === "v2" ||
    "to_mail" in payload ||
    "personalizations" in payload ||
    "content" in payload ||
    "from_mail" in payload;

  if (!hasSendLikeShape) return null;

  const to: Mailbox[] = [];
  const directRecipient = parseMailboxValue(
    typeof payload.to_mail === "string"
      ? payload.to_name
        ? `${payload.to_name} <${payload.to_mail}>`
        : payload.to_mail
      : ""
  );
  if (directRecipient) {
    to.push(directRecipient);
  }

  if (Array.isArray(payload.personalizations)) {
    for (const personalization of payload.personalizations) {
      if (!isRecord(personalization) || !Array.isArray(personalization.to)) continue;
      for (const recipient of personalization.to) {
        if (!isRecord(recipient)) continue;
        const mailbox = parseMailboxValue(
          typeof recipient.email === "string"
            ? recipient.name
              ? `${recipient.name} <${recipient.email}>`
              : recipient.email
            : ""
        );
        if (mailbox) {
          const exists = to.some(
            (item) => item.address && item.address === mailbox.address
          );
          if (!exists) to.push(mailbox);
        }
      }
    }
  }

  const from = parseMailboxValue(
    isRecord(payload.from)
      ? typeof payload.from.email === "string"
        ? payload.from.name
          ? `${payload.from.name} <${payload.from.email}>`
          : payload.from.email
        : rawMail.address || ""
      : typeof payload.from_mail === "string"
        ? payload.from_name
          ? `${payload.from_name} <${payload.from_mail}>`
          : payload.from_mail
        : typeof payload.from_name === "string" && rawMail.address
          ? `${payload.from_name} <${rawMail.address}>`
        : rawMail.address || ""
  );

  let html = "";
  let text = "";

  if (typeof payload.content === "string") {
    if (payload.is_html === true) {
      html = payload.content;
      text = stripHtmlToText(payload.content);
    } else {
      text = payload.content;
    }
  } else if (Array.isArray(payload.content)) {
    const htmlBlock = payload.content.find(
      (item) =>
        isRecord(item) &&
        typeof item.type === "string" &&
        item.type.toLowerCase() === "text/html"
    ) as Record<string, unknown> | undefined;
    const textBlock = payload.content.find(
      (item) =>
        isRecord(item) &&
        typeof item.type === "string" &&
        item.type.toLowerCase() === "text/plain"
    ) as Record<string, unknown> | undefined;

    html = typeof htmlBlock?.value === "string" ? htmlBlock.value : "";
    text = typeof textBlock?.value === "string" ? textBlock.value : "";

    if (!text && html) {
      text = stripHtmlToText(html);
    }
  }

  return {
    id: rawMail.id,
    messageId: rawMail.message_id,
    from,
    to,
    subject:
      decodeMimeWords(
        (typeof payload.subject === "string" && payload.subject.trim()) || rawMail.subject
      ) ||
      "(无主题)",
    text: normalizePlainText(text),
    html: sanitizeMailHtml(html),
    raw: rawContent,
    createdAt: rawMail.created_at,
    date: rawMail.created_at,
    ownerAddress: rawMail.address,
    metadata: rawMail.metadata,
  };
}

export function getMailBodyText(
  mail: Pick<ParsedMail, "text" | "html" | "raw">
): string {
  const text = normalizePlainText(mail.text || "");
  if (text) return text;

  const htmlText = stripHtmlToText(mail.html || "");
  if (htmlText) return htmlText;

  return normalizePlainText(mail.raw || "");
}

export function formatMailboxDisplay(
  mailbox?: Mailbox | ParsedMail["from"],
  options: { addressFirst?: boolean } = {}
): string {
  const name = mailbox?.name?.trim();
  const address = mailbox?.address?.trim();

  if (name && address && name !== address) {
    return options.addressFirst
      ? `${address} · ${name}`
      : `${name} <${address}>`;
  }

  return address || name || "";
}

export function getMailRecipientsDisplay(
  mail: Pick<ParsedMail, "to" | "ownerAddress" | "mailboxKind">,
  options: { preferOwnerAddress?: boolean; addressFirst?: boolean } = {}
): string {
  if (options.preferOwnerAddress && mail.ownerAddress) {
    return mail.ownerAddress;
  }

  const recipients = (mail.to || [])
    .map((item) => formatMailboxDisplay(item, { addressFirst: options.addressFirst }))
    .filter(Boolean);

  if (recipients.length > 0) {
    return recipients.join(", ");
  }

  return mail.ownerAddress || "";
}

function parseMimeMail(rawMail: RawMail): ParsedMail {
  const rawCandidate = rawMail.raw || "";
  const sourceCandidate = rawMail.source || "";
  const rawContent = looksLikeMimeSource(rawCandidate)
    ? rawCandidate
    : looksLikeMimeSource(sourceCandidate)
      ? sourceCandidate
      : rawCandidate || sourceCandidate;

  const fallbackFromHeader = extractHeaderValue(rawContent, "From");
  const fallbackToHeader = extractHeaderValue(rawContent, "To");
  const fallbackFrom =
    parseMailboxValue(fallbackFromHeader) ||
    (!looksLikeMimeSource(sourceCandidate) ? parseMailboxValue(sourceCandidate) : undefined);
  const fallbackTo = parseAddressList(fallbackToHeader);

  const fallbackSubject = decodeMimeWords(
    extractHeaderValue(rawContent, "Subject") || rawMail.subject || "(无主题)"
  );
  const fallbackDate = extractHeaderValue(rawContent, "Date") || rawMail.created_at;
  const fallbackContent = extractMimeContentFallback(rawContent);
  const fallbackHtml = sanitizeMailHtml(fallbackContent.html || "");
  const fallbackText = normalizePlainText(
    fallbackContent.text || stripHtmlToText(fallbackHtml) || rawContent
  );

  return {
    id: rawMail.id,
    messageId: rawMail.message_id,
    from: fallbackFrom,
    to: fallbackTo,
    subject: fallbackSubject,
    text: fallbackText,
    html: fallbackHtml,
    raw: rawContent,
    createdAt: rawMail.created_at,
    date: fallbackDate,
    ownerAddress: rawMail.address,
    metadata: rawMail.metadata,
  };
}

/**
 * Parse raw email content.
 *
 * - 收件邮件：优先按 RFC822/MIME 解析
 * - 发件箱记录：自动识别官方前端使用的 JSON raw 结构（v2 / sendgrid 风格）
 */
export async function parseMail(rawMail: RawMail): Promise<ParsedMail> {
  const sendPayload = parseSendPayload(rawMail);
  if (sendPayload) {
    return sendPayload;
  }

  const rawCandidate = rawMail.raw || "";
  const sourceCandidate = rawMail.source || "";
  const rawContent = looksLikeMimeSource(rawCandidate)
    ? rawCandidate
    : looksLikeMimeSource(sourceCandidate)
      ? sourceCandidate
      : rawCandidate || sourceCandidate;

  if (!rawContent) {
    return {
      id: rawMail.id,
      subject: rawMail.subject || "(无内容)",
      text: "",
      html: "",
      raw: "",
      createdAt: rawMail.created_at,
      ownerAddress: rawMail.address,
      metadata: rawMail.metadata,
    };
  }

  try {
    const parser = new PostalMime();
    const parsed: any = await parser.parse(rawContent);

    const attachments = mapAttachments(Array.isArray(parsed.attachments) ? parsed.attachments : []);
    let html = replaceCidSources(
      sanitizeMailHtml(typeof parsed.html === "string" ? parsed.html : ""),
      attachments
    );
    let text = normalizePlainText(typeof parsed.text === "string" ? parsed.text : "");
    const parsedTo = Array.isArray(parsed.to)
      ? parsed.to
          .map((item: any) =>
            parseMailboxValue(
              typeof item?.address === "string"
                ? item?.name
                  ? `${item.name} <${item.address}>`
                  : item.address
                : ""
            )
          )
          .filter(Boolean) as Mailbox[]
      : [];

    const fallbackFromHeader = extractHeaderValue(rawContent, "From");
    const fallbackToHeader = extractHeaderValue(rawContent, "To");
    const mimeFallback = (!html && !text) || looksLikeHeaderDump(text)
      ? extractMimeContentFallback(rawContent)
      : null;

    if (mimeFallback) {
      if (!html && mimeFallback.html) {
        html = sanitizeMailHtml(mimeFallback.html);
      }
      if (
        (!text || looksLikeHeaderDump(text)) &&
        (mimeFallback.text || html)
      ) {
        text = normalizePlainText(
          mimeFallback.text || stripHtmlToText(html)
        );
      }
    }

    return {
      id: rawMail.id,
      messageId:
        (typeof parsed.messageId === "string" && parsed.messageId) ||
        rawMail.message_id,
      from:
        parseMailboxValue(
          typeof parsed?.from?.address === "string"
            ? parsed?.from?.name
              ? `${parsed.from.name} <${parsed.from.address}>`
              : parsed.from.address
            : ""
        ) ||
        parseMailboxValue(fallbackFromHeader) ||
        (!looksLikeMimeSource(sourceCandidate) ? parseMailboxValue(sourceCandidate) : undefined),
      to: parsedTo.length > 0 ? parsedTo : parseAddressList(fallbackToHeader),
      subject:
        decodeMimeWords(
          (typeof parsed.subject === "string" && parsed.subject.trim()) ||
            rawMail.subject ||
            extractHeaderValue(rawContent, "Subject")
        ) ||
        "(无主题)",
      text,
      html,
      date:
        (typeof parsed.date === "string" && parsed.date) ||
        extractHeaderValue(rawContent, "Date") ||
        rawMail.created_at,
      attachments,
      raw: rawContent,
      createdAt: rawMail.created_at,
      ownerAddress: rawMail.address,
      metadata: rawMail.metadata,
    };
  } catch {
    return parseMimeMail(rawMail);
  }
}

export async function parseMailBatch(rawMails: RawMail[]): Promise<ParsedMail[]> {
  return Promise.all(rawMails.map(parseMail));
}

export function getMailPreview(mail: ParsedMail, maxLength: number = 100): string {
  const text = getMailBodyText(mail);
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength).trim()}...`;
}

function getAiExtractCode(mail: Pick<ParsedMail, "metadata">): string | null {
  if (!mail.metadata) return null;

  try {
    const parsed = JSON.parse(mail.metadata);
    const aiExtract = isRecord(parsed?.ai_extract)
      ? parsed.ai_extract
      : typeof parsed?.ai_extract === "string"
        ? JSON.parse(parsed.ai_extract)
        : null;

    if (!isRecord(aiExtract)) return null;

    const type = typeof aiExtract.type === "string" ? aiExtract.type : "";
    const result = typeof aiExtract.result === "string" ? aiExtract.result.trim() : "";
    const resultText =
      typeof aiExtract.result_text === "string"
        ? aiExtract.result_text.trim()
        : "";

    if (type === "auth_code" && result) return result;

    const merged = [result, resultText].filter(Boolean).join(" ");
    if (!merged) return null;
    const match = merged.match(/\b[A-Z0-9]{4,8}\b/i);
    return match?.[0]?.toUpperCase() || null;
  } catch {
    return null;
  }
}

export function getVerificationCode(mail: ParsedMail): string | null {
  const aiCode = getAiExtractCode(mail);
  if (aiCode) return aiCode.toUpperCase();

  const bodyText = getMailBodyText(mail);
  const corpus = [mail.subject || "", bodyText].filter(Boolean).join("\n");
  const directSources = [bodyText, mail.subject || ""];
  const directPatterns = [
    /(?:验证码|校验码|动态码|动态密码|验证代码|登录码|安全码)\s*(?:是|为|:|：)?\s*([A-Z0-9]{4,8})/i,
    /(?:verification code|security code|one[- ]?time code|login code|passcode|otp)(?:\s+is|\s*[:：-])\s*([A-Z0-9]{4,8})/i,
  ];

  for (const source of directSources) {
    for (const pattern of directPatterns) {
      const directMatch = source.match(pattern);
      if (directMatch?.[1]) {
        return directMatch[1].toUpperCase();
      }
    }
  }

  if (
    /(验证码|校验码|动态码|verification|security code|one[- ]?time|passcode|otp)/i.test(
      corpus
    )
  ) {
    const candidates = corpus.match(/\b[A-Z0-9]{4,8}\b/gi) || [];
    const preferred = candidates.find((item) => /\d/.test(item));
    if (preferred) return preferred.toUpperCase();
    if (candidates[0]) return candidates[0].toUpperCase();
  }

  return null;
}

export function formatMailDate(dateStr?: string): string {
  if (!dateStr) return "";

  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;

    return date.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return dateStr;
  }
}

export function getSenderDisplay(mail: ParsedMail): string {
  if (mail.from?.name) return mail.from.name;
  if (mail.from?.address) return mail.from.address;
  if (!mail.mailboxKind || mail.mailboxKind === "sendbox") {
    return mail.ownerAddress || "未知发件人";
  }
  return "未知发件人";
}

export { sanitizeMailHtml };
