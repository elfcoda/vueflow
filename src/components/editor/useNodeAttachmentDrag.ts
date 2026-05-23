import type { WorkflowNodeAttachmentPayload } from './types'

const WORKFLOW_NODE_ATTACHMENT_MIME = 'application/x-workflow-node-attachment'
let activeNodeAttachmentPayload: WorkflowNodeAttachmentPayload | null = null
let activeDragPreviewElement: HTMLDivElement | null = null

interface NodeAttachmentDragPreviewOptions {
  label: string
  description: string
  iconSrc?: string
  shapeId?: string
}

export function useNodeAttachmentDrag() {
  function startNodeAttachmentDrag(
    event: DragEvent,
    payload: WorkflowNodeAttachmentPayload,
    previewOptions?: NodeAttachmentDragPreviewOptions,
  ) {
    if (!event.dataTransfer) {
      return
    }

    const serializedPayload = JSON.stringify(payload)
    activeNodeAttachmentPayload = payload
    cleanupDragPreviewElement()

    if (previewOptions) {
      const dragPreviewElement = createDragPreviewElement(payload.kind, previewOptions)

      activeDragPreviewElement = dragPreviewElement
      document.body.appendChild(dragPreviewElement)
      event.dataTransfer.setDragImage(dragPreviewElement, 24, 24)
    }

    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.dropEffect = 'copy'
    event.dataTransfer.setData(WORKFLOW_NODE_ATTACHMENT_MIME, serializedPayload)
    event.dataTransfer.setData('text/plain', serializedPayload)
  }

  function clearNodeAttachmentDrag() {
    activeNodeAttachmentPayload = null
    cleanupDragPreviewElement()
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

function cleanupDragPreviewElement() {
  activeDragPreviewElement?.remove()
  activeDragPreviewElement = null
}

function createDragPreviewElement(
  attachmentKind: WorkflowNodeAttachmentPayload['kind'],
  previewOptions: NodeAttachmentDragPreviewOptions,
) {
  const wrapper = document.createElement('div')
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.style.position = 'fixed'
  wrapper.style.top = '-1000px'
  wrapper.style.left = '-1000px'
  wrapper.style.display = 'inline-flex'
  wrapper.style.alignItems = 'center'
  wrapper.style.gap = '12px'
  wrapper.style.padding = '12px 14px'
  wrapper.style.borderRadius = '18px'
  wrapper.style.border = '1px solid rgba(255, 109, 58, 0.28)'
  wrapper.style.background = 'linear-gradient(135deg, rgba(23, 31, 44, 0.96), rgba(31, 43, 60, 0.94))'
  wrapper.style.boxShadow = '0 18px 42px rgba(15, 23, 42, 0.26)'
  wrapper.style.backdropFilter = 'blur(14px)'
  wrapper.style.color = '#f8fafc'
  wrapper.style.minWidth = '204px'
  wrapper.style.fontFamily = "'Segoe UI', 'PingFang SC', sans-serif"
  wrapper.style.pointerEvents = 'none'

  const media = document.createElement('div')
  media.style.width = '42px'
  media.style.height = '42px'
  media.style.display = 'inline-flex'
  media.style.alignItems = 'center'
  media.style.justifyContent = 'center'
  media.style.background = 'linear-gradient(180deg, rgba(255, 109, 58, 0.24), rgba(255, 109, 58, 0.12))'
  media.style.border = '1px solid rgba(255, 255, 255, 0.08)'
  media.style.borderRadius = '14px'
  media.style.flex = '0 0 auto'

  if (attachmentKind === 'icon' && previewOptions.iconSrc) {
    const image = document.createElement('img')
    image.src = previewOptions.iconSrc
    image.alt = previewOptions.label
    image.style.width = '22px'
    image.style.height = '22px'
    image.style.objectFit = 'contain'
    media.appendChild(image)
  } else {
    const shape = document.createElement('span')
    shape.style.width = '24px'
    shape.style.height = '24px'
    shape.style.display = 'inline-block'
    shape.style.background = 'linear-gradient(180deg, #ff8b61, #ff6d3a)'
    shape.style.boxShadow = 'inset 0 1px 0 rgba(255, 255, 255, 0.25)'

    if (previewOptions.shapeId === 'trigger') {
      shape.style.borderRadius = '16px 8px 8px 16px'
    } else if (previewOptions.shapeId === 'pill') {
      shape.style.borderRadius = '999px'
    } else if (previewOptions.shapeId === 'bevel') {
      shape.style.borderRadius = '12px 4px 12px 4px'
    } else {
      shape.style.borderRadius = '8px'
    }

    media.appendChild(shape)
  }

  const copy = document.createElement('div')
  copy.style.display = 'grid'
  copy.style.gap = '3px'

  const badge = document.createElement('span')
  badge.textContent = attachmentKind === 'icon' ? 'Attach Icon' : 'Attach Shape'
  badge.style.display = 'inline-flex'
  badge.style.width = 'fit-content'
  badge.style.padding = '3px 8px'
  badge.style.borderRadius = '999px'
  badge.style.background = 'rgba(255, 109, 58, 0.16)'
  badge.style.color = '#ffb39a'
  badge.style.fontSize = '10px'
  badge.style.letterSpacing = '0.12em'
  badge.style.textTransform = 'uppercase'
  badge.style.fontWeight = '700'

  const title = document.createElement('strong')
  title.textContent = previewOptions.label
  title.style.fontSize = '14px'
  title.style.lineHeight = '1.2'
  title.style.fontWeight = '700'

  const description = document.createElement('span')
  description.textContent = previewOptions.description
  description.style.fontSize = '12px'
  description.style.lineHeight = '1.35'
  description.style.color = 'rgba(226, 232, 240, 0.78)'

  copy.appendChild(badge)
  copy.appendChild(title)
  copy.appendChild(description)

  wrapper.appendChild(media)
  wrapper.appendChild(copy)

  return wrapper
}