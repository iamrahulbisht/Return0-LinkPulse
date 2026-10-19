import { customAlphabet } from 'nanoid';

// No look-alike characters (0/O, 1/l/I), so people can read codes off a poster.
export const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 7;

const nano = customAlphabet(CODE_ALPHABET, CODE_LENGTH);

/** A random 7-character code. 54^7 ≈ 1.3 trillion options, so it cannot be guessed like a counter. */
export function generateCode(): string {
  return nano();
}

export const MAX_CODE_ATTEMPTS = 5;

/**
 * Tries `insert` with fresh codes until the unique index accepts one.
 * `isUniqueViolation` tells a code clash apart from other errors.
 */
export async function insertWithFreshCode<T>(
  insert: (code: string) => Promise<T>,
  isUniqueViolation: (err: unknown) => boolean,
  makeCode: () => string = generateCode,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    try {
      return await insert(makeCode());
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Format check used by the redirect route before touching the cache or database. */
export function looksLikeCode(code: string): boolean {
  return /^[A-Za-z0-9-]{1,30}$/.test(code);
}
