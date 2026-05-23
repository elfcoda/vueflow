import type {
  WorkflowNodeAttachmentPayload,
  WorkflowNodeData,
  WorkflowNodeIconAssetId,
  WorkflowNodeShape,
} from './types'

export interface WorkflowNodeShapeOption {
  kind: 'shape'
  optionId: WorkflowNodeShape
  label: string
  description: string
  previewClass: string
}

export interface WorkflowNodeIconOption {
  kind: 'icon'
  optionId: WorkflowNodeIconAssetId
  label: string
  description: string
  assetSrc: string
}

const iconAssetUrlMap: Record<WorkflowNodeIconAssetId, string> = {
  'webhook-icon': new URL(
    '../../../../n8n/packages/frontend/editor-ui/public/static/webhook-icon.svg',
    import.meta.url,
  ).href,
  'open-ai': new URL(
    '../../../../n8n/packages/frontend/editor-ui/public/static/open-ai.svg',
    import.meta.url,
  ).href,
  'n8n-logo': new URL(
    '../../../../n8n/packages/frontend/editor-ui/public/static/n8n-logo.png',
    import.meta.url,
  ).href,
  'form-grey': new URL(
    '../../../../n8n/packages/frontend/editor-ui/public/static/form-grey.svg',
    import.meta.url,
  ).href,
}

export const workflowNodeShapeOptions: WorkflowNodeShapeOption[] = [
  {
    kind: 'shape',
    optionId: 'default',
    label: 'Card',
    description: '标准卡片节点',
    previewClass: 'preview-default',
  },
  {
    kind: 'shape',
    optionId: 'trigger',
    label: 'Trigger',
    description: 'n8n 风格触发节点轮廓',
    previewClass: 'preview-trigger',
  },
  {
    kind: 'shape',
    optionId: 'pill',
    label: 'Config',
    description: '胶囊型配置节点',
    previewClass: 'preview-pill',
  },
  {
    kind: 'shape',
    optionId: 'bevel',
    label: 'Bevel',
    description: '不规则斜切轮廓',
    previewClass: 'preview-bevel',
  },
]

export const workflowNodeIconOptions: WorkflowNodeIconOption[] = [
  {
    kind: 'icon',
    optionId: 'webhook-icon',
    label: 'Webhook',
    description: '来自 n8n static/webhook-icon.svg',
    assetSrc: iconAssetUrlMap['webhook-icon'],
  },
  {
    kind: 'icon',
    optionId: 'open-ai',
    label: 'OpenAI',
    description: '来自 n8n static/open-ai.svg',
    assetSrc: iconAssetUrlMap['open-ai'],
  },
  {
    kind: 'icon',
    optionId: 'n8n-logo',
    label: 'n8n',
    description: '来自 n8n static/n8n-logo.png',
    assetSrc: iconAssetUrlMap['n8n-logo'],
  },
  {
    kind: 'icon',
    optionId: 'form-grey',
    label: 'Form',
    description: '来自 n8n static/form-grey.svg',
    assetSrc: iconAssetUrlMap['form-grey'],
  },
]

export function getWorkflowNodeIconAssetSrc(iconAssetId?: WorkflowNodeIconAssetId) {
  if (!iconAssetId) {
    return undefined
  }

  return iconAssetUrlMap[iconAssetId]
}

export function applyWorkflowNodeAttachmentToData(
  data: WorkflowNodeData,
  payload: WorkflowNodeAttachmentPayload,
) {
  const nextData: WorkflowNodeData = {
    ...data,
    attachments: {
      ...data.attachments,
    },
  }

  if (payload.kind === 'shape') {
    nextData.shape = payload.optionId
    nextData.attachments = {
      ...nextData.attachments,
      shape: payload.optionId,
    }
  }

  if (payload.kind === 'icon') {
    nextData.iconAssetId = payload.optionId
    nextData.attachments = {
      ...nextData.attachments,
      icon: payload.optionId,
    }
  }

  return nextData
}