<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  MarkerType,
  Position,
  useVueFlow,
  VueFlow,
  type Connection,
  type ViewportTransform,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import WorkflowEdge from './edges/WorkflowEdge.vue'
import StickyNoteNode from './nodes/StickyNoteNode.vue'
import WorkflowNode from './nodes/WorkflowNode.vue'
import {
  isWorkflowDocumentData,
  type WorkflowCanvasNode,
  type WorkflowDocumentData,
} from './document'
import {
  getWorkflowNodeIconAssetId,
  type WorkflowNodeIconOption,
  getWorkflowNodeShape,
  type WorkflowNodeShapeOption,
  workflowNodeIconOptions,
  workflowNodeShapeOptions,
} from './nodeAttachmentCatalog'
import { useNodeAttachmentDrag } from './useNodeAttachmentDrag'
import type { WorkflowNodeData } from './types'
import { sendWorkflowGraphToBackend } from '../../api/workflowGraph'
import { useWorkflowDocumentStore } from '../../stores/workflowDocument.store'

const fallbackNodeData: WorkflowNodeData = {
  title: 'Workflow Canvas',
  subtitle: '拖拽节点、创建连线，或用左侧按钮快速扩展流程。',
  icon: 'WF',
  kind: 'action',
  status: 'default',
  hint: '当前没有选中节点',
}

const workflowDocumentStore = useWorkflowDocumentStore()

workflowDocumentStore.hydrate()

const { theme, nodes, edges, viewport } = storeToRefs(workflowDocumentStore)
const selectedNodeId = ref<string | null>(null)
const nodeSeed = ref(4)
const noteSeed = ref(1)
const importInput = ref<HTMLInputElement | null>(null)
const documentMessage = ref('')
const pendingPlacement = ref<'workflow' | 'sticky' | null>(null)
const shapesOpen = ref(false)
const iconsOpen = ref(false)
const { clearNodeAttachmentDrag, startNodeAttachmentDrag } = useNodeAttachmentDrag()

const nodeTypes = {
  workflow: WorkflowNode,
  sticky: StickyNoteNode,
}

const edgeTypes = {
  workflow: WorkflowEdge,
}

const {
  fitView,
  zoomIn,
  zoomOut,
  setViewport: applyViewport,
  screenToFlowCoordinate,
} = useVueFlow()

syncSeedsFromDocument()

onMounted(() => {
  nextTick(() => {
    void applyStoredViewport()
  })
})

const workflowNodes = computed<WorkflowCanvasNode[]>(() => {
  const result: WorkflowCanvasNode[] = []

  for (const node of nodes.value) {
    if (node.type === 'workflow') {
      result.push(node)
    }
  }

  return result
})

const selectedNodeData = computed<WorkflowNodeData>(() => {
  if (selectedNodeId.value) {
    for (const node of nodes.value) {
      if (node.id === selectedNodeId.value && node.data) {
        return node.data
      }
    }
  }

  const firstNode = workflowNodes.value[0]
  return firstNode?.data ?? fallbackNodeData
})

const stats = computed(() => {
  let noteCount = 0

  for (const node of nodes.value) {
    if (node.type === 'sticky') {
      noteCount += 1
    }
  }

  return {
    nodes: workflowNodes.value.length,
    edges: edges.value.length,
    notes: noteCount,
  }
})

const canvasTone = computed(() =>
  theme.value === 'light' ? 'rgba(17, 24, 39, 0.08)' : 'rgba(255, 255, 255, 0.08)',
)

function onConnect(connection: Connection) {
  if (!connection.source || !connection.target) {
    return
  }

  edges.value.push({
    id: `${connection.source}-${connection.target}-${Date.now()}`,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle,
    targetHandle: connection.targetHandle,
    type: 'workflow',
    markerEnd: MarkerType.ArrowClosed,
    data: { kind: 'main', label: 'Main' },
  })
}

function onNodeClick(event: { node: WorkflowCanvasNode }) {
  selectedNodeId.value = event.node.id
}

function clearSelection() {
  selectedNodeId.value = null
}

function cancelPendingPlacement() {
  pendingPlacement.value = null
}

