export function extensionAuthOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin");
  return request.method === "POST" &&
    ["/api/auth/sign-in/email", "/api/auth/sign-out"].includes(new URL(request.url).pathname) &&
    origin &&
    /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
    ? origin
    : undefined;
}
