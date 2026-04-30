import AsyncStorage from "@react-native-async-storage/async-storage";
import { sha256Hex } from "./sha256";

// ─── Storage Keys ───────────────────────────────────────────────
const STORAGE_KEYS = {
  WORKER_URL: "cloudmail_worker_url",
  ADMIN_PASSWORD: "cloudmail_admin_password",
  SITE_PASSWORD: "cloudmail_site_password",
  WORKER_PROFILES: "cloudmail_worker_profiles",
  ACTIVE_WORKER_PROFILE_ID: "cloudmail_active_worker_profile_id",
  ACCOUNTS: "cloudmail_accounts",
  ACTIVE_ACCOUNT_INDEX: "cloudmail_active_account_index",
  REFRESH_INTERVAL: "cloudmail_refresh_interval",
  LANG: "cloudmail_lang",
} as const;

const adminLoginStrategyCache = new Map<string, "open_api" | "header">();

// ─── Types ──────────────────────────────────────────────────────
export interface MailAccount {
  address: string;
  jwt: string;
  addressId?: number;
  password?: string; // plain-text address password if shown at creation time
  createdAt: string;
  workerProfileId?: string;
  workerUrl?: string;
}

export type WorkerProfileConnectionStatus = "unchecked" | "connected" | "error";

export interface WorkerProfile {
  id: string;
  name: string;
  workerUrl: string;
  adminPassword: string;
  sitePassword?: string;
  domains: string[];
  domainLabels?: string[];
  defaultDomains?: string[];
  randomSubdomainDomains?: string[];
  status: WorkerProfileConnectionStatus;
  lastCheckedAt?: string;
  errorMessage?: string;
}

export interface WorkerDomainEntry {
  domain: string;
  label: string;
  workerProfileId: string;
  workerName: string;
  supportsRandom: boolean;
  conflict: boolean;
}

export interface RawMail {
  id: number;
  message_id?: string;
  source: string;
  raw?: string;
  created_at: string;
  address?: string;
  subject?: string;
  metadata?: string;
}

export interface ParsedMail {
  id: number;
  messageId?: string;
  from?: { name?: string; address?: string };
  to?: { name?: string; address?: string }[];
  subject?: string;
  text?: string;
  html?: string;
  date?: string;
  attachments?: ParsedAttachment[];
  raw: string;
  createdAt: string;
  sourcePrefix?: string;
  ownerAddress?: string;
  mailboxKind?: "inbox" | "sendbox" | "unknown";
  metadata?: string;
}

export interface ParsedAttachment {
  filename?: string;
  mimeType?: string;
  content?: ArrayBuffer;
  size?: number;
}

export interface AutoReply {
  enabled?: boolean;
  subject?: string;
  message?: string;
  name?: string;
  source_prefix?: string;
}

export interface SiteSettings {
  // Public / open
  title?: string;
  prefix?: string;
  minAddressLen?: number;
  maxAddressLen?: number;
  needAuth?: boolean;
  domains?: string[];
  domainLabels?: string[];
  defaultDomains?: string[];
  randomSubdomainDomains?: string[];
  adminContact?: string;
  enableUserCreateEmail?: boolean;
  enableUserDeleteEmail?: boolean;
  enableAutoReply?: boolean;
  enableIndexAbout?: boolean;
  copyright?: string;
  cfTurnstileSiteKey?: string;
  enableWebhook?: boolean;
  isS3Enabled?: boolean;
  enableSendMail?: boolean;
  showGithub?: boolean;
  disableAdminPasswordCheck?: boolean;
  enableAddressPassword?: boolean;
  enableCreateAddressSubdomainMatch?: boolean;

  // Raw for debug display
  _raw?: unknown;
}

export interface UserAddressSettings {
  address?: string;
  auto_reply?: AutoReply;
  send_balance?: number;
  fetched?: boolean;
}

export interface SendMailPayload {
  from_name: string;
  to_name: string;
  to_mail: string;
  subject: string;
  is_html: boolean;
  content: string;
}

export interface CreatedAddress {
  jwt: string;
  address: string;
  address_id?: number;
  password?: string;
}

// ─── Config Helpers ─────────────────────────────────────────────

function normalizeWorkerUrl(value?: string) {
  return (value || "").trim().replace(/\/+$/, "");
}

function isLikelyWorkerUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function normalizeWorkerProfileId(value?: string) {
  return (value || "").trim();
}

function createWorkerProfileId(workerUrl: string) {
  const normalized = normalizeWorkerUrl(workerUrl).toLowerCase();
  const hash = sha256Hex(normalized || `${Date.now()}:${Math.random()}`).slice(0, 12);
  return `worker_${hash}`;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of value) {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    next.push(text);
  }
  return next;
}

function sanitizeWorkerProfile(
  value: Partial<WorkerProfile> | null | undefined,
  fallbackIndex = 0
): WorkerProfile | null {
  const workerUrl = normalizeWorkerUrl(value?.workerUrl);
  if (!workerUrl || !isLikelyWorkerUrl(workerUrl)) return null;
  const id = normalizeWorkerProfileId(value?.id) || createWorkerProfileId(workerUrl);
  const domains = sanitizeStringArray(value?.domains);
  const status: WorkerProfileConnectionStatus =
    value?.status === "connected" || value?.status === "error"
      ? value.status
      : "unchecked";
  return {
    id,
    name: String(value?.name || `账号 ${fallbackIndex + 1}`).trim() || `账号 ${fallbackIndex + 1}`,
    workerUrl,
    adminPassword: String(value?.adminPassword || ""),
    sitePassword: String(value?.sitePassword || ""),
    domains,
    domainLabels: sanitizeStringArray(value?.domainLabels),
    defaultDomains: sanitizeStringArray(value?.defaultDomains),
    randomSubdomainDomains: sanitizeStringArray(value?.randomSubdomainDomains),
    status,
    lastCheckedAt:
      typeof value?.lastCheckedAt === "string" ? value.lastCheckedAt : undefined,
    errorMessage:
      typeof value?.errorMessage === "string" ? value.errorMessage : undefined,
  };
}

