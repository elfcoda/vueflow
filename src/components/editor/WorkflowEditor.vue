<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
import {
  delegateProjectsBatch,
  fetchDecisionQueue,
  fetchDelegationBatchStatus,
  fetchControlPlaneSnapshot,
  schedulerTick,
  sendChatMessage,
  setProjectRuntimeAttributes,
  submitDecision,
  updateWorkItemDecisionDegradation,
  type DecisionQueueItem,
} from '../../api/controlPlane'
import { useWorkflowDocumentStore } from '../../stores/workflowDocument.store'

const fallbackNodeData: WorkflowNodeData = {
  title: 'Workflow Canvas',
  subtitle: '拖拽节点、创建连线，或用左侧按钮快速扩展流程。',
  icon: 'WF',
  kind: 'action',
  status: 'default',
  hint: '当前没有选中节点',
}

type InspectorTabId = 'overview' | 'subagent'
type SubagentMode = 'analyze' | 'implement' | 'refactor' | 'debug'
type SubagentOutput = 'patch' | 'summary' | 'plan'
type SubagentConstraint = 'preserve-api' | 'limit-scope' | 'run-checks' | 'no-deps'
type DecisionPolicy = 'human-first' | 'auto-safe' | 'auto-fast'
type IsolationLevel = 'strict' | 'workspace' | 'shared'
type OrchestrationMode = 'mock' | 'nanobot'
type AgentRunState = 'idle' | 'queued' | 'running' | 'blocked' | 'done' | 'error'
type DecisionAction = 'approved' | 'rejected'
type DecisionDegradationMode = 'wait' | 'stub' | 'continue_partial'

interface NodeSubagentDraft {
  projectName: string
  objective: string
  scopePaths: string
  entryHints: string
  mode: SubagentMode
  output: SubagentOutput
  constraints: SubagentConstraint[]
  parallelSlot: number
  isolationLevel: IsolationLevel
  decisionPolicy: DecisionPolicy
  promptSuffix: string
}

interface ProjectAgentRuntime {
  nodeId: string
  projectName: string
  state: AgentRunState
  lastLatencyMs: number
  lastEvent: string
  lastUpdatedAt: string
}

interface DashboardEvent {
  id: string
  ts: string
  source: 'core' | 'project' | 'system'
  agentId: string
  type: string
  summary: string
}

interface EventStreamFilter {
  key: string
  label: string
  colorToken: string
  sourceEvent: string
  module: string
  contracts: string[]
}

interface WorkflowWsEnvelope {
  event_id?: string
  ts?: string
  type?: string
  project?: string
  metadata_type?: string
  project_decision_id?: string
  payload?: Record<string, unknown>
  cursor?: number
}

interface DecisionQueueViewItem {
  decisionId: string
  workItemId: string
  decisionType: string
  module: string
  status: string
  chosenOption: string
  sourceEvent: string
  relatedContracts: string[]
  options: Array<Record<string, unknown>>
  metadata: Record<string, unknown>
  raw: DecisionQueueItem
}

interface ModuleTemplateItem {
  projectName: string
  title: string
  path: string
  dependsOn: string[]
  hint: string
}

interface InspectorNodeMeta {
  id: string
  type: 'workflow' | 'sticky'
  data: WorkflowNodeData
}

const subagentModeLabels: Record<SubagentMode, string> = {
  analyze: '分析',
  implement: '实现',
  refactor: '重构',
  debug: '排障',
}

const subagentOutputLabels: Record<SubagentOutput, string> = {
  patch: '直接改代码',
  summary: '只返回结论',
  plan: '先给方案',
}

const subagentConstraintLabels: Record<SubagentConstraint, string> = {
  'preserve-api': '不改公共接口',
  'limit-scope': '只动当前模块范围',
  'run-checks': '完成后跑最小验证',
  'no-deps': '不要新增依赖',
}

const isolationLevelLabels: Record<IsolationLevel, string> = {
  strict: '严格隔离',
  workspace: '工作区共享',
  shared: '共享上下文',
}

const decisionPolicyLabels: Record<DecisionPolicy, string> = {
  'human-first': '人类优先',
  'auto-safe': '自动(稳健)',
  'auto-fast': '自动(高速)',
}

const runStateLabels: Record<AgentRunState, string> = {
  idle: 'Idle',
  queued: 'Queued',
  running: 'Running',
  blocked: 'Blocked',
  done: 'Done',
  error: 'Error',
}

const decisionComparePalette = [
  '#ff7a45',
  '#38bdf8',
  '#34d399',
  '#f59e0b',
  '#a78bfa',
  '#fb7185',
  '#22c55e',
  '#60a5fa',
]

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
const inspirationOpen = ref(false)
const inspectorTab = ref<InspectorTabId>('overview')
const inspirationNodeId = ref('')
const inspirationPrompt = ref('')
const inspirationResult = ref('')
const nodeSubagentDrafts = ref<Record<string, NodeSubagentDraft>>({})
const orchestrationMode = ref<OrchestrationMode>('mock')
const controlPlaneApiUrl = ref(import.meta.env.VITE_NANOBOT_CONTROL_API?.trim() || 'http://127.0.0.1:18790/api/control')
const controlPlaneApiKey = ref(import.meta.env.VITE_NANOBOT_API_KEY?.trim() || '')
const workflowWsUrl = ref(import.meta.env.VITE_NANOBOT_WORKFLOW_WS_URL?.trim() || 'ws://127.0.0.1:18791/workflow')
const wsConnected = ref(false)
const wsError = ref('')
const wsCursor = ref(0)
const inboundChannel = ref('e2e')
const inboundSenderId = ref('tester')
const inboundChatId = ref('core-run-flow')
const inboundContent = ref('Use the three fixed project agents under test_code to add one simple interface to each module.')
const eventLog = ref<DashboardEvent[]>([])
const projectRuntimeMap = ref<Record<string, ProjectAgentRuntime>>({})
const isDelegatingBatch = ref(false)
const isTickingScheduler = ref(false)
const snapshotSummary = ref('')
const lastBatchId = ref('')
const batchStatus = ref('')
const moduleTemplateText = ref([
  'project-api|API Contract Agent|src/api||负责后端 API 协议与请求封装',
  'project-editor|Editor Shell Agent|src/components/editor|project-services,project-stores,project-nodes|负责画布、面板、交互状态',
  'project-services|Service Graph Agent|src/services|project-api|负责节点边导出、依赖 contract 编排',
  'project-stores|State Store Agent|src/stores||负责持久化与状态同步策略',
  'project-nodes|Node UI Agent|src/components/editor/nodes||负责节点视图与 message/attachment 展示',
].join('\n'))
const decisionQueue = ref<DecisionQueueViewItem[]>([])
const decisionRationale = ref('')
const decisionQueueError = ref('')
const isLoadingDecisionQueue = ref(false)
const approvingDecisionId = ref('')
const selectedDecisionDegradeMode = ref<DecisionDegradationMode>('wait')
const expandedDecisionItems = ref<Record<string, boolean>>({})
const eventStreamFilters = ref<EventStreamFilter[]>([])
const eventStreamFilterLocked = ref(false)
const chatOpen = ref(false)
const chatInput = ref('')
const chatSending = ref(false)
const chatMessages = ref<Array<{ role: 'user' | 'assistant'; content: string; ts: string }>>([])

const CHAT_STORAGE_KEY = 'vueflow:chat-history:v1'

function loadChatHistory() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (raw) {
      chatMessages.value = JSON.parse(raw)
    }
  } catch { /* ignore */ }
}

function saveChatHistory() {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatMessages.value))
  } catch { /* ignore */ }
}

loadChatHistory()

async function handleSendChat() {
  const text = chatInput.value.trim()
  if (!text || chatSending.value) return

  chatInput.value = ''
  chatMessages.value.push({ role: 'user', content: text, ts: new Date().toISOString() })
  saveChatHistory()
  chatSending.value = true

  try {
    const res = await sendChatMessage(
      { content: text },
      { apiBaseUrl: controlPlaneApiUrl.value, apiKey: controlPlaneApiKey.value },
    )
    chatMessages.value.push({ role: 'assistant', content: res.reply, ts: new Date().toISOString() })
  } catch (error) {
    const msg = error instanceof Error ? error.message : '请求失败'
    chatMessages.value.push({ role: 'assistant', content: `Error: ${msg}`, ts: new Date().toISOString() })
  } finally {
    chatSending.value = false
    saveChatHistory()
  }
}

function handleRemoveChatHistory() {
  chatMessages.value = []
  localStorage.removeItem(CHAT_STORAGE_KEY)
}

function handleEdgeFlowAnimation(edgeId?: string) {
  // 如果没有指定 edgeId, 取第一个 workflow 类型边
  const targetId = edgeId || (edges.value.length > 0 ? edges.value[0].id : '')
  console.warn('Animating flow on edgeId: ', targetId)
  if (!targetId) return
  console.warn('Animating flow length: ', edges.value.length)
  console.warn('Animating flow on edge: ', edges.value[0].source, edges.value[0].target, edges.value[0].id)
  

  for (const edge of edges.value) {
    if (edge.id !== targetId) continue

    const currentFlow = (edge.data as Record<string, unknown>)?.flow === true

    edge.data = {
      ...edge.data,
      flow: !currentFlow,
    } as any

    console.warn('Edge data after toggle: ', edge.data)
    // 5 秒后自动关闭
    if (!currentFlow) {
      window.setTimeout(() => {
        for (const e of edges.value) {
          if (e.id === targetId) {
            e.data = { ...e.data, flow: false } as any
            break
          }
        }
      }, 60000)
    }

    break
  }
}

let nodeHighlightTimer: number | null = null
let edgeHighlightTimer: number | null = null
let workflowWs: WebSocket | null = null
let mockDispatcherTimer: number | null = null
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

