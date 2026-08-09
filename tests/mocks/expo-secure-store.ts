/**
 * In-memory stand-in for expo-secure-store.
 *
 * The real module reaches the iOS Keychain and Android Keystore, neither of
 * which exists under Jest. What the tests need from it is only that a value
 * written under a key comes back under that key, so this is a Map.
 */

const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.has(key) ? (store.get(key) as string) : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Test-only: forget everything between cases. Not part of the real module. */
export function __reset(): void {
  store.clear();
}
