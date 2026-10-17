<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import {
  api,
  type Settings,
  type Prompts,
  type Prompt,
  type Provider,
  type ReasoningEffort,
} from "../lib/api.ts";
import { useTask } from "../composables/task.ts";
const settings = ref<Settings | null>(null);
const prompts = ref<Prompts | null>(null);
const provider = ref<Provider | "">("");
const model = ref("");
const reasoningEffort = ref<ReasoningEffort | null>(null);
const autoTag = ref(true);
const autoSummary = ref(false);
const keys = reactive({ openai: "", openrouter: "" });
const externalProviders = ["openrouter", "openai"] as const;
const promptKinds = ["tagging", "summary"] as const;
const { busy, error, notice, run } = useTask();
function populate(value: Settings) {
  settings.value = value;
  provider.value = value.provider ?? "";
  model.value = value.model ?? "";
  reasoningEffort.value = value.reasoningEffort;
  autoTag.value = value.autoTag;
  autoSummary.value = value.autoSummary;
  keys.openai = "";
  keys.openrouter = "";
}
async function load() {
  const [value, templates] = await Promise.all([
    api<Settings>("/api/settings"),
    api<Prompts>("/api/settings/prompts"),
  ]);
  populate(value);
  prompts.value = templates;
}
onMounted(() => void run(load));
function save() {
  return run(async () => {
    const changedKeys: Partial<Record<"openai" | "openrouter", string>> = {};
    for (const name of externalProviders)
      if (keys[name].trim()) changedKeys[name] = keys[name].trim();
    populate(
      await api<Settings>("/api/settings", {
        method: "PATCH",
        body: {
          provider: provider.value || null,
          model: model.value.trim() || null,
          reasoningEffort: reasoningEffort.value,
          autoTag: autoTag.value,
          autoSummary: autoSummary.value,
          keys: changedKeys,
        },
      }),
    );
    notice.value = "Settings saved.";
  });
}
function clearKey(name: "openai" | "openrouter") {
  return run(async () => {
    const value = await api<Settings>("/api/settings", {
      method: "PATCH",
      body: { keys: { [name]: null } },
    });
    if (settings.value) settings.value.keys = value.keys;
    keys[name] = "";
    notice.value = "Key cleared.";
  });
}
function test() {
  return run(async () => {
    await api("/api/settings/ai/test", { method: "POST", body: {} });
    notice.value = "Connection successful.";
  });
}
function savePrompt(kind: "tagging" | "summary", reset = false) {
  return run(async () => {
    if (!prompts.value) return;
    prompts.value[kind] = await api<Prompt>(`/api/settings/prompts/${kind}`, {
      method: reset ? "DELETE" : "PUT",
      ...(reset ? {} : { body: { template: prompts.value[kind].template } }),
    });
    notice.value = reset ? "Default prompt restored." : "Prompt saved.";
  });
}
</script>
<template>
  <section class="narrow">
    <div class="page-heading">
      <h1>Settings</h1>
      <p class="muted">A little help organizing, on your terms.</p>
    </div>
    <p v-if="error" class="alert" role="alert">
      {{ error }} <button v-if="!settings || !prompts" @click="run(load)">Try again</button>
    </p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="!settings || !prompts" role="status" class="muted">Loading settings…</p>
    <template v-if="settings && prompts">
      <form class="panel stack" @submit.prevent="save">
        <h2>AI provider</h2>
        <div>
          <label for="provider">Provider</label
          ><select
            id="provider"
            v-model="provider"
            @change="
              model = '';
              reasoningEffort = provider ? settings.defaultReasoningEffort[provider] : null;
            "
          >
            <option value="">None</option>
            <option value="workers-ai">Workers AI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <div v-if="provider" class="model-settings">
          <div>
            <label for="model">Model</label
            ><input
              id="model"
              v-model="model"
              :placeholder="settings.defaultModels[provider]"
              maxlength="200"
            /><small class="muted"
              >Leave blank to use {{ settings.defaultModels[provider] }}.</small
            >
          </div>
          <div>
            <label for="reasoning-effort">Reasoning effort</label>
            <select id="reasoning-effort" v-model="reasoningEffort">
              <option :value="null">Provider default</option>
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <small class="muted"
              >Provider default: {{ settings.defaultReasoningEffort[provider] ?? "unspecified" }}.
              Applies to the default model; explicit models omit effort unless selected.
            </small>
          </div>
        </div>
        <div v-for="name in externalProviders" :key="name">
          <div class="row spread">
            <label :for="`key-${name}`"
              >{{ name === "openai" ? "OpenAI" : "OpenRouter" }} API key</label
            ><span class="muted small">{{
              settings.keys[name].hasKey ? "Key saved" : "No key saved"
            }}</span>
          </div>
          <div class="row">
            <input
              :id="`key-${name}`"
              v-model="keys[name]"
              class="grow"
              type="password"
              autocomplete="new-password"
              maxlength="4096"
              :placeholder="
                settings.keys[name].hasKey ? 'Enter a new key to replace' : 'Enter API key'
              "
            /><button
              v-if="settings.keys[name].hasKey"
              type="button"
              :disabled="busy"
              @click="clearKey(name)"
            >
              Clear
            </button>
          </div>
        </div>
        <label class="check"
          ><input v-model="autoTag" type="checkbox" />Automatically tag new bookmarks</label
        ><label class="check"
          ><input v-model="autoSummary" type="checkbox" />Automatically summarize new
          bookmarks</label
        >
        <div class="row">
          <button class="primary" :disabled="busy">Save settings</button
          ><button type="button" :disabled="busy" @click="test">Test connection</button>
        </div>
        <small class="muted">Connection tests use your saved settings. Save changes first.</small>
      </form>
      <section class="prompts">
        <h2>Prompts</h2>
        <p class="muted small">
          Available variables:
          <code v-for="variable in prompts.variables" :key="variable"
            ><span v-text="'{{' + variable + '}}'"></span>
          </code>
        </p>
        <form
          v-for="kind in promptKinds"
          :key="kind"
          class="panel stack prompt"
          @submit.prevent="savePrompt(kind)"
        >
          <div class="row spread">
            <label :for="`prompt-${kind}`">{{
              kind === "tagging" ? "Tagging prompt" : "Summary prompt"
            }}</label
            ><span class="muted small">{{
              prompts[kind].isDefault ? "Default" : "Customized"
            }}</span>
          </div>
          <textarea
            :id="`prompt-${kind}`"
            v-model="prompts[kind].template"
            rows="9"
            required
            maxlength="12000"
          />
          <div class="row">
            <button :disabled="busy">Save prompt</button
            ><button type="button" :disabled="busy" @click="savePrompt(kind, true)">
              Reset to default
            </button>
          </div>
        </form>
      </section>
    </template>
  </section>
</template>
<style scoped>
.model-settings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}
.prompts {
  margin-top: 2.5rem;
}
.prompt {
  margin-top: 1rem;
}
code {
  white-space: nowrap;
  font-size: 0.8rem;
}
textarea {
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
}
</style>
