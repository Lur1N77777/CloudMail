import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  addAccount,
  adminLogin,
  buildWorkerDomainEntries,
  createAddress,
  deleteAddressAdmin,
  deleteMail,
  fetchSettings,
  fetchMailHistory,
  fetchMails,
  fetchMailsSince,
  getAccounts,
  getWorkerProfiles,
  getConfig,
  removeAccount,
  saveAccounts,
  saveConfig,
  saveWorkerProfiles,
  setActiveWorkerProfileId,
} from "../api";
import { sha256Hex } from "../sha256";
import { workerCredentialKey } from "../secure-credentials";

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    multiSet: vi.fn(),
    removeItem: vi.fn(),
    multiRemove: vi.fn(),
  },
}));

vi.mock("expo-secure-store", () => ({
  isAvailableAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

beforeEach(() => {
  (SecureStore.isAvailableAsync as any).mockResolvedValue(false);
  (SecureStore.getItemAsync as any).mockResolvedValue(null);
  (SecureStore.setItemAsync as any).mockResolvedValue(undefined);
  (SecureStore.deleteItemAsync as any).mockResolvedValue(undefined);
  (AsyncStorage.removeItem as any).mockResolvedValue(undefined);
  (AsyncStorage.multiRemove as any).mockResolvedValue(undefined);
});

describe("sha256Hex", () => {
  it("matches known SHA-256 vectors", () => {
    // Known empty-string SHA-256
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    // "abc" vector from FIPS 180-2
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    // Handle UTF-8 input
    expect(sha256Hex("中文密码")).toHaveLength(64);
  });
});

describe("getConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default values when storage is empty", async () => {
    (AsyncStorage.getItem as any).mockResolvedValue(null);
    const config = await getConfig();
    expect(config.workerUrl).toBe("");
    expect(config.adminPassword).toBe("");
    expect(config.sitePassword).toBe("");
    expect(config.refreshInterval).toBe(30);
    expect(config.lang).toBe("zh");
  });

  it("returns stored values", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      const map: Record<string, string> = {
        cloudmail_worker_url: "https://worker.example.com",
        cloudmail_admin_password: "admin123",
        cloudmail_site_password: "site456",
        cloudmail_refresh_interval: "60",
        cloudmail_lang: "en",
      };
      return Promise.resolve(map[key] || null);
    });

    const config = await getConfig();
    expect(config.workerUrl).toBe("https://worker.example.com");
    expect(config.adminPassword).toBe("admin123");
    expect(config.sitePassword).toBe("site456");
    expect(config.refreshInterval).toBe(60);
    expect(config.lang).toBe("en");
  });

  it("strips trailing slashes from workerUrl", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_url")
        return Promise.resolve("https://worker.example.com///");
      return Promise.resolve(null);
    });

    const config = await getConfig();
    expect(config.workerUrl).toBe("https://worker.example.com");
  });
});

describe("saveConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves config values to AsyncStorage", async () => {
    (AsyncStorage.multiSet as any).mockResolvedValue(undefined);
    await saveConfig({
      workerUrl: "https://test.com/",
      adminPassword: "pass",
      refreshInterval: 10,
    });
    expect(AsyncStorage.multiSet).toHaveBeenCalledTimes(1);
    const call = (AsyncStorage.multiSet as any).mock.calls[0][0];
    expect(call).toContainEqual(["cloudmail_worker_url", "https://test.com"]);
    expect(call).toContainEqual(["cloudmail_admin_password", "pass"]);
    expect(call).toContainEqual(["cloudmail_refresh_interval", "10"]);
  });
});

