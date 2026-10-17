import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { profileFor } from "../../lib/http.ts";

export const GET = defineHandler(async (c) => ({
  user: { ...requireAuth(c), role: (await profileFor(c)).role },
}));
