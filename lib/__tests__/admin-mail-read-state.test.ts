import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParsedMail } from "../api";
import {
  __resetAdminMailReadStateForTests,
  buildAdminMailReadKey,
  loadAdminMailUnreadKeySet,
  markAllAdminMailsRead,
  markAdminMailRead,
  reconcileAdminMailReadState,
  subscribeAdminMailReadState,
} from "../admin-mail-read-state";

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
    from: { address: "sender@example.com" },
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

describe("admin mail read state", () => {
  beforeEach(() => {
    storage.clear();
    __resetAdminMailReadStateForTests();
  });

  it("uses the same identity for the same Message-ID across boxes", () => {
    const inboxMail = makeMail({ id: 1, mailboxKind: "inbox" });
    const unknownMail = makeMail({ id: 99, mailboxKind: "unknown" });

    expect(buildAdminMailReadKey(inboxMail)).toBe(
      buildAdminMailReadKey(unknownMail)
    );
  });

  it("treats the first loaded batch as baseline read mails", async () => {
    const unread = await reconcileAdminMailReadState({
      workerUrl: "https://worker.example.com",
      viewKey: "admin:inbox",
      mails: [makeMail()],
    });

    expect(unread.size).toBe(0);
    const persistedUnread = await loadAdminMailUnreadKeySet(
      "https://worker.example.com"
    );
    expect(persistedUnread.size).toBe(0);
  });

  it("marks mails newer than the baseline as unread", async () => {
    const workerUrl = "https://worker.example.com";
    const oldMail = makeMail();
    const newMail = makeMail({
      id: 2,
      messageId: "message-2@example.com",
      text: "Your code is 654321",
      raw: "Your code is 654321",
      createdAt: "2026-04-25T10:01:00.000Z",
      date: "2026-04-25T10:01:00.000Z",
    });

    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [oldMail],
    });
    const unread = await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [newMail, oldMail],
    });

    expect(unread.has(buildAdminMailReadKey(newMail))).toBe(true);
    expect(unread.has(buildAdminMailReadKey(oldMail))).toBe(false);
  });

  it("clears unread state when a mail is marked read", async () => {
    const workerUrl = "https://worker.example.com";
    const oldMail = makeMail();
    const newMail = makeMail({
      id: 2,
      messageId: "message-2@example.com",
      createdAt: "2026-04-25T10:01:00.000Z",
      date: "2026-04-25T10:01:00.000Z",
    });

    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [oldMail],
    });
    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [newMail, oldMail],
    });
    await markAdminMailRead(workerUrl, newMail);

    const unread = await loadAdminMailUnreadKeySet(workerUrl);
    expect(unread.has(buildAdminMailReadKey(newMail))).toBe(false);
  });

  it("clears all unread state for the current worker", async () => {
    const workerUrl = "https://worker.example.com";
    const oldMail = makeMail();
    const newMail = makeMail({
      id: 2,
      messageId: "message-2@example.com",
      createdAt: "2026-04-25T10:01:00.000Z",
      date: "2026-04-25T10:01:00.000Z",
    });

    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [oldMail],
    });
    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [newMail, oldMail],
    });
    await markAllAdminMailsRead(workerUrl);

    const unread = await loadAdminMailUnreadKeySet(workerUrl);
    expect(unread.size).toBe(0);
  });

  it("syncs read state between inbox and unknown copies of the same mail", async () => {
    const workerUrl = "https://worker.example.com";
    const oldMail = makeMail();
    const inboxMail = makeMail({
      id: 2,
      messageId: "shared-message@example.com",
      mailboxKind: "inbox",
      createdAt: "2026-04-25T10:01:00.000Z",
      date: "2026-04-25T10:01:00.000Z",
    });
    const unknownMail = makeMail({
      id: 88,
      messageId: "shared-message@example.com",
      mailboxKind: "unknown",
      createdAt: "2026-04-25T10:01:00.000Z",
      date: "2026-04-25T10:01:00.000Z",
    });

    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [oldMail],
    });
    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [inboxMail, oldMail],
    });
    await markAdminMailRead(workerUrl, unknownMail);

    const unread = await loadAdminMailUnreadKeySet(workerUrl);
    expect(unread.has(buildAdminMailReadKey(inboxMail))).toBe(false);
    expect(buildAdminMailReadKey(inboxMail)).toBe(
      buildAdminMailReadKey(unknownMail)
    );
  });

  it("does not let a first-time address baseline swallow a global new mail", async () => {
    const workerUrl = "https://worker.example.com";
    const oldMail = makeMail();
    const newMail = makeMail({
      id: 2,
      messageId: "message-2@example.com",
      createdAt: "2026-04-25T10:01:00.000Z",
      date: "2026-04-25T10:01:00.000Z",
    });

    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [oldMail],
    });

    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin-address:target@example.com:inbox",
      mails: [newMail, oldMail],
    });

    const unread = await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [newMail, oldMail],
    });

    expect(unread.has(buildAdminMailReadKey(newMail))).toBe(true);
  });

  it("does not upgrade a baseline mail after explicit read", async () => {
    const workerUrl = "https://worker.example.com";
    const oldMail = makeMail();
    const newMail = makeMail({
      id: 2,
      messageId: "message-2@example.com",
      createdAt: "2026-04-25T10:01:00.000Z",
      date: "2026-04-25T10:01:00.000Z",
    });

    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [oldMail],
    });
    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin-address:target@example.com:inbox",
      mails: [newMail, oldMail],
    });
    await markAdminMailRead(workerUrl, newMail);

    const unread = await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [newMail, oldMail],
    });

    expect(unread.has(buildAdminMailReadKey(newMail))).toBe(false);
  });

  it("uses the same fallback identity without Message-ID", () => {
    const inboxMail = makeMail({
      id: 7,
      messageId: undefined,
      mailboxKind: "inbox",
    });
    const unknownMail = makeMail({
      id: 99,
      messageId: undefined,
      mailboxKind: "unknown",
    });

    expect(buildAdminMailReadKey(inboxMail)).toBe(
      buildAdminMailReadKey(unknownMail)
    );
  });

  it("emits scoped unread-key payloads to subscribers", async () => {
    const workerUrl = "https://worker.example.com";
    const oldMail = makeMail();
    const newMail = makeMail({
      id: 2,
      messageId: "message-2@example.com",
      createdAt: "2026-04-25T10:01:00.000Z",
      date: "2026-04-25T10:01:00.000Z",
    });
    const events: { workerUrl: string; unreadKeys: Set<string> }[] = [];
    const unsubscribe = subscribeAdminMailReadState((event) => {
      events.push(event);
    });

    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [oldMail],
    });
    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [newMail, oldMail],
    });

    unsubscribe();
    expect(events.at(-1)?.workerUrl).toBe(workerUrl);
    expect(events.at(-1)?.unreadKeys.has(buildAdminMailReadKey(newMail))).toBe(
      true
    );
  });

  it("does not mark appended pagination results as unread", async () => {
    const workerUrl = "https://worker.example.com";
    const oldMail = makeMail();
    const pagedMail = makeMail({
      id: 2,
      messageId: "message-2@example.com",
      createdAt: "2026-04-25T10:01:00.000Z",
      date: "2026-04-25T10:01:00.000Z",
    });

    await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [oldMail],
    });
    const unread = await reconcileAdminMailReadState({
      workerUrl,
      viewKey: "admin:inbox",
      mails: [pagedMail, oldMail],
      allowMarkUnread: false,
    });

    expect(unread.has(buildAdminMailReadKey(pagedMail))).toBe(false);
  });
});
