import { decrypt } from "./crypto.ts";
import { ProviderError } from "./provider-error.ts";

export async function providerKey(encrypted: string, secret: string, context: string) {
  let key: string;
  try {
    key = await decrypt(encrypted, secret, context);
  } catch {
    throw new ProviderError(
      "Cannot decrypt the saved API key. Re-enter it in Settings; if this affects all users, check ENCRYPTION_KEY.",
    );
  }
  key = key.trim();
  if (!key || /\s/.test(key) || /^Bearer /i.test(key))
    throw new ProviderError("The saved API key is malformed. Re-enter the raw key in Settings.");
  return key;
}