describe("worker profiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("migrates legacy single Worker config into one default profile", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      const map: Record<string, string> = {
        cloudmail_worker_url: "https://worker-a.example.com///",
        cloudmail_admin_password: "admin-a",
        cloudmail_site_password: "site-a",
      };
      return Promise.resolve(map[key] || null);
    });
    (AsyncStorage.setItem as any).mockResolvedValue(undefined);

    const profiles = await getWorkerProfiles();

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      name: "默认账号",
      workerUrl: "https://worker-a.example.com",
      adminPassword: "admin-a",
      sitePassword: "site-a",
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "cloudmail_worker_profiles",
      expect.stringContaining("https://worker-a.example.com")
    );
  });

  it("switches active profile and exposes it through getConfig", async () => {
    const profiles = [
      {
        id: "a",
        name: "账号 A",
        workerUrl: "https://worker-a.example.com",
        adminPassword: "pass-a",
        sitePassword: "",
        domains: ["1.com"],
        status: "connected",
      },
      {
        id: "b",
        name: "账号 B",
        workerUrl: "https://worker-b.example.com",
        adminPassword: "pass-b",
        sitePassword: "site-b",
        domains: ["4.com"],
        status: "connected",
      },
    ];
    let activeId = "a";
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_profiles") return Promise.resolve(JSON.stringify(profiles));
      if (key === "cloudmail_active_worker_profile_id") return Promise.resolve(activeId);
      if (key === "cloudmail_refresh_interval") return Promise.resolve("60");
      return Promise.resolve(null);
    });
    (AsyncStorage.setItem as any).mockImplementation((key: string, value: string) => {
      if (key === "cloudmail_active_worker_profile_id") activeId = value;
      return Promise.resolve(undefined);
    });
    (AsyncStorage.multiSet as any).mockResolvedValue(undefined);

    await setActiveWorkerProfileId("b");
    const config = await getConfig();

    expect(config.workerUrl).toBe("https://worker-b.example.com");
    expect(config.adminPassword).toBe("pass-b");
    expect(config.sitePassword).toBe("site-b");
    expect(config.refreshInterval).toBe(60);
  });

  it("builds global domain entries and marks duplicated domains as conflicts", () => {
    const entries = buildWorkerDomainEntries([
      {
        id: "a",
        name: "账号 A",
        workerUrl: "https://worker-a.example.com",
        frontendUrl: "",
        adminPassword: "pass-a",
        domains: ["1.com", "shared.com"],
        randomSubdomainDomains: ["1.com"],
        status: "connected",
      },
      {
        id: "b",
        name: "账号 B",
        workerUrl: "https://worker-b.example.com",
        frontendUrl: "",
        adminPassword: "pass-b",
        domains: ["4.com", "shared.com"],
        status: "connected",
      },
    ]);

    expect(entries.find((item) => item.domain === "1.com")).toMatchObject({
      workerProfileId: "a",
      supportsRandom: true,
      conflict: false,
    });
    expect(entries.filter((item) => item.domain === "shared.com").every((item) => item.conflict)).toBe(true);
  });

  it("migrates profile passwords to SecureStore before removing plaintext metadata", async () => {
    let storedProfiles = JSON.stringify([
      {
        id: "worker-a",
        name: "账号 A",
        workerUrl: "https://worker-a.example.com",
        frontendUrl: "",
        adminPassword: "admin-secret",
        sitePassword: "site-secret",
        domains: ["example.com"],
        status: "connected",
      },
    ]);
    (SecureStore.isAvailableAsync as any).mockResolvedValue(true);
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_profiles") return Promise.resolve(storedProfiles);
      if (key === "cloudmail_active_worker_profile_id") return Promise.resolve("worker-a");
      return Promise.resolve(null);
    });
    (AsyncStorage.setItem as any).mockImplementation((key: string, value: string) => {
      if (key === "cloudmail_worker_profiles") storedProfiles = value;
      return Promise.resolve(undefined);
    });

    const profiles = await getWorkerProfiles();

    expect(profiles[0]).toMatchObject({
      adminPassword: "admin-secret",
      sitePassword: "site-secret",
    });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^cloudmail\.secure\.v1\./),
      "admin-secret"
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^cloudmail\.secure\.v1\./),
      "site-secret"
    );
    expect(storedProfiles).not.toContain("admin-secret");
    expect(storedProfiles).not.toContain("site-secret");
  });

  it("keeps plaintext profile metadata when SecureStore migration fails", async () => {
    const originalProfiles = JSON.stringify([
      {
        id: "worker-a",
        name: "账号 A",
        workerUrl: "https://worker-a.example.com",
        frontendUrl: "",
        adminPassword: "still-readable",
        sitePassword: "",
        domains: [],
        status: "connected",
      },
    ]);
    (SecureStore.isAvailableAsync as any).mockResolvedValue(true);
    (SecureStore.setItemAsync as any).mockRejectedValue(new Error("keystore unavailable"));
    (AsyncStorage.getItem as any).mockImplementation((key: string) =>
      Promise.resolve(key === "cloudmail_worker_profiles" ? originalProfiles : null)
    );

    const profiles = await getWorkerProfiles();

    expect(profiles[0].adminPassword).toBe("still-readable");
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      "cloudmail_worker_profiles",
      expect.not.stringContaining("still-readable")
    );
  });

  it("starts secure credential reads for all profiles concurrently", async () => {
    const storedProfiles = JSON.stringify([
      {
        id: "worker-a",
        name: "账号 A",
        workerUrl: "https://worker-a.example.com",
        frontendUrl: "",
        domains: [],
        status: "connected",
      },
      {
        id: "worker-b",
        name: "账号 B",
        workerUrl: "https://worker-b.example.com",
        frontendUrl: "",
        domains: [],
        status: "connected",
      },
    ]);
    const pendingReads: ((value: string | null) => void)[] = [];
    (SecureStore.isAvailableAsync as any).mockResolvedValue(true);
    (SecureStore.getItemAsync as any).mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          pendingReads.push(resolve);
        })
    );
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_profiles") return Promise.resolve(storedProfiles);
      if (key === "cloudmail_active_worker_profile_id") return Promise.resolve("worker-a");
      return Promise.resolve(null);
    });

    const profilesPromise = getWorkerProfiles();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();

    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(4);
    pendingReads.forEach((resolve) => resolve(null));
    await expect(profilesPromise).resolves.toHaveLength(2);
  });

  it("removes SecureStore entries for worker profiles deleted during save", async () => {
    const storedProfiles = JSON.stringify([
      {
        id: "worker-a",
        name: "账号 A",
        workerUrl: "https://worker-a.example.com",
        frontendUrl: "",
        domains: [],
        status: "connected",
      },
      {
        id: "worker-b",
        name: "账号 B",
        workerUrl: "https://worker-b.example.com",
        frontendUrl: "",
        domains: [],
        status: "connected",
      },
    ]);
    (SecureStore.isAvailableAsync as any).mockResolvedValue(true);
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_profiles") return Promise.resolve(storedProfiles);
      if (key === "cloudmail_active_worker_profile_id") return Promise.resolve("worker-a");
      return Promise.resolve(null);
    });

    await saveWorkerProfiles([
      {
        id: "worker-a",
        name: "账号 A",
        workerUrl: "https://worker-a.example.com",
        frontendUrl: "",
        adminPassword: "admin-a",
        sitePassword: "",
        domains: [],
        status: "connected",
      },
    ]);

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      workerCredentialKey("worker-b", "admin")
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      workerCredentialKey("worker-b", "site")
    );
  });
});

