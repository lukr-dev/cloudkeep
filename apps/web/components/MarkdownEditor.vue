<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
const props = defineProps<{ modelValue: string; label?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const editor = useEditor({
  extensions: [StarterKit.configure({ link: { openOnClick: false } }), Markdown],
  content: props.modelValue,
  contentType: "markdown",
  editorProps: {
    attributes: {
      role: "textbox",
      "aria-multiline": "true",
      "aria-label": props.label ?? "Note text",
    },
  },
  onUpdate: ({ editor }) => emit("update:modelValue", editor.getMarkdown()),
});
watch(
  () => props.modelValue,
  (value) => {
    if (editor.value && value !== editor.value.getMarkdown())
      editor.value.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  },
);
function setLink() {
  if (!editor.value) return;
  const href = window.prompt(
    "Link URL (leave empty to remove)",
    editor.value.getAttributes("link").href ?? "https://",
  );
  if (href === null) return;
  if (!href.trim()) editor.value.chain().focus().extendMarkRange("link").unsetLink().run();
  else editor.value.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
}
onBeforeUnmount(() => editor.value?.destroy());
</script>
<template>
  <div class="markdown-editor">
    <div v-if="editor" class="editor-toolbar" role="toolbar" aria-label="Text formatting">
      <button
        type="button"
        aria-label="Bold"
        :aria-pressed="editor.isActive('bold')"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <strong>B</strong><span class="sr-only">Bold</span>
      </button>
      <button
        type="button"
        aria-label="Italic"
        :aria-pressed="editor.isActive('italic')"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <em>I</em><span class="sr-only">Italic</span>
      </button>
      <button
        type="button"
        :aria-pressed="editor.isActive('heading')"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        Heading
      </button>
      <button
        type="button"
        :aria-pressed="editor.isActive('bulletList')"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        Bullets
      </button>
      <button
        type="button"
        :aria-pressed="editor.isActive('orderedList')"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        Numbered
      </button>
      <button type="button" :aria-pressed="editor.isActive('link')" @click="setLink">Link</button>
      <button
        type="button"
        :aria-pressed="editor.isActive('code')"
        @click="editor.chain().focus().toggleCode().run()"
      >
        Code
      </button>
      <button
        type="button"
        :aria-pressed="editor.isActive('codeBlock')"
        @click="editor.chain().focus().toggleCodeBlock().run()"
      >
        Code block
      </button>
      <button
        type="button"
        :aria-pressed="editor.isActive('blockquote')"
        @click="editor.chain().focus().toggleBlockquote().run()"
      >
        Quote
      </button>
    </div>
    <EditorContent :editor="editor" />
  </div>
</template>
<style scoped>
.markdown-editor {
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface);
}
.editor-toolbar {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  padding: 0.4rem;
  border-bottom: 1px solid var(--line);
}
.editor-toolbar button {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}
.editor-toolbar button[aria-pressed="true"] {
  background: var(--accent-soft);
  color: var(--accent);
}
:deep(.tiptap) {
  padding: 0.75rem;
  min-height: 10rem;
  max-height: 60vh;
  overflow: auto;
  overflow-wrap: anywhere;
}
:deep(.tiptap:focus) {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
:deep(.tiptap p + p) {
  margin-top: 0.65rem;
}
:deep(.tiptap ul),
:deep(.tiptap ol) {
  padding-left: 1.5rem;
}
:deep(.tiptap ul) {
  list-style: disc;
}
:deep(.tiptap ol) {
  list-style: decimal;
}
:deep(.tiptap blockquote) {
  border-left: 3px solid var(--line-strong);
  padding-left: 0.75rem;
  color: var(--muted);
}
:deep(.tiptap pre),
:deep(.tiptap code) {
  background: var(--subtle);
  border-radius: 4px;
  padding: 0.15rem 0.3rem;
  font-family: monospace;
}
:deep(.tiptap pre) {
  padding: 0.75rem;
  white-space: pre-wrap;
}
:deep(.tiptap a) {
  color: var(--accent);
  text-decoration: underline;
}
</style>
