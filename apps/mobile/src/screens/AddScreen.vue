<script setup lang="ts">
import type { List } from "../api.ts";
import Field from "../Field.vue";
import Button from "../components/Button.vue";
import ChoiceRow from "../components/ChoiceRow.vue";
import Icon from "../components/Icon.vue";
defineProps<{
  url: string;
  lists: List[];
  selected: string[];
  loading: boolean;
  busy: boolean;
  saved: boolean;
  duplicate: boolean;
}>();
defineEmits<{ url: [value: string]; toggle: [id: string]; save: []; view: []; another: [] }>();
</script>
<template>
  <view class="workspace"
    ><scroll-view class="content" scroll-orientation="vertical"
      ><view class="page"
        ><view v-if="saved" class="saved-state"
          ><view class="success-circle"><Icon name="check" tone="accent" /></view
          ><text class="detail-title centered">{{
            duplicate ? "Already saved — moved to the top" : "Saved"
          }}</text
          ><text class="muted centered"
            >Your link is kept. Details may take a moment to arrive.</text
          ><Button label="View bookmarks" primary :disabled="busy" @press="$emit('view')" /><Button
            label="Save another"
            :disabled="busy"
            @press="$emit('another')" /></view
        ><view v-else
          ><Field
            label="Link URL"
            :value="url"
            placeholder="https://…"
            @change="$emit('url', $event)"
          /><text class="section-title section-space">Lists</text
          ><text v-if="loading" class="muted">Updating lists…</text
          ><text v-if="!lists.length" class="muted">You can save without a list.</text
          ><view v-else class="surface-card"
            ><ChoiceRow
              v-for="list in lists"
              :key="list.id"
              :label="list.name"
              :description="`${list.count} links`"
              :checked="selected.includes(list.id)"
              :disabled="busy"
              @press="$emit('toggle', list.id)" /></view
          ><text v-if="selected.length > 30" class="danger-text spaced"
            >Choose at most 30 lists.</text
          ></view
        ></view
      ></scroll-view
    ><view v-if="!saved" class="bottom-actions"
      ><Button
        class="grow"
        :label="busy ? 'Saving…' : 'Save'"
        primary
        :disabled="busy || !url.trim() || selected.length > 30"
        @press="$emit('save')" /></view
  ></view>
</template>
