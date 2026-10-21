<script setup lang="ts">
import type { List } from "../api.ts";
import type { NativeState } from "../native.ts";
import Button from "../components/Button.vue";
import ChoiceRow from "../components/ChoiceRow.vue";
defineProps<{ state: NativeState; lists: List[]; busy: boolean }>();
defineEmits<{ mode: [mode: "ask" | "quick"]; defaultList: [id: string]; logout: []; more: [] }>();
</script>
<template>
  <scroll-view class="content" scroll-orientation="vertical"
    ><view class="page"
      ><text class="group-caption">Account</text
      ><view class="surface-card"
        ><view class="settings-server"
          ><text class="meta">Server</text><text class="body">{{ state.server }}</text></view
        ><Button label="Sign out" danger quiet :disabled="busy" @press="$emit('logout')" /></view
      ><text class="muted spaced">To change server or account, sign out first.</text
      ><text class="group-caption">When sharing a link</text
      ><view class="surface-card"
        ><ChoiceRow
          label="Ask"
          description="Choose lists before saving"
          radio
          :checked="state.shareMode === 'ask'"
          :disabled="busy"
          @press="$emit('mode', 'ask')" /><ChoiceRow
          label="Quick save"
          description="Save instantly without opening the app"
          radio
          :checked="state.shareMode === 'quick'"
          :disabled="busy"
          @press="$emit('mode', 'quick')" /></view
      ><text class="muted spaced">If Quick save fails, the list picker opens so you can retry.</text
      ><text class="group-caption">Quick save list</text
      ><view class="surface-card"
        ><ChoiceRow
          label="No list"
          radio
          :checked="!state.defaultList"
          :disabled="busy"
          @press="$emit('defaultList', '')" /><ChoiceRow
          v-for="list in lists"
          :key="list.id"
          :label="list.name"
          radio
          :checked="state.defaultList === list.id"
          :disabled="busy"
          @press="$emit('defaultList', list.id)" /></view
      ><text
        v-if="state.defaultList && !lists.some((list) => list.id === state.defaultList)"
        class="danger-text spaced"
        >Your default list was deleted. Choose another list or “No list”.</text
      ><text class="group-caption">More</text
      ><view class="surface-card"
        ><Button
          label="AI, prompts and invites"
          icon="external"
          quiet
          :disabled="busy"
          @press="$emit('more')" /></view></view
  ></scroll-view>
</template>
