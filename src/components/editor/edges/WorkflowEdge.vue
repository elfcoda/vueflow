<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  BaseEdge,
  EdgeLabelRenderer,
  MarkerType,
  getBezierPath,
  useVueFlow,
  type EdgeProps,
} from '@vue-flow/core'
import type { WorkflowEdgeData } from '../types'

const props = defineProps<EdgeProps<WorkflowEdgeData>>()

const { removeEdges } = useVueFlow()
const hovered = ref(false)

const edgePath = computed(() =>
  getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    curvature: 0.22,
  }),
)

const labelStyle = computed(() => ({
  transform: `translate(-50%, -50%) translate(${edgePath.value[1]}px, ${edgePath.value[2]}px)`,
}))

const isDataEdge = computed(() => props.data?.kind === 'data')

const edgeClass = computed(() => [
  'workflow-edge',
  { selected: props.selected, data: isDataEdge.value, hovered: hovered.value },
])

const labelClass = computed(() => [
  'edge-label',
  'nopan',
  'nodrag',
  { selected: props.selected, hovered: hovered.value, data: isDataEdge.value },
])

function removeEdge() {
  removeEdges(props.id)
}

function handleMouseEnter() {
  hovered.value = true
}

function handleMouseLeave() {
  hovered.value = false
}
</script>

<template>
  <BaseEdge
    :id="id"
    :path="edgePath[0]"
    :class="edgeClass"
    :style="{ strokeDasharray: isDataEdge ? '6 6' : 'none' }"
    :marker-end="markerEnd ?? MarkerType.ArrowClosed"
    :interaction-width="40"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  />

  <EdgeLabelRenderer>
    <div
      :class="labelClass"
      :style="labelStyle"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <span class="edge-badge">{{ data?.label ?? 'Main' }}</span>
      <button v-if="selected" type="button" class="edge-remove" @click="removeEdge">
        ×
      </button>
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.workflow-edge {
  stroke: color-mix(in srgb, var(--edge-color) 82%, transparent);
  stroke-width: 2;
  stroke-linecap: square;
  transition:
    stroke 0.18s ease,
    stroke-width 0.18s ease,
    opacity 0.18s ease;
}

.workflow-edge.selected {
  stroke: var(--accent);
  stroke-width: 3;
}

.workflow-edge.hovered {
  stroke: color-mix(in srgb, var(--edge-color) 92%, white 8%);
}

.workflow-edge.data {
  stroke: var(--edge-data-color);
  opacity: 0.92;
}

.edge-label {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transform: translateY(-8px);
}

.edge-badge,
.edge-remove {
  border: 1px solid var(--panel-border);
  color: var(--text-secondary);
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;
}

.edge-badge {
  padding: 2px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel-surface) 88%, transparent);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.4;
}

.edge-remove {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--panel-surface);
  cursor: pointer;
}

.edge-label.hovered .edge-badge,
.edge-label.selected .edge-badge {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--panel-border));
  color: var(--text-primary);
}

.edge-label.data .edge-badge {
  color: color-mix(in srgb, var(--edge-data-color) 76%, var(--text-secondary));
}

.edge-label.selected .edge-remove {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--panel-border));
  color: var(--accent);
}
</style>