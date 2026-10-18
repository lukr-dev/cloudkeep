<script setup lang="ts">
import type { List } from "../api.ts";
import Field from "../Field.vue";
import Button from "../components/Button.vue";
import EmptyState from "../components/EmptyState.vue";
defineProps<{ lists: List[]; name: string; editing: boolean; busy: boolean }>();
defineEmits<{
  name: [value: string];
  save: [];
  cancel: [];
  view: [id: string];
  edit: [list: List];
  delete: [list: List];
}>();
</script>
<template>
  <scroll-view class="content" scroll-orientation="vertical"
    ><view class="page"
      ><view class="row input-row"
        ><Field
          class="grow"
          :label="editing ? 'Rename list' : 'New list'"
          :value="name"
          :max-length="100"
          @change="$emit('name', $event)"
          @confirm="$emit('save')" /><Button
          :label="editing ? 'Save' : 'Create'"
          primary
          :disabled="busy || !name.trim()"
          @press="$emit('save')" /></view
      ><Button
        v-if="editing"
        label="Cancel"
        quiet
        :disabled="busy"
        @press="$emit('cancel')" /><EmptyState
        v-if="!lists.length"
        icon="lists"
        title="A place for everything"
        description="Lists help you keep links together." /><view v-else class="surface-card"
        ><view v-for="list in lists" :key="list.id" class="list-row"
          ><view
            class="list-body"
            accessibility-element
            accessibility-traits="button"
            :accessibility-label="`View ${list.name}`"
            @tap="!busy && $emit('view', list.id)"
            ><text class="medium" :maxline="2">{{ list.name }}</text
            ><text class="meta">{{ list.count }} links</text></view
          ><Button
            :label="`Rename ${list.name}`"
            icon="edit"
            icon-only
            quiet
            :disabled="busy"
            @press="$emit('edit', list)" /><Button
            :label="`Delete ${list.name}`"
            icon="trash"
            icon-only
            quiet
            danger
            :disabled="busy"
            @press="$emit('delete', list)" /></view></view></view
  ></scroll-view>
</template>