onUnmounted(() => {
  disconnectWorkflowWs()
  stopMockDispatcher()

  if (nodeHighlightTimer !== null) {
    window.clearTimeout(nodeHighlightTimer)
    nodeHighlightTimer = null
  }

  if (edgeHighlightTimer !== null) {
    window.clearTimeout(edgeHighlightTimer)
    edgeHighlightTimer = null
  }

  clearEdgeHighlightClass()
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

const selectedNodeMeta = computed<InspectorNodeMeta | undefined>(() => {
  if (selectedNodeId.value) {
    for (const node of nodes.value) {
      if (node.id === selectedNodeId.value && node.data) {
        return {
          id: node.id,
          type: node.type === 'sticky' ? 'sticky' : 'workflow',
          data: node.data,
        }
      }
    }
  }

  const fallbackNode = workflowNodes.value[0] ?? nodes.value[0]

  if (!fallbackNode?.data) {
    return undefined
  }

  return {
    id: fallbackNode.id,
    type: fallbackNode.type === 'sticky' ? 'sticky' : 'workflow',
    data: fallbackNode.data,
  }
})

const selectedNodeData = computed<WorkflowNodeData>(() => {
  return selectedNodeMeta.value?.data ?? fallbackNodeData
})

const selectedNodeTypeLabel = computed(() => {
  if (selectedNodeMeta.value?.type === 'sticky') {
    return 'Selected note'
  }

  return 'Selected node'
})

const selectedWorkflowNode = computed<InspectorNodeMeta | undefined>(() => {
  if (selectedNodeMeta.value?.type === 'workflow') {
    return selectedNodeMeta.value
  }

  return undefined
})

const selectedSubagentDraft = computed<NodeSubagentDraft | undefined>(() => {
  const nodeId = selectedWorkflowNode.value?.id

  if (!nodeId) {
    return undefined
  }

  return nodeSubagentDrafts.value[nodeId]
})

function buildSubagentPrompt(node: InspectorNodeMeta, draft: NodeSubagentDraft) {
  const scopeItems = draft.scopePaths
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  const entryItems = draft.entryHints
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
  const constraintItems = draft.constraints.map((constraint) => subagentConstraintLabels[constraint])
  const promptLines = [
    `你是 Project Agent「${draft.projectName}」，负责节点“${node.data?.title ?? node.id}”对应的模块。`,
    `节点类型：${node.data?.kind ?? 'workflow'}。`,
    `任务模式：${subagentModeLabels[draft.mode]}。`,
    `任务目标：${draft.objective || '根据当前节点描述完成对应模块处理。'}`,
    `并行槽位：${draft.parallelSlot}。`,
    `隔离策略：${isolationLevelLabels[draft.isolationLevel]}。`,
    `决策策略：${decisionPolicyLabels[draft.decisionPolicy]}。`,
  ]

  if (scopeItems.length) {
    promptLines.push(`模块范围：${scopeItems.join('；')}。`)
  }

  if (entryItems.length) {
    promptLines.push(`关键文件或入口：${entryItems.join('；')}。`)
  }

  if (node.data?.subtitle) {
    promptLines.push(`业务背景：${node.data.subtitle}`)
  }

  if (node.data?.hint) {
    promptLines.push(`补充提示：${node.data.hint}`)
  }

  if (constraintItems.length) {
    promptLines.push(`执行限制：${constraintItems.join('；')}。`)
  }

  promptLines.push(`期望输出：${subagentOutputLabels[draft.output]}。`)

  if (draft.promptSuffix.trim()) {
    promptLines.push(`额外指令：${draft.promptSuffix.trim()}`)
  }

  promptLines.push('优先保持 UI 提供的信息为准，只在必要范围内补充上下文。')
  return promptLines.join('\n')
}

const selectedSubagentPrompt = computed(() => {
  const node = selectedWorkflowNode.value
  const draft = selectedSubagentDraft.value

  if (!node || !draft) {
    return ''
  }

  return buildSubagentPrompt(node, draft)
})

const actionNodes = computed<WorkflowCanvasNode[]>(() => {
  const result: WorkflowCanvasNode[] = []

  for (const node of workflowNodes.value) {
    if (node.data?.kind === 'action') {
      result.push(node)
    }
  }

  return result
})

const projectNodes = computed<WorkflowCanvasNode[]>(() => {
  const result: WorkflowCanvasNode[] = []

  for (const node of workflowNodes.value) {
    if (node.id === 'core-agent' || node.data?.kind === 'trigger' || node.type !== 'workflow') {
      continue
    }

    result.push(node)
  }

  return result
})

const sortedProjectRuntimes = computed<ProjectAgentRuntime[]>(() => {
  return Object.values(projectRuntimeMap.value)
    .sort((a, b) => a.projectName.localeCompare(b.projectName, 'en'))
})

const orchestrationStats = computed(() => {
  let queued = 0
  let running = 0
  let blocked = 0
  let done = 0
  let errored = 0

  for (const runtime of sortedProjectRuntimes.value) {
    if (runtime.state === 'queued') queued += 1
    if (runtime.state === 'running') running += 1
    if (runtime.state === 'blocked') blocked += 1
    if (runtime.state === 'done') done += 1
    if (runtime.state === 'error') errored += 1
  }

  return {
    total: sortedProjectRuntimes.value.length,
    queued,
    running,
    blocked,
    done,
    errored,
  }
})

const recentEvents = computed(() => eventLog.value.slice(0, 36))

function buildEventFilterFromDecision(item: DecisionQueueViewItem): EventStreamFilter {
  const key = decisionItemKey(item)

  return {
    key,
    label: `${item.module} · ${item.workItemId}`,
    colorToken: decisionComparePalette[Math.abs(hashString(key)) % decisionComparePalette.length],
    sourceEvent: item.sourceEvent,
    module: item.module,
    contracts: [...item.relatedContracts],
  }
}

function hashString(input: string) {
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }

  return hash
}

function getFilterColorStyle(filter: EventStreamFilter) {
  return {
    '--decision-filter-color': filter.colorToken,
  }
}

function isDecisionInCompareSet(item: DecisionQueueViewItem) {
  const key = decisionItemKey(item)

  for (const filter of eventStreamFilters.value) {
    if (filter.key === key) {
      return true
    }
  }

  return false
}

function getDecisionColorStyle(item: DecisionQueueViewItem) {
  const filter = buildEventFilterFromDecision(item)

  return getFilterColorStyle(filter)
}

function doesEventMatchFilter(event: DashboardEvent, filter: EventStreamFilter) {
  const normalizedType = event.type.toLowerCase()
  const normalizedAgent = event.agentId.toLowerCase()
  const normalizedSummary = event.summary.toLowerCase()
  const normalizedSourceEvent = filter.sourceEvent.toLowerCase()
  const normalizedModule = filter.module.toLowerCase()

  const sourceMatches = !normalizedSourceEvent || normalizedType.includes(normalizedSourceEvent)
  const moduleMatches = !normalizedModule
    || normalizedAgent.includes(normalizedModule)
    || normalizedSummary.includes(normalizedModule)
  let contractMatches = true

  if (filter.contracts.length) {
    contractMatches = false

    for (const contractHint of filter.contracts) {
      const normalizedHint = contractHint.toLowerCase()

      if (normalizedHint && (normalizedSummary.includes(normalizedHint) || normalizedAgent.includes(normalizedHint))) {
        contractMatches = true
        break
      }
    }
  }

  return sourceMatches && moduleMatches && contractMatches
}

const filteredRecentEvents = computed(() => {
  const filters = eventStreamFilters.value

  if (!filters.length) {
    return recentEvents.value
  }

  const matched: DashboardEvent[] = []

  for (const event of eventLog.value) {
    let isMatched = false

    for (const filter of filters) {
      if (doesEventMatchFilter(event, filter)) {
        isMatched = true
        break
      }
    }

    if (isMatched) {
      matched.push(event)
    }

    if (matched.length >= 36) {
      break
    }
  }

  return matched
})

const highlightedEventFilterMap = computed(() => {
  const result: Record<string, EventStreamFilter> = {}
  const filters = eventStreamFilters.value

  if (!filters.length) {
    return result
  }

  for (const event of filteredRecentEvents.value) {
    for (const filter of filters) {
      if (doesEventMatchFilter(event, filter)) {
        result[event.id] = filter
        break
      }
    }
  }

  return result
})

const highlightedEventIdSet = computed(() => {
  if (!eventStreamFilters.value.length) {
    return new Set<string>()
  }

  const ids = new Set<string>()

  for (const event of filteredRecentEvents.value) {
    ids.add(event.id)
  }

  return ids
})

function getDecisionEventHitCount(item: DecisionQueueViewItem) {
  const filter = buildEventFilterFromDecision(item)
  let count = 0

  for (const event of eventLog.value) {
    if (doesEventMatchFilter(event, filter)) {
      count += 1
    }
  }

  return count
}

function getRelatedContractEdgeIds(item: DecisionQueueViewItem, targetNodeId = '') {
  const edgeIds: string[] = []
  const edgeList = edges.value as Array<{
    id: string
    source: string
    target: string
    data?: { kind?: string; label?: string }
  }>
  const relatedHints = item.relatedContracts.map((value) => value.toLowerCase())

  for (const edge of edgeList) {
    const isDependencyEdge = edge.data?.kind === 'data'

    if (!isDependencyEdge) {
      continue
    }

    const touchesTargetNode = !!targetNodeId && (edge.source === targetNodeId || edge.target === targetNodeId)
    let relatedByHint = false

    if (!touchesTargetNode && relatedHints.length) {
      const edgeValues = `${edge.source} ${edge.target} ${edge.data?.label || ''}`.toLowerCase()

      for (const hint of relatedHints) {
        if (hint && edgeValues.includes(hint)) {
          relatedByHint = true
          break
        }
      }
    }

    if (touchesTargetNode || relatedByHint) {
      edgeIds.push(edge.id)
    }
  }

  return edgeIds
}

function getDecisionEdgeHitCount(item: DecisionQueueViewItem) {
  const targetNodeId = resolveProjectNodeIdFromDecision(item)
  return getRelatedContractEdgeIds(item, targetNodeId).length
}

const decisionQueueStats = computed(() => {
  const total = decisionQueue.value.length
  let pending = 0

  for (const item of decisionQueue.value) {
    if (item.status.toLowerCase() === 'pending') {
      pending += 1
    }
  }

  return {
    total,
    pending,
  }
})

const parsedModuleTemplate = computed<ModuleTemplateItem[]>(() => parseModuleTemplate(moduleTemplateText.value))

const selectedActionNodeId = computed(() => {
  if (!selectedNodeId.value) {
    return ''
  }

  for (const node of actionNodes.value) {
    if (node.id === selectedNodeId.value) {
      return node.id
    }
  }

  return ''
})

const activeInspirationNodeId = computed(() => {
  if (inspirationNodeId.value) {
    for (const node of actionNodes.value) {
      if (node.id === inspirationNodeId.value) {
        return node.id
      }
    }
  }

  if (selectedActionNodeId.value) {
    return selectedActionNodeId.value
  }

  return actionNodes.value[0]?.id ?? ''
})

const activeInspirationNode = computed(() => {
  const targetNodeId = activeInspirationNodeId.value

  for (const node of actionNodes.value) {
    if (node.id === targetNodeId) {
      return node
    }
  }

  return undefined
})

const pendingDecisionNodes = computed(() => {
  const result: WorkflowCanvasNode[] = []

  for (const node of nodes.value) {
    if (node.type !== 'workflow' || !node.data?.pendingDecisionPayload) {
      continue
    }

    result.push(node)
  }

  return result
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

watch(
  () => selectedWorkflowNode.value?.id,
  (nodeId) => {
    if (!nodeId || nodeSubagentDrafts.value[nodeId]) {
      return
    }

    const node = selectedWorkflowNode.value

    if (!node?.data) {
      return
    }

    nodeSubagentDrafts.value = {
      ...nodeSubagentDrafts.value,
      [nodeId]: createNodeSubagentDraft(node),
    }
  },
  { immediate: true },
)

watch(
  () => projectNodes.value.map((node) => node.id),
  () => {
    syncProjectRuntimesFromNodes()
  },
  { immediate: true },
)

watch(orchestrationMode, (mode) => {
  if (mode === 'nanobot') {
    void handleRefreshDecisionQueue()
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

  for (const node of nodes.value) {
    if (node.id !== event.node.id || node.type !== 'workflow' || !node.data) {
      continue
    }

    // if (node.class === 'agent-focus-flash') {
    //   node.class = ''
    // }

    if (node.data.messageBadge?.hasUnread) {
      if (node.data.pendingDecisionPayload) {
        // 已显示 dialog → 隐藏但保留 unread
        node.data = {
          ...node.data,
          pendingDecisionPayload: undefined,
          pendingDecisionAnswer: undefined,
          pendingDecisionMetadataType: undefined,
          pendingDecisionProjectId: undefined,
        }
      } else {
        // 未显示 dialog → 显示
        node.data = {
          ...node.data,
          pendingDecisionPayload: node.data.pendingDecisionPayload || '新任务到达，请确认处理方案',
          pendingDecisionAnswer: '',
          pendingDecisionMetadataType: node.data.pendingDecisionMetadataType || 'project_agent_decision_request',
          pendingDecisionProjectId: node.data.pendingDecisionProjectId || node.id,
        }
      }
    }

    break
  }
}

function clearSelection() {
  selectedNodeId.value = null
}

function setInspectorTab(nextTab: InspectorTabId) {
  inspectorTab.value = nextTab
}

function updateSelectedDraft<K extends keyof NodeSubagentDraft>(field: K, value: NodeSubagentDraft[K]) {
  const nodeId = selectedWorkflowNode.value?.id
  const currentDraft = selectedSubagentDraft.value

  if (!nodeId || !currentDraft) {
    return
  }

  nodeSubagentDrafts.value = {
    ...nodeSubagentDrafts.value,
    [nodeId]: {
      ...currentDraft,
      [field]: value,
    },
  }

  if (field === 'projectName') {
    patchProjectRuntime(nodeId, {
      projectName: String(value || nodeId),
    })
  }
}

function handleDraftTextInput(field: 'objective' | 'scopePaths' | 'entryHints', event: Event) {
  updateSelectedDraft(field, (event.target as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '')
}

function handleDraftProjectNameInput(event: Event) {
  updateSelectedDraft('projectName', (event.target as HTMLInputElement | null)?.value ?? '')
}

function handleNodeTitleInput(event: Event) {
  console.warn('updating title')
  const value = (event.target as HTMLInputElement | null)?.value ?? ''
  updateSelectedNodeField('title', value)
}

function handleNodeSubtitleInput(event: Event) {
  console.warn('updating subtitle')
  const value = (event.target as HTMLInputElement | null)?.value ?? ''
  updateSelectedNodeField('subtitle', value)
}

function updateSelectedNodeField<K extends keyof WorkflowNodeData>(field: K, value: WorkflowNodeData[K]) {
  const nodeId = selectedNodeId.value
  if (!nodeId) return

  for (const node of nodes.value) {
    if (node.id !== nodeId || node.type !== 'workflow' || !node.data) {
      continue
    }

    node.data = {
      ...node.data,
      [field]: value,
    }

    break
  }
}

function handleDraftPromptSuffixInput(event: Event) {
  updateSelectedDraft('promptSuffix', (event.target as HTMLTextAreaElement | null)?.value ?? '')
}

function handleDraftParallelSlotInput(event: Event) {
  const raw = (event.target as HTMLInputElement | null)?.value ?? '1'
  const value = Number.parseInt(raw, 10)

  if (Number.isNaN(value)) {
    updateSelectedDraft('parallelSlot', 1)
    return
  }

  updateSelectedDraft('parallelSlot', Math.max(1, Math.min(value, 32)))
}

function toggleDraftConstraint(constraint: SubagentConstraint) {
  const currentDraft = selectedSubagentDraft.value

  if (!currentDraft) {
    return
  }

  const nextConstraints = currentDraft.constraints.includes(constraint)
    ? currentDraft.constraints.filter((item) => item !== constraint)
    : [...currentDraft.constraints, constraint]

  updateSelectedDraft('constraints', nextConstraints)
}

function nowIsoString() {
  return new Date().toISOString()
}

function readProjectName(node: InspectorNodeMeta, draft: NodeSubagentDraft) {
  return draft.projectName.trim() || node.id
}

function syncProjectRuntimesFromNodes() {
  const nextMap: Record<string, ProjectAgentRuntime> = {}

  for (const node of projectNodes.value) {
    const existing = projectRuntimeMap.value[node.id]
    const draft = nodeSubagentDrafts.value[node.id]
    const projectName = draft?.projectName || node.id

    nextMap[node.id] = {
      nodeId: node.id,
      projectName,
      state: existing?.state ?? 'idle',
      lastLatencyMs: existing?.lastLatencyMs ?? 0,
      lastEvent: existing?.lastEvent ?? '尚未开始',
      lastUpdatedAt: existing?.lastUpdatedAt ?? nowIsoString(),
    }
  }

  projectRuntimeMap.value = nextMap
}

function pushDashboardEvent(source: DashboardEvent['source'], agentId: string, type: string, summary: string) {
  const entry: DashboardEvent = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    ts: nowIsoString(),
    source,
    agentId,
    type,
    summary,
  }

  eventLog.value = [entry, ...eventLog.value].slice(0, 160)
}

function patchProjectRuntime(nodeId: string, patch: Partial<ProjectAgentRuntime>) {
  const existing = projectRuntimeMap.value[nodeId]

  if (!existing) {
    return
  }

  projectRuntimeMap.value = {
    ...projectRuntimeMap.value,
    [nodeId]: {
      ...existing,
      ...patch,
      lastUpdatedAt: nowIsoString(),
    },
  }
}

function startMockDispatcher() {
  stopMockDispatcher()

  const activeProjectNodes = projectNodes.value

  if (!activeProjectNodes.length) {
    return
  }

  for (const node of activeProjectNodes) {
    patchProjectRuntime(node.id, {
      state: 'queued',
      lastEvent: '等待 scheduler 分发',
    })
  }

  mockDispatcherTimer = window.setInterval(() => {
    const candidates = activeProjectNodes
      .map((node) => projectRuntimeMap.value[node.id])
      .filter((runtime): runtime is ProjectAgentRuntime => !!runtime)

    if (!candidates.length) {
      return
    }

    const runningOrQueued = candidates.filter((runtime) => runtime.state === 'running' || runtime.state === 'queued')

    if (!runningOrQueued.length) {
      stopMockDispatcher()
      pushDashboardEvent('system', 'core-agent', 'workflow.scheduler.done', '所有 project agent 已完成本轮任务')
      return
    }

    const picked = runningOrQueued[Math.floor(Math.random() * runningOrQueued.length)]
    const roll = Math.random()

    if (picked.state === 'queued') {
      patchProjectRuntime(picked.nodeId, {
        state: 'running',
        lastEvent: '已领取任务并开始执行',
        lastLatencyMs: 120 + Math.floor(Math.random() * 520),
      })
      pushDashboardEvent('project', picked.projectName, 'workflow.dispatch.started', '开始执行模块任务')
      return
    }

    if (roll < 0.18) {
      patchProjectRuntime(picked.nodeId, {
        state: 'blocked',
        lastEvent: '等待依赖接口返回 contract stub',
      })
      pushDashboardEvent('project', picked.projectName, 'workflow.contract.waiting', '依赖未就绪，先返回当前步骤')
      return
    }

    if (roll < 0.32) {
      patchProjectRuntime(picked.nodeId, {
        state: 'running',
        lastEvent: '收到依赖接口，继续增量实现',
        lastLatencyMs: 160 + Math.floor(Math.random() * 420),
      })
      pushDashboardEvent('project', picked.projectName, 'workflow.contract.resumed', '依赖可用，恢复执行')
      return
    }

    if (roll < 0.92) {
      patchProjectRuntime(picked.nodeId, {
        state: 'done',
        lastEvent: '产出 patch 并回传 core agent',
        lastLatencyMs: 240 + Math.floor(Math.random() * 760),
      })
      pushDashboardEvent('project', picked.projectName, 'workflow.dispatch.completed', '完成本模块实现并提交结果')
      return
    }

    patchProjectRuntime(picked.nodeId, {
      state: 'error',
      lastEvent: '执行失败，等待人工决策',
      lastLatencyMs: 180 + Math.floor(Math.random() * 540),
    })
    pushDashboardEvent('project', picked.projectName, 'workflow.dispatch.failed', '执行异常，需要人工决策')
  }, 1100)
}

function stopMockDispatcher() {
  if (mockDispatcherTimer !== null) {
    window.clearInterval(mockDispatcherTimer)
    mockDispatcherTimer = null
  }
}

function parseModuleTemplate(templateText: string): ModuleTemplateItem[] {
  const lines = templateText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const result: ModuleTemplateItem[] = []

  for (const line of lines) {
    const [projectNameRaw, titleRaw, pathRaw, dependsRaw, hintRaw] = line.split('|')
    const projectName = (projectNameRaw || '').trim()
    const title = (titleRaw || '').trim()
    const path = (pathRaw || '').trim()

    if (!projectName || !title || !path) {
      continue
    }

    const dependsOn = (dependsRaw || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    result.push({
      projectName,
      title,
      path,
      dependsOn,
      hint: (hintRaw || '').trim() || `负责 ${path} 模块实现`,
    })
  }

  return result
}

function parseBatchIdFromMessage(message: string) {
  const match = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  return match ? match[0] : ''
}

function readStringField(payload: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = payload[field]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function readNumericField(payload: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = payload[field]

    if (typeof value === 'number') {
      return value
    }
  }

  return undefined
}

function readObjectField(payload: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = payload[field]

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  }

  return {}
}

function readObjectArrayField(payload: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = payload[field]

    if (!Array.isArray(value)) {
      continue
    }

    const list: Array<Record<string, unknown>> = []

    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        list.push(item as Record<string, unknown>)
      }
    }

    if (list.length) {
      return list
    }
  }

  return []
}

function readStringListField(payload: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const value = payload[field]

    if (Array.isArray(value)) {
      const list = value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)

      if (list.length) {
        return list
      }
    }

    if (typeof value === 'string' && value.trim()) {
      return [value.trim()]
    }
  }

  return []
}

