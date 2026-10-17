import { defineHandler } from "void";
import { profileFor, fail } from "../../../../lib/http.ts";
import { complete } from "../../../../lib/settings.ts";
import { z } from "zod";

export const POST = defineHandler.withValidator({ body: z.object({}).strict() })(async (c) => {
  const profile = await profileFor(c);
  if (!profile.provider) return fail(400, "Choose an AI provider first");
  try {
    // Reasoning models spend output tokens thinking first; 8 tokens can yield empty content.
    await complete(profile, "Reply with OK.", 256);
    return { ok: true };
  } catch {
    return fail(502, "AI test failed; check the selected provider, model, key, and quota");
  }
});
