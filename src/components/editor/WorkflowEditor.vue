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
import type { WorkflowNodeData } from './types'
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

const nodeTypes = {
  workflow: WorkflowNode,
  sticky: StickyNoteNode,
}

const edgeTypes = {
  workflow: WorkflowEdge,
}

const { fitView, zoomIn, zoomOut, setViewport: applyViewport } = useVueFlow()

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

function addActionNode() {
  nodeSeed.value += 1
  const id = `action-${nodeSeed.value}`
  const actionCount = workflowNodes.value.length
  let lastWorkflowNode: WorkflowCanvasNode | undefined

  for (const node of workflowNodes.value) {
    lastWorkflowNode = node
  }

  nodes.value.push({
    id,
    type: 'workflow',
    position: { x: 80 + actionCount * 280, y: 320 },
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

  if (lastWorkflowNode) {
    edges.value.push({
      id: `${lastWorkflowNode.id}-${id}`,
      source: lastWorkflowNode.id,
      target: id,
      type: 'workflow',
      markerEnd: MarkerType.ArrowClosed,
      data: { kind: 'main', label: 'Main' },
    })
  }

  nextTick(() => {
    fitView({ padding: 0.2, duration: 300 })
  })
}

function addStickyNote() {
  noteSeed.value += 1
  nodes.value.push({
    id: `note-${noteSeed.value}`,
    type: 'sticky',
    position: { x: 160 + noteSeed.value * 110, y: 20 + noteSeed.value * 28 },
    data: {
      title: `Note ${noteSeed.value}`,
      subtitle: '说明区',
      icon: 'NT',
      kind: 'sticky',
      note: '这是从参考 repo 抽象出的便签交互，用于补充流程说明。',
    },
  })
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

async function applyStoredViewport() {
  await applyViewport(viewport.value)
}

function handleSaveDocument() {
  workflowDocumentStore.persist()
  setDocumentMessage('Workflow JSON 已保存到本地文档状态')
}

function handleResetDocument() {
  workflowDocumentStore.reset()
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

      <section class="inspector-card">
        <p class="inspector-eyebrow">Selected node</p>
        <strong>{{ selectedNodeData.title }}</strong>
        <span>{{ selectedNodeData.subtitle }}</span>
        <p>
          {{ selectedNodeData.hint ?? '拖拽节点、创建连线，或用左侧按钮快速扩展流程。' }}
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
          @pane-click="clearSelection"
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
  padding: 28px;
  border-right: 1px solid var(--panel-border);
  background: var(--sidebar-surface);
  backdrop-filter: blur(18px);
  color: var(--text-primary);
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
.inspector-card {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background: var(--panel-surface);
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