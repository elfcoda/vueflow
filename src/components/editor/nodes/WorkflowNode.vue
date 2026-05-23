<script setup lang="ts">
import { computed, ref } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import type { WorkflowNodeData } from '../types'
import NodeContentWidget from './NodeContentWidget.vue'
import {
  getWorkflowNodeIconAssetId,
  getWorkflowNodeIconAssetSrc,
  getWorkflowNodeShape,
} from '../nodeAttachmentCatalog'
import { useNodeAttachmentDrag } from '../useNodeAttachmentDrag'
import { useWorkflowDocumentStore } from '../../../stores/workflowDocument.store'

const props = defineProps<NodeProps<WorkflowNodeData>>()
const workflowDocumentStore = useWorkflowDocumentStore()
const { clearNodeAttachmentDrag, getNodeAttachmentPayload, hasNodeAttachmentPayload } =
  useNodeAttachmentDrag()
const isAttachmentTarget = ref(false)

const statusLabel = computed(() => {
  switch (props.data.status) {
    case 'success':
      return 'Ready'
    case 'warning':
      return 'Draft'
    case 'error':
      return 'Issue'
    default:
      return 'Idle'
  }
})

const classes = computed(() => [
  'workflow-node',
  `kind-${props.data.kind}`,
  `shape-${getWorkflowNodeShape(props.data.attachments)}`,
  `status-${props.data.status ?? 'default'}`,
  {
    selected: props.selected,
    'attachment-target': isAttachmentTarget.value,
  },
])

const iconAssetSrc = computed(() => getWorkflowNodeIconAssetSrc(getWorkflowNodeIconAssetId(props.data.attachments)))

function handleDragOver(event: DragEvent) {
  if (!hasNodeAttachmentPayload(event)) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
  isAttachmentTarget.value = true
}

function handleDragEnter(event: DragEvent) {
  if (!hasNodeAttachmentPayload(event)) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  isAttachmentTarget.value = true
}

function handleDragLeave() {
  isAttachmentTarget.value = false
}

function handleDrop(event: DragEvent) {
  const payload = getNodeAttachmentPayload(event)

  isAttachmentTarget.value = false

  if (!payload) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  workflowDocumentStore.applyNodeAttachment(props.id, payload)
  clearNodeAttachmentDrag()
}
</script>

<template>
  <div
    :class="classes"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <Handle type="target" :position="Position.Left" class="port port-target" />

    <div class="node-topline">
      <span class="node-icon">
        <img v-if="iconAssetSrc" :src="iconAssetSrc" :alt="data.title" class="node-icon-asset" />
        <span v-else>{{ data.icon }}</span>
      </span>
      <span class="node-kind">{{ data.kind }}</span>
      <span class="node-status">{{ statusLabel }}</span>
    </div>

    <div class="node-copy">
      <strong class="node-title">{{ data.title }}</strong>
      <span class="node-subtitle">{{ data.subtitle }}</span>
      <span v-if="data.hint" class="node-hint">{{ data.hint }}</span>
    </div>

    <div class="node-footer">
      <span class="node-pill">Input</span>
      <span class="node-pill">Output</span>
    </div>

    <NodeContentWidget v-if="data.contentWidget" :content="data.contentWidget.content" />

    <Handle type="source" :position="Position.Right" class="port port-source" />
  </div>
</template>

<style scoped>
.workflow-node {
  width: 260px;
  min-height: 118px;
  padding: 14px;
  border: 1px solid var(--node-border);
  background: var(--node-surface);
  box-shadow: var(--node-shadow);
  color: var(--text-primary);
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.shape-default {
  border-radius: 20px;
}

.shape-trigger {
  border-radius: 40px 20px 20px 40px;
}

.shape-pill {
  border-radius: 999px;
}

.shape-bevel {
  border-radius: 32px 10px 32px 10px;
}

.workflow-node.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-ring), var(--node-shadow);
  transform: translateY(-1px);
}

.workflow-node.attachment-target {
  border-color: var(--accent);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 22%, transparent), var(--node-shadow);
}

.node-topline,
.node-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.node-icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--node-icon-surface);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.node-icon-asset {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.node-kind,
.node-status,
.node-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.node-kind {
  margin-left: auto;
  background: var(--chip-muted-bg);
  color: var(--text-muted);
}

.node-status {
  background: var(--chip-status-bg);
  color: var(--chip-status-text);
}

.node-copy {
  display: grid;
  gap: 6px;
  margin: 14px 0;
}

.node-title {
  font-size: 17px;
  line-height: 1.2;
}

.node-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.node-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.node-footer {
  padding-top: 8px;
  border-top: 1px solid var(--node-divider);
}

.node-pill {
  background: var(--chip-muted-bg);
  color: var(--text-secondary);
}

.kind-trigger .node-icon {
  background: rgba(255, 184, 77, 0.18);
  color: #b65a06;
}

.kind-action .node-icon {
  background: rgba(87, 124, 255, 0.16);
  color: #3151c6;
}

.kind-output .node-icon {
  background: rgba(52, 199, 128, 0.16);
  color: #1e7a4b;
}

.status-success {
  --chip-status-bg: rgba(41, 163, 105, 0.16);
  --chip-status-text: #157347;
}

.status-warning {
  --chip-status-bg: rgba(255, 184, 77, 0.18);
  --chip-status-text: #9d5a00;
}

.status-error {
  --chip-status-bg: rgba(229, 77, 66, 0.16);
  --chip-status-text: #b32d22;
}

.status-default {
  --chip-status-bg: rgba(91, 101, 124, 0.14);
  --chip-status-text: var(--text-secondary);
}

.port {
  width: 12px;
  height: 12px;
  border: 2px solid var(--canvas-surface);
  background: var(--accent);
}

.port-target {
  left: -6px;
}

.port-source {
  right: -6px;
}
</style>