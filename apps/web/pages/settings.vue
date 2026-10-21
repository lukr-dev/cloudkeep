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
import { useFeatures, useSession } from "../composables/session.ts";
import { useTask } from "../composables/task.ts";
const user = useSession();
const features = useFeatures();
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
const providers = [
  { value: "", label: "Off" },
  { value: "workers-ai", label: "Workers AI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai", label: "OpenAI" },
] as const;
const providerNames = { openai: "OpenAI", openrouter: "OpenRouter" } as const;
const promptLabels = {
  tagging: { title: "Tagging", hint: "Runs on every new bookmark to pick tags." },
  summary: { title: "Summary", hint: "Runs when automatic summaries are on." },
} as const;
function choose(value: Provider | "") {
  if (provider.value === value) return;
  provider.value = value;
  model.value = "";
  reasoningEffort.value =
    value && settings.value ? settings.value.defaultReasoningEffort[value] : null;
}
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
    notice.value = "Settings saved";
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
    notice.value = "Key removed";
  });
}
function test() {
  return run(async () => {
    await api("/api/settings/ai/test", { method: "POST", body: {} });
    notice.value = "Connection works";
  });
}
function savePrompt(kind: "tagging" | "summary", reset = false) {
  return run(async () => {
    if (!prompts.value) return;
    prompts.value[kind] = await api<Prompt>(`/api/settings/prompts/${kind}`, {
      method: reset ? "DELETE" : "PUT",
      ...(reset ? {} : { body: { template: prompts.value[kind].template } }),
    });
    notice.value = reset ? "Default prompt restored" : "Prompt saved";
  });
}
</script>
<template>
  <div class="settings">
    <div class="page-head">
      <h1>Settings</h1>
    </div>
    <div v-if="error" class="alert" role="alert">
      <span>{{ error }}</span
      ><button v-if="!settings || !prompts" @click="run(load)">Try again</button>
    </div>
    <div v-if="!settings || !prompts" class="loading" aria-hidden="true">
      <div v-for="n in 3" :key="n" class="skeleton"></div>
    </div>
    <p v-if="user?.role === 'admin'" class="muted small">
      File uploads: {{ features.files ? "on" : "off"
      }}<template v-if="!features.files">
        — enable R2 and redeploy with CLOUDKEEP_FILES=true, see
        <a
          class="link"
          href="https://github.com/lukr-dev/cloudkeep/blob/dev/apps/web/README.md#file-uploads-optional-needs-r2"
          target="_blank"
          rel="noopener noreferrer"
          >README</a
        >.
      </template>
    </p>
    <template v-if="settings && prompts">
      <form class="group fade-in" @submit.prevent="save">
        <div class="intro">
          <h2>AI</h2>
          <p>Tags and summarizes new bookmarks. Use Cloudflare Workers AI, or your own key.</p>
        </div>
        <div class="controls stack">
          <div class="field">
            <span id="provider-label" class="label">Provider</span>
            <div class="segmented" role="radiogroup" aria-labelledby="provider-label">
              <button
                v-for="option in providers"
                :key="option.value"
                type="button"
                role="radio"
                :aria-checked="provider === option.value"
                @click="choose(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <template v-if="provider">
            <div class="pair">
              <div class="field">
                <label for="model">Model</label
                ><input
                  id="model"
                  v-model="model"
                  class="mono-input"
                  :placeholder="settings.defaultModels[provider]"
                  maxlength="200"
                  spellcheck="false"
                />
              </div>
              <div class="field">
                <label for="reasoning-effort">Reasoning</label>
                <select id="reasoning-effort" v-model="reasoningEffort">
                  <option :value="null">Default</option>
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            <p class="hint">
              Leave the model empty to use the default. Reasoning is only sent when set.
            </p>
            <p v-if="provider === 'workers-ai'" class="hint note">
              Runs on your Cloudflare account. No key needed.
            </p>
            <div v-else class="field">
              <div class="row label-row">
                <label :for="`key-${provider}`">{{ providerNames[provider] }} API key</label
                ><span v-if="settings.keys[provider].hasKey" class="saved"
                  ><span class="dot"></span>Saved</span
                >
              </div>
              <div class="row">
                <input
                  :id="`key-${provider}`"
                  v-model="keys[provider]"
                  class="grow mono-input"
                  type="password"
                  autocomplete="new-password"
                  maxlength="4096"
                  spellcheck="false"
                  :placeholder="
                    settings.keys[provider].hasKey ? '••••••••  Paste to replace' : 'Paste your key'
                  "
                /><button
                  v-if="settings.keys[provider].hasKey"
                  type="button"
                  class="ghost"
                  :disabled="busy"
                  @click="clearKey(provider)"
                >
                  Remove
                </button>
              </div>
              <p class="hint">Stored encrypted. Never shown again.</p>
            </div>
          </template>
          <div class="toggles">
            <label class="check"
              ><input v-model="autoTag" type="checkbox" :disabled="!provider" />Tag new
              bookmarks</label
            ><label class="check"
              ><input v-model="autoSummary" type="checkbox" :disabled="!provider" />Summarize new
              bookmarks</label
            >
          </div>
          <div class="row">
            <button class="primary" :disabled="busy">Save</button
            ><button v-if="provider" type="button" class="ghost" :disabled="busy" @click="test">
              Test connection
            </button>
          </div>
        </div>
      </form>
      <section class="group fade-in">
        <div class="intro">
          <h2>Prompts</h2>
          <p>Edit what the AI is asked. Variables are filled in for each bookmark.</p>
          <div class="variables">
            <code
              v-for="variable in prompts.variables"
              :key="variable"
              v-text="'{{' + variable + '}}'"
            />
          </div>
        </div>
        <div class="controls stack">
          <form
            v-for="kind in promptKinds"
            :key="kind"
            class="field"
            @submit.prevent="savePrompt(kind)"
          >
            <div class="row label-row">
              <label :for="`prompt-${kind}`">{{ promptLabels[kind].title }}</label
              ><span class="hint">{{ prompts[kind].isDefault ? "Default" : "Edited" }}</span>
            </div>
            <textarea
              :id="`prompt-${kind}`"
              v-model="prompts[kind].template"
              class="prompt"
              rows="10"
              required
              maxlength="12000"
              spellcheck="false"
            />
            <div class="row prompt-actions">
              <span class="hint grow">{{ promptLabels[kind].hint }}</span
              ><button
                v-if="!prompts[kind].isDefault"
                type="button"
                class="ghost small"
                :disabled="busy"
                @click="savePrompt(kind, true)"
              >
                Reset</button
              ><button class="small" :disabled="busy">Save prompt</button>
            </div>
          </form>
        </div>
      </section>
    </template>
  </div>