function dedupeWorkerProfiles(profiles: WorkerProfile[]) {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const next: WorkerProfile[] = [];
  profiles.forEach((profile, index) => {
    const normalized = sanitizeWorkerProfile(profile, index);
    if (!normalized) return;
    const urlKey = normalized.workerUrl.toLowerCase();
    let id = normalized.id;
    if (seenIds.has(id)) {
      id = createWorkerProfileId(`${normalized.workerUrl}:${index}`);
    }
    if (seenUrls.has(urlKey)) {
      return;
    }
    seenIds.add(id);
    seenUrls.add(urlKey);
    next.push({ ...normalized, id });
  });
  return next;
}

async function readWorkerProfilesRaw() {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.WORKER_PROFILES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return dedupeWorkerProfiles(
      parsed
        .map((item, index) => sanitizeWorkerProfile(item, index))
        .filter(Boolean) as WorkerProfile[]
    );
  } catch {
    return [];
  }
}

async function writeWorkerProfilesRaw(profiles: WorkerProfile[]) {
  await AsyncStorage.setItem(
    STORAGE_KEYS.WORKER_PROFILES,
    JSON.stringify(dedupeWorkerProfiles(profiles))
  );
}

async function getLegacyConfigValues() {
  const [workerUrl, adminPassword, sitePassword, refreshInterval, lang] =
    await Promise.all([
      AsyncStorage.getItem(STORAGE_KEYS.WORKER_URL),
      AsyncStorage.getItem(STORAGE_KEYS.ADMIN_PASSWORD),
      AsyncStorage.getItem(STORAGE_KEYS.SITE_PASSWORD),
      AsyncStorage.getItem(STORAGE_KEYS.REFRESH_INTERVAL),
      AsyncStorage.getItem(STORAGE_KEYS.LANG),
    ]);
  return {
    workerUrl: normalizeWorkerUrl(workerUrl || ""),
    adminPassword: adminPassword || "",
    sitePassword: sitePassword || "",
    refreshInterval: refreshInterval ? parseInt(refreshInterval, 10) : 30,
    lang: lang || "zh",
  };
}

async function writeActiveProfileCompat(profile: WorkerProfile | null) {
  if (!profile) return;
  await AsyncStorage.multiSet([
    [STORAGE_KEYS.WORKER_URL, normalizeWorkerUrl(profile.workerUrl)],
    [STORAGE_KEYS.ADMIN_PASSWORD, profile.adminPassword || ""],
    [STORAGE_KEYS.SITE_PASSWORD, profile.sitePassword || ""],
  ]);
}

function pickActiveWorkerProfile(
  profiles: WorkerProfile[],
  activeProfileId?: string | null
) {
  if (profiles.length === 0) return null;
  const normalizedId = normalizeWorkerProfileId(activeProfileId || "");
  return profiles.find((profile) => profile.id === normalizedId) || profiles[0];
}

async function migrateLegacyAccountsToWorkerProfile(profile: WorkerProfile) {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.ACCOUNTS);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    let changed = false;
    const accounts = parsed.map((account) => {
      if (!account || typeof account !== "object") return account;
      const next = { ...account } as MailAccount;
      if (!next.workerProfileId) {
        next.workerProfileId = profile.id;
        changed = true;
      }
      if (!next.workerUrl) {
        next.workerUrl = profile.workerUrl;
        changed = true;
      }
      return next;
    });
    if (changed) {
      await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    }
  } catch {}
}

export async function migrateSingleWorkerConfigToProfiles(): Promise<WorkerProfile[]> {
  const existingProfiles = await readWorkerProfilesRaw();
  const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID);
  if (existingProfiles.length > 0) {
    const active = pickActiveWorkerProfile(existingProfiles, activeId);
    if (active && active.id !== activeId) {
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID, active.id);
    }
    return existingProfiles;
  }

  const legacy = await getLegacyConfigValues();
  if (!legacy.workerUrl || !isLikelyWorkerUrl(legacy.workerUrl)) return [];

  const profile: WorkerProfile = {
    id: createWorkerProfileId(legacy.workerUrl),
    name: "默认账号",
    workerUrl: legacy.workerUrl,
    adminPassword: legacy.adminPassword,
    sitePassword: legacy.sitePassword,
    domains: [],
    status: "unchecked",
  };
  await writeWorkerProfilesRaw([profile]);
  await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID, profile.id);
  await migrateLegacyAccountsToWorkerProfile(profile);
  return [profile];
}

export async function getWorkerProfiles(): Promise<WorkerProfile[]> {
  return migrateSingleWorkerConfigToProfiles();
}

export async function saveWorkerProfiles(profiles: WorkerProfile[]) {
  const nextProfiles = dedupeWorkerProfiles(profiles);
  await writeWorkerProfilesRaw(nextProfiles);
  const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID);
  const active = pickActiveWorkerProfile(nextProfiles, activeId);
  if (active) {
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID, active.id);
    await writeActiveProfileCompat(active);
  }
  return nextProfiles;
}

export async function getActiveWorkerProfileId(): Promise<string> {
  const profiles = await getWorkerProfiles();
  const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID);
  return pickActiveWorkerProfile(profiles, activeId)?.id || "";
}

export async function setActiveWorkerProfileId(profileId: string) {
  const profiles = await getWorkerProfiles();
  const active = pickActiveWorkerProfile(profiles, profileId);
  if (!active) {
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID, profileId);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID, active.id);
  await writeActiveProfileCompat(active);
}

