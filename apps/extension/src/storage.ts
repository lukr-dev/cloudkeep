import { settingsDefaults, type Settings, type ListCache } from "./logic.ts";
export async function settings(): Promise<Settings> {
  const data = await chrome.storage.local.get<Partial<Settings>>([
    "server",
    "token",
    "badge",
    "shareMode",
    "defaultList",
  ]);
  return settingsDefaults(data);
}
export async function clearToken(token?: string) {
  await sessionMessage({ type: "clearSession", token });
}
export async function sessionMessage(message: { type: string; token?: string; server?: string }) {
  const result = await chrome.runtime.sendMessage(message);
  if (!result?.ok) throw new Error(result?.error || "Session update failed.");
}
export async function readLists(): Promise<ListCache | undefined> {
  return (await chrome.storage.local.get<{ listCache?: ListCache }>("listCache")).listCache;
}
