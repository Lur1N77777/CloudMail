import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addAccount,
  adminLogin,
  deleteMail,
  fetchSettings,
  fetchMailHistory,
  getAccounts,
  getConfig,
  saveConfig,
} from "../api";
import { sha256Hex } from "../sha256";

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    multiSet: vi.fn(),
  },
}));

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
