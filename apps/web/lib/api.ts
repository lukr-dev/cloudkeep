export type User = { id: string; name: string; email: string; role: "admin" | "user" };
export type TagLink = { id: string; name: string; source: "manual" | "ai" };
export type Bookmark = {
  id: string;
  userId: string;
  type: "link" | "text" | "asset";
  url: string | null;
  noteText: string | null;
  assetType: "image" | "pdf" | null;
  assetMime: string | null;
  assetName: string | null;
  assetSize: number | null;
  hasFile: boolean;
  fileUrl: string | null;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  siteName: string | null;
  contentText: string | null;
  summary: string | null;
  status: "pending" | "processing" | "done" | "failed";
  error: string | null;
  createdAt: number;
  updatedAt: number;
};
export type BookmarkDetail = Bookmark & { tags: TagLink[]; listIds: string[] };
export type BookmarkItem = Omit<BookmarkDetail, "contentText" | "noteText"> & {
  excerpt: string | null;
};
export type List = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  count: number;
};
export type Tag = { id: string; name: string; count: number };
export type Invite = {
  id: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number | null;
  usedAt: number | null;
  revokedAt: number | null;
};
export type ReasoningEffort = "none" | "low" | "medium" | "high";
export type Provider = "workers-ai" | "openrouter" | "openai";
export type Settings = {
  provider: Provider | null;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  autoTag: boolean;
  autoSummary: boolean;
  keys: Record<"openai" | "openrouter", { hasKey: boolean }>;
  defaultModels: Record<Provider, string>;
  defaultReasoningEffort: Record<Provider, ReasoningEffort | null>;
};
export type Prompt = { template: string; defaultTemplate: string; isDefault: boolean };
export type Prompts = Record<"tagging" | "summary", Prompt> & { variables: string[] };
export type Page<T> = { items: T[]; limit: number; offset: number };
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown; redirectOnUnauthorized?: boolean };
export async function api<T>(path: `/api/${string}`, options: ApiOptions = {}): Promise<T> {
  const { body, redirectOnUnauthorized = true, ...init } = options;
  const headers = new Headers(init.headers);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(0, "Could not connect. Check your connection and try again.");
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && redirectOnUnauthorized && typeof window !== "undefined") {
      window.location.assign("/login");
    }
    const details = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const message =
      typeof details.error === "string"
        ? details.error
        : typeof details.message === "string"
          ? details.message
          : `Request failed (${response.status}). Please try again.`;
    throw new ApiError(response.status, message, details);
  }
  return data as T;
}

// The API paginates lists and tags too; do not silently hide items after the first page.
export async function allItems<T>(path: "/api/lists" | "/api/tags"): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; offset <= 100_000; offset += 50) {
    const page = await api<Page<T>>(`${path}?limit=50&offset=${offset}`);
    items.push(...page.items);
    if (page.items.length < 50) break;
  }
  return items;
}
export function message(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
