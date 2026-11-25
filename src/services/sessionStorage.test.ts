import * as SecureStore from 'expo-secure-store';
import { CHUNK_SIZE, splitIntoChunks, sessionStorage } from './sessionStorage';

// The mock exposes __reset; the real module does not.
const resetStore = (SecureStore as unknown as { __reset: () => void }).__reset;

beforeEach(() => {
  resetStore();
});

describe('splitIntoChunks', () => {
  it('should return one chunk for a value that fits', () => {
    expect(splitIntoChunks('abc', 10)).toEqual(['abc']);
  });

  it('should return one chunk for a value exactly the size of the limit', () => {
    expect(splitIntoChunks('abcde', 5)).toEqual(['abcde']);
  });

  it('should split a value one character over the limit', () => {
    expect(splitIntoChunks('abcdef', 5)).toEqual(['abcde', 'f']);
  });

  it('should split evenly when the length is an exact multiple', () => {
    expect(splitIntoChunks('abcdef', 2)).toEqual(['ab', 'cd', 'ef']);
  });

  it('should represent an empty value as a single empty chunk', () => {
    // So that reading it back returns '' rather than null -- an empty stored
    // value and an absent one are different answers.
    expect(splitIntoChunks('', 10)).toEqual(['']);
  });

  it('should round-trip values around the real limit', () => {
    for (const length of [
      0,
      1,
      CHUNK_SIZE - 1,
      CHUNK_SIZE,
      CHUNK_SIZE + 1,
      CHUNK_SIZE * 3 + 7,
    ]) {
      const value = 'x'.repeat(length);
      expect(splitIntoChunks(value, CHUNK_SIZE).join('')).toBe(value);
    }
  });
});

describe('sessionStorage', () => {
  it('should return null for a key that was never written', async () => {
    expect(await sessionStorage.getItem('sb-auth-token')).toBeNull();
  });

  it('should round-trip a small value', async () => {
    await sessionStorage.setItem('sb-auth-token', '{"a":1}');

    expect(await sessionStorage.getItem('sb-auth-token')).toBe('{"a":1}');
  });

  it('should round-trip a value larger than one entry can hold', async () => {
    const big = 'y'.repeat(CHUNK_SIZE * 2 + 11);

    await sessionStorage.setItem('sb-auth-token', big);

    expect(await sessionStorage.getItem('sb-auth-token')).toBe(big);
  });

  it('should not leave parts of a longer previous value behind', async () => {
    // A five-part session replaced by a one-part session must not read back
    // with the tail of the old one attached.
    await sessionStorage.setItem('sb-auth-token', 'z'.repeat(CHUNK_SIZE * 4));
    await sessionStorage.setItem('sb-auth-token', 'short');

    expect(await sessionStorage.getItem('sb-auth-token')).toBe('short');
  });

  it('should refuse a half-written value rather than return part of it', async () => {
    const big = 'w'.repeat(CHUNK_SIZE * 2);
    await sessionStorage.setItem('sb-auth-token', big);

    // Simulate a write interrupted partway, or storage evicting one entry.
    await SecureStore.deleteItemAsync('sb-auth-token.1');

    expect(await sessionStorage.getItem('sb-auth-token')).toBeNull();
  });

  it('should clear the remains of a half-written value', async () => {
    const big = 'w'.repeat(CHUNK_SIZE * 2);
    await sessionStorage.setItem('sb-auth-token', big);
    await SecureStore.deleteItemAsync('sb-auth-token.1');

    await sessionStorage.getItem('sb-auth-token');

    expect(await SecureStore.getItemAsync('sb-auth-token')).toBeNull();
    expect(await SecureStore.getItemAsync('sb-auth-token.0')).toBeNull();
  });

  it('should remove every part on removeItem', async () => {
    await sessionStorage.setItem('sb-auth-token', 'v'.repeat(CHUNK_SIZE * 3));

    await sessionStorage.removeItem('sb-auth-token');

    expect(await sessionStorage.getItem('sb-auth-token')).toBeNull();
    expect(await SecureStore.getItemAsync('sb-auth-token.0')).toBeNull();
    expect(await SecureStore.getItemAsync('sb-auth-token.2')).toBeNull();
  });

  it('should report no session when the store throws', async () => {
    const spy = jest
      .spyOn(SecureStore, 'getItemAsync')
      .mockRejectedValueOnce(new Error('Could not decrypt'));

    expect(await sessionStorage.getItem('sb-auth-token')).toBeNull();

    spy.mockRestore();
  });

  it('should not throw out of getItem when the store throws', async () => {
    const spy = jest
      .spyOn(SecureStore, 'getItemAsync')
      .mockRejectedValue(new Error('Could not decrypt'));

    await expect(sessionStorage.getItem('sb-auth-token')).resolves.toBeNull();

    spy.mockRestore();
  });
});
