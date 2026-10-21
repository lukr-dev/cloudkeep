import { defineConfig } from "vite-plus";
import { voidPlugin } from "void";
import { voidVue } from "@void/vue/plugin";

export default defineConfig({
  run: {
    tasks: {
      dev: { command: "vp dev", cache: false },
      build: { command: "vp build", cache: { env: ["CLOUDKEEP_FILES"] } },
    },
  },
  plugins: [voidPlugin(), voidVue()],
});
