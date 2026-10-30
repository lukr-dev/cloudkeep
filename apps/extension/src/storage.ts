import { DEFAULT_SERVER, type Settings, type ListCache } from "./logic.ts";
export async function settings(): Promise<Settings> {
  const data = await chrome.storage.local.get<Partial<Settings>>(["server", "token", "badge"]);
  return { server: data.server ?? DEFAULT_SERVER, token: data.token, badge: data.badge !== false };
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