function toggleTheme() {
  workflowDocumentStore.setTheme(theme.value === 'light' ? 'dark' : 'light')
}

function handleZoomIn() {
  zoomIn()
}

function handleZoomOut() {
  zoomOut()
}

function handleFitView() {
  fitView({ padding: 0.18, duration: 300 })
}

function createActionNodeAtPosition(position: { x: number; y: number }) {
  nodeSeed.value += 1
  const id = `action-${nodeSeed.value}`

  nodes.value.push({
    id,
    type: 'workflow',
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      title: `Action ${nodeSeed.value}`,
      subtitle: '新增的处理节点，可继续连接到后续步骤',
      icon: 'ND',
      kind: 'action',
      status: 'default',
      hint: 'Click edge to remove, drag node to reorder',
    },
  })
}

function addActionNode() {
  pendingPlacement.value = 'workflow'
  setDocumentMessage('点击画布任意位置放置处理节点')
}

function createStickyNoteAtPosition(position: { x: number; y: number }) {
  noteSeed.value += 1
  nodes.value.push({
    id: `note-${noteSeed.value}`,
    type: 'sticky',
    position,
    data: {
      title: `Note ${noteSeed.value}`,
      subtitle: '说明区',
      icon: 'NT',
      kind: 'sticky',
      note: '这是从参考 repo 抽象出的便签交互，用于补充流程说明。',
    },
  })
}

function addStickyNote() {
  pendingPlacement.value = 'sticky'
  setDocumentMessage('点击画布任意位置放置便签')
}

function syncSeedsFromDocument() {
  let nextNodeSeed = 1
  let nextNoteSeed = 1

  for (const node of nodes.value) {
    if (node.id.startsWith('action-')) {
      const numericId = Number.parseInt(node.id.replace('action-', ''), 10)

      if (!Number.isNaN(numericId) && numericId > nextNodeSeed) {
        nextNodeSeed = numericId
      }
    }

    if (node.id.startsWith('note-')) {
      const numericId = Number.parseInt(node.id.replace('note-', ''), 10)

      if (!Number.isNaN(numericId) && numericId > nextNoteSeed) {
        nextNoteSeed = numericId
      }
    }
  }

  nodeSeed.value = nextNodeSeed
  noteSeed.value = nextNoteSeed
}

function onViewportChangeEnd(nextViewport: ViewportTransform) {
  workflowDocumentStore.setViewport(nextViewport)
}

function setDocumentMessage(message: string) {
  documentMessage.value = message

  window.setTimeout(() => {
    if (documentMessage.value === message) {
      documentMessage.value = ''
    }
  }, 2400)
}

function handleAttachmentDragStart(
  event: DragEvent,
  payload: WorkflowNodeShapeOption | WorkflowNodeIconOption,
) {
  if (payload.kind === 'shape') {
    startNodeAttachmentDrag(event, {
      kind: 'shape',
      optionId: payload.optionId,
    }, {
      label: payload.label,
      description: payload.description,
      shapeId: payload.optionId,
    })
  }

  if (payload.kind === 'icon') {
    startNodeAttachmentDrag(event, {
      kind: 'icon',
      optionId: payload.optionId,
    }, {
      label: payload.label,
      description: payload.description,
      iconSrc: payload.assetSrc,
    })
  }

  setDocumentMessage('拖动到任意工作流节点上即可附加这个属性')
}

function handleAttachmentDragEnd() {
  clearNodeAttachmentDrag()
}

function toggleShapesOpen() {
  shapesOpen.value = !shapesOpen.value
}

function toggleIconsOpen() {
  iconsOpen.value = !iconsOpen.value
}

async function applyStoredViewport() {
  await applyViewport(viewport.value)
}

function handlePaneClick(event: MouseEvent) {
  clearSelection()

  if (!pendingPlacement.value) {
    return
  }

  const position = screenToFlowCoordinate({
    x: event.clientX,
    y: event.clientY,
  })

  if (pendingPlacement.value === 'workflow') {
    createActionNodeAtPosition({
      x: position.x - 130,
      y: position.y - 60,
    })
    setDocumentMessage('处理节点已放置')
  }

  if (pendingPlacement.value === 'sticky') {
    createStickyNoteAtPosition({
      x: position.x - 125,
      y: position.y - 80,
    })
    setDocumentMessage('便签已放置')
  }

  cancelPendingPlacement()
}