function decisionItemKey(item: DecisionQueueViewItem) {
  return item.decisionId || item.workItemId
}

function isDecisionItemExpanded(item: DecisionQueueViewItem) {
  return !!expandedDecisionItems.value[decisionItemKey(item)]
}

function toggleDecisionItemExpanded(item: DecisionQueueViewItem) {
  const key = decisionItemKey(item)
  const nextMap = { ...expandedDecisionItems.value }
  nextMap[key] = !nextMap[key]
  expandedDecisionItems.value = nextMap
}

function formatJsonForPreview(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function clearNodeHighlightClass() {
  for (const node of nodes.value) {
    if (node.class === 'agent-focus-flash') {
      node.class = ''
    }
  }
}

function clearEdgeHighlightClass() {
  const edgeList = edges.value as Array<{
    class?: string
    source: string
    target: string
    data?: { kind?: string; label?: string }
  }>

  for (const edge of edgeList) {
    if (edge.class === 'contract-edge-focus') {
      edge.class = ''
    }
  }
}

function clearEventStreamFilter() {
  eventStreamFilters.value = []
}

function removeEventStreamFilter(key: string) {
  eventStreamFilters.value = eventStreamFilters.value.filter((item) => item.key !== key)
}

function focusSourceEventsForDecision(item: DecisionQueueViewItem) {
  const nextFilter = buildEventFilterFromDecision(item)

  if (!eventStreamFilterLocked.value) {
    eventStreamFilters.value = [nextFilter]
  } else {
    const existingIndex = eventStreamFilters.value.findIndex((filter) => filter.key === nextFilter.key)

    if (existingIndex >= 0) {
      const cloned = [...eventStreamFilters.value]
      cloned[existingIndex] = nextFilter
      eventStreamFilters.value = cloned
    } else {
      eventStreamFilters.value = [...eventStreamFilters.value, nextFilter]
    }
  }

  const matchedCount = filteredRecentEvents.value.length
  setDocumentMessage(
    matchedCount
      ? `已定位 ${matchedCount} 条来源事件${eventStreamFilterLocked.value ? '（锁定模式）' : ''}`
      : '未匹配到来源事件，请先刷新事件流',
  )
}

function resolveProjectNodeIdFromDecision(item: DecisionQueueViewItem) {
  const byModule = findNodeIdByProjectName(item.module)

  if (byModule) {
    return byModule
  }

  const sourceHints = [
    ...item.relatedContracts,
    readStringField(item.metadata, ['module', 'project', 'owner_agent']),
  ].map((value) => value.trim().toLowerCase()).filter(Boolean)

  for (const node of projectNodes.value) {
    const draft = nodeSubagentDrafts.value[node.id]
    const candidateValues = [
      node.id,
      draft?.projectName || '',
      draft?.scopePaths || '',
      node.data?.title || '',
      node.data?.subtitle || '',
    ].join(' ').toLowerCase()

    for (const hint of sourceHints) {
      if (hint && candidateValues.includes(hint)) {
        return node.id
      }
    }
  }

  return ''
}

async function focusProjectAgentNode(item: DecisionQueueViewItem) {
  const targetNodeId = resolveProjectNodeIdFromDecision(item)

  if (!targetNodeId) {
    setDocumentMessage('未找到对应 project agent 节点')
    return
  }

  selectedNodeId.value = targetNodeId

  let targetNode: { id: string; position: { x: number; y: number }; class?: string } | null = null
  const nodeList = nodes.value as Array<{ id: string; position: { x: number; y: number }; class?: string }>

  for (const node of nodeList) {
    if (node.id === targetNodeId) {
      targetNode = node
      break
    }
  }

  if (!targetNode) {
    setDocumentMessage('目标节点不存在')
    return
  }

  clearNodeHighlightClass()
  clearEdgeHighlightClass()
  targetNode.class = 'agent-focus-flash'

  if (nodeHighlightTimer !== null) {
    window.clearTimeout(nodeHighlightTimer)
  }

  if (edgeHighlightTimer !== null) {
    window.clearTimeout(edgeHighlightTimer)
  }

  const edgeIds = getRelatedContractEdgeIds(item, targetNodeId)
  const edgeList = edges.value as Array<{
    id: string
    class?: string
  }>

  for (const edge of edgeList) {
    if (edgeIds.includes(edge.id)) {
      edge.class = 'contract-edge-focus'
    }
  }

  nodeHighlightTimer = window.setTimeout(() => {
    clearNodeHighlightClass()
    nodeHighlightTimer = null
  }, 1600)

  edgeHighlightTimer = window.setTimeout(() => {
    clearEdgeHighlightClass()
    edgeHighlightTimer = null
  }, 2200)

  await applyViewport({
    x: -targetNode.position.x + 480,
    y: -targetNode.position.y + 240,
    zoom: 1,
  })

  setDocumentMessage(`已跳转并高亮 ${targetNodeId} 及其 contract 依赖边`)
}

function toDecisionQueueViewItem(raw: DecisionQueueItem): DecisionQueueViewItem | null {
  const decisionId = typeof raw.decision_id === 'string' ? raw.decision_id : ''
  const workItemId = typeof raw.work_item_id === 'string' ? raw.work_item_id : ''

  if (!workItemId) {
    return null
  }

  const moduleName = typeof raw.module === 'string'
    ? raw.module
    : typeof raw.owner_agent === 'string'
      ? raw.owner_agent
      : ''

  const metadata = readObjectField(raw, ['metadata'])
  const options = readObjectArrayField(raw, ['options'])
  const sourceEvent = readStringField(raw, ['source_event', 'event_type', 'source'])
    || readStringField(metadata, ['source_event', 'event_type', 'source'])
    || 'unknown'
  const relatedContracts = [
    ...readStringListField(raw, ['related_contracts', 'contract_ids', 'contract_id']),
    ...readStringListField(metadata, ['related_contracts', 'contract_ids', 'contract_id']),
    readStringField(raw, ['provider_module']),
    readStringField(raw, ['consumer_module']),
    readStringField(raw, ['interface_name']),
  ].map((item) => item.trim()).filter(Boolean)

  return {
    decisionId,
    workItemId,
    decisionType: typeof raw.decision_type === 'string' ? raw.decision_type : 'unspecified',
    module: moduleName || 'unknown',
    status: typeof raw.status === 'string' ? raw.status : 'pending',
    chosenOption: typeof raw.chosen_option === 'string' ? raw.chosen_option : '',
    sourceEvent,
    relatedContracts,
    options,
    metadata,
    raw,
  }
}

async function handleRefreshDecisionQueue() {
  decisionQueueError.value = ''

  if (orchestrationMode.value !== 'nanobot') {
    decisionQueue.value = []
    decisionQueueError.value = 'Mock 模式不读取真实决策队列'
    return
  }

  isLoadingDecisionQueue.value = true

  try {
    const response = await fetchDecisionQueue(120, {
      apiBaseUrl: controlPlaneApiUrl.value,
      apiKey: controlPlaneApiKey.value,
    })
    const nextQueue: DecisionQueueViewItem[] = []

    for (const item of response.queue) {
      const mapped = toDecisionQueueViewItem(item)

      if (mapped) {
        nextQueue.push(mapped)
      }
    }

    decisionQueue.value = nextQueue
    const nextExpandedMap: Record<string, boolean> = {}

    for (const item of nextQueue) {
      const key = decisionItemKey(item)

      if (expandedDecisionItems.value[key]) {
        nextExpandedMap[key] = true
      }
    }

    expandedDecisionItems.value = nextExpandedMap
    pushDashboardEvent('core', 'core-agent', 'workflow.decision.queue', `Decision queue updated: ${nextQueue.length}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    decisionQueueError.value = message
    pushDashboardEvent('system', 'core-agent', 'workflow.decision.queue.error', message)
  } finally {
    isLoadingDecisionQueue.value = false
  }
}

async function handleDecisionAction(item: DecisionQueueViewItem, action: DecisionAction) {
  if (orchestrationMode.value !== 'nanobot') {
    setDocumentMessage('Mock 模式不提交审批到后端')
    return
  }

  approvingDecisionId.value = item.decisionId || item.workItemId

  try {
    await submitDecision(
      {
        decisionId: item.decisionId || undefined,
        workItemId: item.workItemId,
        decisionType: item.decisionType,
        status: action,
        chosenOption: action === 'approved' ? (item.chosenOption || 'approved') : 'rejected',
        rationale: decisionRationale.value.trim() || `Decision ${action} from dashboard`,
        metadata: {
          source: 'workflow-dashboard',
        },
      },
      {
        apiBaseUrl: controlPlaneApiUrl.value,
        apiKey: controlPlaneApiKey.value,
      },
    )

    pushDashboardEvent('core', item.module, `workflow.decision.${action}`, `${item.workItemId} ${action}`)
    setDocumentMessage(`Decision ${action} 已提交`)
    await handleRefreshDecisionQueue()
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    pushDashboardEvent('system', item.module, 'workflow.decision.error', message)
    setDocumentMessage(`Decision 提交失败: ${message}`)
  } finally {
    approvingDecisionId.value = ''
  }
}

async function handleDecisionDegrade(item: DecisionQueueViewItem) {
  if (orchestrationMode.value !== 'nanobot') {
    setDocumentMessage('Mock 模式不提交 degrade')
    return
  }

  approvingDecisionId.value = item.workItemId

  try {
    await updateWorkItemDecisionDegradation(
      item.workItemId,
      selectedDecisionDegradeMode.value,
      {
        apiBaseUrl: controlPlaneApiUrl.value,
        apiKey: controlPlaneApiKey.value,
      },
    )

    pushDashboardEvent('core', item.module, 'workflow.decision.degrade', `${item.workItemId} -> ${selectedDecisionDegradeMode.value}`)
    setDocumentMessage(`Degrade 已设置为 ${selectedDecisionDegradeMode.value}`)
    await handleRefreshDecisionQueue()
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    pushDashboardEvent('system', item.module, 'workflow.decision.degrade.error', message)
    setDocumentMessage(`Degrade 设置失败: ${message}`)
  } finally {
    approvingDecisionId.value = ''
  }
}

function mapEventTypeToRuntimeState(eventType: string): AgentRunState | null {
  const normalized = eventType.toLowerCase()

  if (normalized.includes('contract') && (normalized.includes('wait') || normalized.includes('blocked'))) return 'blocked'
  if (normalized.includes('contract') && (normalized.includes('resume') || normalized.includes('ready'))) return 'running'
  if (normalized.includes('decision') && normalized.includes('queue')) return 'blocked'
  if (normalized.includes('batch') && normalized.includes('queued')) return 'queued'
  if (normalized.includes('batch') && (normalized.includes('running') || normalized.includes('dispatch'))) return 'running'
  if (normalized.includes('batch') && (normalized.includes('done') || normalized.includes('finished') || normalized.includes('completed'))) return 'done'
  if (normalized.includes('queue')) return 'queued'
  if (normalized.includes('start') || normalized.includes('running') || normalized.includes('dispatch')) return 'running'
  if (normalized.includes('block') || normalized.includes('wait')) return 'blocked'
  if (normalized.includes('done') || normalized.includes('complete') || normalized.includes('finish')) return 'done'
  if (normalized.includes('error') || normalized.includes('fail')) return 'error'

  return null
}

function findNodeIdByProjectName(projectName: string) {
  const target = projectName.trim().toLowerCase()

  for (const node of projectNodes.value) {
    const draft = nodeSubagentDrafts.value[node.id]
    const candidate = draft?.projectName?.toLowerCase()

    if (candidate && candidate === target) {
      return node.id
    }
  }

  return ''
}

function extractProjectNameFromPayload(payload: Record<string, unknown>) {
  return readStringField(payload, ['project', 'provider_module', 'consumer_module', 'module', 'owner_agent'])
}

function summarizePayload(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload)
  return text.length > 140 ? `${text.slice(0, 140)}...` : text
}

function handleProject(project?: string, metadata_type?: string, project_decision_id?: string) {
  if (project === "test_code/module1" && metadata_type === "project_agent_decision_request") {
    // 先不处理后端bug，module1的decision
    return
  }

  // 先按title查找做demo，虽然可能不唯一.但是目前目录应该是唯一的
  const normalizedProject = project?.trim().toLowerCase()
  
  if (!normalizedProject) {
    return
  }

  for (const node of nodes.value) {
    // node.id
    if (node.type !== 'workflow' || !node.data) {
      continue
    }

    const candidateTitle = node.data?.title.trim().toLowerCase()
    const isMatched = candidateTitle === normalizedProject
      || candidateTitle.includes(normalizedProject)

    if (!isMatched) {
      continue
    }

    if (metadata_type === 'project_agent_decision_request' && project_decision_id) {
      // node.class = 'agent-focus-flash'
      node.data = {
        ...node.data,
        messageBadge: {
          hasUnread: true,
        },
      }

      node.data = {
        ...node.data,
        pendingDecisionPayload: '新任务到达，请确认处理方案', // || payload,
        pendingDecisionAnswer: '',
        pendingDecisionMetadataType: metadata_type,
        pendingDecisionProjectId: project || node.id,
      }
    }

    break
  }
}

function handleWorkflowWsEnvelope(envelope: WorkflowWsEnvelope) {
  console.warn('Handling workflow ws envelope project:', envelope.project)
  console.warn('Handling workflow ws envelope payload:', envelope.payload)

  const eventType = String(envelope.type || 'workflow.unknown')
  const payload = envelope.payload || {}
  const semanticEventType = readStringField(payload, ['event_type', 'type']) || eventType
  const summary = summarizePayload(payload)
  const projectName = extractProjectNameFromPayload(payload)
  const mappedNodeId = projectName ? findNodeIdByProjectName(projectName) : ''

  console.warn('envelope.project: ', envelope.project)
  if (envelope.project === "test_code/module1" || envelope.project === "test_code/module2" || envelope.project === "test_code/module3") {
    handleProject(envelope.project || projectName, envelope.metadata_type, envelope.project_decision_id)
  }

  // --- fin 式 connected 握手: 提取 latest_cursor ---
  if (eventType === 'workflow.connected') {
    const latestCursor = readNumericField(payload, ['latest_cursor'])
    if (typeof latestCursor === 'number' && latestCursor > wsCursor.value) {
      wsCursor.value = latestCursor
    }
  }

  if (typeof envelope.cursor === 'number' && envelope.cursor > wsCursor.value) {
    wsCursor.value = envelope.cursor
  }

  if (mappedNodeId) {
    const nextState = mapEventTypeToRuntimeState(semanticEventType)

    if (nextState) {
      patchProjectRuntime(mappedNodeId, {
        state: nextState,
        lastEvent: summarizePayload({ event: semanticEventType, detail: payload.status ?? payload.phase ?? payload.reason ?? '' }),
      })
    }
  }

  const normalized = semanticEventType.toLowerCase()

  if (normalized.includes('decision') && normalized.includes('queue')) {
    void handleRefreshDecisionQueue()
  }

  if (normalized.includes('contract') && normalized.includes('wait') && mappedNodeId) {
    patchProjectRuntime(mappedNodeId, {
      state: 'blocked',
      lastEvent: '等待 contract 依赖',
    })
  }

  if (normalized.includes('contract') && (normalized.includes('resume') || normalized.includes('ready')) && mappedNodeId) {
    patchProjectRuntime(mappedNodeId, {
      state: 'running',
      lastEvent: 'contract 已就绪，恢复执行',
    })
  }

  if (normalized.includes('batch') && normalized.includes('status')) {
    batchStatus.value = readStringField(payload, ['status', 'phase']) || eventType
  }

  pushDashboardEvent(mappedNodeId ? 'project' : 'system', projectName || 'workflow', semanticEventType, summary)
}

// envelope's field
function respondDecision(metadata_type: string, project: string, project_decision_id: string, answer?: string) {
  // --- fin 式自动应答: project_agent_decision_request ---
  if (metadata_type === 'project_agent_decision_request') {
    if (project === 'test_code/module2' || project === 'test_code/module3') {
      const content = answer?.trim() || 'rest'
      sendWorkflowInbound(content, { metadata: { project_decision_id: project_decision_id } })
    }
  }
}

function handleSendDecisionAnswer(nodeId: string, answer: string) {
  for (const node of nodes.value) {
    if (node.id !== nodeId || node.type !== 'workflow' || !node.data) {
      continue
    }

    const trimmedAnswer = answer.trim() || 'rest'
    respondDecision(
      node.data.pendingDecisionMetadataType || 'project_agent_decision_request',
      node.data.pendingDecisionProjectId || node.id,
      node.id,
      trimmedAnswer,
    )

    // 清除该节点的 unread 徽标和 dialog 状态
    node.data = {
      ...node.data,
      messageBadge: {
        hasUnread: false,
      },
      pendingDecisionPayload: undefined,
      pendingDecisionAnswer: undefined,
      pendingDecisionMetadataType: undefined,
      pendingDecisionProjectId: undefined,
    }

    break
  }
}


function sendWorkflowInbound(content: string, extra: Record<string, unknown> = {}) {
  if (!workflowWs || workflowWs.readyState !== WebSocket.OPEN) {
    wsError.value = 'WebSocket 未连接，无法发送 inbound 消息'
    return false
  }
  const message: Record<string, unknown> = {
    type: 'inbound',
    channel: inboundChannel.value,
    sender_id: inboundSenderId.value,
    chat_id: inboundChatId.value,
    content,
    ...extra,
  }
  workflowWs.send(JSON.stringify(message))
  pushDashboardEvent('system', 'workflow', 'workflow.inbound.sent', content.slice(0, 80))
  return true
}

function handleSendInbound() {
  if (!inboundContent.value.trim()) {
    setDocumentMessage('请输入要发送的消息内容')
    return
  }
  sendWorkflowInbound(inboundContent.value)
  inboundContent.value = ''
  setDocumentMessage('Inbound 消息已发送')
}

function disconnectWorkflowWs() {
  if (workflowWs) {
    workflowWs.close()
    workflowWs = null
  }

  wsConnected.value = false
}

function connectWorkflowWs() {
  disconnectWorkflowWs()
  wsError.value = ''

  try {
    workflowWs = new WebSocket(workflowWsUrl.value)
  } catch (error) {
    wsError.value = error instanceof Error ? error.message : 'WebSocket 初始化失败'
    return
  }

  workflowWs.onopen = () => {
    wsConnected.value = true
    pushDashboardEvent('system', 'workflow', 'workflow.connected', '已连接 workflow ws 通道')

    const subscribeCommand = {
      type: 'subscribe',
      event_types: [],
      since_cursor: wsCursor.value,
    }

    workflowWs?.send(JSON.stringify(subscribeCommand))
  }

  workflowWs.onmessage = (event) => {
    try {
      const envelope = JSON.parse(String(event.data)) as WorkflowWsEnvelope
      // log envelope
      // console.warn('Received workflow ws envelope:', envelope)
      handleWorkflowWsEnvelope(envelope)
    } catch {
      pushDashboardEvent('system', 'workflow', 'workflow.raw', String(event.data).slice(0, 180))
    }
  }

  workflowWs.onerror = () => {
    wsError.value = 'workflow ws 连接异常'
  }

  workflowWs.onclose = () => {
    wsConnected.value = false
  }
}

async function handleRefreshSnapshot() {
  if (orchestrationMode.value !== 'nanobot') {
    snapshotSummary.value = 'Mock 模式下不请求后端 snapshot'
    return
  }

  try {
    const snapshot = await fetchControlPlaneSnapshot({
      apiBaseUrl: controlPlaneApiUrl.value,
      apiKey: controlPlaneApiKey.value,
    })
    const workItemCount = Array.isArray(snapshot.work_items) ? snapshot.work_items.length : 0
    const contractCount = Array.isArray(snapshot.contracts) ? snapshot.contracts.length : 0
    const decisionCount = Array.isArray(snapshot.decisions) ? snapshot.decisions.length : 0

    snapshotSummary.value = `WorkItems ${workItemCount} | Contracts ${contractCount} | Decisions ${decisionCount}`
    pushDashboardEvent('core', 'core-agent', 'workflow.snapshot.refreshed', snapshotSummary.value)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    snapshotSummary.value = `Snapshot 拉取失败: ${message}`
    pushDashboardEvent('system', 'core-agent', 'workflow.snapshot.error', snapshotSummary.value)
  }
}

async function handleRefreshBatchStatus() {
  if (orchestrationMode.value !== 'nanobot') {
    batchStatus.value = 'Mock 模式无 batch 状态'
    return
  }

  if (!lastBatchId.value) {
    batchStatus.value = '当前没有 batch id'
    return
  }

  try {
    const response = await fetchDelegationBatchStatus(lastBatchId.value, {
      apiBaseUrl: controlPlaneApiUrl.value,
      apiKey: controlPlaneApiKey.value,
    })
    batchStatus.value = response.status
    pushDashboardEvent('core', 'core-agent', 'workflow.batch.status', `${response.batch_id}: ${response.status}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    batchStatus.value = `Batch status 获取失败: ${message}`
    pushDashboardEvent('system', 'core-agent', 'workflow.batch.status.error', message)
  }
}

async function handleSchedulerTick() {
  if (isTickingScheduler.value) {
    return
  }

  if (orchestrationMode.value === 'mock') {
    pushDashboardEvent('core', 'core-agent', 'workflow.scheduler.tick', 'Mock 模式下推进一拍')
    startMockDispatcher()
    setDocumentMessage('Mock scheduler tick 已触发')
    return
  }

  isTickingScheduler.value = true

  try {
    await schedulerTick({
      apiBaseUrl: controlPlaneApiUrl.value,
      apiKey: controlPlaneApiKey.value,
    })
    pushDashboardEvent('core', 'core-agent', 'workflow.scheduler.tick', '已请求 nanobot scheduler tick')
    setDocumentMessage('Scheduler tick 请求成功')
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    pushDashboardEvent('system', 'core-agent', 'workflow.scheduler.error', message)
    setDocumentMessage(`Scheduler tick 失败: ${message}`)
  } finally {
    isTickingScheduler.value = false
  }
}

async function handlePushSelectedAttributes() {
  const node = selectedWorkflowNode.value
  const draft = selectedSubagentDraft.value

  if (!node || !draft) {
    setDocumentMessage('请先选择一个 workflow 节点')
    return
  }

  const projectName = readProjectName(node, draft)
  const attributes = {
    module_scope: draft.scopePaths,
    entry_hints: draft.entryHints,
    mode: draft.mode,
    output: draft.output,
    constraints: draft.constraints,
    parallel_slot: draft.parallelSlot,
    isolation: draft.isolationLevel,
    decision_policy: draft.decisionPolicy,
    prompt_suffix: draft.promptSuffix,
    prompt: buildSubagentPrompt(node, draft),
  }

  if (orchestrationMode.value === 'mock') {
    pushDashboardEvent('project', projectName, 'workflow.attributes.mocked', 'Mock 模式下仅在前端记录属性')
    setDocumentMessage(`已在 Mock 模式记录 ${projectName} 的属性`)
    return
  }

  try {
    await setProjectRuntimeAttributes(projectName, attributes, {
      apiBaseUrl: controlPlaneApiUrl.value,
      apiKey: controlPlaneApiKey.value,
    })
    pushDashboardEvent('project', projectName, 'workflow.attributes.updated', 'Project runtime attributes 已更新')
    setDocumentMessage(`已推送 ${projectName} 属性到后端`)
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    pushDashboardEvent('system', projectName, 'workflow.attributes.error', message)
    setDocumentMessage(`属性推送失败: ${message}`)
  }
}

async function handleDelegateBatchRun() {
  if (isDelegatingBatch.value) {
    return
  }

  const batchItems: Array<{ project: string; task: string }> = []

  for (const node of projectNodes.value) {
    const draft = nodeSubagentDrafts.value[node.id]

    if (!draft) {
      continue
    }

    const inspectorNode: InspectorNodeMeta = {
      id: node.id,
      type: 'workflow',
      data: node.data ?? fallbackNodeData,
    }

    const projectName = readProjectName(inspectorNode, draft)
    batchItems.push({
      project: projectName,
      task: buildSubagentPrompt(inspectorNode, draft),
    })

    patchProjectRuntime(node.id, {
      state: 'queued',
      lastEvent: '等待 core agent 分发',
    })
  }

  if (!batchItems.length) {
    setDocumentMessage('当前没有可委托的项目节点')
    return
  }

  isDelegatingBatch.value = true

  if (orchestrationMode.value === 'mock') {
    pushDashboardEvent('core', 'core-agent', 'workflow.batch.started', `已并行提交 ${batchItems.length} 个 project agent`)
    setDocumentMessage(`Mock 并行批次已启动，共 ${batchItems.length} 个 agent`)
    startMockDispatcher()
    isDelegatingBatch.value = false
    return
  }

  try {
    const response = await delegateProjectsBatch(batchItems, {
      apiBaseUrl: controlPlaneApiUrl.value,
      apiKey: controlPlaneApiKey.value,
    })
    const batchId = parseBatchIdFromMessage(response.message || '')

    if (batchId) {
      lastBatchId.value = batchId
    }

    pushDashboardEvent('core', 'core-agent', 'workflow.batch.delegated', response.message || 'batch 已提交')
    setDocumentMessage(`并行委托成功: ${response.message || 'batch submitted'}`)

    if (batchId) {
      await handleRefreshBatchStatus()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    pushDashboardEvent('system', 'core-agent', 'workflow.batch.error', message)
    setDocumentMessage(`并行委托失败: ${message}`)
  } finally {
    isDelegatingBatch.value = false
  }
}

function handleBuildParallelBlueprint() {
  stopMockDispatcher()
  const moduleNodes = parsedModuleTemplate.value

  if (!moduleNodes.length) {
    setDocumentMessage('模块模板为空，无法生成蓝图')
    return
  }

  const moduleNodeMap = new Map(moduleNodes.map((node) => [node.projectName, node]))
  const dependencyEdges: Array<{
    id: string
    source: string
    target: string
    type: 'workflow'
    markerEnd: MarkerType
    data: { kind: 'data'; label: string }
  }> = []

  for (const node of moduleNodes) {
    for (const dependency of node.dependsOn) {
      if (!moduleNodeMap.has(dependency)) {
        continue
      }

      dependencyEdges.push({
        id: `edge-${dependency}-${node.projectName}`,
        source: dependency,
        target: node.projectName,
        type: 'workflow',
        markerEnd: MarkerType.ArrowClosed,
        data: {
          kind: 'data',
          label: 'Contract',
        },
      })
    }
  }

  nodes.value = [
    {
      id: 'core-agent',
      type: 'workflow',
      position: { x: 80, y: 280 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        title: 'Core Agent Scheduler',
        subtitle: '统一调度并行 project agents，负责 tick 与聚合决策',
        icon: 'CR',
        kind: 'trigger',
        status: 'success',
        hint: 'Human-in-the-loop decision first',
      },
    },
    ...moduleNodes.map((moduleNode, index) => ({
      id: moduleNode.projectName,
      type: 'workflow' as const,
      position: { x: 420 + (index % 2) * 320, y: 120 + Math.floor(index / 2) * 220 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        title: moduleNode.title,
        subtitle: `${moduleNode.path}: project agent module`,
        icon: 'PJ',
        kind: 'action' as const,
        status: 'default' as const,
        hint: moduleNode.hint,
      },
    })),
  ]

  edges.value = [
    ...moduleNodes.map((moduleNode, index) => ({
      id: `edge-core-${moduleNode.projectName}`,
      source: 'core-agent',
      target: moduleNode.projectName,
      type: 'workflow' as const,
      markerEnd: MarkerType.ArrowClosed,
      data: {
        kind: 'main' as const,
        label: `Dispatch P${index + 1}`,
      },
    })),
    ...dependencyEdges,
  ]

  selectedNodeId.value = 'core-agent'
  const nextDrafts: Record<string, NodeSubagentDraft> = {}

  for (const moduleNode of moduleNodes) {
    nextDrafts[moduleNode.projectName] = {
      projectName: moduleNode.projectName,
      objective: `围绕“${moduleNode.title}”完成 ${moduleNode.path} 模块处理。`,
      scopePaths: moduleNode.path,
      entryHints: moduleNode.hint,
      mode: 'implement',
      output: 'patch',
      constraints: ['limit-scope', 'preserve-api', 'run-checks'],
      parallelSlot: 1,
      isolationLevel: 'workspace',
      decisionPolicy: 'human-first',
      promptSuffix: moduleNode.dependsOn.length
        ? `优先对齐依赖接口: ${moduleNode.dependsOn.join(', ')}`
        : '',
    }
  }

  nodeSubagentDrafts.value = nextDrafts
  syncSeedsFromDocument()
  syncProjectRuntimesFromNodes()
  pushDashboardEvent('core', 'core-agent', 'workflow.blueprint.loaded', '并行 agent 蓝图已装载')
  setDocumentMessage(`已按模板生成并行蓝图，共 ${moduleNodes.length} 个 project agents`)

  nextTick(() => {
    fitView({ padding: 0.18, duration: 280 })
  })
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

function toggleInspirationOpen() {
  inspirationOpen.value = !inspirationOpen.value
}

function handleInspirationNodeChange(event: Event) {
  const nextValue = (event.target as HTMLSelectElement | null)?.value ?? ''
  inspirationNodeId.value = nextValue
}

function handleInspirationBurst() {
  if (!activeInspirationNodeId.value) {
    inspirationResult.value = ''
    setDocumentMessage('当前没有可用的 action 节点')
    return
  }

  inspirationResult.value = 'generated from ai agent'
  setDocumentMessage('灵感工作台已生成输出')
}

function handleTriggerInboxPing() {
  const updated = workflowDocumentStore.markFirstTriggerNodeUnread()

  if (updated) {
    setDocumentMessage('Trigger 节点已收到一条后端消息')
    return
  }

  setDocumentMessage('没有可用的 trigger 节点')
}

function handleTriggerInboxDone() {
  const updated = workflowDocumentStore.clearFirstTriggerNodeUnread()

  if (updated) {
    setDocumentMessage('Trigger 节点消息已处理完成')
    return
  }

  setDocumentMessage('没有可用的 trigger 节点')
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
  stopMockDispatcher()
  clearNodeHighlightClass()
  clearEdgeHighlightClass()
  clearEventStreamFilter()

  if (nodeHighlightTimer !== null) {
    window.clearTimeout(nodeHighlightTimer)
    nodeHighlightTimer = null
  }

  if (edgeHighlightTimer !== null) {
    window.clearTimeout(edgeHighlightTimer)
    edgeHighlightTimer = null
  }

  cancelPendingPlacement()
  selectedNodeId.value = null
  eventLog.value = []
  projectRuntimeMap.value = {}
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

function createNodeSubagentDraft(node: InspectorNodeMeta): NodeSubagentDraft {
  const defaultScope = `src/${node.id}/\nsrc/${node.data.title.toLowerCase().replace(/\s+/g, '-')}/`
  const defaultMode: SubagentMode = node.data.kind === 'trigger' ? 'analyze' : 'implement'

  return {
    projectName: node.id,
    objective: `围绕“${node.data.title}”完成当前节点对应的模块处理。`,
    scopePaths: defaultScope,
    entryHints: node.data.hint ?? '',
    mode: defaultMode,
    output: defaultMode === 'analyze' ? 'summary' : 'patch',
    constraints: ['limit-scope', 'preserve-api', 'run-checks'],
    parallelSlot: 1,
    isolationLevel: 'workspace',
    decisionPolicy: 'human-first',
    promptSuffix: '',
  }
}

function getNodeDecisionDialogStyle(node: { position: { x: number; y: number } }) {
  const vp = viewport.value
  return {
    top: `${(node.position.y - 115) * vp.zoom + vp.y}px`,
    left: `${(node.position.x + 10) * vp.zoom + vp.x}px`,
  }
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
        <button type="button" @click="handleTriggerInboxPing">模拟 Trigger 消息</button>
        <button type="button" @click="handleTriggerInboxDone">处理完成</button>
        <button type="button" @click="toggleTheme">
          切换到{{ theme === 'light' ? '深色' : '浅色' }}主题
        </button>
      </div>

      <section class="orchestration-panel">
        <div class="orchestration-header">
          <p class="inspector-eyebrow">Decision Console</p>
          <strong>Core + Project Agent 调度台</strong>
          <span>
            并行隔离执行，持续回传状态，确保人保持主导决策。
          </span>
        </div>

        <div class="orchestration-grid">
          <label class="inspiration-field">
            <span>运行模式</span>
            <select v-model="orchestrationMode" class="inspiration-select">
              <option value="mock">Mock (前端并行模拟)</option>
              <option value="nanobot">Nanobot (真实后端)</option>
            </select>
          </label>

          <label class="inspiration-field">
            <span>Control API</span>
            <input v-model="controlPlaneApiUrl" class="inspiration-select orchestration-input" />
          </label>

          <label class="inspiration-field">
            <span>Workflow WS</span>
            <input v-model="workflowWsUrl" class="inspiration-select orchestration-input" />
          </label>

          <label class="inspiration-field">
            <span>API Key (optional)</span>
            <input
              v-model="controlPlaneApiKey"
              type="password"
              class="inspiration-select orchestration-input"
              placeholder="X-Nanobot-API-Key"
            />
          </label>
        </div>

        <div class="orchestration-actions">
          <button type="button" class="primary" @click="handleBuildParallelBlueprint">加载并行蓝图</button>
          <button type="button" :disabled="isDelegatingBatch" @click="handleDelegateBatchRun">
            {{ isDelegatingBatch ? '提交中...' : '并行委托全部模块' }}
          </button>
          <button type="button" :disabled="isTickingScheduler" @click="handleSchedulerTick">
            {{ isTickingScheduler ? 'Ticking...' : 'Scheduler Tick' }}
          </button>
          <button type="button" @click="handleRefreshSnapshot">刷新 Snapshot</button>
          <button type="button" @click="handleRefreshBatchStatus">刷新 Batch 状态</button>
          <button
            type="button"
            :disabled="isLoadingDecisionQueue"
            @click="handleRefreshDecisionQueue"
          >
            {{ isLoadingDecisionQueue ? '刷新中...' : '刷新 Decision Queue' }}
          </button>
          <button v-if="!wsConnected" type="button" @click="connectWorkflowWs">连接 WS</button>
          <button v-else type="button" @click="disconnectWorkflowWs">断开 WS</button>
        </div>

        <!-- fin 式 inbound 消息发送 -->
        <div v-if="wsConnected" class="orchestration-inbound-section">
          <p class="orchestration-inbound-title">Inbound 消息 (仿 fin 函数)</p>
          <div class="orchestration-inbound-row">
            <label class="inspiration-field inbound-field-sm">
              <span>channel</span>
              <input v-model="inboundChannel" class="inspiration-select" />
            </label>
            <label class="inspiration-field inbound-field-sm">
              <span>sender_id</span>
              <input v-model="inboundSenderId" class="inspiration-select" />
            </label>
            <label class="inspiration-field inbound-field-sm">
              <span>chat_id</span>
              <input v-model="inboundChatId" class="inspiration-select" />
            </label>
          </div>
          <label class="inspiration-field">
            <span>消息内容</span>
            <div class="orchestration-inbound-ctrl">
              <textarea
                v-model="inboundContent"
                class="inspiration-textarea"
                rows="2"
                placeholder="输入要发送的 inbound 内容，例如：为 test_code/module2 添加一个简单接口"
              />
              <button type="button" class="primary" @click="handleSendInbound">发送 Inbound</button>
            </div>
          </label>
        </div>

        <label class="inspiration-field">
          <span>模块模板 (project|title|path|depends(comma)|hint)</span>
          <textarea
            v-model="moduleTemplateText"
            class="inspiration-textarea orchestration-template-textarea"
            rows="6"
          />
        </label>

        <p class="orchestration-summary">
          Parsed Modules: {{ parsedModuleTemplate.length }}
          <span v-if="lastBatchId"> | Batch: {{ lastBatchId }}</span>
          <span v-if="batchStatus"> | Status: {{ batchStatus }}</span>
        </p>

        <div class="orchestration-strip">
          <span class="orchestration-chip">Total {{ orchestrationStats.total }}</span>
          <span class="orchestration-chip">Queued {{ orchestrationStats.queued }}</span>
          <span class="orchestration-chip">Running {{ orchestrationStats.running }}</span>
          <span class="orchestration-chip">Blocked {{ orchestrationStats.blocked }}</span>
          <span class="orchestration-chip">Done {{ orchestrationStats.done }}</span>
          <span class="orchestration-chip">Error {{ orchestrationStats.errored }}</span>
          <span class="orchestration-chip" :class="{ active: wsConnected }">WS {{ wsConnected ? 'ON' : 'OFF' }}</span>
        </div>

        <p v-if="snapshotSummary" class="orchestration-summary">{{ snapshotSummary }}</p>
        <p v-if="wsError" class="orchestration-error">{{ wsError }}</p>

        <div class="orchestration-runtime-list">
          <article
            v-for="runtime in sortedProjectRuntimes"
            :key="runtime.nodeId"
            class="orchestration-runtime-item"
            :data-state="runtime.state"
          >
            <div>
              <strong>{{ runtime.projectName }}</strong>
              <p>{{ runtime.lastEvent }}</p>
            </div>
            <div class="orchestration-runtime-meta">
              <span>{{ runStateLabels[runtime.state] }}</span>
              <span>{{ runtime.lastLatencyMs }}ms</span>
            </div>
          </article>
        </div>

        <div class="orchestration-event-stream">
          <div class="orchestration-event-header">
            <p class="orchestration-event-title">实时事件流</p>
            <div class="orchestration-event-actions">
              <label class="orchestration-filter-lock">
                <input v-model="eventStreamFilterLocked" type="checkbox" />
                <span>锁定过滤</span>
              </label>
              <button
                v-if="eventStreamFilters.length"
                type="button"
                class="orchestration-clear-filter"
                @click="clearEventStreamFilter"
              >
                清除过滤
              </button>
            </div>
          </div>
          <div v-if="eventStreamFilters.length" class="orchestration-filter-tags">
            <span
              v-for="filter in eventStreamFilters"
              :key="filter.key"
              class="orchestration-filter-tag"
              :style="getFilterColorStyle(filter)"
            >
              <span>{{ filter.label }}</span>
              <button type="button" @click="removeEventStreamFilter(filter.key)">x</button>
            </span>
          </div>
          <article
            v-for="event in filteredRecentEvents"
            :key="event.id"
            class="orchestration-event-item"
            :class="{ highlighted: highlightedEventIdSet.has(event.id) }"
            :style="highlightedEventFilterMap[event.id] ? getFilterColorStyle(highlightedEventFilterMap[event.id]) : undefined"
          >
            <header>
              <strong>{{ event.type }}</strong>
              <span>{{ event.agentId }}</span>
            </header>
            <p>{{ event.summary }}</p>
          </article>
          <p v-if="!filteredRecentEvents.length" class="orchestration-summary">当前过滤条件下没有匹配事件。</p>
        </div>

        <section class="decision-queue-card">
          <header>
            <p class="orchestration-event-title">Decision Queue</p>
            <span>Pending {{ decisionQueueStats.pending }} / {{ decisionQueueStats.total }}</span>
          </header>

          <label class="inspiration-field">
            <span>审批理由 (全局)</span>
            <textarea
              v-model="decisionRationale"
              class="inspiration-textarea"
              rows="2"
              placeholder="例如：风险可控，批准继续；或接口不稳定，驳回要求补证据"
            />
          </label>

          <label class="inspiration-field">
            <span>Degrade 模式</span>
            <select v-model="selectedDecisionDegradeMode" class="inspiration-select">
              <option value="wait">wait</option>
              <option value="stub">stub</option>
              <option value="continue_partial">continue_partial</option>
            </select>
          </label>

          <p v-if="decisionQueueError" class="orchestration-error">{{ decisionQueueError }}</p>

          <div class="decision-queue-list">
            <article v-for="item in decisionQueue" :key="`${item.decisionId}-${item.workItemId}`" class="decision-queue-item">
              <div class="decision-queue-main">
                <div class="decision-title-row" :style="getDecisionColorStyle(item)">
                  <span class="decision-color-strip" aria-hidden="true"></span>
                  <strong>{{ item.module }}</strong>
                </div>
                <p>{{ item.workItemId }} · {{ item.decisionType }} · {{ item.status }}</p>
                <p>source: {{ item.sourceEvent }}</p>
                <div class="decision-hit-metrics">
                  <span>事件命中 {{ getDecisionEventHitCount(item) }}</span>
                  <span>边命中 {{ getDecisionEdgeHitCount(item) }}</span>
                  <span v-if="isDecisionInCompareSet(item)" class="decision-compare-badge">当前已加入对比集</span>
                </div>
              </div>

              <div class="decision-queue-secondary-actions">
                <button type="button" @click="toggleDecisionItemExpanded(item)">
                  {{ isDecisionItemExpanded(item) ? '收起详情' : '展开详情' }}
                </button>
                <button type="button" @click="focusProjectAgentNode(item)">跳转并高亮节点</button>
              </div>

              <div class="decision-queue-actions">
                <button
                  type="button"
                  :disabled="approvingDecisionId === (item.decisionId || item.workItemId)"
                  @click="handleDecisionAction(item, 'approved')"
                >
                  Approve
                </button>
                <button
                  type="button"
                  :disabled="approvingDecisionId === (item.decisionId || item.workItemId)"
                  @click="handleDecisionAction(item, 'rejected')"
                >
                  Reject
                </button>
                <button
                  type="button"
                  :disabled="approvingDecisionId === item.workItemId"
                  @click="handleDecisionDegrade(item)"
                >
                  Degrade
                </button>
              </div>

              <div v-if="isDecisionItemExpanded(item)" class="decision-queue-details">
                <div class="decision-queue-detail-field">
                  <span>Related Contract</span>
                  <p>{{ item.relatedContracts.length ? item.relatedContracts.join(', ') : 'none' }}</p>
                </div>
                <div class="decision-queue-detail-field decision-queue-detail-actions">
                  <button type="button" @click="focusSourceEventsForDecision(item)">定位来源事件</button>
                </div>
                <div class="decision-queue-detail-field">
                  <span>Options</span>
                  <pre>{{ item.options.length ? formatJsonForPreview(item.options) : '[]' }}</pre>
                </div>
                <div class="decision-queue-detail-field">
                  <span>Metadata</span>
                  <pre>{{ formatJsonForPreview(item.metadata) }}</pre>
                </div>
                <div class="decision-queue-detail-field">
                  <span>Raw Event</span>
                  <pre>{{ formatJsonForPreview(item.raw) }}</pre>
                </div>
              </div>
            </article>

            <p v-if="!decisionQueue.length" class="orchestration-summary">当前没有待处理 decision。</p>
          </div>
        </section>
      </section>

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

      <section class="inspiration-workbench" :class="{ collapsed: !inspirationOpen }">
        <button
          type="button"
          class="inspiration-workbench-header"
          :aria-expanded="inspirationOpen"
          @click="toggleInspirationOpen"
        >
          <span class="inspiration-workbench-header-copy">
            <span class="inspector-eyebrow">Inspiration Lab</span>
            <span class="inspiration-workbench-copy">为 action 节点快速触发灵感输出</span>
          </span>
          <span class="inspiration-workbench-caret" :class="{ open: inspirationOpen }">▾</span>
        </button>

        <div v-if="inspirationOpen" class="inspiration-workbench-body">
          <label class="inspiration-field">
            <span>Action node</span>
            <select
              class="inspiration-select"
              :value="activeInspirationNodeId"
              :disabled="!actionNodes.length"
              @change="handleInspirationNodeChange"
            >
              <option v-if="!actionNodes.length" value="">No action nodes</option>
              <option v-for="node in actionNodes" :key="node.id" :value="node.id">
                {{ node.data?.title ?? node.id }}
              </option>
            </select>
          </label>

          <label class="inspiration-field">
            <span>Input</span>
            <textarea
              v-model="inspirationPrompt"
              class="inspiration-textarea"
              rows="4"
              :disabled="!actionNodes.length"
              placeholder="Describe the spark you want for this action node..."
            />
          </label>

          <button
            type="button"
            class="inspiration-button"
            :disabled="!actionNodes.length"
            @click="handleInspirationBurst"
          >
            SPARK
          </button>

          <label class="inspiration-field">
            <span>Output</span>
            <textarea
              :value="inspirationResult"
              class="inspiration-textarea inspiration-output"
              rows="3"
              readonly
              :placeholder="activeInspirationNode ? `Ready for ${activeInspirationNode.data?.title}` : 'No action nodes available'"
            />
          </label>
        </div>
      </section>

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
        <div class="inspector-card-header">
          <div>
            <p class="inspector-eyebrow">{{ selectedNodeTypeLabel }}</p>
            <input
              class="inspector-textarea inspector-input inspector-title-input"
              :value="selectedNodeData.title"
              placeholder="节点标题"
              @input="handleNodeTitleInput($event)"
            />
          </div>

          <div class="inspector-tabs" role="tablist" aria-label="Node inspector tabs">
            <button
              type="button"
              class="inspector-tab"
              :class="{ active: inspectorTab === 'overview' }"
              @click="setInspectorTab('overview')"
            >
              概览
            </button>
            <button
              type="button"
              class="inspector-tab"
              :class="{ active: inspectorTab === 'subagent' }"
              @click="setInspectorTab('subagent')"
            >
              Subagent
            </button>
          </div>
        </div>

        <div v-if="inspectorTab === 'overview'" class="inspector-panel">
          <input
            class="inspector-textarea inspector-input"
            :value="selectedNodeData.subtitle"
            placeholder="副标题"
            @input="handleNodeSubtitleInput($event)"
          />
          <p>
            {{ selectedNodeData.hint ?? '拖拽节点、创建连线，或用左侧按钮快速扩展流程。' }}
          </p>
          <p>
            Shape: {{ getWorkflowNodeShape(selectedNodeData.attachments) }} · Icon:
            {{ getWorkflowNodeIconAssetId(selectedNodeData.attachments) ?? selectedNodeData.icon }}
          </p>
          <p v-if="selectedNodeMeta">
            节点 ID: {{ selectedNodeMeta.id }} · Kind: {{ selectedNodeData.kind }}
          </p>
        </div>

        <div v-else class="inspector-panel inspector-subagent-panel">
          <template v-if="selectedWorkflowNode && selectedSubagentDraft">
            <p class="inspector-subagent-copy">
              这个 tab 用来把“目录模块 + 执行限制”转成后端 subagent 可直接消费的提示词，不要求展示所有底层细节，只保留足够驱动执行的信息。
            </p>

            <div class="inspector-chip-row">
              <span class="inspector-chip">{{ selectedWorkflowNode.data?.kind }}</span>
              <span class="inspector-chip">{{ subagentModeLabels[selectedSubagentDraft.mode] }}</span>
              <span class="inspector-chip">{{ subagentOutputLabels[selectedSubagentDraft.output] }}</span>
            </div>

            <label class="inspector-field">
              <span>Project Name</span>
              <input
                class="inspector-textarea inspector-input"
                :value="selectedSubagentDraft.projectName"
                placeholder="例如 src/services 或 project-services"
                @input="handleDraftProjectNameInput"
              />
            </label>

            <label class="inspector-field">
              <span>任务目标</span>
              <textarea
                class="inspector-textarea"
                rows="3"
                :value="selectedSubagentDraft.objective"
                placeholder="例如：在当前目录内补齐模块编排逻辑，并保持现有接口不变"
                @input="handleDraftTextInput('objective', $event)"
              />
            </label>

            <label class="inspector-field">
              <span>模块范围</span>
              <textarea
                class="inspector-textarea"
                rows="3"
                :value="selectedSubagentDraft.scopePaths"
                placeholder="每行一个目录或文件，告诉 subagent 允许关注哪里"
                @input="handleDraftTextInput('scopePaths', $event)"
              />
            </label>

            <label class="inspector-field">
              <span>关键文件 / 入口</span>
              <textarea
                class="inspector-textarea"
                rows="2"
                :value="selectedSubagentDraft.entryHints"
                placeholder="例如：index.ts、controller.ts、某个导出函数名"
                @input="handleDraftTextInput('entryHints', $event)"
              />
            </label>

            <div class="inspector-field">
              <span>任务模式</span>
              <div class="inspector-segmented">
                <button
                  v-for="(label, mode) in subagentModeLabels"
                  :key="mode"
                  type="button"
                  class="inspector-segmented-button"
                  :class="{ active: selectedSubagentDraft.mode === mode }"
                  @click="updateSelectedDraft('mode', mode)"
                >
                  {{ label }}
                </button>
              </div>
            </div>

            <div class="inspector-field">
              <span>输出形式</span>
              <div class="inspector-segmented compact">
                <button
                  v-for="(label, output) in subagentOutputLabels"
                  :key="output"
                  type="button"
                  class="inspector-segmented-button"
                  :class="{ active: selectedSubagentDraft.output === output }"
                  @click="updateSelectedDraft('output', output)"
                >
                  {{ label }}
                </button>
              </div>
            </div>

            <div class="inspector-field">
              <span>执行限制</span>
              <div class="inspector-check-grid">
                <label
                  v-for="(label, constraint) in subagentConstraintLabels"
                  :key="constraint"
                  class="inspector-check"
                >
                  <input
                    type="checkbox"
                    :checked="selectedSubagentDraft.constraints.includes(constraint)"
                    @change="toggleDraftConstraint(constraint)"
                  />
                  <span>{{ label }}</span>
                </label>
              </div>
            </div>

            <div class="inspector-field">
              <span>隔离策略</span>
              <div class="inspector-segmented compact">
                <button
                  v-for="(label, isolationLevel) in isolationLevelLabels"
                  :key="isolationLevel"
                  type="button"
                  class="inspector-segmented-button"
                  :class="{ active: selectedSubagentDraft.isolationLevel === isolationLevel }"
                  @click="updateSelectedDraft('isolationLevel', isolationLevel)"
                >
                  {{ label }}
                </button>
              </div>
            </div>

            <div class="inspector-field">
              <span>决策策略</span>
              <div class="inspector-segmented compact">
                <button
                  v-for="(label, decisionPolicy) in decisionPolicyLabels"
                  :key="decisionPolicy"
                  type="button"
                  class="inspector-segmented-button"
                  :class="{ active: selectedSubagentDraft.decisionPolicy === decisionPolicy }"
                  @click="updateSelectedDraft('decisionPolicy', decisionPolicy)"
                >
                  {{ label }}
                </button>
              </div>
            </div>

            <label class="inspector-field">
              <span>并行槽位</span>
              <input
                class="inspector-textarea inspector-input"
                type="number"
                min="1"
                max="32"
                :value="selectedSubagentDraft.parallelSlot"
                @input="handleDraftParallelSlotInput"
              />
            </label>

            <label class="inspector-field">
              <span>额外 Prompt</span>
              <textarea
                class="inspector-textarea"
                rows="2"
                :value="selectedSubagentDraft.promptSuffix"
                placeholder="用于附加临时策略，例如仅输出最小可回滚 patch"
                @input="handleDraftPromptSuffixInput"
              />
            </label>

            <div class="inspector-field">
              <span>Prompt Preview</span>
              <pre class="inspector-prompt-preview">{{ selectedSubagentPrompt }}</pre>
            </div>

            <div class="inspector-subagent-actions">
              <button type="button" @click="handlePushSelectedAttributes">推送当前节点属性到后端</button>
            </div>
          </template>

          <p v-else class="inspector-empty-state">
            这个 tab 仅对 workflow 节点启用。请选择一个真正代表目录模块的节点，再通过 UI 填任务目标、范围和限制。
          </p>
        </div>
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
          <button type="button" @click="handleEdgeFlowAnimation()">边流动</button>
          <button type="button" @click="handleRemoveChatHistory">移除聊天记录</button>
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
        <!-- 节点决策问答浮窗 -->
        <div
          v-for="node in pendingDecisionNodes"
          :key="node.id"
          class="node-decision-dialog"
          :style="getNodeDecisionDialogStyle(node)"
        >
          <p class="decision-dialog-question">{{ node.data?.pendingDecisionPayload }}</p>
          <input
            v-model="node.data!.pendingDecisionAnswer"
            class="inspiration-select"
            placeholder="press enter to answer"
            @keydown.enter.prevent="handleSendDecisionAnswer(node.id, node.data?.pendingDecisionAnswer ?? '')"
          />
        </div>
      </div>

      <!-- 聊天对话框 -->
      <div class="chat-panel" :class="{ open: chatOpen }">
        <button type="button" class="chat-toggle" @click="chatOpen = !chatOpen">
          {{ chatOpen ? '×' : '💬' }}
        </button>
        <div v-if="chatOpen" class="chat-body">
          <div class="chat-messages" ref="chatMessagesRef">
            <div
              v-for="(msg, index) in chatMessages"
              :key="index"
              class="chat-message"
              :class="msg.role"
            >
              <div class="chat-bubble">{{ msg.content }}</div>
            </div>
          </div>
          <div class="chat-input-row">
            <input
              v-model="chatInput"
              class="chat-input"
              placeholder="输入消息..."
              :disabled="chatSending"
              @keydown.enter.prevent="handleSendChat"
            />
            <button
              type="button"
              class="chat-send-btn"
              :disabled="chatSending || !chatInput.trim()"
              @click="handleSendChat"
            >
              {{ chatSending ? '...' : '发送' }}
            </button>
          </div>
        </div>
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
  --node-shadow: 0 1px 4px rgba(33, 43, 54, 0.06);
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
  --node-shadow: 0 1px 6px rgba(0, 0, 0, 0.18);
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
.inspiration-workbench,
.attachment-panel,
.orchestration-panel,
.inspector-card {
  padding: 16px;
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background: var(--panel-surface);
}

.orchestration-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.orchestration-panel > * {
  min-width: 0;
}

.orchestration-header {
  display: grid;
  gap: 6px;
}

.orchestration-header strong {
  font-size: 16px;
}

.orchestration-header span {
  color: var(--text-secondary);
  line-height: 1.5;
}

.orchestration-grid {
  display: grid;
  gap: 10px;
}

.orchestration-input {
  font-size: 13px;
}

.orchestration-template-textarea {
  min-height: 132px;
  font-family: 'Cascadia Code', 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
}

.orchestration-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.orchestration-actions button {
  min-height: 40px;
}

.orchestration-inbound-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  margin-top: 8px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--panel-surface) 64%, transparent);
}

.orchestration-inbound-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--accent);
  text-transform: uppercase;
}

.orchestration-inbound-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.orchestration-inbound-row .inbound-field-sm {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.orchestration-inbound-row .inbound-field-sm > span {
  font-size: 10px;
  color: var(--text-secondary);
}

.orchestration-inbound-row .inbound-field-sm input {
  min-height: 28px;
  font-size: 12px;
}

.orchestration-inbound-ctrl {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.orchestration-inbound-ctrl textarea {
  flex: 1;
}

.orchestration-inbound-ctrl button {
  white-space: nowrap;
  min-height: 40px;
  align-self: stretch;
}

.inbound-auto-respond {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}

.inbound-auto-respond input {
  margin: 0;
}

.decision-dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--accent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--accent) 8%, var(--panel-surface));
}

