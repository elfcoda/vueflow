export type WorkflowNodeKind = 'trigger' | 'action' | 'output' | 'sticky'
export type WorkflowNodeStatus = 'default' | 'success' | 'warning' | 'error'

export interface WorkflowNodeData {
  title: string
  subtitle: string
  icon: string
  kind: WorkflowNodeKind
  status?: WorkflowNodeStatus
  hint?: string
  note?: string
}

export interface WorkflowEdgeData {
  kind: 'main' | 'data'
  label: string
}