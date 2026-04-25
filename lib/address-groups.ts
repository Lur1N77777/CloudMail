import AsyncStorage from "@react-native-async-storage/async-storage";

export type AddressGroupColor =
  | "blue"
  | "teal"
  | "violet"
  | "orange"
  | "green"
  | "gray";

export type AddressGroup = {
  id: string;
  name: string;
  color: AddressGroupColor;
  createdAt: string;
  updatedAt: string;
};

type AddressGroupState = {
  groups: AddressGroup[];
  memberships: Record<string, string[]>;
};

type ScopedAddressGroupState = AddressGroupState & {
  key: string;
};

const ADDRESS_GROUP_STORAGE_PREFIX = "cloudmail_address_groups";
const DEFAULT_GROUP_STATE: AddressGroupState = {
  groups: [],
  memberships: {},
};

export const ADDRESS_GROUP_COLOR_OPTIONS: AddressGroupColor[] = [
  "blue",
  "teal",
  "violet",
  "orange",
  "green",
  "gray",
];

const scopedStateCache = new Map<string, AddressGroupState>();

function normalizeWorkerScope(workerUrl?: string) {
  return (workerUrl || "default").trim().replace(/\/+$/, "").toLowerCase() || "default";
}

function getStorageKey(workerUrl?: string) {
  return `${ADDRESS_GROUP_STORAGE_PREFIX}:${normalizeWorkerScope(workerUrl)}`;
}

function extractWorkerScopeAliases(workerUrl?: string) {
  const normalized = normalizeWorkerScope(workerUrl);
  if (!normalized || normalized === "default") {
    return ["default"];
  }

  const aliases = [normalized];

  try {
    const parsed = normalized.includes("://")
      ? new URL(normalized)
      : new URL(`https://${normalized}`);
    const host = parsed.host.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    const hostPath = pathname && pathname !== "/" ? `${host}${pathname}` : host;

    aliases.push(host);
    aliases.push(hostPath);
  } catch {
    const sanitized = normalized.replace(/^[a-z]+:\/\//, "").replace(/\/+$/, "");
    const host = sanitized.split("/")[0];
    aliases.push(sanitized);
    aliases.push(host);
  }

  return dedupeIds(aliases);
}

function getStorageKeys(workerUrl?: string) {
  return extractWorkerScopeAliases(workerUrl).map(
    (scope) => `${ADDRESS_GROUP_STORAGE_PREFIX}:${scope}`
  );
}

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

function dedupeIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function sanitizeState(value: unknown): AddressGroupState {
  if (!value || typeof value !== "object") {
    return DEFAULT_GROUP_STATE;
  }

  const raw = value as Partial<AddressGroupState>;
  const groups = Array.isArray(raw.groups)
    ? raw.groups
        .filter((item): item is AddressGroup => {
          return !!item && typeof item === "object" && typeof item.id === "string";
        })
        .map((item) => ({
          id: item.id,
          name: String(item.name || "").trim(),
          color: ADDRESS_GROUP_COLOR_OPTIONS.includes(item.color)
            ? item.color
            : "blue",
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        }))
        .filter((item) => item.name)
    : [];

  const validGroupIds = new Set(groups.map((item) => item.id));
  const memberships: Record<string, string[]> = {};
  if (raw.memberships && typeof raw.memberships === "object") {
    for (const [address, groupIds] of Object.entries(raw.memberships)) {
      if (!Array.isArray(groupIds)) continue;
      const normalizedAddress = normalizeAddress(address);
      const normalizedIds = dedupeIds(
        groupIds.map((item) => String(item)).filter((id) => validGroupIds.has(id))
      );
      if (normalizedAddress && normalizedIds.length > 0) {
        memberships[normalizedAddress] = normalizedIds;
      }
    }
  }

  return { groups, memberships };
}

async function persistState(workerUrl: string | undefined, state: AddressGroupState) {
  const sanitized = sanitizeState(state);
  const payload = JSON.stringify(sanitized);
  const keys = getStorageKeys(workerUrl);

  keys.forEach((key) => {
    scopedStateCache.set(key, sanitized);
  });

  await AsyncStorage.multiSet(keys.map((key) => [key, payload]));
  return sanitized;
}

export async function loadAddressGroupState(workerUrl?: string): Promise<ScopedAddressGroupState> {
  const key = getStorageKey(workerUrl);
  const cached = scopedStateCache.get(key);
  if (cached) {
    return { ...cached, key };
  }

  const candidateKeys = getStorageKeys(workerUrl);
  const entries = await AsyncStorage.multiGet(candidateKeys);
  const matchedEntry = entries.find(([, value]) => !!value);

  if (matchedEntry?.[1]) {
    try {
      const parsed = sanitizeState(JSON.parse(matchedEntry[1]));
      candidateKeys.forEach((storageKey) => {
        scopedStateCache.set(storageKey, parsed);
      });

      if (matchedEntry[0] !== key) {
        await AsyncStorage.multiSet(candidateKeys.map((storageKey) => [storageKey, matchedEntry[1]!]));
      }

      return { ...parsed, key };
    } catch {
      // ignore and continue to legacy key scan below
    }
  }

  const allKeys = await AsyncStorage.getAllKeys();
  const currentAliases = new Set(extractWorkerScopeAliases(workerUrl));
  const legacyKey = allKeys.find((storageKey) => {
    if (!storageKey.startsWith(`${ADDRESS_GROUP_STORAGE_PREFIX}:`)) return false;
    const storedScope = storageKey.slice(`${ADDRESS_GROUP_STORAGE_PREFIX}:`.length);
    return extractWorkerScopeAliases(storedScope).some((alias) => currentAliases.has(alias));
  });

  if (legacyKey) {
    const raw = await AsyncStorage.getItem(legacyKey);
    if (raw) {
      try {
        const parsed = sanitizeState(JSON.parse(raw));
        candidateKeys.forEach((storageKey) => {
          scopedStateCache.set(storageKey, parsed);
        });
        await AsyncStorage.multiSet(candidateKeys.map((storageKey) => [storageKey, raw]));
        return { ...parsed, key };
      } catch {
        // fall through to default state
      }
    }
  }

  candidateKeys.forEach((storageKey) => {
    scopedStateCache.set(storageKey, DEFAULT_GROUP_STATE);
  });
  return { ...DEFAULT_GROUP_STATE, key };
}

export async function listAddressGroups(workerUrl?: string): Promise<AddressGroup[]> {
  const state = await loadAddressGroupState(workerUrl);
  return state.groups;
}

export async function createAddressGroup(
  workerUrl: string | undefined,
  params: {
    name: string;
    color?: AddressGroupColor;
  }
): Promise<AddressGroup> {
  const name = params.name.trim();
  if (!name) {
    throw new Error("请输入分组名称");
  }

  const state = await loadAddressGroupState(workerUrl);
  const duplicate = state.groups.find(
    (item) => item.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    throw new Error("分组名称已存在");
  }

  const now = new Date().toISOString();
  const group: AddressGroup = {
    id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    color: params.color && ADDRESS_GROUP_COLOR_OPTIONS.includes(params.color)
      ? params.color
      : "blue",
    createdAt: now,
    updatedAt: now,
  };

  const nextState = {
    groups: [...state.groups, group],
    memberships: state.memberships,
  };
  await persistState(workerUrl, nextState);
  return group;
}

export async function deleteAddressGroup(workerUrl: string | undefined, groupId: string) {
  const state = await loadAddressGroupState(workerUrl);
  const nextGroups = state.groups.filter((item) => item.id !== groupId);
  if (nextGroups.length === state.groups.length) {
    return;
  }

  const nextMemberships: Record<string, string[]> = {};
  for (const [address, ids] of Object.entries(state.memberships)) {
    const filtered = ids.filter((id) => id !== groupId);
    if (filtered.length > 0) {
      nextMemberships[address] = filtered;
    }
  }

  await persistState(workerUrl, {
    groups: nextGroups,
    memberships: nextMemberships,
  });
}

export async function addAddressToGroup(
  workerUrl: string | undefined,
  address: string,
  groupId: string
) {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) {
    throw new Error("邮箱地址不能为空");
  }

  const state = await loadAddressGroupState(workerUrl);
  if (!state.groups.some((item) => item.id === groupId)) {
    throw new Error("分组不存在");
  }

  const currentIds = state.memberships[normalizedAddress] || [];
  const nextIds = dedupeIds([...currentIds, groupId]);
  await persistState(workerUrl, {
    groups: state.groups,
    memberships: {
      ...state.memberships,
      [normalizedAddress]: nextIds,
    },
  });
}

