<script setup lang="ts">
import type { List } from "../api.ts";
import { domain } from "../presentation.ts";
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
defineEmits<{ toggle: [id: string]; save: []; cancel: []; stay: [] }>();
</script>
<template>
  <view class="workspace"
    ><scroll-view class="content" scroll-orientation="vertical"
      ><view class="page"
        ><view v-if="saved" class="saved-state"
          ><view class="success-circle"><Icon name="check" tone="accent" /></view
          ><text class="detail-title centered">{{
            duplicate ? "Already saved" : "Saved to CloudKeep"
          }}</text
          ><text class="muted centered">Your link will be here when you need it.</text
          ><Button
            label="Return to previous app"
            primary
            :disabled="busy"
            @press="$emit('cancel')" /><Button
            label="Stay in CloudKeep"
            :disabled="busy"
            @press="$emit('stay')" /></view
        ><view v-else
          ><view class="link-preview"
            ><text class="medium">{{ domain(url) }}</text
            ><text class="muted" :maxline="2">{{ url }}</text></view
          ><view class="row section-heading"
            ><text class="section-title">Add to lists</text><text class="meta">Optional</text></view
          ><text v-if="loading" class="muted spaced">Updating lists…</text
          ><text v-if="!loading && !lists.length" class="muted spaced"
            >No lists yet. You can save without a list.</text
          ><view v-if="lists.length" class="surface-card"
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
      ><Button class="grow" label="Cancel" :disabled="busy" @press="$emit('cancel')" /><Button
        class="grow"
        :label="busy ? 'Saving…' : 'Save'"
        primary
        :disabled="busy || !url.trim() || selected.length > 30"
        @press="$emit('save')" /></view
  ></view>
</template>