function handleSaveDocument() {
  workflowDocumentStore.persist()
  setDocumentMessage('Workflow JSON 已保存到本地文档状态')
}

function handleResetDocument() {
  workflowDocumentStore.reset()
  cancelPendingPlacement()
  selectedNodeId.value = null
  syncSeedsFromDocument()

  nextTick(() => {
    void applyStoredViewport()
  })

  setDocumentMessage('Workflow 已重置为默认示例')
}

function handleExportDocument() {
  const serializedDocument = workflowDocumentStore.serialize()
  const blob = new Blob([JSON.stringify(serializedDocument, null, 2)], {
    type: 'application/json',
  })
  const downloadUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = downloadUrl
  link.download = 'workflow-document.json'
  link.click()

  window.URL.revokeObjectURL(downloadUrl)
  setDocumentMessage('Workflow JSON 已导出')
}

function handleExportGraphDocument() {
  const serializedGraph = workflowDocumentStore.serializeGraph()
  const blob = new Blob([JSON.stringify(serializedGraph, null, 2)], {
    type: 'application/json',
  })
  const downloadUrl = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = downloadUrl
  link.download = 'workflow-graph.json'
  link.click()

  window.URL.revokeObjectURL(downloadUrl)
  setDocumentMessage('节点边 JSON 已导出')
}

async function handleSendGraphToBackend() {
  try {
    const serializedGraph = workflowDocumentStore.serializeGraph()
    await sendWorkflowGraphToBackend(serializedGraph)
    setDocumentMessage('节点边 JSON 已发送到 Python 后端')
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    setDocumentMessage(`发送失败：${message}`)
  }
}

function handleImportClick() {
  importInput.value?.click()
}

async function handleImportDocument(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]

  if (!file) {
    return
  }

  try {
    const fileContent = await file.text()
    const parsedDocument = JSON.parse(fileContent) as unknown

    if (!isWorkflowDocumentData(parsedDocument)) {
      throw new Error('Invalid workflow document')
    }

    workflowDocumentStore.replaceDocument(parsedDocument as WorkflowDocumentData)
    workflowDocumentStore.persist()
    selectedNodeId.value = null
    syncSeedsFromDocument()

    await nextTick()
    await applyStoredViewport()
    setDocumentMessage('Workflow JSON 导入成功')
  } catch {
    setDocumentMessage('导入失败：JSON 格式或结构无效')
  } finally {
    if (input) {
      input.value = ''
    }
  }
}

function tidyCanvas() {
  let index = 0

  for (const node of nodes.value) {
    if (node.type === 'sticky') {
      continue
    }

    node.position = { x: 60 + index * 300, y: 200 }
    index += 1
  }

  nextTick(() => {
    fitView({ padding: 0.18, duration: 300 })
  })
}

function minimapNodeColor(node: WorkflowCanvasNode) {
  if (node.type === 'sticky') return '#ffbe3d'
  if (node.data?.status === 'success') return '#27ae60'
  if (node.data?.status === 'warning') return '#e6a700'
  if (node.data?.status === 'error') return '#d9534f'
  return theme.value === 'light' ? '#7c8ba1' : '#9fb1cc'
}
</script>