.node-decision-dialog2 {
  position: absolute;
  z-index: 50;
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: var(--panel-surface);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.node-decision-dialog {
  position: absolute;
  z-index: 50;
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 0;
  border-radius: 18px;
  background: transparent;
}


.node-decision-dialog textarea {
  min-height: 60px;
}

.node-decision-dialog button {
  align-self: flex-end;
}

.decision-dialog-question {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 聊天对话框 */
.chat-panel {
  position: fixed;
  bottom: 34px;
  left: 350px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.chat-toggle {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: var(--panel-surface);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
}

.chat-toggle:hover {
  background: color-mix(in srgb, var(--accent) 12%, var(--panel-surface));
}

.chat-body {
  position: absolute;
  bottom: 52px;
  left: 0;
  width: 360px;
  max-height: 480px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: var(--panel-surface);
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 380px;
}

.chat-message {
  display: flex;
}

.chat-message.user {
  justify-content: flex-end;
}

.chat-message.assistant {
  justify-content: flex-start;
}

.chat-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
  white-space: pre-wrap;
}

.chat-message.user .chat-bubble {
  background: var(--accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-message.assistant .chat-bubble {
  background: color-mix(in srgb, var(--panel-border) 32%, transparent);
  border-bottom-left-radius: 4px;
}

.chat-input-row {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid var(--panel-border);
}

.chat-input {
  flex: 1;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 88%, transparent);
  color: var(--text-primary);
  font: inherit;
  font-size: 13px;
}

.chat-send-btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.chat-send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.orchestration-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.orchestration-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 82%, transparent);
  color: var(--text-secondary);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.orchestration-chip.active {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--panel-border));
  color: var(--accent);
}

