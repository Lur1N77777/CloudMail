import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ParsedMail } from "./api";

type AdminMailSpamRule = {
  address: string;
  createdAt: number;
  updatedAt: number;
};

type AdminMailSpamStore = {
  version: 1;
  blockedSenders: Record<string, AdminMailSpamRule>;
};

type AdminMailSpamStateEvent = {
  workerUrl: string;
  blockedSenders: Set<string>;
};

const STORAGE_PREFIX = "cloudmail_admin_mail_spam_state_v1";
const MAX_BLOCKED_SENDERS = 1000;

const storeCache = new Map<string, AdminMailSpamStore>();
const storeLocks = new Map<string, Promise<unknown>>();
const listeners = new Set<(event: AdminMailSpamStateEvent) => void>();

function createEmptyStore(): AdminMailSpamStore {
  return {
    version: 1,
    blockedSenders: {},
  };
}

function normalizeStorageToken(value: string) {
  return encodeURIComponent((value || "default").trim().toLowerCase());
}

function buildStorageKey(workerUrl: string) {
  return `${STORAGE_PREFIX}:${normalizeStorageToken(workerUrl)}`;
}

function sanitizeStore(value: unknown): AdminMailSpamStore {
  if (!value || typeof value !== "object") return createEmptyStore();
  const raw = value as Partial<AdminMailSpamStore>;
  const blockedSenders: Record<string, AdminMailSpamRule> = {};

  if (raw.blockedSenders && typeof raw.blockedSenders === "object") {
    for (const [key, rule] of Object.entries(raw.blockedSenders)) {
      const normalized = normalizeAdminMailSenderAddress(key);
      if (!normalized || !rule || typeof rule !== "object") continue;
      const candidate = rule as Partial<AdminMailSpamRule>;
      blockedSenders[normalized] = {
        address: normalized,
        createdAt:
          typeof candidate.createdAt === "number"
            ? candidate.createdAt
            : Date.now(),
        updatedAt:
          typeof candidate.updatedAt === "number"
            ? candidate.updatedAt
            : Date.now(),
      };
    }
  }

  return { version: 1, blockedSenders };
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

function pruneStore(store: AdminMailSpamStore) {
  const entries = Object.entries(store.blockedSenders);
  if (entries.length <= MAX_BLOCKED_SENDERS) return;

  entries.sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
  store.blockedSenders = Object.fromEntries(entries.slice(0, MAX_BLOCKED_SENDERS));
}

async function writeStoreByKey(storageKey: string, store: AdminMailSpamStore) {
  pruneStore(store);
  storeCache.set(storageKey, store);
  await AsyncStorage.setItem(storageKey, JSON.stringify(store));
}

async function mutateStore<T>(
  workerUrl: string,
  updater: (store: AdminMailSpamStore) => { changed: boolean; result: T }
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

function collectBlockedSenders(store: AdminMailSpamStore) {
  return new Set(Object.keys(store.blockedSenders));
}

function notifySpamStateChanged(event: AdminMailSpamStateEvent) {
  for (const listener of listeners) {
    listener(event);
  }
}

export function normalizeAdminMailSenderAddress(value?: string) {
  return (value || "").trim().toLowerCase();
}

export function getAdminMailSpamSender(mail: ParsedMail) {
  return normalizeAdminMailSenderAddress(mail.from?.address);
}

export function isAdminMailSpamBySenderSet(
  mail: ParsedMail,
  blockedSenders: Set<string>
) {
  const sender = getAdminMailSpamSender(mail);
  return !!sender && blockedSenders.has(sender);
}

export async function loadAdminMailSpamSenderSet(workerUrl: string) {
  if (!workerUrl.trim()) return new Set<string>();
  const store = await readStoreByKey(buildStorageKey(workerUrl));
  return collectBlockedSenders(store);
}

export async function blockAdminMailSender(workerUrl: string, mail: ParsedMail) {
  const sender = getAdminMailSpamSender(mail);
  if (!workerUrl.trim() || !sender) return null;
  let didChange = false;

  const blockedSenders = await mutateStore(workerUrl, (store) => {
    const now = Date.now();
    const existing = store.blockedSenders[sender];
    if (existing) {
      existing.updatedAt = now;
    } else {
      store.blockedSenders[sender] = {
        address: sender,
        createdAt: now,
        updatedAt: now,
      };
      didChange = true;
    }

    return {
      changed: didChange,
      result: collectBlockedSenders(store),
    };
  });

  if (didChange) notifySpamStateChanged({ workerUrl, blockedSenders });
  return sender;
}

export async function unblockAdminMailSender(
  workerUrl: string,
  senderAddress: string
) {
  const sender = normalizeAdminMailSenderAddress(senderAddress);
  if (!workerUrl.trim() || !sender) return;
  let didChange = false;

  const blockedSenders = await mutateStore(workerUrl, (store) => {
    if (store.blockedSenders[sender]) {
      delete store.blockedSenders[sender];
      didChange = true;
    }

    return {
      changed: didChange,
      result: collectBlockedSenders(store),
    };
  });

  if (didChange) notifySpamStateChanged({ workerUrl, blockedSenders });
}

export function subscribeAdminMailSpamState(
  listener: (event: AdminMailSpamStateEvent) => void
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function __resetAdminMailSpamStateForTests() {
  storeCache.clear();
  storeLocks.clear();
  listeners.clear();
}
