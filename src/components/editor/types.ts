export type WorkflowNodeKind = 'trigger' | 'action' | 'output' | 'sticky'
export type WorkflowNodeStatus = 'default' | 'success' | 'warning' | 'error'
export type WorkflowNodeShape = 'default' | 'trigger' | 'pill' | 'bevel'
export type WorkflowNodeIconAssetId = 'webhook-icon' | 'open-ai' | 'n8n-logo' | 'form-grey'
export type WorkflowNodeAttachmentKind = 'shape' | 'icon'

export interface WorkflowNodeAttachments {
  shape?: WorkflowNodeShape
  icon?: WorkflowNodeIconAssetId
}

export type WorkflowNodeAttachmentPayload =
  | {
      kind: 'shape'
      optionId: WorkflowNodeShape
    }
  | {
      kind: 'icon'
      optionId: WorkflowNodeIconAssetId
    }

export interface WorkflowNodeContentWidgetData {
  content: string
  updatedAt: string
}

export interface WorkflowNodeMessageBadgeData {
  hasUnread: boolean
}

export interface WorkflowNodeData {
  title: string
  subtitle: string
  icon: string
  kind: WorkflowNodeKind
  attachments?: WorkflowNodeAttachments
  status?: WorkflowNodeStatus
  hint?: string
  note?: string
  contentWidget?: WorkflowNodeContentWidgetData
  messageBadge?: WorkflowNodeMessageBadgeData
  pendingDecisionPayload?: string
  pendingDecisionAnswer?: string
  pendingDecisionMetadataType?: string
  pendingDecisionProjectId?: string
}

export interface WorkflowEdgeData {
  kind: 'main' | 'data'
  label: string
  flow?: boolean
}