describe("getAccounts / saveAccounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no accounts stored", async () => {
    (AsyncStorage.getItem as any).mockResolvedValue(null);
    const accounts = await getAccounts();
    expect(accounts).toEqual([]);
  });

  it("returns parsed accounts", async () => {
    const mockAccounts = [
      { address: "test@example.com", jwt: "token123", createdAt: "2024-01-01" },
    ];
    (AsyncStorage.getItem as any).mockResolvedValue(
      JSON.stringify(mockAccounts)
    );
    const accounts = await getAccounts();
    expect(accounts).toEqual(mockAccounts);
    expect(accounts[0].address).toBe("test@example.com");
  });

  it("migrates account JWT and password to SecureStore without changing the hydrated account", async () => {
    let storedAccounts = JSON.stringify([
      {
        address: "secure@example.com",
        jwt: "address-jwt",
        password: "address-password",
        createdAt: "2024-01-01",
        workerProfileId: "worker-a",
      },
    ]);
    (SecureStore.isAvailableAsync as any).mockResolvedValue(true);
    (AsyncStorage.getItem as any).mockImplementation((key: string) =>
      Promise.resolve(key === "cloudmail_accounts" ? storedAccounts : null)
    );
    (AsyncStorage.setItem as any).mockImplementation((key: string, value: string) => {
      if (key === "cloudmail_accounts") storedAccounts = value;
      return Promise.resolve(undefined);
    });

    const accounts = await getAccounts();

    expect(accounts[0]).toMatchObject({ jwt: "address-jwt", password: "address-password" });
    expect(storedAccounts).not.toContain("address-jwt");
    expect(storedAccounts).not.toContain("address-password");
  });

  it("does not replace account metadata when secure credential persistence fails", async () => {
    (SecureStore.isAvailableAsync as any).mockResolvedValue(true);
    (SecureStore.setItemAsync as any).mockRejectedValue(new Error("keystore unavailable"));

    await expect(
      saveAccounts([
        { address: "safe@example.com", jwt: "must-not-be-lost", createdAt: "2024-01-01" },
      ])
    ).rejects.toThrow("keystore unavailable");
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      "cloudmail_accounts",
      expect.any(String)
    );
  });

  it("starts secure credential reads for all accounts concurrently", async () => {
    const storedAccounts = JSON.stringify([
      {
        address: "first@example.com",
        createdAt: "2024-01-01",
        workerProfileId: "worker-a",
      },
      {
        address: "second@example.com",
        createdAt: "2024-01-02",
        workerProfileId: "worker-a",
      },
    ]);
    const pendingReads: ((value: string | null) => void)[] = [];
    (SecureStore.isAvailableAsync as any).mockResolvedValue(true);
    (SecureStore.getItemAsync as any).mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          pendingReads.push(resolve);
        })
    );
    (AsyncStorage.getItem as any).mockImplementation((key: string) =>
      Promise.resolve(key === "cloudmail_accounts" ? storedAccounts : null)
    );

    const accountsPromise = getAccounts();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();

    expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(4);
    pendingReads.forEach((resolve) => resolve(null));
    await expect(accountsPromise).resolves.toHaveLength(2);
  });
});

