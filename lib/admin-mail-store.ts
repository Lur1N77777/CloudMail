import type { ParsedMail } from "./api";

export interface AdminMailStoreEntry {
  mail: ParsedMail;
  kind: "inbox" | "sendbox" | "unknown";
}

const store = new Map<string, AdminMailStoreEntry>();

export function setAdminMailEntry(key: string, entry: AdminMailStoreEntry) {
  store.set(key, entry);
}

export function getAdminMailEntry(key: string) {
  return store.get(key);
}

export function removeAdminMailEntry(key: string) {
  store.delete(key);
}
