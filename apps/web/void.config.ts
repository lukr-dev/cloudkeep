import { defineConfig } from "void/config";

export default defineConfig({
  auth: { providers: ["email"] },
  worker: { compatibility_date: "2026-10-17", compatibility_flags: ["nodejs_compat"] },
  cloudflare: { name: "cloudkeep" },
});
