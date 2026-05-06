import { beforeEach, describe, expect, it, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ParsedMail } from "../api";
import { readMailboxCache, writeMailboxCache } from "../mail-cache";

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
});