export async function getActiveWorkerProfile(): Promise<WorkerProfile | null> {
  const profiles = await getWorkerProfiles();
  const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID);
  return pickActiveWorkerProfile(profiles, activeId);
}

export function buildWorkerDomainEntries(
  profiles: WorkerProfile[]
): WorkerDomainEntry[] {
  const domainCounts = new Map<string, number>();
  for (const profile of profiles) {
    for (const domain of profile.domains || []) {
      const key = domain.toLowerCase();
      domainCounts.set(key, (domainCounts.get(key) || 0) + 1);
    }
  }
  return profiles.flatMap((profile) =>
    (profile.domains || []).map((domain, index) => {
      const label = profile.domainLabels?.[index];
      const normalizedDomain = domain.toLowerCase();
      return {
        domain,
        label: label && label !== domain ? `${label}（${domain}）` : domain,
        workerProfileId: profile.id,
        workerName: profile.name,
        supportsRandom: !!profile.randomSubdomainDomains?.includes(domain),
        conflict: (domainCounts.get(normalizedDomain) || 0) > 1,
      };
    })
  );
}

export type RuntimeConfigOverride = {
  workerUrl: string;
  adminPassword?: string;
  sitePassword?: string;
  lang?: string;
};

export type ApiRuntimeOptions = {
  workerProfile?: WorkerProfile;
  configOverride?: RuntimeConfigOverride;
};

function runtimeConfigFromProfile(
  profile: WorkerProfile,
  lang = "zh"
): RuntimeConfigOverride {
  return {
    workerUrl: profile.workerUrl,
    adminPassword: profile.adminPassword,
    sitePassword: profile.sitePassword || "",
    lang,
  };
}

export async function getConfig() {
  const [legacy, profiles, activeId] = await Promise.all([
    getLegacyConfigValues(),
    getWorkerProfiles(),
    AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID),
  ]);
  const activeProfile = pickActiveWorkerProfile(profiles, activeId);
  return {
    workerUrl: activeProfile ? activeProfile.workerUrl : legacy.workerUrl,
    adminPassword: activeProfile ? activeProfile.adminPassword : legacy.adminPassword,
    sitePassword: activeProfile ? activeProfile.sitePassword || "" : legacy.sitePassword,
    refreshInterval: legacy.refreshInterval,
    lang: legacy.lang,
  };
}

export async function saveConfig(config: {
  workerUrl?: string;
  adminPassword?: string;
  sitePassword?: string;
  refreshInterval?: number;
  lang?: string;
}) {
  const pairs: [string, string][] = [];
  if (config.workerUrl !== undefined)
    pairs.push([STORAGE_KEYS.WORKER_URL, normalizeWorkerUrl(config.workerUrl)]);
  if (config.adminPassword !== undefined)
    pairs.push([STORAGE_KEYS.ADMIN_PASSWORD, config.adminPassword]);
  if (config.sitePassword !== undefined)
    pairs.push([STORAGE_KEYS.SITE_PASSWORD, config.sitePassword]);
  if (config.refreshInterval !== undefined)
    pairs.push([
      STORAGE_KEYS.REFRESH_INTERVAL,
      config.refreshInterval.toString(),
    ]);
  if (config.lang !== undefined) pairs.push([STORAGE_KEYS.LANG, config.lang]);
  if (pairs.length) await AsyncStorage.multiSet(pairs);

  if (
    config.workerUrl !== undefined ||
    config.adminPassword !== undefined ||
    config.sitePassword !== undefined
  ) {
    const profiles = await getWorkerProfiles();
    const activeId = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID);
    const active = pickActiveWorkerProfile(profiles, activeId);
    const workerUrl = normalizeWorkerUrl(config.workerUrl ?? active?.workerUrl ?? "");
    if (workerUrl) {
      const nextProfile: WorkerProfile = {
        id: active?.id || createWorkerProfileId(workerUrl),
        name: active?.name || "默认账号",
        workerUrl,
        adminPassword: config.adminPassword ?? active?.adminPassword ?? "",
        sitePassword: config.sitePassword ?? active?.sitePassword ?? "",
        domains: active?.domains || [],
        domainLabels: active?.domainLabels || [],
        defaultDomains: active?.defaultDomains || [],
        randomSubdomainDomains: active?.randomSubdomainDomains || [],
        status: active?.status || "unchecked",
        lastCheckedAt: active?.lastCheckedAt,
        errorMessage: active?.errorMessage,
      };
      const nextProfiles = active
        ? profiles.map((profile) => (profile.id === active.id ? nextProfile : profile))
        : [nextProfile, ...profiles];
      await writeWorkerProfilesRaw(nextProfiles);
      await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_WORKER_PROFILE_ID, nextProfile.id);
    }
  }
}

// ─── Account Helpers ────────────────────────────────────────────
export async function getAccounts(): Promise<MailAccount[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.ACCOUNTS);
  const parsed = raw ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [];
}

export async function saveAccounts(accounts: MailAccount[]) {
  await AsyncStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
}

export async function getActiveAccountIndex(): Promise<number> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_ACCOUNT_INDEX);
  return raw ? parseInt(raw, 10) : 0;
}

export async function setActiveAccountIndex(index: number) {
  await AsyncStorage.setItem(
    STORAGE_KEYS.ACTIVE_ACCOUNT_INDEX,
    index.toString()
  );
}

export function buildMailAccountIdentityKey(account: Pick<MailAccount, "address" | "workerProfileId" | "workerUrl">) {
  const address = (account.address || "").trim().toLowerCase();
  const scope =
    (account.workerProfileId || "").trim() ||
    normalizeWorkerUrl(account.workerUrl || "").toLowerCase() ||
    "legacy";
  return `${scope}:${address}`;
}

