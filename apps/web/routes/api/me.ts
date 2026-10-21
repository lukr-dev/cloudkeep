import { filesEnabled } from "../../lib/assets.ts";
import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { profileFor } from "../../lib/http.ts";

export const GET = defineHandler(async (c) => ({
  features: { files: filesEnabled() },
  user: { ...requireAuth(c), role: (await profileFor(c)).role },
}));
