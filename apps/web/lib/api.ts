export type Features = { files: boolean; audio: boolean };
export type Me = { user: User; features: Features };
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
  contentTruncated: boolean;
  hasAudio?: boolean;
  processingListId: string | null;
  status: "pending" | "processing" | "done" | "failed";
  error: string | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
export type BookmarkLookup = {
  bookmark:
    | (Pick<Bookmark, "id" | "title" | "archivedAt"> & { url: string; listIds: string[] })
    | null;
};
export type BookmarkCreate = { bookmark: Bookmark & { listIds: string[] }; alreadyExists: boolean };
export type Audio = {
  kind: "short" | "full";
  status: "pending" | "processing" | "done" | "failed";
  error: string | null;
  text: string | null;
  hasAudio: boolean;
  url: string | null;
};
export type BookmarkDetail = Bookmark & {
  tags: TagLink[];
  listIds: string[];
  audioEnabled: boolean;
  audio: Audio[];
};
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
  ttsProvider: Provider | null;
  ttsModel: string | null;
  ttsVoice: string | null;
  defaultTts: Record<Provider, { model: string; voice: string }>;
  autoTag: boolean;
  autoSummary: boolean;
  keys: Record<"openai" | "openrouter", { hasKey: boolean }>;
  defaultModels: Record<Provider, string>;
  defaultReasoningEffort: Record<Provider, ReasoningEffort | null>;
};
export type Prompt = { template: string; defaultTemplate: string; isDefault: boolean };
export type Prompts = Record<"tagging" | "summary" | "detailed_summary", Prompt> & {
  variables: string[];
};
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

export function uploadFile(
  file: File,
  listId: string,
  progress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const query = new URLSearchParams();
    if (listId) query.append("listId", listId);
    request.open("POST", `/api/bookmarks/files?${query}`);
    request.setRequestHeader("Content-Type", file.type);
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    // The browser supplies Content-Length for the raw File body.
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(new ApiError(0, "Could not upload. Check your connection and try again."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      let error = `Upload failed (${request.status}). Please try again.`;
      try {
        const data = JSON.parse(request.responseText);
        if (typeof data.error === "string") error = data.error;
      } catch {
        /* Non-JSON error responses use the controlled fallback. */
      }
      if (request.status === 401) window.location.assign("/login");
      reject(new ApiError(request.status, error));
    };
    request.send(file);
  });
}

export type ListSettings = List & {
  provider: Provider | null;
  model: string | null;
  reasoningEffort: ReasoningEffort | null;
  audioEnabled: boolean;
  ttsProvider: Provider | null;
  ttsModel: string | null;
  ttsVoice: string | null;
};
export type ListConfiguration = { list: ListSettings; prompts: Prompts };

export async function retryFailedBookmarks() {
  let queued = 0;
  let failed = 0;
  let after: string | null = null;
  do {
    const result: { queued: number; failed: number; nextCursor: string | null } = await api(
      "/api/bookmarks/retry-failed",
      {
        method: "POST",
        body: after ? { after } : {},
      },
    );
    queued += result.queued;
    failed += result.failed;
    after = result.nextCursor;
  } while (after);
  return { queued, failed };
}
