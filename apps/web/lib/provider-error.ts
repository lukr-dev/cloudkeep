// Only errors constructed here may be exposed; upstream bodies can contain secrets.
export class ProviderError extends Error {}
export function providerHttpError(provider: string, status: number, kind = "AI", code?: string) {
  return new ProviderError(
    `${kind} provider returned HTTP ${status}` +
      (code ? ` [${code}]` : "") +
      (status === 401
        ? ` (${provider} rejected the saved API key; check that provider's key and project access in Settings)`
        : ""),
  );
}
// Keeps only the machine-readable error code (e.g. invalid_api_key, ip_not_authorized);
// messages and other body fields can echo credentials or request text.
export async function providerErrorCode(response: Response) {
  try {
    const body: unknown = JSON.parse((await response.text()).slice(0, 16_384));
    const error = (body as { error?: { code?: unknown; type?: unknown } } | null)?.error;
    for (const value of [error?.code, error?.type])
      if (typeof value === "string" && /^[a-z0-9_.-]{1,64}$/.test(value)) return value;
  } catch {}
  return undefined;
}
export async function providerResponseError(provider: string, response: Response, kind = "AI") {
  return providerHttpError(provider, response.status, kind, await providerErrorCode(response));
}
