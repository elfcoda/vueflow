<script setup lang="ts">
import { computed } from 'vue'
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
  { selected: props.selected, data: isDataEdge.value },
])

function removeEdge() {
  removeEdges(props.id)
}
</script>

<template>
  <BaseEdge
    :id="id"
    :path="edgePath[0]"
    :class="edgeClass"
    :style="{ strokeDasharray: isDataEdge ? '6 6' : 'none' }"
    :marker-end="markerEnd ?? MarkerType.ArrowClosed"
  />

  <EdgeLabelRenderer>
    <div class="edge-label nopan nodrag" :style="labelStyle">
      <span class="edge-badge">{{ data?.label ?? 'Main' }}</span>
      <button v-if="selected" type="button" class="edge-remove" @click="removeEdge">
        ×
      </button>
    </div>
  </EdgeLabelRenderer>
</template>

<style scoped>
.workflow-edge {
  stroke: var(--edge-color);
  stroke-width: 2.5;
}

.workflow-edge.selected {
  stroke: var(--accent);
  stroke-width: 3;
}

.workflow-edge.data {
  stroke: var(--edge-data-color);
}

.edge-label {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.edge-badge,
.edge-remove {
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: var(--panel-surface);
  color: var(--text-secondary);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
}

.edge-badge {
  padding: 4px 10px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.edge-remove {
  width: 24px;
  height: 24px;
  cursor: pointer;
}
</style>