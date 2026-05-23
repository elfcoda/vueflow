import type { WorkflowNodeAttachmentPayload } from './types'

const WORKFLOW_NODE_ATTACHMENT_MIME = 'application/x-workflow-node-attachment'
let activeNodeAttachmentPayload: WorkflowNodeAttachmentPayload | null = null

export function useNodeAttachmentDrag() {
  function startNodeAttachmentDrag(
    event: DragEvent,
    payload: WorkflowNodeAttachmentPayload,
  ) {
    if (!event.dataTransfer) {
      return
    }

    const serializedPayload = JSON.stringify(payload)
    activeNodeAttachmentPayload = payload

    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.dropEffect = 'copy'
    event.dataTransfer.setData(WORKFLOW_NODE_ATTACHMENT_MIME, serializedPayload)
    event.dataTransfer.setData('text/plain', serializedPayload)
  }

  function clearNodeAttachmentDrag() {
    activeNodeAttachmentPayload = null
  }

  function hasNodeAttachmentPayload(event: DragEvent) {
    if (activeNodeAttachmentPayload) {
      return true
    }

    const transferTypes = event.dataTransfer?.types

    if (!transferTypes) {
      return false
    }

    return Array.from(transferTypes).includes(WORKFLOW_NODE_ATTACHMENT_MIME)
  }

  function getNodeAttachmentPayload(event: DragEvent) {
    if (activeNodeAttachmentPayload) {
      return activeNodeAttachmentPayload
    }

    const serializedPayload = event.dataTransfer?.getData(WORKFLOW_NODE_ATTACHMENT_MIME)

    if (!serializedPayload) {
      return null
    }

    try {
      const payload = JSON.parse(serializedPayload) as WorkflowNodeAttachmentPayload

      if (
        payload.kind === 'shape' ||
        payload.kind === 'icon'
      ) {
        return payload
      }
    } catch {
      return null
    }

    return null
  }

  return {
    startNodeAttachmentDrag,
    clearNodeAttachmentDrag,
    hasNodeAttachmentPayload,
    getNodeAttachmentPayload,
  }
}