export async function addAccount(account: MailAccount) {
  const accounts = await getAccounts();
  const accountKey = buildMailAccountIdentityKey(account);
  const existingIdx = accounts.findIndex(
    (a) => buildMailAccountIdentityKey(a) === accountKey
  );
  if (existingIdx >= 0) {
    accounts[existingIdx] = { ...accounts[existingIdx], ...account };
    await saveAccounts(accounts);
    await setActiveAccountIndex(existingIdx);
    return;
  }
  accounts.push(account);
  await saveAccounts(accounts);
  await setActiveAccountIndex(accounts.length - 1);
}

export async function removeAccount(index: number) {
  const accounts = await getAccounts();
  accounts.splice(index, 1);
  await saveAccounts(accounts);
  const activeIndex = await getActiveAccountIndex();
  if (activeIndex >= accounts.length) {
    await setActiveAccountIndex(Math.max(0, accounts.length - 1));
  }
}

// ─── HTTP Helpers ───────────────────────────────────────────────
type RuntimeConfig = Awaited<ReturnType<typeof getConfig>>;

function buildHeaders(options: {
  config: RuntimeConfig | RuntimeConfigOverride;
  jwt?: string;
  adminAuth?: boolean;
  adminPasswordOverride?: string;
}): Record<string, string> {
  const { config, jwt, adminAuth, adminPasswordOverride } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-lang": config.lang || "zh",
  };
  if (config.sitePassword) {
    headers["x-custom-auth"] = config.sitePassword;
  }
  const resolvedAdminPassword = adminPasswordOverride ?? config.adminPassword;
  if (adminAuth && resolvedAdminPassword) {
    headers["x-admin-auth"] = resolvedAdminPassword;
  }
  if (jwt) {
    headers["Authorization"] = `Bearer ${jwt}`;
    headers["x-user-token"] = jwt;
  }
  return headers;
}

export interface ApiError extends Error {
  status?: number;
  path?: string;
  body?: string;
}

