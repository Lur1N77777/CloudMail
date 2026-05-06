import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AdminAddress } from "./api";

/**
 * 管理员地址列表持久化缓存。
 *
 * 目标不是替代服务端数据，而是让地址页像收件/发件页一样：
 * 1. 进入页面先显示上次缓存，避免白屏；
 * 2. 后台再刷新第一页，同步服务端新增/删除；
 * 3. 按 worker / query / userId 隔离，多 Worker 不串数据。
 */

const PANEL_CACHE_PREFIX = "cloudmail_admin_address_panel_cache_v1";
const INDEX_CACHE_PREFIX = "cloudmail_admin_address_index_cache_v1";
const MAX_PANEL_ADDRESSES = 240;
const MAX_INDEX_ADDRESSES = 3000;

type AdminAddressCachePayload = {
  updatedAt: string;
  count: number;
  offset: number;
  addresses: AdminAddress[];
};

export interface AdminAddressCacheEntry {
  count: number;
  offset: number;
  addresses: AdminAddress[];
}

function normalizeToken(value?: string | number | null) {
  return encodeURIComponent(String(value ?? "all").trim().toLowerCase() || "all");
}

function buildPanelCacheKey(
  workerScope?: string,
  query?: string,
  userId?: string | number | null
) {
  return [
    PANEL_CACHE_PREFIX,
    normalizeToken(workerScope || "default"),
    normalizeToken(query || "*"),
    normalizeToken(userId || "all"),
  ].join(":");
}

function buildIndexCacheKey(workerScope?: string) {
  return [INDEX_CACHE_PREFIX, normalizeToken(workerScope || "default")].join(":");
}

function sanitizeAddress(item: unknown): AdminAddress | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Partial<AdminAddress>;
  const id = Number(raw.id);
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!Number.isFinite(id) || !name) return null;
  return {
    ...raw,
    id,
    name,
  } as AdminAddress;
}

function sanitizePayload(raw: unknown): AdminAddressCacheEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Partial<AdminAddressCachePayload>;
  if (!Array.isArray(payload.addresses)) return null;
  const addresses = payload.addresses
    .map(sanitizeAddress)
    .filter((item): item is AdminAddress => !!item);
  return {
    count: typeof payload.count === "number" ? payload.count : addresses.length,
    offset: typeof payload.offset === "number" ? payload.offset : addresses.length,
    addresses,
  };
}

async function readCache(key: string): Promise<AdminAddressCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return sanitizePayload(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeCache(
  key: string,
  entry: AdminAddressCacheEntry,
  maxItems: number
) {
  const payload: AdminAddressCachePayload = {
    updatedAt: new Date().toISOString(),
    count: entry.count,
    offset: entry.offset,
    addresses: entry.addresses.slice(0, maxItems),
  };
  await AsyncStorage.setItem(key, JSON.stringify(payload));
}

export function getAdminAddressPanelCacheKey(
  workerScope?: string,
  query?: string,
  userId?: string | number | null
) {
  return buildPanelCacheKey(workerScope, query, userId);
}

export async function readAdminAddressPanelCache(params: {
  workerScope?: string;
  query?: string;
  userId?: string | number | null;
}) {
  return readCache(buildPanelCacheKey(params.workerScope, params.query, params.userId));
}

export async function writeAdminAddressPanelCache(
  params: {
    workerScope?: string;
    query?: string;
    userId?: string | number | null;
  },
  entry: AdminAddressCacheEntry
) {
  await writeCache(
    buildPanelCacheKey(params.workerScope, params.query, params.userId),
    entry,
    MAX_PANEL_ADDRESSES
  );
}

export async function clearAdminAddressPanelCache(params: {
  workerScope?: string;
  query?: string;
  userId?: string | number | null;
}) {
  await AsyncStorage.removeItem(
    buildPanelCacheKey(params.workerScope, params.query, params.userId)
  );
}

export async function readAdminAddressIndexCache(workerScope?: string) {
  return readCache(buildIndexCacheKey(workerScope));
}

export async function writeAdminAddressIndexCache(
  workerScope: string | undefined,
  entry: AdminAddressCacheEntry
) {
  await writeCache(buildIndexCacheKey(workerScope), entry, MAX_INDEX_ADDRESSES);
}