describe("addAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds a new account to the list", async () => {
    const existing = [
      { address: "a@b.com", jwt: "t1", createdAt: "2024-01-01" },
    ];
    (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(existing));
    (AsyncStorage.setItem as any).mockResolvedValue(undefined);

    await addAccount({
      address: "c@d.com",
      jwt: "t2",
      createdAt: "2024-01-02",
    });

    expect(AsyncStorage.setItem).toHaveBeenCalled();
    const savedData = JSON.parse(
      (AsyncStorage.setItem as any).mock.calls[0][1]
    );
    expect(savedData).toHaveLength(2);
    expect(savedData[1].address).toBe("c@d.com");
  });

  it("updates in place when address already exists", async () => {
    const existing = [
      { address: "a@b.com", jwt: "old", createdAt: "2024-01-01" },
    ];
    (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify(existing));
    (AsyncStorage.setItem as any).mockResolvedValue(undefined);

    await addAccount({
      address: "a@b.com",
      jwt: "new",
      createdAt: "2024-01-02",
    });

    // Should have been called once for saveAccounts (setItem) and once for setActiveAccountIndex
    expect(AsyncStorage.setItem).toHaveBeenCalled();
    const savedData = JSON.parse(
      (AsyncStorage.setItem as any).mock.calls[0][1]
    );
    expect(savedData).toHaveLength(1);
    expect(savedData[0].jwt).toBe("new");
  });

  it("keeps the same email address separate across Worker profiles", async () => {
    let storedAccounts = [
      {
        address: "same@example.com",
        jwt: "jwt-a",
        createdAt: "2024-01-01",
        workerProfileId: "worker-a",
        workerUrl: "https://worker-a.example.com",
      },
    ];
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_accounts") {
        return Promise.resolve(JSON.stringify(storedAccounts));
      }
      return Promise.resolve(null);
    });
    (AsyncStorage.setItem as any).mockImplementation((key: string, value: string) => {
      if (key === "cloudmail_accounts") {
        storedAccounts = JSON.parse(value);
      }
      return Promise.resolve(undefined);
    });

    await addAccount({
      address: "same@example.com",
      jwt: "jwt-b",
      createdAt: "2024-01-02",
      workerProfileId: "worker-b",
      workerUrl: "https://worker-b.example.com",
    });

    expect(storedAccounts).toHaveLength(2);
    expect(storedAccounts.map((account) => account.jwt)).toEqual(["jwt-a", "jwt-b"]);

    await addAccount({
      address: "same@example.com",
      jwt: "jwt-b-new",
      createdAt: "2024-01-03",
      workerProfileId: "worker-b",
      workerUrl: "https://worker-b.example.com",
    });

    expect(storedAccounts).toHaveLength(2);
    expect(storedAccounts[0].jwt).toBe("jwt-a");
    expect(storedAccounts[1]).toMatchObject({
      jwt: "jwt-b-new",
      workerProfileId: "worker-b",
    });
  });
});

