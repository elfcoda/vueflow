import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { ViewportTransform } from '@vue-flow/core'
import {
  createDefaultWorkflowDocument,
  isWorkflowDocumentData,
  serializeWorkflowGraph,
  WORKFLOW_DOCUMENT_STORAGE_KEY,
  type WorkflowCanvasEdge,
  type WorkflowCanvasNode,
  type WorkflowDocumentData,
  type WorkflowGraphExportData,
  type WorkflowTheme,
} from '../components/editor/document'

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
    return serializeWorkflowGraph(serialize())
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
  }
})