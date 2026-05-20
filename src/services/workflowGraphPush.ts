import type { WorkflowNodeContentWidgetData, WorkflowNodeData } from '../components/editor/types'

export interface WorkflowNodeContentPushPayload {
  nodeId: string
  content: string
}

interface WorkflowNodeWithContentTarget {
  id: string
  data?: WorkflowNodeData & {
    contentWidget?: WorkflowNodeContentWidgetData
  }
}

export function createWorkflowNodeContentWidget(content: string): WorkflowNodeContentWidgetData {
  return {
    content,
    updatedAt: new Date().toISOString(),
  }
}

export function applyWorkflowNodeContentPush(
  targetNodes: WorkflowNodeWithContentTarget[],
  payload: WorkflowNodeContentPushPayload,
) {
  const targetNode = targetNodes.find((node) => node.id === payload.nodeId)

  if (!targetNode || !targetNode.data) {
    return false
  }

  targetNode.data = {
    ...targetNode.data,
    contentWidget: createWorkflowNodeContentWidget(payload.content),
  }

  return true
}