import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedMail } from "../api";
import {
  __resetAdminMailSpamStateForTests,
  blockAdminMailSender,
  getAdminMailSpamSender,
  isAdminMailSpamBySenderSet,
  loadAdminMailSpamSenderSet,
  subscribeAdminMailSpamState,
  unblockAdminMailSender,
} from "../admin-mail-spam-state";

const storage = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
  },
}));

function makeMail(overrides: Partial<ParsedMail> = {}): ParsedMail {
  return {
    id: 1,
    messageId: "message-1@example.com",
    from: { address: "Sender@Example.com" },
    to: [{ address: "target@example.com" }],
    subject: "验证码",
    text: "Your code is 123456",
    raw: "Your code is 123456",
    createdAt: "2026-04-25T10:00:00.000Z",
    date: "2026-04-25T10:00:00.000Z",
    mailboxKind: "inbox",
    ...overrides,
  };
}

describe("admin mail spam state", () => {
  beforeEach(() => {
    storage.clear();
    __resetAdminMailSpamStateForTests();
  });

  it("normalizes sender addresses from mails", () => {
    expect(getAdminMailSpamSender(makeMail())).toBe("sender@example.com");
    expect(getAdminMailSpamSender(makeMail({ from: undefined }))).toBe("");
  });

  it("blocks and unblocks a sender per worker", async () => {
    const workerUrl = "https://worker.example.com";
    const mail = makeMail();

    await blockAdminMailSender(workerUrl, mail);
    const blocked = await loadAdminMailSpamSenderSet(workerUrl);
    expect(blocked.has("sender@example.com")).toBe(true);
    expect(isAdminMailSpamBySenderSet(mail, blocked)).toBe(true);

    await unblockAdminMailSender(workerUrl, "sender@example.com");
    const afterUnblock = await loadAdminMailSpamSenderSet(workerUrl);
    expect(afterUnblock.has("sender@example.com")).toBe(false);
  });

  it("keeps blocked sender rules scoped by worker", async () => {
    await blockAdminMailSender("https://worker-a.example.com", makeMail());

    const blockedA = await loadAdminMailSpamSenderSet("https://worker-a.example.com");
    const blockedB = await loadAdminMailSpamSenderSet("https://worker-b.example.com");

    expect(blockedA.has("sender@example.com")).toBe(true);
    expect(blockedB.has("sender@example.com")).toBe(false);
  });

  it("does not create a rule without a sender address", async () => {
    const result = await blockAdminMailSender(
      "https://worker.example.com",
      makeMail({ from: undefined })
    );
    const blocked = await loadAdminMailSpamSenderSet("https://worker.example.com");

    expect(result).toBeNull();
    expect(blocked.size).toBe(0);
  });

  it("emits scoped blocked-sender payloads", async () => {
    const events: { workerUrl: string; blockedSenders: Set<string> }[] = [];
    const unsubscribe = subscribeAdminMailSpamState((event) => {
      events.push(event);
    });

    await blockAdminMailSender("https://worker.example.com", makeMail());
    unsubscribe();

    expect(events.at(-1)?.workerUrl).toBe("https://worker.example.com");
    expect(events.at(-1)?.blockedSenders.has("sender@example.com")).toBe(true);
  });
});
