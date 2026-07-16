import { beforeEach, describe, expect, it, vi } from "vitest";
import * as SecureStore from "expo-secure-store";

import {
  accountCredentialKey,
  legacyConfigCredentialKey,
  secureCredentialsAvailable,
  workerCredentialKey,
} from "../secure-credentials";

vi.mock("expo-secure-store", () => ({
  isAvailableAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("secure credential keys", () => {
  it("produces deterministic SecureStore-compatible keys without embedding identities", () => {
    const workerKey = workerCredentialKey("worker@example.com", "admin");
    const accountKey = accountCredentialKey("worker-a:user@example.com", "jwt");

    expect(workerKey).toMatch(/^cloudmail\.secure\.v1\.[A-Za-z0-9._-]+$/);
    expect(accountKey).toMatch(/^cloudmail\.secure\.v1\.[A-Za-z0-9._-]+$/);
    expect(workerKey).not.toContain("worker@example.com");
    expect(accountKey).not.toContain("user@example.com");
    expect(workerCredentialKey("worker@example.com", "admin")).toBe(workerKey);
    expect(workerCredentialKey("worker@example.com", "site")).not.toBe(workerKey);
    expect(legacyConfigCredentialKey("admin")).not.toBe(legacyConfigCredentialKey("site"));
  });
});

describe("secure credential availability", () => {
  it("fails closed when the native keystore availability check throws", async () => {
    (SecureStore.isAvailableAsync as any).mockRejectedValue(new Error("native module unavailable"));

    await expect(secureCredentialsAvailable()).resolves.toBe(false);
  });
});
