import { native, type NativeResponse } from "./native.ts";
export type { BookmarkDetail, BookmarkItem, List, Tag } from "../../web/lib/api.ts";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function serverOrigin(input: string): string {
  // Lynx does not guarantee the browser URL global; validate an origin without it.
  const value = input.trim().replace(/\/+$/, "");
  if (
    !/^https?:\/\/(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:]+\])(?::\d{1,5})?$/i.test(value)
  ) {
    throw new Error("Use a server origin such as https://cloudkeep.toastnet.work");
  }
  return value;
}

export async function request(
  path: `/api/${string}`,
  method = "GET",
  body?: unknown,
): Promise<NativeResponse> {
  try {
    return await native<NativeResponse>("request", {
      path,
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiError(0, "Could not connect. Check your server and connection, then retry.");
  }
}
export function parseResponse<T>(response: NativeResponse): T {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(response.body) as Record<string, unknown>;
  } catch {
    throw new ApiError(response.status, "Server returned an invalid response.");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new ApiError(
      response.status,
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : `Request failed (${response.status})`,
    );
  }
  return data as T;
}
export async function api<T>(path: `/api/${string}`, method = "GET", body?: unknown): Promise<T> {
  return parseResponse<T>(await request(path, method, body));
}
export async function signIn(server: string, email: string, password: string): Promise<void> {
  const origin = serverOrigin(server);
  await native("setCredentials", { server: origin, token: "" });
  const response = await request("/api/auth/sign-in/email", "POST", {
    email: email.trim(),
    password,
  });
  parseResponse(response);
  if (!response.token)
    throw new Error("No bearer token returned. Enable Better Auth's bearer plugin on your server.");
  await native("setCredentials", { server: origin, token: response.token });
}
export async function allItems<T>(path: "/api/lists" | "/api/tags"): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; offset <= 100_000; offset += 50) {
    const page = await api<{ items: T[] }>(`${path}?limit=50&offset=${offset}`);
    items.push(...page.items);
    if (page.items.length < 50) break;
  }
  return items;
}
export function bookmarkQuery(
  q: string,
  listId: string,
  tag: string,
  offset: number,
): `/api/${string}` {
  const query = Object.entries({
    q: q.trim(),
    listId,
    tag: tag.trim().toLowerCase(),
    offset: String(offset),
    limit: "20",
  })
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `/api/bookmarks?${query}`;
}
