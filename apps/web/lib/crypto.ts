import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const encoder = new TextEncoder();
function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function unbase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
async function encryptionKey(secret: string) {
  const bytes = unbase64(secret);
  if (bytes.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes in base64");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encrypt(value: string, secret: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    await encryptionKey(secret),
    encoder.encode(value),
  );
  return `v1.${base64(iv)}.${base64(new Uint8Array(ciphertext))}`;
}
export async function decrypt(value: string, secret: string, context: string) {
  const [version, iv, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Invalid encrypted key");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unbase64(iv), additionalData: encoder.encode(context) },
      await encryptionKey(secret),
      unbase64(ciphertext),
    ),
  );
}
export async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
// Must match Void's default Better Auth hasher (native node:crypto scrypt, `salt:key` hex),
// because registration writes hashes that Better Auth's login then verifies.
const SCRYPT_OPTIONS = { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 };
// Unicode normalization form applied before hashing, so equivalent inputs hash identically.
const UNICODE_FORM = "NFKC";
function scryptKey(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize(UNICODE_FORM), salt, 64, SCRYPT_OPTIONS, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scryptKey(password, salt)).toString("hex")}`;
}
export async function verifyPassword({ hash, password }: { hash: string; password: string }) {
  const [salt, key, ...extra] = hash.split(":");
  if (!salt || key?.length !== 128 || extra.length > 0) return false;
  return timingSafeEqual(await scryptKey(password, salt), Buffer.from(key, "hex"));
}