<template>
  <main class="editor-shell" :data-theme="theme">
    <aside class="editor-sidebar">
      <div>
        <p class="sidebar-eyebrow">n8n-inspired editor</p>
        <h1>Workflow Canvas</h1>
        <p class="sidebar-copy">
          这里不是把 n8n 前端整仓搬进来，而是抽取了它最核心的编辑器呈现层：节点卡片、便签、连线标签、画布工具栏和主题变量。
        </p>
      </div>

      <div class="sidebar-actions">
        <button type="button" class="primary" @click="addActionNode">添加处理节点</button>
        <button type="button" @click="addStickyNote">添加便签</button>
        <button type="button" @click="tidyCanvas">整理布局</button>
        <button type="button" @click="toggleTheme">
          切换到{{ theme === 'light' ? '深色' : '浅色' }}主题
        </button>
      </div>

      <dl class="sidebar-stats">
        <div>
          <dt>Nodes</dt>
          <dd>{{ stats.nodes }}</dd>
        </div>
        <div>
          <dt>Edges</dt>
          <dd>{{ stats.edges }}</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>{{ stats.notes }}</dd>
        </div>
      </dl>

      <section class="attachment-panel">
        <div class="attachment-panel-header">
          <p class="inspector-eyebrow">Drag Attachments</p>
          <span class="attachment-panel-copy">拖到节点上，直接替换形状或 icon</span>
        </div>

        <section class="attachment-group">
          <button type="button" class="attachment-folder" @click="toggleShapesOpen">
            <span class="attachment-folder-meta">
              <span class="attachment-folder-caret" :class="{ open: shapesOpen }">▾</span>
              <strong class="attachment-group-title">Shapes</strong>
            </span>
            <span class="attachment-folder-count">{{ workflowNodeShapeOptions.length }}</span>
          </button>
          <div v-if="shapesOpen" class="attachment-grid">
            <button
              v-for="shapeOption in workflowNodeShapeOptions"
              :key="shapeOption.optionId"
              type="button"
              class="attachment-card"
              draggable="true"
              @dragstart="handleAttachmentDragStart($event, shapeOption)"
              @dragend="handleAttachmentDragEnd"
            >
              <span class="attachment-preview" :class="shapeOption.previewClass"></span>
              <span class="attachment-meta">
                <strong>{{ shapeOption.label }}</strong>
                <span>{{ shapeOption.description }}</span>
              </span>
            </button>
          </div>
        </section>

        <section class="attachment-group">
          <button type="button" class="attachment-folder" @click="toggleIconsOpen">
            <span class="attachment-folder-meta">
              <span class="attachment-folder-caret" :class="{ open: iconsOpen }">▾</span>
              <strong class="attachment-group-title">Icons</strong>
            </span>
            <span class="attachment-folder-count">{{ workflowNodeIconOptions.length }}</span>
          </button>
          <div v-if="iconsOpen" class="attachment-grid">
            <button
              v-for="iconOption in workflowNodeIconOptions"
              :key="iconOption.optionId"
              type="button"
              class="attachment-card"
              draggable="true"
              @dragstart="handleAttachmentDragStart($event, iconOption)"
              @dragend="handleAttachmentDragEnd"
            >
              <span class="attachment-icon-shell">
                <img :src="iconOption.assetSrc" :alt="iconOption.label" class="attachment-icon" />
              </span>
              <span class="attachment-meta">
                <strong>{{ iconOption.label }}</strong>
                <span>{{ iconOption.description }}</span>
              </span>
            </button>
          </div>
        </section>
      </section>

      <section class="inspector-card">
        <p class="inspector-eyebrow">Selected node</p>
        <strong>{{ selectedNodeData.title }}</strong>
        <span>{{ selectedNodeData.subtitle }}</span>
        <p>
          {{ selectedNodeData.hint ?? '拖拽节点、创建连线，或用左侧按钮快速扩展流程。' }}
        </p>
        <p>
          Shape: {{ getWorkflowNodeShape(selectedNodeData.attachments) }} · Icon:
          {{ getWorkflowNodeIconAssetId(selectedNodeData.attachments) ?? selectedNodeData.icon }}
        </p>
      </section>
    </aside>

    <section class="editor-stage">
      <header class="editor-toolbar">
        <div class="toolbar-group">
          <button type="button" @click="handleZoomOut">-</button>
          <button type="button" @click="handleZoomIn">+</button>
          <button type="button" @click="handleFitView">Fit</button>
        </div>
        <div class="toolbar-group toolbar-doc-actions">
          <button type="button" @click="handleSaveDocument">保存</button>
          <button type="button" @click="handleResetDocument">重置</button>
          <button type="button" @click="handleImportClick">导入 JSON</button>
          <button type="button" @click="handleExportDocument">导出 JSON</button>
          <button type="button" @click="handleExportGraphDocument">导出节点边 JSON</button>
          <button type="button" @click="handleSendGraphToBackend">发送到 Python</button>
          <input
            ref="importInput"
            type="file"
            accept="application/json,.json"
            class="import-input"
            @change="handleImportDocument"
          />
        </div>
        <div class="toolbar-group toolbar-tags">
          <span class="toolbar-tag">Custom nodes</span>
          <span class="toolbar-tag">Custom edges</span>
          <span class="toolbar-tag">Theme tokens</span>
          <span v-if="documentMessage" class="toolbar-tag toolbar-status">{{ documentMessage }}</span>
        </div>
      </header>

      <div class="canvas-frame">
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          class="workflow-canvas"
          :node-types="nodeTypes"
          :edge-types="edgeTypes"
          :default-viewport="viewport"
          fit-view
          :min-zoom="0.35"
          :max-zoom="1.8"
          :default-edge-options="{ type: 'workflow', markerEnd: MarkerType.ArrowClosed }"
          @connect="onConnect"
          @pane-click="handlePaneClick"
          @node-click="onNodeClick"
          @viewport-change-end="onViewportChangeEnd"
        >
          <Background :gap="24" :size="1.2" :pattern-color="canvasTone" />
          <MiniMap pannable zoomable :node-color="minimapNodeColor" />
        </VueFlow>
      </div>
    </section>
  </main>
