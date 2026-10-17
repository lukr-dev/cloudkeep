<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type Invite, type Page } from "../../lib/api.ts";
import { useSession } from "../../composables/session.ts";
import { useTask } from "../../composables/task.ts";
import Icon from "../../components/Icon.vue";
const user = useSession();
const invites = ref<Invite[]>([]);
const expiryDays = ref("7");
const copied = ref(false);
const inviteLink = ref("");
const more = ref(false);
const loaded = ref(false);
const { busy, error, notice, run } = useTask();
async function load(append = false) {
  const page = await api<Page<Invite>>(
    `/api/admin/invites?limit=50&offset=${append ? invites.value.length : 0}`,
  );
  invites.value = append ? [...invites.value, ...page.items] : page.items;
  more.value = page.items.length === 50;
  loaded.value = true;
}
onMounted(() => {
  if (user.value?.role === "admin") void run(() => load());
});
function create() {
  return run(async () => {
    const result = await api<{ invite: Invite; code: string }>("/api/admin/invites", {
      method: "POST",
      body: {
        expiresAt: expiryDays.value ? Date.now() + Number(expiryDays.value) * 86_400_000 : null,
      },
    });
    inviteLink.value = `${window.location.origin}/register?code=${encodeURIComponent(result.code)}`;
    copied.value = false;
    await load();
  });
}
function revoke(id: string) {
  if (window.confirm("Revoke this invite? The link will stop working."))
    return run(async () => {
      await api(`/api/admin/invites/${id}`, { method: "DELETE" });
      await load();
    });
}
function copy() {
  return run(async () => {
    try {
      await navigator.clipboard.writeText(inviteLink.value);
      copied.value = true;
      notice.value = "Link copied";
    } catch {
      throw new Error("Couldn’t copy. Select the link and copy it manually.");
    }
  });
}
function status(invite: Invite) {
  return invite.revokedAt
    ? "Revoked"
    : invite.usedAt
      ? "Used"
      : invite.expiresAt && invite.expiresAt <= Date.now()
        ? "Expired"
        : "Active";
}
</script>
<template>
  <div v-if="user?.role === 'admin'" class="invites">
    <div class="page-head">
      <div>
        <h1>Invites</h1>
        <p>Each link lets one person create an account.</p>
      </div>
    </div>
    <form class="create" @submit.prevent="create">
      <label for="expiry" class="sr-only">Link expires</label>
      <select id="expiry" v-model="expiryDays">
        <option value="1">Expires in 1 day</option>
        <option value="7">Expires in 7 days</option>
        <option value="30">Expires in 30 days</option>
        <option value="">Never expires</option>
      </select>
      <button class="primary" :disabled="busy">Create invite link</button>
    </form>
    <div v-if="error" class="alert" role="alert">
      <span>{{ error }}</span
      ><button v-if="!loaded" @click="run(() => load())">Try again</button>
    </div>
    <div v-if="inviteLink" class="new-link fade-in">
      <label for="invite-link">New invite link</label>
      <div class="row">
        <input
          id="invite-link"
          class="grow"
          :value="inviteLink"
          readonly
          @focus="($event.target as HTMLInputElement).select()"
        /><button :disabled="busy" @click="copy">
          <Icon v-if="copied" name="check" :size="14" />{{ copied ? "Copied" : "Copy" }}
        </button>
      </div>
      <p class="hint">Copy it now. It won’t be shown again.</p>
    </div>
    <h2 class="history">Sent</h2>
    <div v-if="!loaded && !error" class="rows" aria-hidden="true">
      <div v-for="n in 2" :key="n" class="skeleton placeholder"></div>
    </div>
    <p v-else-if="loaded && !invites.length" class="none">No invites yet.</p>
    <ul v-else class="rows">
      <li v-for="invite in invites" :key="invite.id" class="invite">
        <span class="status" :data-status="status(invite).toLowerCase()">{{ status(invite) }}</span>
        <span class="when grow">
          Created {{ new Date(invite.createdAt).toLocaleDateString() }}
          <span aria-hidden="true">·</span>
          {{
            invite.expiresAt
              ? `${status(invite) === "Expired" ? "Expired" : "Expires"} ${new Date(invite.expiresAt).toLocaleDateString()}`
              : "No expiry"
          }}
        </span>
        <button
          v-if="status(invite) === 'Active'"
          class="ghost small danger"
          :disabled="busy"
          @click="revoke(invite.id)"
        >
          Revoke
        </button>
      </li>
    </ul>
    <button v-if="more" class="more" :disabled="busy" @click="run(() => load(true))">
      Show more
    </button>
  </div>
</template>
<style scoped>
.invites {
  max-width: 640px;
}
.create {
  display: flex;
  gap: 0.5rem;
}
.create select {
  width: auto;
  flex: 1;
}
.new-link {
  display: grid;
  gap: 0.5rem;
  margin-top: 1.25rem;
  padding: 1rem;
  border-radius: var(--radius-lg);
  background: var(--accent-soft);
}
.new-link input {
  font-family: var(--mono);
  font-size: 0.8rem;
}
.history {
  margin: 2.5rem 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--faint);
}
.none {
  color: var(--muted);
  font-size: 0.9rem;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.placeholder {
  height: 2.75rem;
  margin-bottom: 2px;
}
.invite {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-height: 3rem;
  border-bottom: 1px solid var(--line);
  font-size: 0.88rem;
}
.status {
  width: 4.5rem;
  font-weight: 500;
}
.status[data-status="active"] {
  color: var(--accent);
}
.status:not([data-status="active"]) {
  color: var(--faint);
}
.when {
  color: var(--muted);
}
.more {
  margin-top: 1rem;
}
@media (max-width: 520px) {
  .create {
    flex-direction: column;
  }
}
</style>