describe("removeAccount", () => {
  it("does not delete shared SecureStore entries while a duplicate identity remains", async () => {
    const storedAccounts = JSON.stringify([
      {
        address: "duplicate@example.com",
        createdAt: "2024-01-01",
        workerProfileId: "worker-a",
      },
      {
        address: "duplicate@example.com",
        createdAt: "2024-01-02",
        workerProfileId: "worker-a",
      },
    ]);
    (SecureStore.isAvailableAsync as any).mockResolvedValue(true);
    (SecureStore.getItemAsync as any).mockResolvedValue("stored-credential");
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_accounts") return Promise.resolve(storedAccounts);
      if (key === "cloudmail_active_account_index") return Promise.resolve("0");
      return Promise.resolve(null);
    });

    await removeAccount(0);

    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});

describe("fetchSettings", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("prefers the upstream open_api settings route and sends x-lang header", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_url") {
        return Promise.resolve("https://worker.example.com");
      }
      return Promise.resolve(null);
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({ domains: ["mail.example.com"], domainLabels: ["Mail"] })
        ),
    });

    const settings = await fetchSettings();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://worker.example.com/open_api/settings",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-lang": "zh",
        }),
      })
    );
    expect(settings.domains).toEqual(["mail.example.com"]);
    expect(settings.domainLabels).toEqual(["Mail"]);
    // Raw response retained for diagnostics
    expect((settings._raw as any)?.domains).toEqual(["mail.example.com"]);
  });

  it("falls back to defaultDomains when domains is absent or empty", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_url") {
        return Promise.resolve("https://worker.example.com");
      }
      return Promise.resolve(null);
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            defaultDomains: ["saved.example.com", "backup.example.com"],
          })
        ),
    });

    const settings = await fetchSettings();

    expect(settings.domains).toEqual([
      "saved.example.com",
      "backup.example.com",
    ]);
    expect(settings.defaultDomains).toEqual([
      "saved.example.com",
      "backup.example.com",
    ]);
  });

  it("falls back to /api/settings when open_api is unavailable", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_url") {
        return Promise.resolve("https://worker.example.com");
      }
      return Promise.resolve(null);
    });

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ error: "Not Found" })),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(JSON.stringify({ domains: ["fallback.example.com"] })),
      });

    const settings = await fetchSettings();

    expect((global.fetch as any).mock.calls[0][0]).toBe(
      "https://worker.example.com/open_api/settings"
    );
    expect((global.fetch as any).mock.calls[1][0]).toBe(
      "https://worker.example.com/api/settings"
    );
    expect(settings.domains).toEqual(["fallback.example.com"]);
  });

  it("includes x-user-token when JWT is provided", async () => {
    // Direct test on the internal request helper via fetchMailHistory
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_url") {
        return Promise.resolve("https://worker.example.com");
      }
      return Promise.resolve(null);
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify([])),
    });

    await fetchMailHistory("jwt-token", { pageSize: 2, maxPages: 1 });

    const headers = (global.fetch as any).mock.calls[0][1].headers;
    expect(headers["Authorization"]).toBe("Bearer jwt-token");
    expect(headers["x-user-token"]).toBe("jwt-token");
    expect(headers["x-lang"]).toBe("zh");
  });
});