</template>

<style scoped>
.editor-shell {
  --accent: #ff6d3a;
  --accent-ring: rgba(255, 109, 58, 0.22);
  --canvas-surface: rgba(249, 246, 239, 0.94);
  --panel-surface: rgba(255, 255, 255, 0.88);
  --panel-border: rgba(33, 43, 54, 0.09);
  --sidebar-surface: rgba(255, 255, 255, 0.78);
  --text-primary: #1f2937;
  --text-secondary: #526072;
  --text-muted: #7f8b99;
  --edge-color: #7c8ba1;
  --edge-data-color: #2f8fce;
  --node-surface: rgba(255, 255, 255, 0.92);
  --node-border: rgba(33, 43, 54, 0.1);
  --node-divider: rgba(33, 43, 54, 0.08);
  --node-icon-surface: rgba(17, 24, 39, 0.06);
  --chip-muted-bg: rgba(91, 101, 124, 0.1);
  --node-shadow: 0 24px 48px rgba(53, 67, 90, 0.12);
  min-height: 100vh;
  display: grid;
  grid-template-columns: 320px 1fr;
  background:
    radial-gradient(circle at top left, rgba(255, 192, 92, 0.2), transparent 24%),
    radial-gradient(circle at right top, rgba(94, 201, 255, 0.18), transparent 22%),
    linear-gradient(160deg, #f2ede4 0%, #f7fafc 52%, #eef4ec 100%);
}

.editor-shell[data-theme='dark'] {
  --accent: #ff8b61;
  --accent-ring: rgba(255, 139, 97, 0.24);
  --canvas-surface: rgba(16, 19, 27, 0.94);
  --panel-surface: rgba(21, 27, 37, 0.88);
  --panel-border: rgba(148, 163, 184, 0.16);
  --sidebar-surface: rgba(16, 19, 27, 0.84);
  --text-primary: #f3f5f7;
  --text-secondary: #bcc6d4;
  --text-muted: #8c97a7;
  --edge-color: #8aa0bf;
  --edge-data-color: #60baf8;
  --node-surface: rgba(24, 31, 43, 0.92);
  --node-border: rgba(148, 163, 184, 0.16);
  --node-divider: rgba(148, 163, 184, 0.12);
  --node-icon-surface: rgba(255, 255, 255, 0.05);
  --chip-muted-bg: rgba(148, 163, 184, 0.12);
  --node-shadow: 0 24px 52px rgba(0, 0, 0, 0.34);
  background:
    radial-gradient(circle at top left, rgba(255, 117, 58, 0.18), transparent 24%),
    radial-gradient(circle at right top, rgba(64, 174, 255, 0.16), transparent 22%),
    linear-gradient(160deg, #0f141b 0%, #151c28 52%, #10201d 100%);
}

.editor-sidebar {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-height: 100vh;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 28px;
  border-right: 1px solid var(--panel-border);
  background: var(--sidebar-surface);
  backdrop-filter: blur(18px);
  color: var(--text-primary);
}

.editor-sidebar::-webkit-scrollbar {
  width: 10px;
}

.editor-sidebar::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(127, 139, 153, 0.35);
}

.editor-sidebar::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-eyebrow,
.inspector-eyebrow {
  margin: 0 0 8px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent);
}

