import { defineConfig } from "vite-plus";
import { readFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
export default defineConfig({
  plugins: [
    {
      name: "manifest",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "manifest.json",
          source: JSON.stringify(
            {
              manifest_version: 3,
              name: "CloudKeep",
              version,
              description: "Save the current page to CloudKeep instantly.",
              permissions: ["activeTab", "storage", "tabs"],
              optional_host_permissions: ["https://*/*", "http://*/*"],
              action: {
                default_popup: "popup.html",
                default_title: "Save to CloudKeep",
                default_icon: Object.fromEntries(
                  [16, 32].map((size) => [size, `icons/${size}.png`]),
                ),
              },
              options_page: "options.html",
              background: { service_worker: "background.js", type: "module" },
              commands: {
                _execute_action: {
                  suggested_key: { default: "Alt+Shift+K" },
                  description: "Save to CloudKeep",
                },
              },
              icons: Object.fromEntries(
                [16, 32, 48, 128].map((size) => [size, `icons/${size}.png`]),
              ),
            },
            null,
            2,
          ),
        });
      },
    },
  ],
  build: {
    rolldownOptions: {
      input: { popup: "popup.html", options: "options.html", background: "src/background.ts" },
      output: { entryFileNames: "[name].js" },
    },
  },
});
