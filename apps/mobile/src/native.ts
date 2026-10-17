export type NativeState = {
  server: string;
  token: string;
  shareMode: "ask" | "quick";
  defaultList: string;
  pendingUrl: string;
};
export type NativeResponse = { status: number; body: string; token: string };

declare const NativeModules: {
  CloudKeep?: { call(action: string, payload: string, callback: (result: string) => void): void };
};

export const hasNativeHost = typeof NativeModules !== "undefined" && !!NativeModules.CloudKeep;
const explorer: NativeState = {
  server: "https://cloudkeep.toastnet.work",
  token: "",
  shareMode: "ask",
  defaultList: "",
  pendingUrl: "",
};

// Explorer has no CloudKeep module: development sessions are deliberately memory-only.
export async function native<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (hasNativeHost) {
    return new Promise((resolve, reject) => {
      NativeModules.CloudKeep!.call(action, JSON.stringify(payload), (raw) => {
        try {
          const result = JSON.parse(raw) as { value: T; error?: string };
          if (result.error) reject(new Error(result.error));
          else resolve(result.value);
        } catch {
          reject(new Error("Invalid native response"));
        }
      });
    });
  }
  switch (action) {
    case "getState":
      return { ...explorer } as T;
    case "setCredentials":
      Object.assign(explorer, payload, { defaultList: "" });
      break;
    case "clearCredentials":
      explorer.token = "";
      explorer.defaultList = "";
      break;
    case "setShareSettings":
      Object.assign(explorer, payload);
      break;
    case "getPendingSharedUrl":
      return explorer.pendingUrl as T;
    case "clearPendingSharedUrl":
      explorer.pendingUrl = "";
      break;
    case "request": {
      if (
        typeof payload.path !== "string" ||
        (payload.method !== undefined && typeof payload.method !== "string") ||
        (payload.body !== undefined && typeof payload.body !== "string")
      )
        throw new Error("Invalid request");
      const response = await fetch(explorer.server + payload.path, {
        method: payload.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...(explorer.token ? { Authorization: `Bearer ${explorer.token}` } : {}),
        },
        ...(payload.body === undefined ? {} : { body: payload.body }),
      });
      return {
        status: response.status,
        body: await response.text(),
        token: response.headers.get("set-auth-token") ?? "",
      } as T;
    }
    case "openUrl":
    case "finishShare":
      throw new Error("This action requires the CloudKeep Android host.");
    case "toast":
      break;
    default:
      throw new Error("Unknown native action");
  }
  return true as T;
}

export const openUrl = (url: string) => native<boolean>("openUrl", { url });
