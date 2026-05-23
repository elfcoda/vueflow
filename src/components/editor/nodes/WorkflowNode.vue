<script setup lang="ts">
import { computed, ref } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import type { WorkflowNodeAttachments, WorkflowNodeData } from '../types'
import NodeContentWidget from './NodeContentWidget.vue'
import chatBadgeIconUrl from '../../../assets/ui/Chat3.svg'
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
  `shape-${getWorkflowNodeShape(props.data.attachments) ?? 'default'}`,
  `status-${props.data.status ?? 'default'}`,
  {
    selected: props.selected,
    'attachment-target': isAttachmentTarget.value,
  },
])

const iconAssetSrc = computed(() => getWorkflowNodeIconAssetSrc(getWorkflowNodeIconAssetId(props.data.attachments)))
const attachmentEntries = computed(() => createAttachmentEntries(props.data.attachments))
const showMessageBadge = computed(() => props.data.messageBadge?.hasUnread === true)

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

function createAttachmentEntries(attachments?: WorkflowNodeAttachments) {
  if (!attachments) {
    return []
  }

  return Object.entries(attachments)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    .map(([key, value]) => {
      const hue = hashAttachmentKey(key)

      return {
        key,
        value,
        label: key.slice(0, 1).toUpperCase(),
        style: {
          backgroundColor: `hsla(${hue}, 72%, 84%, 0.88)`,
          borderColor: `hsla(${hue}, 52%, 56%, 0.3)`,
          color: `hsl(${hue}, 34%, 22%)`,
          boxShadow: `inset 0 1px 0 hsla(${hue}, 100%, 100%, 0.65)`,
        },
      }
    })
}

function hashAttachmentKey(key: string) {
  let hash = 0

  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360
  }

  return hash
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
        <span v-if="showMessageBadge" class="node-message-badge" aria-label="Unread backend message">
          <img :src="chatBadgeIconUrl" alt="" class="node-message-badge-icon" />
          <span class="node-message-badge-dot"></span>
        </span>
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

    <div v-if="attachmentEntries.length" class="node-footer">
      <span
        v-for="attachment in attachmentEntries"
        :key="attachment.key"
        class="attachment-badge"
        :style="attachment.style"
        tabindex="0"
      >
        <span class="attachment-badge-label">{{ attachment.label }}</span>
        <span class="attachment-tooltip">
          <strong>{{ attachment.key }}</strong>
          <span>{{ attachment.value }}</span>
        </span>
      </span>
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

.node-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.node-icon {
  position: relative;
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

.node-message-badge {
  position: absolute;
  top: -19px;
  left: -20px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  animation: message-badge-pulse 1.4s ease-in-out infinite;
  z-index: 1;
}

.node-message-badge-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

.node-message-badge-dot {
  position: absolute;
  top: -2px;
  right: -1px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ef4444;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.98);
}

.node-icon-asset {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

@keyframes message-badge-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.94;
  }

  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}

.node-kind,
.node-status {
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
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--node-divider);
}

.attachment-badge {
  position: relative;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  cursor: default;
  outline: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.attachment-badge:hover,
.attachment-badge:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.12);
}

.attachment-badge-label {
  line-height: 1;
}

.attachment-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  transform: translateX(-50%) translateY(6px);
  min-width: max-content;
  max-width: 180px;
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(17, 24, 39, 0.94);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.22);
  color: #f8fafc;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  z-index: 2;
}

.attachment-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  width: 10px;
  height: 10px;
  background: rgba(17, 24, 39, 0.94);
  transform: translateX(-50%) rotate(45deg);
}

.attachment-tooltip strong {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.66);
}

.attachment-tooltip span {
  font-size: 12px;
  line-height: 1.4;
  color: #f8fafc;
  white-space: nowrap;
}

.attachment-badge:hover .attachment-tooltip,
.attachment-badge:focus-visible .attachment-tooltip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
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