import * as SecureStore from "expo-secure-store";

import { sha256Hex } from "./sha256";

const KEY_PREFIX = "cloudmail.secure.v1";

type WorkerCredentialKind = "admin" | "site";
type AccountCredentialKind = "jwt" | "password";

function credentialScope(value: string) {
  return sha256Hex(value.trim().toLowerCase()).slice(0, 32);
}

export function workerCredentialKey(
  profileId: string,
  kind: WorkerCredentialKind
) {
  return `${KEY_PREFIX}.worker.${credentialScope(profileId)}.${kind}`;
}

export function legacyConfigCredentialKey(kind: WorkerCredentialKind) {
  return `${KEY_PREFIX}.config.${kind}`;
}

export function accountCredentialKey(
  accountIdentity: string,
  kind: AccountCredentialKind
) {
  return `${KEY_PREFIX}.account.${credentialScope(accountIdentity)}.${kind}`;
}

export async function secureCredentialsAvailable() {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function readSecureCredential(key: string) {
  return SecureStore.getItemAsync(key);
}

export async function writeSecureCredential(key: string, value: string) {
  if (value) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function deleteSecureCredential(key: string) {
  await SecureStore.deleteItemAsync(key);
}
