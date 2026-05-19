import type { WorkflowEdgeData } from '../components/editor/types'
import type { WorkflowCanvasEdge, WorkflowCanvasNode, WorkflowDocumentData } from '../components/editor/document'

export interface WorkflowGraphExportNode {
  id: WorkflowCanvasNode['id']
  type: WorkflowCanvasNode['type']
  data: WorkflowCanvasNode['data']
  events?: WorkflowCanvasNode['events']
}

export interface WorkflowGraphExportEdge {
  id: WorkflowCanvasEdge['id']
  type: WorkflowCanvasEdge['type']
  source: WorkflowCanvasEdge['source']
  target: WorkflowCanvasEdge['target']
  data: WorkflowCanvasEdge['data']
  events?: WorkflowCanvasEdge['events']
  label?: WorkflowCanvasEdge['label'] | WorkflowEdgeData['label']
}

export interface WorkflowGraphExportData {
  nodes: WorkflowGraphExportNode[]
  edges: WorkflowGraphExportEdge[]
}

export function createWorkflowGraphExport(document: WorkflowDocumentData): WorkflowGraphExportData {
  return {
    nodes: document.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      data: node.data,
      events: node.events,
    })),
    edges: document.edges.map((edge) => ({
      id: edge.id,
      type: edge.type,
      source: edge.source,
      target: edge.target,
      data: edge.data,
      events: edge.events,
      label: edge.label ?? edge.data?.label,
    })),
  }
}