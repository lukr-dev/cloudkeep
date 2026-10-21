import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { effectivePrompts } from "../../../../lib/settings.ts";

export const GET = defineHandler((c) => effectivePrompts(requireAuth(c).id));
