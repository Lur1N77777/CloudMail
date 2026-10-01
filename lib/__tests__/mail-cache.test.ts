import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ParsedMail } from "../api";
import { readMailboxCache, writeMailboxCache } from "../mail-cache";
import { readAdminMailCache, writeAdminMailCache } from "../admin-mail-cache";
import { getSyncAnchor, setSyncAnchor } from "../mail-sync-anchor";

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
      return Promise.resolve();
    }),
  },
}));

describe("mail cache", () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
  });

  it("preserves body fields needed for cached detail view and download", async () => {
    const mail: ParsedMail = {
      id: 1,
      subject: "Hello",
      text: "Plain body",
      html: "<p>HTML body</p>",
      raw: "Raw MIME body",
      createdAt: "2026-01-01T00:00:00Z",
      attachments: [
        {
          filename: "demo.txt",
          mimeType: "text/plain",
          size: 4,
          content: new TextEncoder().encode("demo").buffer,
        },
      ],
    };

    await writeMailboxCache(
      { workerUrl: "https://worker.example.com", address: "demo@example.com", box: "inbox" },
      [mail]
    );

    const cached = await readMailboxCache({
      workerUrl: "https://worker.example.com",
      address: "demo@example.com",
      box: "inbox",
    });

    expect(cached[0]).toMatchObject({
      id: 1,
      subject: "Hello",
      text: "Plain body",
      html: "<p>HTML body</p>",
      raw: "Raw MIME body",
      createdAt: "2026-01-01T00:00:00Z",
      attachments: [{ filename: "demo.txt", mimeType: "text/plain", size: 4 }],
    });
    expect(cached[0].attachments?.[0].content).toBeUndefined();
  });

  it("uses legacy summary preview as a text fallback instead of returning a blank cached mail", async () => {
    (AsyncStorage.getItem as any).mockResolvedValueOnce(
      JSON.stringify({
        updatedAt: "2026-01-01T00:00:00Z",
        mails: [
          {
            id: 2,
            subject: "Cached summary",
            preview: "Preview-only body",
            raw: "",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
      })
    );

    const cached = await readMailboxCache({
      workerUrl: "https://worker.example.com",
      address: "demo@example.com",
      box: "inbox",
    });

    expect(cached[0].text).toBe("Preview-only body");
    expect(cached[0].raw).toBe("");
  });

  it("repairs legacy Chinese bodies without losing cached IDs or the sync anchor", async () => {
    const scope = {
      workerUrl: "https://worker.example.com",
      address: "demo@example.com",
      box: "inbox" as const,
    };
    const raw = [
      "From: sender@example.com",
      "To: demo@example.com",
      "Subject: =?GB2312?B?1tDOxA==?=",
      'Content-Type: multipart/alternative; boundary="parts"',
      "",
      "--parts",
      "Content-Type: text/plain; charset=GB2312",
      "Content-Transfer-Encoding: base64",
      "",
      "1tDOxA==",
      "--parts",
      "Content-Type: text/html; charset=GB2312",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "<p>=D6=D0=CE=C4</p>",
      "--parts--",
    ].join("\r\n");
    const mail: ParsedMail = {
      id: 42,
      messageId: "message-42",
      subject: "����",
      text: "����",
      html: "<p>����</p>",
      raw,
      createdAt: "2026-01-01T00:00:00Z",
      ownerAddress: scope.address,
      sourcePrefix: "test",
      mailboxKind: "inbox",
      metadata: '{"tag":"keep"}',
    };
    const anchor = {
      latestMailId: 42,
      latestCreatedAt: mail.createdAt,
      totalFetched: 1,
    };
    await writeMailboxCache(scope, [mail]);
    const cacheKey = [...storage.keys()][0];
    const legacy = JSON.parse(storage.get(cacheKey)!);
    delete legacy.parserVersion;
    storage.set(cacheKey, JSON.stringify(legacy));
    await setSyncAnchor(scope, anchor);

    const cached = await readMailboxCache(scope);

    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatchObject({
      id: 42,
      messageId: "message-42",
      subject: "中文",
      text: "中文",
      raw,
      createdAt: mail.createdAt,
      ownerAddress: scope.address,
      sourcePrefix: "test",
      mailboxKind: "inbox",
      metadata: mail.metadata,
    });
    expect(cached[0].html?.trim()).toBe("<p>中文</p>");
    expect(await getSyncAnchor(scope)).toEqual(anchor);
    expect(JSON.parse(storage.get(cacheKey)!).mails[0].text).toBe("中文");
    // The persisted migration is reused on the next read, without another write.
    vi.mocked(AsyncStorage.setItem).mockClear();
    expect((await readMailboxCache(scope))[0].text).toBe("中文");
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("returns repaired bodies even when saving the migration fails", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify({
      mails: [{
        id: 9,
        raw: "Content-Type: text/plain; charset=GBK\r\nContent-Transfer-Encoding: base64\r\n\r\n1tDOxA==",
        text: "����",
        createdAt: "2026-01-01T00:00:00Z",
      }],
    }));
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("Storage full"));

    const cached = await readMailboxCache({ address: "demo@example.com", box: "inbox" });

    expect(cached[0].text).toBe("中文");
  });

  it("discards legacy admin summaries and offsets so page zero can be refetched", async () => {
    const mail: ParsedMail = {
      id: 42,
      subject: "中文",
      text: "中文",
      raw: "original MIME",
      createdAt: "2026-01-01T00:00:00Z",
    };
    const scope = "https://worker.example.com";
    await writeAdminMailCache("inbox", scope, { mails: [mail], count: 80, offset: 20 });
    const cacheKey = [...storage.keys()][0];
    const legacy = JSON.parse(storage.get(cacheKey)!);
    delete legacy.parserVersion;
    legacy.mails[0].subject = "����";
    storage.set(cacheKey, JSON.stringify(legacy));

    expect(await readAdminMailCache("inbox", scope)).toBeNull();

    await writeAdminMailCache("inbox", scope, { mails: [mail], count: 80, offset: 1 });
    expect(await readAdminMailCache("inbox", scope)).toMatchObject({
      count: 80,
      offset: 1,
      mails: [{ id: 42, subject: "中文", raw: "" }],
    });
  });
});
