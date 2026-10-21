import { defineConfig } from "void/config";

export default defineConfig({
  auth: { providers: ["email"] },
  worker: { compatibility_date: "2026-10-17", compatibility_flags: ["nodejs_compat"] },
  cloudflare: {
    name: "cloudkeep",
    // Inference alone does not remove an R2 binding saved in void.lock.json.
    ...(process.env.CLOUDKEEP_FILES === "true" ? {} : { r2_buckets: [] }),
  },
  // Without a viewport tag, phones lay the page out at a ~980px virtual width
  // and the responsive breakpoints in style.css never apply.
  head: {
    title: "CloudKeep",
    htmlAttrs: { lang: "en" },
    meta: [{ name: "viewport", content: "width=device-width, initial-scale=1" }],
  },
  // lib/ is not scanned by binding inference.
  inference: { bindings: { ai: true, storage: process.env.CLOUDKEEP_FILES === "true" } },
});
