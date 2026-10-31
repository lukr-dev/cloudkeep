import { digest } from "./crypto.ts";

export const API_KEY_PREFIX = "ck_";
export function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return API_KEY_PREFIX + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function apiKeyHash(key: string) {
  return /^ck_[0-9a-f]{64}$/.test(key) ? digest(key) : null;
}