describe("createAddress multi-worker routing", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("uses the Worker profile selected by domain routing", async () => {
    const profiles = [
      {
        id: "a",
        name: "账号 A",
        workerUrl: "https://worker-a.example.com",
        adminPassword: "pass-a",
        sitePassword: "",
        domains: ["1.com"],
        status: "connected",
      },
      {
        id: "b",
        name: "账号 B",
        workerUrl: "https://worker-b.example.com",
        adminPassword: "pass-b",
        sitePassword: "site-b",
        domains: ["4.com"],
        status: "connected",
      },
    ];
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_profiles") return Promise.resolve(JSON.stringify(profiles));
      if (key === "cloudmail_active_worker_profile_id") return Promise.resolve("a");
      return Promise.resolve(null);
    });
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({ address: "demo@4.com", jwt: "jwt-b", address_id: 7 })
        ),
    });

    const result = await createAddress({
      name: "demo",
      domain: "4.com",
      workerProfileId: "b",
    });

    expect(result.address).toBe("demo@4.com");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://worker-b.example.com/admin/new_address",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-admin-auth": "pass-b",
          "x-custom-auth": "site-b",
        }),
      })
    );
  });

});

describe("adminLogin", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("falls back to header auth without writing temporary config and reuses the winning strategy", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      const map: Record<string, string> = {
        cloudmail_worker_url: "https://worker-header.example.com",
        cloudmail_site_password: "site-pass",
      };
      return Promise.resolve(map[key] || null);
    });

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ error: "missing" })),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ address_count: 1 })),
      });

    await expect(adminLogin("admin-secret")).resolves.toBe(true);

    expect(AsyncStorage.multiSet).not.toHaveBeenCalled();
    expect((global.fetch as any).mock.calls[1][0]).toBe(
      "https://worker-header.example.com/admin/statistics"
    );
    expect((global.fetch as any).mock.calls[1][1].headers).toMatchObject({
      "x-custom-auth": "site-pass",
      "x-admin-auth": "admin-secret",
    });

    (global.fetch as any).mockClear();
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ address_count: 2 })),
    });

    await expect(adminLogin("admin-secret")).resolves.toBe(true);

    expect((global.fetch as any).mock.calls).toHaveLength(1);
    expect((global.fetch as any).mock.calls[0][0]).toBe(
      "https://worker-header.example.com/admin/statistics"
    );
  });

  it("reports credential rejection when a legacy Worker lacks the open login route", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) =>
      Promise.resolve(
        key === "cloudmail_worker_url"
          ? "https://worker-auth-error.example.com"
          : null
      )
    );
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("missing"),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve("admin password rejected"),
      });

    await expect(adminLogin("wrong-password")).rejects.toMatchObject({
      status: 401,
      path: "/admin/statistics",
    });
  });
});

describe("deleteMail", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_url") {
        return Promise.resolve("https://worker.example.com");
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("prefers the singular delete route and verifies the mail is gone", async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve(""),
      });

    await deleteMail("jwt-token", 123);

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://worker.example.com/api/mail/123",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-token",
          "x-user-token": "jwt-token",
        }),
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://worker.example.com/api/mail/123",
      expect.objectContaining({
        method: "GET",
      })
    );
  });

  it("falls back to the plural delete route when the singular route is unavailable", async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("not found"),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(""),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve(""),
      });

    await deleteMail("jwt-token", 456);

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://worker.example.com/api/mail/456",
      expect.objectContaining({
        method: "DELETE",
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://worker.example.com/api/mails/456",
      expect.objectContaining({
        method: "DELETE",
      })
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "https://worker.example.com/api/mail/456",
      expect.objectContaining({
        method: "GET",
      })
    );
  });
});

