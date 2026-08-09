/**
 * Where the Supabase session lives.
 *
 * The client is configured with `persistSession: true`, but on React Native
 * there is no `localStorage`, so without an adapter supabase-js falls back to
 * memory and the session is gone when the app closes. This is that adapter.
 *
 * It writes to expo-secure-store -- the iOS Keychain and the Android Keystore --
 * rather than to a plain file. A stored TrygKreds session is a key to seeing
 * where someone's family is, so it is worth protecting from other apps and from
 * a rooted device, not only from a locked screen.
 *
 * The price is the size limit: Expo documents around 2048 bytes per value on
 * iOS and a Supabase session can exceed it. So a value is split across several
 * entries -- `<key>.0`, `<key>.1`, ... -- with `<key>` itself holding the count.
 */

import * as SecureStore from 'expo-secure-store';

/**
 * Comfortably below the documented 2048, because the limit is on the stored
 * representation rather than on our string and the margin costs nothing.
 */
export const CHUNK_SIZE = 1800;

/**
 * Pure: no storage, no platform. An empty value becomes a single empty chunk,
 * so that reading it back yields '' rather than null -- a stored empty value
 * and an absent one are different answers.
 */
export function splitIntoChunks(value: string, size: number): string[] {
  if (value.length === 0) return [''];

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.slice(i, i + size));
  }
  return chunks;
}

function partKey(key: string, index: number): string {
  return `${key}.${index}`;
}

async function deleteParts(key: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(partKey(key, i));
  }
}

async function storedCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return 0;

  const count = Number.parseInt(raw, 10);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const count = await storedCount(key);
      if (count === 0) return null;

      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await SecureStore.getItemAsync(partKey(key, i));

        if (part === null) {
          // A part is missing -- an interrupted write, or storage evicting an
          // entry. Returning what survives would hand supabase-js a truncated
          // session, which is worse than no session: it looks valid and is
          // not. Clear the remains so the next write starts from nothing.
          await deleteParts(key, count);
          await SecureStore.deleteItemAsync(key);
          return null;
        }

        parts.push(part);
      }

      return parts.join('');
    } catch {
      // The Keystore can stop being able to decrypt an entry -- after a
      // lock-screen change, for instance. Treated like a missing part: clear
      // what is there and report no session, so the app falls back to signed
      // out rather than throwing on every read until it is reinstalled.
      try {
        await this.removeItem(key);
      } catch {
        // Nothing more to do; the read still reports no session.
      }
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    // Delete the old parts first. A five-part session replaced by a one-part
    // session would otherwise leave parts 1..4 behind, and the next read of a
    // longer value would splice the survivors into it.
    const previous = await storedCount(key);
    await deleteParts(key, previous);

    const chunks = splitIntoChunks(value, CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i += 1) {
      await SecureStore.setItemAsync(partKey(key, i), chunks[i]);
    }

    // The count goes last, so a write interrupted partway leaves either the old
    // count (whose parts have gone, caught by getItem) or none at all.
    await SecureStore.setItemAsync(key, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const count = await storedCount(key);
    await deleteParts(key, count);
    await SecureStore.deleteItemAsync(key);
  },
};
