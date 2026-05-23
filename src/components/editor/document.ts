import { MarkerType, Position, type Edge, type Node, type ViewportTransform } from '@vue-flow/core'
import type { WorkflowEdgeData, WorkflowNodeData } from './types'

export type WorkflowTheme = 'light' | 'dark'
export type WorkflowCanvasNode = Node<WorkflowNodeData>
export type WorkflowCanvasEdge = Edge<WorkflowEdgeData>

export interface WorkflowDocumentData {
  theme: WorkflowTheme
  nodes: WorkflowCanvasNode[]
  edges: WorkflowCanvasEdge[]
  viewport: ViewportTransform
}

export const WORKFLOW_DOCUMENT_STORAGE_KEY = 'vueflow:workflow-document:v1'

export function createDefaultWorkflowDocument(): WorkflowDocumentData {
  return {
    theme: 'dark',
    nodes: [
      {
        id: 'trigger-1',
        type: 'workflow',
        position: { x: 60, y: 180 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          title: 'Webhook Trigger',
          subtitle: '监听外部事件并启动流程',
          icon: 'WB',
          kind: 'trigger',
          attachments: {
            shape: 'trigger',
            icon: 'webhook-icon',
          },
          status: 'success',
          hint: 'POST /lead-capture',
        },
      },
      {
        id: 'action-1',
        type: 'workflow',
        position: { x: 360, y: 180 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          title: 'Transform Payload',
          subtitle: '清洗请求体并映射字段',
          icon: 'FX',
          kind: 'action',
          attachments: {
            shape: 'default',
            icon: 'open-ai',
          },
          status: 'warning',
          hint: 'Normalize name, email, tags',
        },
      },
      {
        id: 'output-1',
        type: 'workflow',
        position: { x: 660, y: 180 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          title: 'CRM Sync',
          subtitle: '将结果写入外部系统',
          icon: 'DB',
          kind: 'output',
          attachments: {
            shape: 'pill',
            icon: 'n8n-logo',
          },
          status: 'default',
          hint: 'Create or update contact',
        },
      },
      {
        id: 'note-1',
        type: 'sticky',
        draggable: true,
        position: { x: 360, y: 24 },
        data: {
          title: 'Release Note',
          subtitle: '和真实 n8n 一样，便签节点常用来标记流程意图。',
          icon: 'NT',
          kind: 'sticky',
          note: '先保留一个轻量前端版本，后续再补节点配置面板与执行态。',
        },
      },
    ],
    edges: [
      {
        id: 'trigger-action',
        source: 'trigger-1',
        target: 'action-1',
        type: 'workflow',
        markerEnd: MarkerType.ArrowClosed,
        data: { kind: 'main', label: 'Main' },
      },
      {
        id: 'action-output',
        source: 'action-1',
        target: 'output-1',
        type: 'workflow',
        markerEnd: MarkerType.ArrowClosed,
        data: { kind: 'data', label: 'Data' },
      },
    ],
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
  }
}

export function cloneWorkflowDocument(document: WorkflowDocumentData): WorkflowDocumentData {
  return JSON.parse(JSON.stringify(document)) as WorkflowDocumentData
}

export function isWorkflowDocumentData(value: unknown): value is WorkflowDocumentData {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<WorkflowDocumentData>

  return (
    (candidate.theme === 'light' || candidate.theme === 'dark') &&
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    !!candidate.viewport &&
    typeof candidate.viewport.x === 'number' &&
    typeof candidate.viewport.y === 'number' &&
    typeof candidate.viewport.zoom === 'number'
  )
}