describe("fetchMailHistory", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("walks paginated mail history until the final short page", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_url") {
        return Promise.resolve("https://worker.example.com");
      }
      return Promise.resolve(null);
    });

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify([
              { id: 1, source: "m1", created_at: "2026-01-01T00:00:00Z" },
              { id: 2, source: "m2", created_at: "2026-01-01T00:01:00Z" },
            ])
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () =>
          Promise.resolve(
            JSON.stringify([
              { id: 3, source: "m3", created_at: "2026-01-01T00:02:00Z" },
            ])
          ),
      });

    const mails = await fetchMailHistory("jwt-token", {
      pageSize: 2,
      maxPages: 5,
    });

    expect((global.fetch as any).mock.calls[0][0]).toContain(
      "/api/mails?limit=2&offset=0"
    );
    expect((global.fetch as any).mock.calls[1][0]).toContain(
      "/api/mails?limit=2&offset=2"
    );
    expect(mails.map((mail) => mail.id)).toEqual([1, 2, 3]);
  });
});

describe("fetchMailsSince", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      if (key === "cloudmail_worker_url") {
        return Promise.resolve("https://worker.example.com");
      }
      return Promise.resolve(null);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("walks pages until it reaches the old anchor before advancing the anchor", async () => {
    const page1 = Array.from({ length: 50 }, (_, index) => ({
      id: 160 - index,
      source: `m${160 - index}`,
      created_at: "2026-01-01T00:00:00Z",
    }));
    const page2 = Array.from({ length: 50 }, (_, index) => ({
      id: 110 - index,
      source: `m${110 - index}`,
      created_at: "2026-01-01T00:01:00Z",
    }));

    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ results: page1, count: 100 })),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ results: page2, count: 100 })),
      });

    const result = await fetchMailsSince("jwt-token", 100);

    expect((global.fetch as any).mock.calls[0][0]).toContain(
      "/api/mails?limit=50&offset=0"
    );
    expect((global.fetch as any).mock.calls[1][0]).toContain(
      "/api/mails?limit=50&offset=50"
    );
    expect(result.newMails).toHaveLength(60);
    expect(result.latestMailId).toBe(160);
    expect(result.hasMore).toBe(false);
  });
});

describe("account scoped API routing", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("uses explicit account Worker config instead of the active Worker", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      const map: Record<string, string> = {
        cloudmail_worker_url: "https://active-worker.example.com",
        cloudmail_admin_password: "active-pass",
      };
      return Promise.resolve(map[key] || null);
    });
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ results: [], count: 0 })),
    });

    await fetchMails("jwt-b", 10, 0, {
      configOverride: {
        workerUrl: "https://account-worker.example.com",
        sitePassword: "site-b",
        lang: "zh",
      },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://account-worker.example.com/api/mails?limit=10&offset=0",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-custom-auth": "site-b",
          "x-user-token": "jwt-b",
        }),
      })
    );
  });

  it("routes admin address deletion to the account Worker when provided", async () => {
    (AsyncStorage.getItem as any).mockImplementation((key: string) => {
      const map: Record<string, string> = {
        cloudmail_worker_url: "https://active-worker.example.com",
        cloudmail_admin_password: "active-pass",
      };
      return Promise.resolve(map[key] || null);
    });
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(""),
    });

    await deleteAddressAdmin(42, {
      configOverride: {
        workerUrl: "https://account-worker.example.com",
        adminPassword: "account-admin",
        sitePassword: "site-b",
        lang: "zh",
      },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://account-worker.example.com/admin/delete_address/42",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          "x-admin-auth": "account-admin",
          "x-custom-auth": "site-b",
        }),
      })
    );
  });
});
