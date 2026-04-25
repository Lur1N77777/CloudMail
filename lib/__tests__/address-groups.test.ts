import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    }),
    multiSet: vi.fn((pairs: [string, string][]) => {
      pairs.forEach(([key, value]) => storage.set(key, value));
      return Promise.resolve();
    }),
    multiGet: vi.fn((keys: string[]) =>
      Promise.resolve(keys.map((key) => [key, storage.get(key) ?? null]))
    ),
    getAllKeys: vi.fn(() => Promise.resolve(Array.from(storage.keys()))),
  },
}));

describe("address-groups persistence", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
  });

  it("keeps groups available across equivalent worker URL variants", async () => {
    const groups = await import("../address-groups");

    const group = await groups.createAddressGroup("https://mail.example.com/api", {
      name: "验证码",
      color: "blue",
    });
    await groups.addAddressToGroup(
      "https://mail.example.com/api",
      "user@mail.example.com",
      group.id
    );

    const lookup = await groups.getAddressGroupsLookup("http://mail.example.com/api/");
    const matched = groups.getAddressGroupsForAddress(lookup.lookup, "user@mail.example.com");

    expect(lookup.groups).toHaveLength(1);
    expect(matched[0]?.name).toBe("验证码");
  });

  it("can restore legacy single-key data by alias matching and migrate it", async () => {
    const legacyState = {
      groups: [
        {
          id: "legacy_group",
          name: "重点用户",
          color: "teal",
          createdAt: "2026-04-24T00:00:00.000Z",
          updatedAt: "2026-04-24T00:00:00.000Z",
        },
      ],
      memberships: {
        "vip@example.com": ["legacy_group"],
      },
    };

    storage.set(
      "cloudmail_address_groups:https://demo.example.com/base",
      JSON.stringify(legacyState)
    );

    const groups = await import("../address-groups");
    const restored = await groups.loadAddressGroupState("http://demo.example.com/base/");

    expect(restored.groups[0]?.name).toBe("重点用户");
    expect(
      storage.get("cloudmail_address_groups:http://demo.example.com/base")
    ).toBeTruthy();
  });
});