.orchestration-summary {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.orchestration-error {
  margin: 0;
  font-size: 12px;
  color: #d9534f;
}

.orchestration-runtime-list {
  display: grid;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
}

.orchestration-runtime-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 78%, transparent);
}

.orchestration-runtime-item p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.orchestration-runtime-meta {
  display: grid;
  justify-items: end;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.orchestration-runtime-item[data-state='running'] {
  border-color: rgba(47, 143, 206, 0.35);
}

.orchestration-runtime-item[data-state='blocked'] {
  border-color: rgba(230, 167, 0, 0.4);
}

.orchestration-runtime-item[data-state='done'] {
  border-color: rgba(39, 174, 96, 0.38);
}

.orchestration-runtime-item[data-state='error'] {
  border-color: rgba(217, 83, 79, 0.45);
}

.orchestration-event-stream {
  display: grid;
  gap: 8px;
  max-height: 220px;
  overflow: auto;
  padding-top: 4px;
}

.orchestration-event-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.orchestration-event-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.orchestration-filter-lock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

.orchestration-filter-lock input {
  margin: 0;
}

.orchestration-clear-filter {
  min-height: 30px;
  padding: 0 10px;
  font-size: 11px;
}

.orchestration-filter-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.orchestration-filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.orchestration-filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--decision-filter-color, var(--accent)) 48%, var(--panel-border));
  background: color-mix(in srgb, var(--decision-filter-color, var(--accent)) 14%, var(--panel-surface));
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.orchestration-filter-tag button {
  min-height: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10px;
}

