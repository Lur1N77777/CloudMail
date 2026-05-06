import AsyncStorage from "@react-native-async-storage/async-storage";

const ANCHOR_PREFIX = "cloudmail_sync_anchor";

export interface SyncAnchor {
  latestMailId: number;
  latestCreatedAt: string;
  totalFetched: number;
}

function normalizeToken(v?: string) {
  return encodeURIComponent((v || "").trim().toLowerCase());
}

function buildKey(workerUrl: string, address: string, box: "inbox" | "sent") {
  return `${ANCHOR_PREFIX}:${box}:${normalizeToken(workerUrl)}:${normalizeToken(address)}`;
}

export async function getSyncAnchor(
  input: { workerUrl?: string; address: string; box: "inbox" | "sent" }
): Promise<SyncAnchor | null> {
  try {
    const raw = await AsyncStorage.getItem(
      buildKey(input.workerUrl || "", input.address, input.box)
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SyncAnchor;
    if (typeof parsed.latestMailId === "number" && parsed.latestMailId > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setSyncAnchor(
  input: { workerUrl?: string; address: string; box: "inbox" | "sent" },
  anchor: SyncAnchor
) {
  await AsyncStorage.setItem(
    buildKey(input.workerUrl || "", input.address, input.box),
    JSON.stringify(anchor)
  );
}

export async function clearSyncAnchor(
  input: { workerUrl?: string; address: string; box: "inbox" | "sent" }
) {
  await AsyncStorage.removeItem(
    buildKey(input.workerUrl || "", input.address, input.box)
  );
}

export function buildAnchorFromMails(
  mails: { id: number; created_at?: string; createdAt?: string }[]
): SyncAnchor | null {
  if (mails.length === 0) return null;
  let maxId = 0;
  let latestCreatedAt = "";
  for (const m of mails) {
    if (m.id > maxId) {
      maxId = m.id;
      latestCreatedAt = m.created_at || m.createdAt || "";
    }
  }
  return maxId > 0
    ? { latestMailId: maxId, latestCreatedAt, totalFetched: mails.length }
    : null;
}