</template>
<style scoped>
.settings {
  max-width: 880px;
}
.group {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 3rem;
  padding: 0.5rem 0 2.5rem;
}
.group + .group {
  padding-top: 2.5rem;
  border-top: 1px solid var(--line);
}
.intro p {
  margin-top: 0.35rem;
  font-size: 0.86rem;
  color: var(--muted);
}
.variables {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.9rem;
}
.variables code {
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--subtle);
  color: var(--muted);
  font-size: 0.74rem;
}
.segmented {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 3px;
  border-radius: calc(var(--radius) + 2px);
  background: var(--subtle);
  box-shadow: inset 0 0 0 1px var(--line);
}
.segmented button {
  height: 2rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 0.86rem;
}
.segmented button:hover {
  color: var(--text);
  background: transparent;
}
.segmented button[aria-checked="true"] {
  background: var(--surface);
  color: var(--text);
  box-shadow:
    0 1px 2px rgb(0 0 0 / 0.06),
    0 0 0 1px var(--line);
}
.pair {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 10rem;
  gap: 0.75rem;
}
.pair + .hint {
  margin-top: -0.75rem;
}
.note {
  color: var(--muted);
}
.mono-input {
  font-family: var(--mono);
  font-size: 0.84rem;
}
.label-row {
  justify-content: space-between;
}
.saved {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: var(--accent);
}
.toggles {
  display: grid;
  gap: 0.6rem;
  padding: 1rem 0;
  border-block: 1px solid var(--line);
}
.toggles .check:has(input:disabled) {
  color: var(--faint);
  cursor: default;
}
.prompt {
  font-family: var(--mono);
  font-size: 0.8rem;
  line-height: 1.6;
  background: var(--surface);
}
.prompt-actions {
  margin-top: 0.15rem;
}
.loading {
  display: grid;
  gap: 1rem;
}
.loading .skeleton {
  height: 3rem;
}
@media (max-width: 760px) {
  .group {
    grid-template-columns: 1fr;
    gap: 1.25rem;
  }
  .segmented {
    grid-template-columns: repeat(2, 1fr);
  }
  .pair {
    grid-template-columns: 1fr;
  }
}
</style>