.orchestration-event-title {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.orchestration-event-item {
  border-radius: 12px;
  border: 1px dashed var(--panel-border);
  padding: 9px 10px;
}

.orchestration-event-item header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
}

.orchestration-event-item p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.orchestration-event-item.highlighted {
  border-color: color-mix(in srgb, var(--decision-filter-color, var(--accent)) 56%, var(--panel-border));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--decision-filter-color, var(--accent)) 28%, transparent);
}

.decision-queue-card {
  display: grid;
  gap: 10px;
  padding-top: 6px;
  border-top: 1px dashed var(--panel-border);
}

.decision-queue-card header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.decision-queue-list {
  display: grid;
  gap: 8px;
  max-height: 260px;
  overflow: auto;
}

.decision-queue-item {
  display: grid;
  gap: 8px;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 10px;
  background: color-mix(in srgb, var(--panel-surface) 80%, transparent);
}

.decision-queue-main p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.decision-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.decision-color-strip {
  display: inline-block;
  width: 4px;
  height: 16px;
  border-radius: 999px;
  background: var(--decision-filter-color, var(--accent));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--decision-filter-color, var(--accent)) 36%, transparent);
}

.decision-hit-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.decision-hit-metrics span {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 82%, transparent);
  font-size: 11px;
  color: var(--text-muted);
}