async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    jwt?: string;
    adminAuth?: boolean;
    adminPasswordOverride?: string;
    configOverride?: RuntimeConfigOverride;
  } = {}
): Promise<T> {
  const storedConfig = options.configOverride ? null : await getConfig();
  const config = {
    ...(storedConfig || {}),
    ...(options.configOverride || {}),
    workerUrl: normalizeWorkerUrl(options.configOverride?.workerUrl || storedConfig?.workerUrl || ""),
    adminPassword:
      options.configOverride?.adminPassword ?? storedConfig?.adminPassword ?? "",
    sitePassword:
      options.configOverride?.sitePassword ?? storedConfig?.sitePassword ?? "",
    lang: options.configOverride?.lang ?? storedConfig?.lang ?? "zh",
  };
  if (!config.workerUrl) {
    const err = new Error("请先配置 Worker 地址") as ApiError;
    err.path = path;
    throw err;
  }
  const { method = "GET", body, jwt, adminAuth, adminPasswordOverride } = options;
  const headers = buildHeaders({
    config,
    jwt,
    adminAuth,
    adminPasswordOverride,
  });
  const url = `${config.workerUrl}${path}`;

  const fetchOptions: RequestInit = { method, headers };
  if (body !== undefined && body !== null) {
    fetchOptions.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (err: any) {
    const wrapped = new Error(err?.message || "网络请求失败") as ApiError;
    wrapped.path = path;
    throw wrapped;
  }

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    let raw = "";
    try {
      raw = await response.text();
      try {
        const parsed = JSON.parse(raw);
        errorMsg = parsed.message || parsed.error || errorMsg;
      } catch {
        if (raw) errorMsg = `${errorMsg}: ${raw.slice(0, 200)}`;
      }
    } catch {}
    const err = new Error(errorMsg) as ApiError;
    err.status = response.status;
    err.path = path;
    err.body = raw;
    throw err;
  }

  // Some endpoints return no body (DELETE), handle gracefully.
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// ─── Settings ───────────────────────────────────────────────────

function resolveWorkerProfileConfigOverride(
  options?: ApiRuntimeOptions
) {
  if (options?.configOverride) return options.configOverride;
  if (options?.workerProfile) {
    return runtimeConfigFromProfile(options.workerProfile);
  }
  return undefined;
}

/** Fetch site settings including available domains (public endpoint). */
export async function fetchSettings(options?: {
  workerProfile?: WorkerProfile;
  configOverride?: RuntimeConfigOverride;
}): Promise<SiteSettings> {
  const raw = await fetchSettingsWithFallback(resolveWorkerProfileConfigOverride(options));
  const domains =
    (Array.isArray(raw.domains) && raw.domains.length ? raw.domains : undefined) ||
    (Array.isArray(raw.defaultDomains) ? raw.defaultDomains : []);

  return {
    ...raw,
    domains,
    _raw: raw,
  };
}

async function fetchSettingsWithFallback(
  configOverride?: RuntimeConfigOverride
): Promise<SiteSettings> {
  let lastError: Error | undefined;
  for (const path of ["/open_api/settings", "/api/settings"]) {
    try {
      return await apiRequest<SiteSettings>(path, { configOverride });
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError || new Error("获取设置失败");
}

/** Fetch per-address user settings (address, auto_reply, send_balance). Requires JWT. */
export async function fetchUserAddressSettings(
  jwt: string,
  options?: ApiRuntimeOptions
): Promise<UserAddressSettings> {
  return apiRequest<UserAddressSettings>("/api/settings", {
    jwt,
    configOverride: resolveWorkerProfileConfigOverride(options),
  });
}

// ─── Address Management ─────────────────────────────────────────

/** Create a new email address. Uses admin API if admin password set, otherwise user API. */
export async function createAddress(params: {
  name: string;
  domain: string;
  enablePrefix?: boolean;
  enableRandomSubdomain?: boolean;
  workerProfileId?: string;
  workerProfile?: WorkerProfile;
}): Promise<CreatedAddress> {
  let workerProfile = params.workerProfile;
  if (!workerProfile && params.workerProfileId) {
    const profiles = await getWorkerProfiles();
    workerProfile = profiles.find((profile) => profile.id === params.workerProfileId);
    if (!workerProfile) {
      throw new Error("未找到所选 Worker 配置，请重新选择域名");
    }
  }
  const configOverride = workerProfile
    ? runtimeConfigFromProfile(workerProfile)
    : undefined;
  const config = configOverride
    ? {
        workerUrl: configOverride.workerUrl,
        adminPassword: configOverride.adminPassword || "",
        sitePassword: configOverride.sitePassword || "",
        refreshInterval: 30,
        lang: configOverride.lang || "zh",
      }
    : await getConfig();
  const body = {
    name: params.name,
    domain: params.domain,
    enablePrefix: params.enablePrefix ?? true,
    enableRandomSubdomain: params.enableRandomSubdomain ?? false,
  };
  if (config.adminPassword) {
    return apiRequest<CreatedAddress>("/admin/new_address", {
      method: "POST",
      adminAuth: true,
      body,
      configOverride,
    });
  }
  return apiRequest<CreatedAddress>("/api/new_address", {
    method: "POST",
    body,
    configOverride,
  });
}

/** Delete an email address (admin path — removes from server). */
export async function deleteAddressAdmin(
  addressId: number,
  options?: ApiRuntimeOptions
): Promise<void> {
  await apiRequest(`/admin/delete_address/${addressId}`, {
    method: "DELETE",
    adminAuth: true,
    configOverride: resolveWorkerProfileConfigOverride(options),
  });
}

/** Delete the currently-authenticated user address. */
export async function deleteAddressUser(jwt: string, options?: ApiRuntimeOptions): Promise<void> {
  await apiRequest("/api/delete_address", {
    method: "DELETE",
    jwt,
    configOverride: resolveWorkerProfileConfigOverride(options),
  });
}

/** Change the password for the current address. */
export async function changeAddressPassword(
  jwt: string,
  params: { old_password?: string; password: string },
  options?: ApiRuntimeOptions
): Promise<void> {
  await apiRequest("/api/address_change_password", {
    method: "POST",
    jwt,
    configOverride: resolveWorkerProfileConfigOverride(options),
    body: {
      old_password: params.old_password ? sha256Hex(params.old_password) : "",
      password: sha256Hex(params.password),
    },
  });
}

// ─── Login / Recovery ───────────────────────────────────────────

/** Login with address credential (a JWT string). Validates server-side and returns JWT. */
export async function loginWithCredential(
  credential: string,
  options?: ApiRuntimeOptions
): Promise<{ jwt: string }> {
  await apiRequest("/open_api/credential_login", {
    method: "POST",
    configOverride: resolveWorkerProfileConfigOverride(options),
    body: { credential },
  });
  return { jwt: credential };
}

/** Login with email + password. Password is SHA-256 hashed before sending. */
export async function loginWithAddressPassword(params: {
  email: string;
  password: string;
}, options?: ApiRuntimeOptions): Promise<{ jwt: string }> {
  return apiRequest<{ jwt: string }>("/api/address_login", {
    method: "POST",
    configOverride: resolveWorkerProfileConfigOverride(options),
    body: {
      email: params.email,
      password: sha256Hex(params.password),
    },
  });
}

// ─── Mails ──────────────────────────────────────────────────────

export interface MailPage {
  results: RawMail[];
  count: number;
}

/** List mails (paginated). Returns {results, count} — official shape. */
export async function fetchMails(
  jwt: string,
  limit: number = 20,
  offset: number = 0,
  options?: ApiRuntimeOptions
): Promise<MailPage> {
  const resp = await apiRequest<MailPage | RawMail[]>(
    `/api/mails?limit=${limit}&offset=${offset}`,
    { jwt, configOverride: resolveWorkerProfileConfigOverride(options) }
  );
  return normalizeMailPage(resp);
}

/** Walk all pages of mail history until we hit a short page. */
export async function fetchMailHistory(
  jwt: string,
  options: {
    pageSize?: number;
    maxPages?: number;
  } & ApiRuntimeOptions = {}
): Promise<RawMail[]> {
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 100;
  const allMails: RawMail[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const { results } = await fetchMails(jwt, pageSize, offset, options);

    if (results.length === 0) break;
    allMails.push(...results);
    if (results.length < pageSize) break;
  }

  return allMails;
}

/** Fetch a single mail by ID. */
export async function fetchSingleMail(
  jwt: string,
  mailId: number,
  options?: ApiRuntimeOptions
): Promise<RawMail> {
  return apiRequest<RawMail>(`/api/mail/${mailId}`, {
    jwt,
    configOverride: resolveWorkerProfileConfigOverride(options),
  });
}

function shouldFallbackDeleteRoute(error: unknown): boolean {
  const status = (error as ApiError | undefined)?.status;
  return status === 400 || status === 404 || status === 405 || status === 501;
}

/** Delete a single mail. */
export async function deleteMail(
  jwt: string,
  mailId: number,
  options?: ApiRuntimeOptions
): Promise<void> {
  const deletePaths = [`/api/mail/${mailId}`, `/api/mails/${mailId}`];
  let lastError: Error | undefined;

  for (const path of deletePaths) {
    try {
      await apiRequest(path, {
        method: "DELETE",
        jwt,
        configOverride: resolveWorkerProfileConfigOverride(options),
      });
    } catch (error) {
      lastError = error as Error;
      if (shouldFallbackDeleteRoute(error) && path !== deletePaths[deletePaths.length - 1]) {
        continue;
      }
      throw error;
    }

    try {
      await fetchSingleMail(jwt, mailId, options);
      lastError = new Error("邮件删除未生效，请稍后重试");
    } catch (error) {
      if ((error as ApiError | undefined)?.status === 404) {
        return;
      }
      lastError = error as Error;
    }
  }

  throw lastError || new Error("删除邮件失败");
}

/** Clear the entire inbox for the current address. */
export async function clearInbox(jwt: string, options?: ApiRuntimeOptions): Promise<void> {
  await apiRequest("/api/clear_inbox", {
    method: "DELETE",
    jwt,
    configOverride: resolveWorkerProfileConfigOverride(options),
  });
}

// ─── Send Mail ──────────────────────────────────────────────────

export async function sendMail(
  jwt: string,
  payload: SendMailPayload,
  options?: ApiRuntimeOptions
): Promise<{ success?: boolean }> {
  return apiRequest("/api/send_mail", {
    method: "POST",
    jwt,
    configOverride: resolveWorkerProfileConfigOverride(options),
    body: payload,
  });
}

/** Request send-mail access (bumps send_balance from 0). */
export async function requestSendMailAccess(jwt: string, options?: ApiRuntimeOptions): Promise<void> {
  await apiRequest("/api/request_send_mail_access", {
    method: "POST",
    jwt,
    configOverride: resolveWorkerProfileConfigOverride(options),
    body: {},
  });
}

/** List sent mails. */
export async function fetchSentMails(
  jwt: string,
  limit: number = 20,
  offset: number = 0,
  options?: ApiRuntimeOptions
): Promise<MailPage> {
  const resp = await apiRequest<MailPage | RawMail[]>(
    `/api/sendbox?limit=${limit}&offset=${offset}`,
    { jwt, configOverride: resolveWorkerProfileConfigOverride(options) }
  );
  return normalizeMailPage(resp);
}

/** Walk all pages of sent-mail history. */
export async function fetchSentMailHistory(
  jwt: string,
  options: { pageSize?: number; maxPages?: number } & ApiRuntimeOptions = {}
): Promise<RawMail[]> {
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 100;
  const all: RawMail[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const { results } = await fetchSentMails(jwt, pageSize, offset, options);
    if (results.length === 0) break;
    all.push(...results);
    if (results.length < pageSize) break;
  }
  return all;
}

/** Delete a single sent mail. */
export async function deleteSentMail(
  jwt: string,
  mailId: number,
  options?: ApiRuntimeOptions
): Promise<void> {
  await apiRequest(`/api/sendbox/${mailId}`, {
    method: "DELETE",
    jwt,
    configOverride: resolveWorkerProfileConfigOverride(options),
  });
}

/** Clear all sent items. */
export async function clearSentItems(jwt: string, options?: ApiRuntimeOptions): Promise<void> {
  await apiRequest("/api/clear_sent_items", {
    method: "DELETE",
    jwt,
    configOverride: resolveWorkerProfileConfigOverride(options),
  });
}

function normalizeMailPage(resp: MailPage | RawMail[] | undefined): MailPage {
  if (!resp) return { results: [], count: 0 };
  if (Array.isArray(resp)) return { results: resp, count: resp.length };
  return {
    results: Array.isArray(resp.results) ? resp.results : [],
    count: typeof resp.count === "number" ? resp.count : 0,
  };
}

// ─── Auto Reply ─────────────────────────────────────────────────

export async function setAutoReply(
  jwt: string,
  autoReply: AutoReply,
  options?: ApiRuntimeOptions
): Promise<void> {
  await apiRequest("/api/auto_reply", {
    method: "POST",
    jwt,
    configOverride: resolveWorkerProfileConfigOverride(options),
    body: {
      auto_reply: {
        enabled: autoReply.enabled ?? false,
        subject: autoReply.subject ?? "",
        message: autoReply.message ?? "",
        name: autoReply.name ?? "",
        source_prefix: autoReply.source_prefix ?? "",
      },
    },
  });
}

// ─── Admin API ──────────────────────────────────────────────────

export interface AdminAddress {
  id: number;
  name: string;
  mail_count?: number;
  send_count?: number;
  created_at?: string;
  updated_at?: string;
  user_id?: number | string;
  user_name?: string;
  user_email?: string;
  username?: string;
  groups?: import("./address-groups").AddressGroup[];
}

export interface AdminAddressPage {
  results: AdminAddress[];
  count: number;
  hasMore?: boolean;
}

export interface AdminUser {
  id: number | string;
  name?: string;
  username?: string;
  email?: string;
  user_email?: string;
  openId?: string;
  openid?: string;
  role_text?: string | null;
  address_count?: number;
  mail_count?: number;
  send_count?: number;
  [key: string]: unknown;
}

export interface AdminUserPage {
  results: AdminUser[];
  count: number;
}

export type AdminBulkAction =
  | "delete_addresses"
  | "clear_inbox"
  | "clear_sent"
  | "clear_all"
  | "delete_empty";

export interface AdminBulkRequest {
  action: AdminBulkAction;
  address_ids?: (number | string)[];
  addresses?: string[];
  filters?: {
    query?: string;
    user_id?: number | string;
    group_id?: string;
  };
  confirm?: boolean;
}

export interface AdminBulkPreviewResponse {
  action?: AdminBulkAction;
  address_count?: number;
  mail_count?: number;
  send_count?: number;
  empty_address_count?: number;
  sample_addresses?: string[];
  message?: string;
  [key: string]: unknown;
}

export interface AdminBulkExecuteResponse extends AdminBulkPreviewResponse {
  success_count?: number;
  failed_count?: number;
  failures?: { address?: string; id?: number | string; error?: string }[];
}

export interface AdminStatistics {
  address_count?: number;
  mail_count?: number;
  send_count?: number;
  unknow_mail_count?: number;
  addressCount?: number;
  mailCount?: number;
  sendMailCount?: number;
  unknowMailCount?: number;
  unknownMailCount?: number;
  active_user_count_24h?: number;
  active_user_count_week?: number;
  [key: string]: unknown;
}

/** Verify admin password. Returns true if accepted. */
export async function adminLogin(
  password: string,
  options?: { workerProfile?: WorkerProfile; configOverride?: RuntimeConfigOverride }
): Promise<boolean> {
  const trimmedPassword = password.trim();
  if (!trimmedPassword) {
    throw new Error("请输入管理员密码");
  }

  const configOverride = resolveWorkerProfileConfigOverride(options);
  const config = configOverride
    ? {
        workerUrl: normalizeWorkerUrl(configOverride.workerUrl),
        adminPassword: configOverride.adminPassword || "",
        sitePassword: configOverride.sitePassword || "",
        refreshInterval: 30,
        lang: configOverride.lang || "zh",
      }
    : await getConfig();
  const cacheKey = config.workerUrl;

  const verifyViaOpenApi = async () => {
    await apiRequest("/open_api/admin_login", {
      method: "POST",
      body: { password: sha256Hex(trimmedPassword) },
      configOverride,
    });
  };

  const verifyViaHeader = async () => {
    await apiRequest<AdminStatistics>("/admin/statistics", {
      adminAuth: true,
      adminPasswordOverride: trimmedPassword,
      configOverride,
    });
  };

  const preferredStrategy = cacheKey ? adminLoginStrategyCache.get(cacheKey) : undefined;
  if (preferredStrategy) {
    try {
      if (preferredStrategy === "open_api") {
        await verifyViaOpenApi();
      } else {
        await verifyViaHeader();
      }
      return true;
    } catch {
      adminLoginStrategyCache.delete(cacheKey);
    }
  }

  const errors: unknown[] = [];
  return new Promise<boolean>((resolve, reject) => {
    let pending = 2;
    let settled = false;

    const handleSuccess = (strategy: "open_api" | "header") => {
      if (settled) return;
      settled = true;
      if (cacheKey) {
        adminLoginStrategyCache.set(cacheKey, strategy);
      }
      resolve(true);
    };

    const handleFailure = (error: unknown) => {
      errors.push(error);
      pending -= 1;
      if (pending === 0 && !settled) {
        reject((errors[0] as Error) || new Error("管理员密码校验失败"));
      }
    };

    verifyViaOpenApi()
      .then(() => handleSuccess("open_api"))
      .catch(handleFailure);

    verifyViaHeader()
      .then(() => handleSuccess("header"))
      .catch(handleFailure);
  });
}

/** List all addresses in the system (admin). */
export async function fetchAdminAddresses(params: {
  limit?: number;
  offset?: number;
  query?: string;
  userId?: number | string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<AdminAddressPage> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 50));
  qs.set("offset", String(params.offset ?? 0));
  if (params.query) qs.set("query", params.query);
  if (params.userId !== undefined && params.userId !== null && String(params.userId) !== "all") {
    qs.set("user_id", String(params.userId));
  }
  if (params.sortBy) qs.set("sort_by", params.sortBy);
  if (params.sortOrder) qs.set("sort_order", params.sortOrder);

  const resp = await apiRequest<AdminAddressPage | AdminAddress[]>(
    `/admin/address?${qs.toString()}`,
    { adminAuth: true }
  );
  if (!resp) return { results: [], count: 0 };
  if (Array.isArray(resp)) return { results: resp, count: resp.length };
  return {
    results: Array.isArray(resp.results) ? resp.results : [],
    count: typeof resp.count === "number" ? resp.count : 0,
  };
}

/** Admin: list users with address/mail statistics when the Worker supports it. */
export async function fetchAdminUsers(params: {
  limit?: number;
  offset?: number;
  query?: string;
} = {}): Promise<AdminUserPage> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 100));
  qs.set("offset", String(params.offset ?? 0));
  if (params.query) qs.set("query", params.query);

  const resp = await apiRequest<AdminUserPage | AdminUser[]>(
    `/admin/users?${qs.toString()}`,
    { adminAuth: true }
  );
  if (!resp) return { results: [], count: 0 };
  if (Array.isArray(resp)) return { results: resp, count: resp.length };
  return {
    results: Array.isArray(resp.results) ? resp.results : [],
    count: typeof resp.count === "number" ? resp.count : 0,
  };
}

