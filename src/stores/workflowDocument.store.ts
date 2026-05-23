import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ViewportTransform } from '@vue-flow/core'
import {
  createDefaultWorkflowDocument,
  isWorkflowDocumentData,
  WORKFLOW_DOCUMENT_STORAGE_KEY,
  type WorkflowCanvasEdge,
  type WorkflowCanvasNode,
  type WorkflowDocumentData,
  type WorkflowTheme,
} from '../components/editor/document'
import type { WorkflowNodeAttachmentPayload } from '../components/editor/types'
import { createWorkflowGraphExport, type WorkflowGraphExportData } from '../services/workflowGraph'
import { applyWorkflowNodeContentPush } from '../services/workflowGraphPush'
import { applyWorkflowNodeAttachmentToData } from '../components/editor/nodeAttachmentCatalog'

export const useWorkflowDocumentStore = defineStore('workflow-document', () => {
  const initialDocument = createDefaultWorkflowDocument()

  const theme = ref<WorkflowTheme>(initialDocument.theme)
  const nodes = ref<WorkflowCanvasNode[]>(initialDocument.nodes)
  const edges = ref<WorkflowCanvasEdge[]>(initialDocument.edges)
  const viewport = ref<ViewportTransform>(initialDocument.viewport)
  const isHydrated = ref(false)

  function replaceDocument(nextDocument: WorkflowDocumentData) {
    const snapshot = JSON.parse(JSON.stringify(nextDocument)) as WorkflowDocumentData

    theme.value = snapshot.theme
    nodes.value = snapshot.nodes
    edges.value = snapshot.edges
    viewport.value = snapshot.viewport
  }

  function serialize(): WorkflowDocumentData {
    const snapshot = {
      theme: theme.value as WorkflowTheme,
      nodes: nodes.value as WorkflowCanvasNode[],
      edges: edges.value as WorkflowCanvasEdge[],
      viewport: viewport.value as ViewportTransform,
    }

    return JSON.parse(JSON.stringify(snapshot)) as WorkflowDocumentData
  }

  function serializeGraph(): WorkflowGraphExportData {
    return createWorkflowGraphExport(serialize())
  }

  function persist() {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(WORKFLOW_DOCUMENT_STORAGE_KEY, JSON.stringify(serialize()))
  }

  function hydrate() {
    const fallbackDocument = createDefaultWorkflowDocument()

    if (typeof window === 'undefined') {
      replaceDocument(fallbackDocument)
      isHydrated.value = true
      return
    }

    const rawDocument = window.localStorage.getItem(WORKFLOW_DOCUMENT_STORAGE_KEY)

    if (!rawDocument) {
      replaceDocument(fallbackDocument)
      isHydrated.value = true
      return
    }

    try {
      const parsedDocument = JSON.parse(rawDocument) as unknown

      if (isWorkflowDocumentData(parsedDocument)) {
        replaceDocument(parsedDocument)
      } else {
        replaceDocument(fallbackDocument)
      }
    } catch {
      replaceDocument(fallbackDocument)
    }

    isHydrated.value = true
  }

  function reset() {
    replaceDocument(createDefaultWorkflowDocument())
    persist()
  }

  function setTheme(nextTheme: WorkflowTheme) {
    theme.value = nextTheme
  }

  function setViewport(nextViewport: ViewportTransform) {
    viewport.value = {
      x: nextViewport.x,
      y: nextViewport.y,
      zoom: nextViewport.zoom,
    }
  }

  function upsertNodeContentWidget(nodeId: string, content: string) {
    return applyWorkflowNodeContentPush(nodes.value, { nodeId, content })
  }

  function applyNodeAttachment(nodeId: string, payload: WorkflowNodeAttachmentPayload) {
    for (const node of nodes.value) {
      if (node.id !== nodeId || node.type !== 'workflow' || !node.data) {
        continue
      }

      node.data = applyWorkflowNodeAttachmentToData(node.data, payload)
      return true
    }

    return false
  }

  function markFirstTriggerNodeUnread() {
    for (const node of nodes.value) {
      if (node.type !== 'workflow' || node.data?.kind !== 'trigger' || !node.data) {
        continue
      }

      node.data = {
        ...node.data,
        messageBadge: {
          hasUnread: true,
        },
      }

      return true
    }

    return false
  }

  function clearFirstTriggerNodeUnread() {
    for (const node of nodes.value) {
      if (node.type !== 'workflow' || node.data?.kind !== 'trigger' || !node.data) {
        continue
      }

      node.data = {
        ...node.data,
        messageBadge: {
          hasUnread: false,
        },
      }

      return true
    }

    return false
  }

  watch([theme, nodes, edges, viewport], () => {
    if (isHydrated.value) {
      persist()
    }
  }, { deep: true })

  return {
    theme,
    nodes,
    edges,
    viewport,
    isHydrated,
    hydrate,
    persist,
    reset,
    serialize,
    serializeGraph,
    replaceDocument,
    setTheme,
    setViewport,
    upsertNodeContentWidget,
    applyNodeAttachment,
    markFirstTriggerNodeUnread,
    clearFirstTriggerNodeUnread,
  }
})