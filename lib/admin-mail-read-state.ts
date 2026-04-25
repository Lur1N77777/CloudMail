import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ParsedMail } from "./api";
import { sha256Hex } from "./sha256";

type AdminMailReadStatus = "read" | "unread";

type AdminMailReadEntry = {
  status: AdminMailReadStatus;
  firstSeenAt: number;
  updatedAt: number;
  mailAt: number;
  explicitReadAt?: number;
};

type AdminMailReadBaseline = {
  initializedAt: number;
  latestMailAt: number;
};

type AdminMailReadStore = {
  version: 1;
  entries: Record<string, AdminMailReadEntry>;
  baselines: Record<string, AdminMailReadBaseline>;
};

type AdminMailReadStateEvent = {
  workerUrl: string;
  unreadKeys: Set<string>;
};

const STORAGE_PREFIX = "cloudmail_admin_mail_read_state_v1";
const MAX_ENTRIES = 2000;

const storeCache = new Map<string, AdminMailReadStore>();
const storeLocks = new Map<string, Promise<unknown>>();
const listeners = new Set<(event: AdminMailReadStateEvent) => void>();

function createEmptyStore(): AdminMailReadStore {
  return {
    version: 1,
    entries: {},
    baselines: {},
  };
}

function normalizeStorageToken(value: string) {
  return encodeURIComponent((value || "default").trim().toLowerCase());
}

function buildStorageKey(workerUrl: string) {
  return `${STORAGE_PREFIX}:${normalizeStorageToken(workerUrl)}`;
}

function sanitizeStore(value: unknown): AdminMailReadStore {
  if (!value || typeof value !== "object") return createEmptyStore();
  const raw = value as Partial<AdminMailReadStore>;
  const entries: Record<string, AdminMailReadEntry> = {};
  const baselines: Record<string, AdminMailReadBaseline> = {};

  if (raw.entries && typeof raw.entries === "object") {
    for (const [key, entry] of Object.entries(raw.entries)) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Partial<AdminMailReadEntry>;
      const status = candidate.status === "unread" ? "unread" : "read";
      entries[key] = {
        status,
        firstSeenAt:
          typeof candidate.firstSeenAt === "number"
            ? candidate.firstSeenAt
            : Date.now(),
        updatedAt:
          typeof candidate.updatedAt === "number"
            ? candidate.updatedAt
            : Date.now(),
        mailAt: typeof candidate.mailAt === "number" ? candidate.mailAt : 0,
        explicitReadAt:
          typeof candidate.explicitReadAt === "number"
            ? candidate.explicitReadAt
            : undefined,
      };
    }
  }

  if (raw.baselines && typeof raw.baselines === "object") {
    for (const [key, baseline] of Object.entries(raw.baselines)) {
      if (!baseline || typeof baseline !== "object") continue;
      const candidate = baseline as Partial<AdminMailReadBaseline>;
      baselines[key] = {
        initializedAt:
          typeof candidate.initializedAt === "number"
            ? candidate.initializedAt
            : Date.now(),
        latestMailAt:
          typeof candidate.latestMailAt === "number"
            ? candidate.latestMailAt
            : 0,
      };
    }
  }

  return { version: 1, entries, baselines };
}

async function readStoreByKey(storageKey: string) {
  const cached = storeCache.get(storageKey);
  if (cached) return cached;

  try {
    const raw = await AsyncStorage.getItem(storageKey);
    const store = raw ? sanitizeStore(JSON.parse(raw)) : createEmptyStore();
    storeCache.set(storageKey, store);
    return store;
  } catch {
    const store = createEmptyStore();
    storeCache.set(storageKey, store);
    return store;
  }
}

async function writeStoreByKey(storageKey: string, store: AdminMailReadStore) {
  pruneStore(store);
  storeCache.set(storageKey, store);
  await AsyncStorage.setItem(storageKey, JSON.stringify(store));
}

function pruneStore(store: AdminMailReadStore) {
  const entries = Object.entries(store.entries);
  if (entries.length <= MAX_ENTRIES) return;

  entries.sort(([, a], [, b]) => {
    const unreadA = a.status === "unread" ? 1 : 0;
    const unreadB = b.status === "unread" ? 1 : 0;
    if (unreadA !== unreadB) return unreadB - unreadA;
    return b.updatedAt - a.updatedAt;
  });

  store.entries = Object.fromEntries(entries.slice(0, MAX_ENTRIES));
}

async function mutateStore<T>(
  workerUrl: string,
  updater: (store: AdminMailReadStore) => { changed: boolean; result: T }
): Promise<T> {
  const storageKey = buildStorageKey(workerUrl);
  const previous = storeLocks.get(storageKey) ?? Promise.resolve();

  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const store = await readStoreByKey(storageKey);
      const outcome = updater(store);
      if (outcome.changed) {
        await writeStoreByKey(storageKey, store);
      }
      return outcome.result;
    });

  const lock = next.finally(() => {
    if (storeLocks.get(storageKey) === lock) {
      storeLocks.delete(storageKey);
    }
  });
  storeLocks.set(storageKey, lock);

  return next;
}

function notifyReadStateChanged(event: AdminMailReadStateEvent) {
  for (const listener of listeners) {
    listener(event);
  }
}

function normalizeMessageId(value?: string) {
  return (value || "").trim().replace(/^<|>$/g, "").toLowerCase();
}

function normalizeAddress(value?: string) {
  return (value || "").trim().toLowerCase();
}

function normalizeText(value?: string) {
  return (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 500);
}