/** Admin: list addresses bound to a specific user, matching the web admin page.
 * Current Workers return the complete bound list from this endpoint. The optional
 * limit/offset are sent for forward compatibility and also applied client-side
 * when an older Worker ignores them.
 */
export async function fetchAdminUserAddresses(
  userId: number | string,
  params: { limit?: number; offset?: number } = {}
): Promise<AdminAddressPage> {
  const encodedUserId = encodeURIComponent(String(userId));
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  const query = qs.toString();
  const resp = await apiRequest<AdminAddressPage | AdminAddress[]>(
    `/admin/users/bind_address/${encodedUserId}${query ? `?${query}` : ""}`,
    { adminAuth: true }
  );
  if (!resp) return { results: [], count: 0 };
  const results = Array.isArray(resp)
    ? resp
    : Array.isArray(resp.results)
      ? resp.results
      : [];
  const normalizedResults = results.map((item) => ({
    ...item,
    user_id: item.user_id ?? userId,
  }));
  const hasResponseCount = !Array.isArray(resp) && typeof resp.count === "number";
  const limit = params.limit;
  const offset = params.offset ?? 0;
  const shouldApplyClientPaging =
    typeof limit === "number" &&
    limit > 0 &&
    normalizedResults.length > limit;
  const shouldClientPage =
    shouldApplyClientPaging &&
    normalizedResults.length > offset &&
    (!hasResponseCount || normalizedResults.length > limit);
  const pageResults = shouldClientPage
    ? normalizedResults.slice(offset, offset + limit)
    : normalizedResults;

  let totalCount = hasResponseCount ? resp.count : normalizedResults.length;
  let hasMore =
    typeof totalCount === "number" && totalCount > 0
      ? offset + pageResults.length < totalCount
      : false;

  if (!hasResponseCount && typeof limit === "number" && limit > 0) {
    if (shouldApplyClientPaging) {
      totalCount = normalizedResults.length;
      hasMore = offset + pageResults.length < normalizedResults.length;
    } else if (pageResults.length >= limit) {
      totalCount = offset + pageResults.length + 1;
      hasMore = true;
    } else {
      totalCount = offset + pageResults.length;
      hasMore = false;
    }
  }

  return {
    results: pageResults,
    count: totalCount,
    hasMore,
  };
}