.decision-hit-metrics .decision-compare-badge {
  border-color: color-mix(in srgb, var(--accent) 44%, var(--panel-border));
  background: color-mix(in srgb, var(--accent) 14%, var(--panel-surface));
  color: var(--text-primary);
}

.decision-queue-secondary-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.decision-queue-secondary-actions button {
  min-height: 34px;
  font-size: 12px;
}

.decision-queue-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.decision-queue-actions button {
  min-height: 34px;
  font-size: 12px;
}

.decision-queue-details {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-radius: 10px;
  border: 1px dashed var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 76%, transparent);
}

.decision-queue-detail-field {
  display: grid;
  gap: 4px;
}

.decision-queue-detail-field span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.decision-queue-detail-field p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.decision-queue-detail-field pre {
  margin: 0;
  max-height: 120px;
  overflow: auto;
  padding: 8px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-primary);
  background: rgba(7, 10, 16, 0.24);
  border: 1px solid var(--panel-border);
  font-family: 'Cascadia Code', 'SFMono-Regular', Consolas, monospace;
}

.decision-queue-detail-actions {
  display: flex;
}

.decision-queue-detail-actions button {
  min-height: 34px;
  font-size: 12px;
}

:deep(.vue-flow__node.agent-focus-flash) {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 78%, transparent), 0 0 18px rgba(255, 109, 58, 0.5);
  animation: agent-node-focus-flash 1.6s ease;
}

