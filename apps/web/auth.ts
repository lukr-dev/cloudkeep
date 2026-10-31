import { extensionAuthOrigin } from "./lib/extension-auth.ts";
import { defineAuth } from "void/auth";
import { apiKey } from "@better-auth/api-key";
import { bearer } from "better-auth/plugins";

export default defineAuth(({ defaults }) => ({
  ...defaults,
  trustedOrigins: async (request) => {
    const origins =
      typeof defaults.trustedOrigins === "function"
        ? await defaults.trustedOrigins(request)
        : (defaults.trustedOrigins ?? []);
    const origin = request && extensionAuthOrigin(request);
    return [...origins, ...(origin ? [origin] : [])];
  },
  emailAndPassword: {
    ...defaults.emailAndPassword,
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  plugins: [
    ...(defaults.plugins ?? []),
    bearer(),
    apiKey({
      defaultPrefix: "ck_",
      requireName: true,
      maximumNameLength: 100,
      rateLimit: { enabled: true, maxRequests: 1000, timeWindow: 60_000 },
    }),
  ],
}));
