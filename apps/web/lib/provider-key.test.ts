import { expect, it } from "vite-plus/test";
import { encrypt } from "./crypto.ts";
import { providerKey } from "./provider-key.ts";
import { ProviderError } from "./provider-error.ts";

const secret = btoa("a".repeat(32));
it("decrypts saved credentials and normalizes surrounding whitespace", async () => {
  const encrypted = await encrypt(" sk-test\n", secret, "owner:openai");
  expect(await providerKey(encrypted, secret, "owner:openai")).toBe("sk-test");
});
it("reports rotated secrets and context mismatches without exposing ciphertext", async () => {
  const encrypted = await encrypt("sk-private", secret, "owner:openai");
  for (const [key, context] of [
    [btoa("b".repeat(32)), "owner:openai"],
    [secret, "other:openai"],
  ]) {
    await expect(providerKey(encrypted, key!, context!)).rejects.toThrow(ProviderError);
    await expect(providerKey(encrypted, key!, context!)).rejects.toThrow(
      "Cannot decrypt the saved API key",
    );
  }
});
it("rejects empty, prefixed and internally whitespace-containing saved keys before sending", async () => {
  for (const key of ["", "Bearer sk-private", "sk-\nprivate"]) {
    const encrypted = await encrypt(key, secret, "owner:openai");
    await expect(providerKey(encrypted, secret, "owner:openai")).rejects.toThrow("malformed");
  }
});