:deep(.vue-flow__edge-path.contract-edge-focus),
:deep(.vue-flow__edge.contract-edge-focus .vue-flow__edge-path) {
  stroke: color-mix(in srgb, var(--accent) 82%, #ffb38f);
  stroke-width: 3;
  filter: drop-shadow(0 0 5px rgba(255, 109, 58, 0.65));
  animation: contract-edge-focus-flash 2.2s ease;
}

@keyframes agent-node-focus-flash {
  0% {
    transform: scale(1);
  }

  40% {
    transform: scale(1.02);
  }

  100% {
    transform: scale(1);
  }
}

@keyframes contract-edge-focus-flash {
  0% {
    stroke-opacity: 0.45;
  }

  45% {
    stroke-opacity: 1;
  }

  100% {
    stroke-opacity: 0.75;
  }
}

.inspiration-workbench {
  display: grid;
  gap: 14px;
}

.inspiration-workbench-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
}

.inspiration-workbench-header-copy {
  display: grid;
  gap: 6px;
}

.inspiration-workbench-copy {
  font-size: 13px;
  color: var(--text-secondary);
}

.inspiration-workbench-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel-surface) 76%, transparent);
  color: var(--text-secondary);
  transition: transform 0.18s ease, color 0.18s ease;
}

.inspiration-workbench-caret.open {
  transform: rotate(180deg);
  color: var(--text-primary);
}

.inspiration-workbench-body {
  display: grid;
  gap: 14px;
}

.inspiration-workbench.collapsed {
  gap: 0;
}

.inspiration-field {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.inspiration-field > * {
  min-width: 0;
}

.inspiration-field span {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.inspiration-select,
.inspiration-textarea {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 88%, transparent);
  color: var(--text-primary);
  padding: 12px 14px;
  font: inherit;
}

.inspiration-select {
  height: 44px;
}

.inspiration-textarea {
  min-height: 96px;
  resize: vertical;
  line-height: 1.5;
}

.inspiration-output {
  min-height: 88px;
}

.inspiration-select:disabled,
.inspiration-textarea:disabled,
.inspiration-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.inspiration-button {
  height: 44px;
  border-color: transparent;
  background: linear-gradient(135deg, #ff8657 0%, #ff5a36 100%);
  color: #fff;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
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

.inspector-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.inspector-card-header > * {
  min-width: 0;
}

.inspector-card-header strong {
  display: block;
  overflow-wrap: anywhere;
}

.inspector-panel {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.inspector-panel > * {
  min-width: 0;
}

.inspector-card span,
.inspector-card p {
  color: var(--text-secondary);
}

.inspector-card p {
  margin: 0;
  line-height: 1.6;
}

.inspector-tabs {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel-surface) 82%, transparent);
  border: 1px solid var(--panel-border);
}

.inspector-tab {
  min-width: 0;
  padding: 8px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.inspector-tab.active {
  background: rgba(255, 109, 58, 0.12);
  color: var(--accent);
}

.inspector-subagent-panel {
  gap: 14px;
}

.inspector-subagent-copy {
  font-size: 13px;
}

.inspector-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.inspector-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, var(--panel-surface));
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--panel-border));
  color: var(--text-primary);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.inspector-field {
  display: grid;
  gap: 8px;
}

.inspector-field > span {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.inspector-textarea {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
  resize: vertical;
  min-height: 72px;
  padding: 12px 13px;
  border-radius: 16px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 82%, transparent);
  color: var(--text-primary);
  font: inherit;
  line-height: 1.55;
}

.inspector-input {
  min-height: 44px;
  resize: none;
}

.inspector-textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 34%, transparent);
  outline-offset: 1px;
}

.inspector-segmented {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.inspector-segmented.compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.inspector-segmented-button {
  min-height: 42px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 86%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.inspector-segmented-button.active {
  border-color: color-mix(in srgb, var(--accent) 36%, var(--panel-border));
  background: color-mix(in srgb, var(--accent) 14%, var(--panel-surface));
  color: var(--text-primary);
}

.inspector-check-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.inspector-check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 84%, transparent);
}

.inspector-check input {
  margin: 0;
}

.inspector-check span {
  font-size: 13px;
  color: var(--text-primary);
}

.inspector-prompt-preview {
  margin: 0;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background: rgba(7, 10, 16, 0.28);
  color: var(--text-primary);
  font-family: 'Cascadia Code', 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.inspector-empty-state {
  padding: 14px;
  border-radius: 16px;
  border: 1px dashed var(--panel-border);
  background: color-mix(in srgb, var(--panel-surface) 76%, transparent);
}

.inspector-subagent-actions {
  display: flex;
  gap: 8px;
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
  position: relative;
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

  .inspector-card-header {
    flex-direction: column;
  }

  .inspector-tabs {
    width: 100%;
  }

  .inspector-tab {
    flex: 1 1 0;
  }

  .inspector-segmented,
  .inspector-segmented.compact,
  .inspector-check-grid,
  .orchestration-actions,
  .decision-queue-actions,
  .decision-queue-secondary-actions {
    grid-template-columns: 1fr;
  }

  .workflow-canvas {
    height: 72vh;
  }
}
</style>