export async function removeAddressFromGroup(
  workerUrl: string | undefined,
  address: string,
  groupId: string
) {
  const normalizedAddress = normalizeAddress(address);
  if (!normalizedAddress) return;

  const state = await loadAddressGroupState(workerUrl);
  const currentIds = state.memberships[normalizedAddress] || [];
  const nextIds = currentIds.filter((id) => id !== groupId);
  const nextMemberships = { ...state.memberships };
  if (nextIds.length > 0) {
    nextMemberships[normalizedAddress] = nextIds;
  } else {
    delete nextMemberships[normalizedAddress];
  }

  await persistState(workerUrl, {
    groups: state.groups,
    memberships: nextMemberships,
  });
}

export async function getAddressGroupsLookup(workerUrl?: string) {
  const state = await loadAddressGroupState(workerUrl);
  const groupMap = new Map(state.groups.map((item) => [item.id, item]));
  const lookup = new Map<string, AddressGroup[]>();

  for (const [address, ids] of Object.entries(state.memberships)) {
    const groups = ids
      .map((id) => groupMap.get(id))
      .filter((item): item is AddressGroup => !!item);
    if (groups.length > 0) {
      lookup.set(address, groups);
    }
  }

  return {
    groups: state.groups,
    memberships: state.memberships,
    lookup,
  };
}

export function getAddressGroupsForAddress(
  lookup: Map<string, AddressGroup[]>,
  address?: string | null
) {
  if (!address) return [];
  return lookup.get(normalizeAddress(address)) || [];
}

export function normalizeGroupAddress(address?: string | null) {
  return address ? normalizeAddress(address) : "";
}
