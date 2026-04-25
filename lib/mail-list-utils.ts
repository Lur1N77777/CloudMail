import type { ParsedMail } from "./api";

export function sortMailsDesc(mails: ParsedMail[]) {
  return [...mails].sort((a, b) => {
    const da = new Date(a.date || a.createdAt).getTime();
    const db = new Date(b.date || b.createdAt).getTime();
    return db - da;
  });
}

export function mergeMailLists(existing: ParsedMail[], incoming: ParsedMail[]) {
  const merged = new Map<number, ParsedMail>();

  for (const mail of existing) {
    merged.set(mail.id, mail);
  }

  for (const mail of incoming) {
    merged.set(mail.id, mail);
  }

  return sortMailsDesc(Array.from(merged.values()));
}