/** Admin: ask the Worker to preview a destructive bulk operation. */
export async function adminBulkPreview(
  payload: AdminBulkRequest
): Promise<AdminBulkPreviewResponse> {
  return apiRequest<AdminBulkPreviewResponse>("/admin/bulk/preview", {
    method: "POST",
    adminAuth: true,
    body: payload,
  });
}

/** Admin: execute a confirmed bulk operation when the Worker supports it. */
export async function adminBulkExecute(
  payload: AdminBulkRequest
): Promise<AdminBulkExecuteResponse> {
  return apiRequest<AdminBulkExecuteResponse>("/admin/bulk/execute", {
    method: "POST",
    adminAuth: true,
    body: payload,
  });
}

/** Admin: list all inbox mails (optionally filtered by address). */
export async function fetchAdminMails(params: {
  limit?: number;
  offset?: number;
  address?: string;
}): Promise<MailPage> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 50));
  qs.set("offset", String(params.offset ?? 0));
  if (params.address) qs.set("address", params.address);
  const resp = await apiRequest<MailPage | RawMail[]>(
    `/admin/mails?${qs.toString()}`,
    { adminAuth: true }
  );
  return normalizeMailPage(resp);
}

/** Admin: list all sent mails (optionally filtered by address). */
export async function fetchAdminSendbox(params: {
  limit?: number;
  offset?: number;
  address?: string;
}): Promise<MailPage> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 50));
  qs.set("offset", String(params.offset ?? 0));
  if (params.address) qs.set("address", params.address);
  const resp = await apiRequest<MailPage | RawMail[]>(
    `/admin/sendbox?${qs.toString()}`,
    { adminAuth: true }
  );
  return normalizeMailPage(resp);
}

