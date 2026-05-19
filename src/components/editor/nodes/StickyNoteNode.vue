<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { WorkflowNodeData } from '../types'

defineProps<NodeProps<WorkflowNodeData>>()
</script>

<template>
  <div class="sticky-note" :class="{ selected }">
    <span class="sticky-badge">Note</span>
    <strong class="sticky-title">{{ data.title }}</strong>
    <p class="sticky-copy">{{ data.note ?? data.subtitle }}</p>
  </div>
</template>

<style scoped>
.sticky-note {
  width: 250px;
  min-height: 160px;
  padding: 18px;
  border-radius: 24px;
  border: 1px solid rgba(125, 89, 26, 0.14);
  background: linear-gradient(180deg, #fff8cb 0%, #ffe7a3 100%);
  box-shadow: 0 18px 32px rgba(161, 119, 22, 0.16);
  transform: rotate(-1.4deg);
}

.sticky-note.selected {
  box-shadow: 0 0 0 4px rgba(255, 184, 77, 0.3), 0 18px 32px rgba(161, 119, 22, 0.16);
}

.sticky-badge {
  display: inline-flex;
  margin-bottom: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(103, 70, 18, 0.12);
  color: #8a5c12;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sticky-title {
  display: block;
  margin-bottom: 10px;
  font-size: 18px;
  color: #53380a;
}

.sticky-copy {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #6e4a10;
}
</style>