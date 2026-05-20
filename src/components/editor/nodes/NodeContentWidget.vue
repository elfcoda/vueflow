<script setup lang="ts">
defineProps<{
  content: string
}>()
</script>

<template>
  <div class="node-content-widget">
    <span class="widget-label">Content</span>
    <p class="widget-copy">{{ content }}</p>
  </div>
</template>

<style scoped>
.node-content-widget {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--node-divider);
  background: color-mix(in srgb, var(--node-surface) 84%, white 16%);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.widget-label {
  display: inline-flex;
  margin-bottom: 8px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--chip-muted-bg);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.widget-copy {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>