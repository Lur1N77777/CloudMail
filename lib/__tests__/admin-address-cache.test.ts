import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readAdminAddressPanelCache,
  writeAdminAddressPanelCache,
  readAdminAddressIndexCache,
  writeAdminAddressIndexCache,
} from "../admin-address-cache";

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

describe("admin address cache", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("isolates panel cache by worker, query and user", async () => {
    await writeAdminAddressPanelCache(
      { workerScope: "https://a.example.com", query: "", userId: "all" },
      {
        count: 1,
        offset: 1,
        addresses: [{ id: 1, name: "a@example.com" }],
      }
    );
    await writeAdminAddressPanelCache(
      { workerScope: "https://b.example.com", query: "", userId: "all" },
      {
        count: 1,
        offset: 1,
        addresses: [{ id: 2, name: "b@example.com" }],
      }
    );

    const cachedA = await readAdminAddressPanelCache({
      workerScope: "https://a.example.com",
      query: "",
      userId: "all",
    });
    const cachedB = await readAdminAddressPanelCache({
      workerScope: "https://b.example.com",
      query: "",
      userId: "all",
    });

    expect(cachedA?.addresses[0]?.name).toBe("a@example.com");
    expect(cachedB?.addresses[0]?.name).toBe("b@example.com");
  });

  it("persists the full address index for group/search cache-first views", async () => {
    await writeAdminAddressIndexCache("https://worker.example.com", {
      count: 2,
      offset: 2,
      addresses: [
        { id: 1, name: "one@example.com" },
        { id: 2, name: "two@example.com", mail_count: 3 },
      ],
    });

    const cached = await readAdminAddressIndexCache("https://worker.example.com");

    expect(cached).toMatchObject({
      count: 2,
      offset: 2,
      addresses: [
        { id: 1, name: "one@example.com" },
        { id: 2, name: "two@example.com", mail_count: 3 },
      ],
    });
  });
});