/** Admin: list mails that arrived without a matching address. */
export async function fetchAdminUnknownMails(params: {
  limit?: number;
  offset?: number;
}): Promise<MailPage> {
  const qs = new URLSearchParams();
  qs.set("limit", String(params.limit ?? 50));
  qs.set("offset", String(params.offset ?? 0));
  const resp = await apiRequest<MailPage | RawMail[]>(
    `/admin/mails_unknow?${qs.toString()}`,
    { adminAuth: true }
  );
  return normalizeMailPage(resp);
}

/** Admin: delete any mail by ID. */
export async function adminDeleteMail(mailId: number): Promise<void> {
  await apiRequest(`/admin/mails/${mailId}`, {
    method: "DELETE",
    adminAuth: true,
  });
}

/** Admin: delete any sent mail by ID. */
export async function adminDeleteSentMail(mailId: number): Promise<void> {
  await apiRequest(`/admin/sendbox/${mailId}`, {
    method: "DELETE",
    adminAuth: true,
  });
}

/** Admin: clear inbox of a specific address. */
export async function adminClearInbox(address: string): Promise<void> {
  await apiRequest(`/admin/clear_inbox/${encodeURIComponent(address)}`, {
    method: "DELETE",
    adminAuth: true,
  });
}

/** Admin: clear sent items of a specific address. */
export async function adminClearSentItems(address: string): Promise<void> {
  await apiRequest(`/admin/clear_sent_items/${encodeURIComponent(address)}`, {
    method: "DELETE",
    adminAuth: true,
  });
}

/** Admin: delete any address. */
export async function adminDeleteAddress(addressId: number): Promise<void> {
  await apiRequest(`/admin/delete_address/${addressId}`, {
    method: "DELETE",
    adminAuth: true,
  });
}

/** Admin: send mail as any address (unlimited). */
export async function adminSendMail(payload: {
  from_mail: string;
  from_name: string;
  to_name: string;
  to_mail: string;
  subject: string;
  is_html: boolean;
  content: string;
}): Promise<{ success?: boolean }> {
  return apiRequest("/admin/send_mail", {
    method: "POST",
    adminAuth: true,
    body: payload,
  });
}

/** Admin: get system statistics. */
export async function fetchAdminStatistics(): Promise<AdminStatistics> {
  const resp = await apiRequest<AdminStatistics>("/admin/statistics", {
    adminAuth: true,
  });

  return {
    ...resp,
    address_count:
      typeof resp.address_count === "number"
        ? resp.address_count
        : typeof resp.addressCount === "number"
          ? resp.addressCount
          : 0,
    mail_count:
      typeof resp.mail_count === "number"
        ? resp.mail_count
        : typeof resp.mailCount === "number"
          ? resp.mailCount
          : 0,
    send_count:
      typeof resp.send_count === "number"
        ? resp.send_count
        : typeof resp.sendMailCount === "number"
          ? resp.sendMailCount
          : 0,
    unknow_mail_count:
      typeof resp.unknow_mail_count === "number"
        ? resp.unknow_mail_count
        : typeof resp.unknowMailCount === "number"
          ? resp.unknowMailCount
          : typeof resp.unknownMailCount === "number"
            ? resp.unknownMailCount
            : 0,
  };
}

/** Admin: show address credential (returns the address's JWT). */
export async function adminShowAddressCredential(
  addressId: number
): Promise<{ jwt?: string; password?: string; address?: string }> {
  return apiRequest(`/admin/show_password/${addressId}`, {
    adminAuth: true,
  });
}
