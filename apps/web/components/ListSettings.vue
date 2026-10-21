<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type ListConfiguration, type Provider } from "../lib/api.ts";
import { DEFAULT_MODELS, DEFAULT_REASONING_EFFORT } from "../lib/providers.ts";
import { promptKind } from "../lib/prompts.ts";
import { useFeatures } from "../composables/session.ts";
import { useTask } from "../composables/task.ts";
import TtsFields from "./TtsFields.vue";
const props = defineProps<{ id: string }>();
const features = useFeatures();
const config = ref<ListConfiguration | null>(null);
const { busy, error, notice, run } = useTask();
const kinds = promptKind.options;
const labels = { tagging: "Tagging", summary: "Summary", detailed_summary: "Detailed summary" };
onMounted(
  () =>
    void run(async () => {
      config.value = await api<ListConfiguration>(`/api/lists/${props.id}/settings`);
    }),
);
function aiDefaults(event: Event) {
  if (!config.value) return;
  Object.assign(config.value.list, {
    provider: (event.target as HTMLInputElement).checked ? null : "workers-ai",
    model: null,
    reasoningEffort: null,
  });
}
function providerChanged(event: Event) {
  if (!config.value) return;
  const provider = (event.target as HTMLSelectElement).value as Provider;
  Object.assign(config.value.list, {
    provider,
    model: null,
    reasoningEffort: DEFAULT_REASONING_EFFORT[provider],
  });
}
function save() {
  return run(async () => {
    if (!config.value) return;
    const { list, prompts } = config.value;
    config.value = await api<ListConfiguration>(`/api/lists/${props.id}/settings`, {
      method: "PUT",
      body: {
        provider: list.provider,
        model: list.model?.trim() || null,
        reasoningEffort: list.reasoningEffort,
        ...(features.value.audio
          ? {
              audioEnabled: list.audioEnabled,
              ttsProvider: list.ttsProvider,
              ttsModel: list.ttsModel?.trim() || null,
              ttsVoice: list.ttsVoice?.trim() || null,
            }
          : {}),
        prompts: Object.fromEntries(
          kinds.map((kind) => [kind, prompts[kind].isDefault ? null : prompts[kind].template]),
        ),
      },
    });
    notice.value = "List settings saved";
  });
}
</script>
<template>
  <div class="list-settings stack">
    <p class="hint">
      Applies to bookmarks first saved into this list. With several customized lists, the first one
      selected wins. Reprocess reuses the chosen list.
    </p>
    <p v-if="error" class="alert" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <form v-if="config" class="stack" @submit.prevent="save">
      <h3>Prompts</h3>
      <div v-for="kind in kinds" :key="kind" class="field">
        <label class="check"
          ><input
            v-model="config.prompts[kind].isDefault"
            type="checkbox"
            @change="config.prompts[kind].template = config.prompts[kind].defaultTemplate"
          />{{ labels[kind] }}: inherit my prompt</label
        >
        <textarea
          v-if="!config.prompts[kind].isDefault"
          v-model="config.prompts[kind].template"
          rows="7"
          required
          maxlength="12000"
          :aria-label="labels[kind]"
        />
        <button
          v-if="!config.prompts[kind].isDefault"
          type="button"
          class="ghost small"
          @click="
            config.prompts[kind].isDefault = true;
            config.prompts[kind].template = config.prompts[kind].defaultTemplate;
          "
        >
          Reset to inherit
        </button>
      </div>
      <h3>AI</h3>
      <label class="check"
        ><input type="checkbox" :checked="!config.list.provider" @change="aiDefaults" />Use my
        default AI settings</label
      >
      <template v-if="config.list.provider">
        <label class="field"
          >Provider<select :value="config.list.provider" @change="providerChanged">
            <option value="workers-ai">Workers AI</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
          </select></label
        >
        <label class="field"
          >Model<input
            v-model="config.list.model"
            maxlength="200"
            :placeholder="DEFAULT_MODELS[config.list.provider]"
        /></label>
        <label class="field"
          >Reasoning<select v-model="config.list.reasoningEffort">
            <option :value="null">Default</option>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select></label
        >
        <p class="hint">Uses your saved key for this provider.</p>
      </template>
      <template v-if="features.audio">
        <h3>Audio</h3>
        <label class="check"
          ><input v-model="config.list.audioEnabled" type="checkbox" />Generate spoken
          summaries</label
        >
        <p class="hint">Generates a summary even when automatic summaries are off.</p>
        <label class="check"
          ><input
            type="checkbox"
            :checked="!config.list.ttsProvider"
            @change="
              config.list.ttsProvider = ($event.target as HTMLInputElement).checked
                ? null
                : 'workers-ai';
              config.list.ttsModel = null;
              config.list.ttsVoice = null;
            "
          />Use my default TTS settings</label
        >
        <TtsFields
          v-if="config.list.ttsProvider"
          v-model:provider="config.list.ttsProvider"
          v-model:model="config.list.ttsModel"
          v-model:voice="config.list.ttsVoice"
        />
      </template>
      <button class="primary" :disabled="busy">Save list settings</button>
    </form>
  </div>
</template>
<style scoped>
.list-settings {
  padding: 1rem 0;
  width: 100%;
}
h3 {
  margin-top: 0.5rem;
}
</style>
