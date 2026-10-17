<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, type Invite, type Page } from "../../lib/api.ts";
import { useSession } from "../../composables/session.ts";
import { useTask } from "../../composables/task.ts";
const user = useSession();
const invites = ref<Invite[]>([]);
const expiry = ref("");
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
      body: { expiresAt: expiry.value ? new Date(expiry.value).getTime() : null },
    });
    inviteLink.value = `${window.location.origin}/register?code=${encodeURIComponent(result.code)}`;
    expiry.value = "";
    await load();
  });
}
function revoke(id: string) {
  if (window.confirm("Revoke this invitation?"))
    return run(async () => {
      await api(`/api/admin/invites/${id}`, { method: "DELETE" });
      await load();
    });
}
function copy() {
  return run(async () => {
    try {
      await navigator.clipboard.writeText(inviteLink.value);
      notice.value = "Invite link copied.";
    } catch {
      throw new Error("Copy unavailable. Select the link and copy it manually.");
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
  <section v-if="user?.role === 'admin'" class="narrow">
    <div class="page-heading">
      <p class="muted small">ADMIN</p>
      <h1>Invite someone in.</h1>
      <p class="muted">Each invitation can be used once.</p>
    </div>
    <form class="panel stack" @submit.prevent="create">
      <div>
        <label for="expiry">Expires at <span class="muted small">(optional)</span></label
        ><input id="expiry" v-model="expiry" type="datetime-local" /><small class="muted"
          >Your local time. Leave blank for no expiry.</small
        >
      </div>
      <div><button class="primary" :disabled="busy">Create invite</button></div>
    </form>
    <p v-if="error" class="alert" role="alert">
      {{ error }} <button v-if="!loaded" @click="run(() => load())">Try again</button>
    </p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <div v-if="inviteLink" class="panel new-invite">
      <label for="invite-link">Your invite link</label>
      <p class="muted small">Copy it now. This link is only shown here once.</p>
      <div class="row">
        <input
          id="invite-link"
          class="grow"
          :value="inviteLink"
          readonly
          @focus="($event.target as HTMLInputElement).select()"
        /><button :disabled="busy" @click="copy">Copy</button>
      </div>
    </div>
    <h2 class="history">Invitations</h2>
    <p v-if="!loaded && !error" class="muted" role="status">Loading invitations…</p>
    <p v-else-if="loaded && !invites.length" class="empty muted">No invitations yet.</p>
    <article v-for="invite in invites" :key="invite.id" class="invite row">
      <div class="grow">
        <strong>{{ status(invite) }}</strong>
        <p class="muted small">
          Created {{ new Date(invite.createdAt).toLocaleString() }}<br />{{
            invite.expiresAt
              ? `Expires ${new Date(invite.expiresAt).toLocaleString()}`
              : "No expiry"
          }}
        </p>
      </div>
      <button v-if="status(invite) === 'Active'" :disabled="busy" @click="revoke(invite.id)">
        Revoke
      </button>
    </article>
    <button v-if="more" :disabled="busy" @click="run(() => load(true))">Load more</button>
  </section>
</template>
<style scoped>
.new-invite,
.history {
  margin-top: 2rem;
}
.invite {
  padding: 1rem 0;
  border-bottom: 1px solid var(--line);
}
.invite p {
  margin: 0.25rem 0 0;
}
</style>
