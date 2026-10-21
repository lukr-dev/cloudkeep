<script setup lang="ts">
import type { Provider } from "../lib/api.ts";
import { DEFAULT_TTS } from "../lib/tts.ts";
const provider = defineModel<Provider | null>("provider", { required: true });
const model = defineModel<string | null>("model", { required: true });
const voice = defineModel<string | null>("voice", { required: true });
function change(event: Event) {
  provider.value = (event.target as HTMLSelectElement).value as Provider;
  model.value = null;
  voice.value = null;
}
</script>
<template>
  <div class="stack">
    <label class="field"
      >Provider<select :value="provider ?? 'workers-ai'" @change="change">
        <option value="workers-ai">Workers AI</option>
        <option value="openai">OpenAI</option>
        <option value="openrouter">OpenRouter</option>
      </select></label
    >
    <label class="field"
      >Model<input
        :value="model ?? ''"
        maxlength="200"
        :placeholder="DEFAULT_TTS[provider ?? 'workers-ai'].model"
        @input="model = ($event.target as HTMLInputElement).value || null"
    /></label>
    <label class="field"
      >Voice<input
        :value="voice ?? ''"
        maxlength="200"
        :placeholder="DEFAULT_TTS[provider ?? 'workers-ai'].voice"
        @input="voice = ($event.target as HTMLInputElement).value || null"
    /></label>
    <p class="hint">Leave model and voice empty for provider defaults. Uses your saved API key.</p>
  </div>
</template>