function getMailTimestamp(mail: ParsedMail) {
  const rawDate = mail.date || mail.createdAt;
  const timestamp = rawDate ? new Date(rawDate).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getEffectiveMailTimestamp(mail: ParsedMail, now: number) {
  const timestamp = getMailTimestamp(mail);
  return timestamp > 0 ? timestamp : now;
}

function getRecipientFingerprint(mail: ParsedMail) {
  return (mail.to || [])
    .map((recipient) => normalizeAddress(recipient.address))
    .filter(Boolean)
    .sort()
    .join(",");
}

export function buildAdminMailReadKey(mail: ParsedMail) {
  const messageId = normalizeMessageId(mail.messageId);
  if (messageId) return `mid:${sha256Hex(messageId)}`;

  const fallbackPayload = [
    normalizeAddress(mail.from?.address),
    getRecipientFingerprint(mail),
    normalizeText(mail.subject),
    String(getMailTimestamp(mail)),
    normalizeText(mail.text || mail.html || mail.raw),
  ].join("|");

  return `fp:${sha256Hex(fallbackPayload)}`;
}

function collectUnreadKeys(store: AdminMailReadStore) {
  const unread = new Set<string>();
  for (const [key, entry] of Object.entries(store.entries)) {
    if (entry.status === "unread") {
      unread.add(key);
    }
  }
  return unread;
}

export async function loadAdminMailUnreadKeySet(workerUrl: string) {
  if (!workerUrl.trim()) return new Set<string>();
  const store = await readStoreByKey(buildStorageKey(workerUrl));
  return collectUnreadKeys(store);
}

export async function reconcileAdminMailReadState({
  workerUrl,
  viewKey,
  mails,
  allowMarkUnread = true,
}: {
  workerUrl: string;
  viewKey: string;
  mails: ParsedMail[];
  allowMarkUnread?: boolean;
}) {
  if (!workerUrl.trim()) return new Set<string>();
  const normalizedViewKey = viewKey.trim().toLowerCase() || "default";
  let didChange = false;

  const unread = await mutateStore(workerUrl, (store) => {
    const now = Date.now();
    const baseline = store.baselines[normalizedViewKey];
    const previousLatestMailAt = baseline?.latestMailAt ?? 0;
    let latestMailAt = previousLatestMailAt;

    for (const mail of mails) {
      const key = buildAdminMailReadKey(mail);
      const mailAt = getEffectiveMailTimestamp(mail, now);
      latestMailAt = Math.max(latestMailAt, mailAt);
      const existing = store.entries[key];
      const shouldMarkUnread =
        !!baseline && allowMarkUnread && mailAt > previousLatestMailAt;

      if (existing) {
        existing.mailAt = Math.max(existing.mailAt, mailAt);
        if (
          shouldMarkUnread &&
          existing.status === "read" &&
          !existing.explicitReadAt
        ) {
          existing.status = "unread";
          existing.updatedAt = now;
          didChange = true;
        }
        continue;
      }

      store.entries[key] = {
        status: shouldMarkUnread ? "unread" : "read",
        firstSeenAt: now,
        updatedAt: now,
        mailAt,
      };
      didChange = true;
    }

    if (!baseline) {
      store.baselines[normalizedViewKey] = {
        initializedAt: now,
        latestMailAt,
      };
      didChange = true;
    } else if (latestMailAt > previousLatestMailAt) {
      baseline.latestMailAt = latestMailAt;
      didChange = true;
    }

    return {
      changed: didChange,
      result: collectUnreadKeys(store),
    };
  });

  if (didChange) notifyReadStateChanged({ workerUrl, unreadKeys: unread });
  return unread;
}

export async function markAdminMailRead(workerUrl: string, mail: ParsedMail) {
  if (!workerUrl.trim()) return;
  const key = buildAdminMailReadKey(mail);
  let didChange = false;

  const unread = await mutateStore(workerUrl, (store) => {
    const now = Date.now();
    const existing = store.entries[key];

    if (!existing) {
      store.entries[key] = {
        status: "read",
        firstSeenAt: now,
        updatedAt: now,
        mailAt: getEffectiveMailTimestamp(mail, now),
        explicitReadAt: now,
      };
      didChange = true;
    } else {
      const wasUnread = existing.status !== "read";
      const hadExplicitRead = !!existing.explicitReadAt;
      existing.status = "read";
      existing.explicitReadAt = now;
      existing.updatedAt = now;
      if (wasUnread || !hadExplicitRead) {
        didChange = true;
      }
    }

    return { changed: didChange, result: collectUnreadKeys(store) };
  });

  if (didChange) notifyReadStateChanged({ workerUrl, unreadKeys: unread });
}

export async function markAdminMailsRead(
  workerUrl: string,
  mails: ParsedMail[]
) {
  if (!workerUrl.trim() || mails.length === 0) return;
  let didChange = false;

  const unread = await mutateStore(workerUrl, (store) => {
    const now = Date.now();

    for (const mail of mails) {
      const key = buildAdminMailReadKey(mail);
      const existing = store.entries[key];
      if (!existing) {
        store.entries[key] = {
          status: "read",
          firstSeenAt: now,
          updatedAt: now,
          mailAt: getEffectiveMailTimestamp(mail, now),
          explicitReadAt: now,
        };
        didChange = true;
      } else {
        const wasUnread = existing.status !== "read";
        const hadExplicitRead = !!existing.explicitReadAt;
        existing.status = "read";
        existing.explicitReadAt = now;
        existing.updatedAt = now;
        if (wasUnread || !hadExplicitRead) {
          didChange = true;
        }
      }
    }

    return { changed: didChange, result: collectUnreadKeys(store) };
  });

  if (didChange) notifyReadStateChanged({ workerUrl, unreadKeys: unread });
}

export function subscribeAdminMailReadState(
  listener: (event: AdminMailReadStateEvent) => void
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function __resetAdminMailReadStateForTests() {
  storeCache.clear();
  storeLocks.clear();
  listeners.clear();
}
