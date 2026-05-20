export type WorkflowNodeKind = 'trigger' | 'action' | 'output' | 'sticky'
export type WorkflowNodeStatus = 'default' | 'success' | 'warning' | 'error'

export interface WorkflowNodeContentWidgetData {
  content: string
  updatedAt: string
}

export interface WorkflowNodeData {
  title: string
  subtitle: string
  icon: string
  kind: WorkflowNodeKind
  status?: WorkflowNodeStatus
  hint?: string
  note?: string
  contentWidget?: WorkflowNodeContentWidgetData
}

export interface WorkflowEdgeData {
  kind: 'main' | 'data'
  label: string
}