h1 {
  margin: 0 0 14px;
  font-size: 34px;
  line-height: 1.05;
}

.sidebar-copy {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.7;
}

.sidebar-actions {
  display: grid;
  gap: 10px;
}

button {
  height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  background: var(--panel-surface);
  color: var(--text-primary);
  cursor: pointer;
}

button.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}

.sidebar-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
}

.sidebar-stats div,
.attachment-panel,
.inspector-card {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background: var(--panel-surface);
}

.attachment-panel {
  display: grid;
  gap: 16px;
}

.attachment-panel-header {
  display: grid;
  gap: 6px;
}

.attachment-panel-copy {
  font-size: 13px;
  color: var(--text-secondary);
}

.attachment-group {
  display: grid;
  gap: 10px;
}

.attachment-folder {
  height: auto;
  min-height: 44px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--panel-surface) 84%, transparent);
}

.attachment-folder-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.attachment-folder-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  color: var(--text-muted);
  transform: rotate(-90deg);
  transition: transform 0.18s ease;
}

.attachment-folder-caret.open {
  transform: rotate(0deg);
}

.attachment-folder-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--chip-muted-bg);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.attachment-group-title {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.attachment-grid {
  display: grid;
  gap: 10px;
}

.attachment-card {
  height: auto;
  min-height: 74px;
  padding: 12px;
  justify-content: flex-start;
  gap: 12px;
  cursor: grab;
}

.attachment-card:active {
  cursor: grabbing;
}

.attachment-preview,
.attachment-icon-shell {
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 72%, transparent);
}

.attachment-preview {
  display: inline-flex;
}

.preview-default {
  border-radius: 12px;
}

.preview-trigger {
  border-radius: 22px 12px 12px 22px;
}

.preview-pill {
  border-radius: 999px;
}

.preview-bevel {
  border-radius: 18px 8px 18px 8px;
}

.attachment-icon-shell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
}

.attachment-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.attachment-meta {
  display: grid;
  gap: 4px;
  text-align: left;
}

.attachment-meta strong {
  font-size: 14px;
  color: var(--text-primary);
}

.attachment-meta span {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.sidebar-stats dt {
  margin-bottom: 6px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.sidebar-stats dd {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}

.inspector-card {
  display: grid;
  gap: 8px;
}

.inspector-card span,
.inspector-card p {
  color: var(--text-secondary);
}

.inspector-card p {
  margin: 0;
  line-height: 1.6;
}

.editor-stage {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px 12px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-tags {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.toolbar-doc-actions {
  flex-wrap: wrap;
}

.toolbar-tag {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--panel-surface);
  border: 1px solid var(--panel-border);
  color: var(--text-secondary);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.toolbar-status {
  color: var(--accent);
  border-color: rgba(255, 109, 58, 0.24);
}

.import-input {
  display: none;
}

.canvas-frame {
  flex: 1;
  padding: 0 22px 22px;
}

.workflow-canvas {
  width: 100%;
  height: calc(100vh - 92px);
  border-radius: 28px;
  border: 1px solid var(--panel-border);
  overflow: hidden;
  background: var(--canvas-surface);
  box-shadow: 0 22px 54px rgba(30, 41, 59, 0.12);
}

:deep(.vue-flow__minimap) {
  background: var(--panel-surface);
  border: 1px solid var(--panel-border);
  border-radius: 16px;
}

:deep(.vue-flow__attribution) {
  background: transparent;
  color: var(--text-muted);
}

@media (max-width: 1080px) {
  .editor-shell {
    grid-template-columns: 1fr;
  }

  .editor-sidebar {
    max-height: none;
    border-right: 0;
    border-bottom: 1px solid var(--panel-border);
  }

  .editor-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-tags {
    justify-content: flex-start;
  }

  .workflow-canvas {
    height: 72vh;
  }
}
</style>