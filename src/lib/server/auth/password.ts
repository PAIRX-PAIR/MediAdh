import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * scrypt parameters from the OWASP Password Storage Cheat Sheet
 * (N=2^17, r=8, p=1 -> 128 MiB). Node's default maxmem is 32 MiB, so it is
 * raised explicitly. Parameters are stored in every hash so they can be
 * increased later without invalidating existing passwords.
 */
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAXMEM = 256 * 1024 * 1024;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(keyB64, "base64");
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM };
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) return false;
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, params);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function needsRehash(stored: string): boolean {
  return !stored.startsWith(`scrypt$${N}$${R}$${P}$`);
}

// Pre-computed hash used to spend the same time on unknown usernames.
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
}

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  "123456789012",
  "1234567890123",
  "12345678901234",
  "123456789abc",
  "qwertyuiop12",
  "qwertyuiopas",
  "asdfghjklñ12",
  "contraseña123",
  "contrasena123",
  "contraseña1234",
  "password1234",
  "passwordpassword",
  "administrador",
  "administrador1",
  "admin1234567",
  "iloveyou1234",
  "tequiero1234",
  "colombia1234",
  "colombia12345",
  "bogota123456",
  "medellin1234",
  "millonarios1",
  "nacional1234",
  "abcdefghijkl",
  "abc123abc123",
  "aaaaaaaaaaaa",
  "111111111111",
  "000000000000",
]);

/** NIST SP 800-63B style policy: length over composition rules, block obvious choices. */
export function passwordProblems(password: string, context: { username?: string; displayName?: string } = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres. Tip: usa una frase de 3 palabras.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) return `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres.`;
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return "Esa contraseña es demasiado común. Elige otra.";
  if (/^(.)\1+$/.test(password)) return "La contraseña no puede ser un solo carácter repetido.";
  if (isSequence(lower)) return "La contraseña no puede ser una secuencia (1234…, abcd…).";
  const username = context.username?.toLowerCase();
  if (username && username.length >= 3 && lower.includes(username)) return "La contraseña no puede contener tu usuario.";
  return null;
}

function isSequence(value: string): boolean {
  if (value.length < 6) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < value.length; i++) {
    const diff = value.charCodeAt(i) - value.charCodeAt(i - 1);
    if (diff !== 1) ascending = false;
    if (diff !== -1) descending = false;
  }
  return ascending || descending;
}
