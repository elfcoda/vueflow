import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultWorkflowDocument } from '../components/editor/document'
import { useWorkflowDocumentStore } from '../stores/workflowDocument.store'
import { createPinia, setActivePinia } from 'pinia'
import {
  applyWorkflowNodeContentPush,
  createWorkflowNodeContentWidget,
} from './workflowGraphPush'

describe('workflowGraph push service', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('builds a content widget payload', () => {
    const widget = createWorkflowNodeContentWidget('mock content')

    expect(widget.content).toBe('mock content')
    expect(widget.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('attaches pushed content to the matched node', () => {
    const document = createDefaultWorkflowDocument()
    const updated = applyWorkflowNodeContentPush(document.nodes, {
      nodeId: 'action-1',
      content: 'backend content',
    })

    const targetNode = document.nodes.find((node) => node.id === 'action-1')

    expect(updated).toBe(true)
    expect(targetNode?.data?.contentWidget?.content).toBe('backend content')
  })

  it('stores pushed widget data through the workflow store', () => {
    const store = useWorkflowDocumentStore()
    store.replaceDocument(createDefaultWorkflowDocument())

    const updated = store.upsertNodeContentWidget('action-1', 'stored content')
    const serialized = store.serialize()
    const targetNode = serialized.nodes.find((node) => node.id === 'action-1')

    expect(updated).toBe(true)
    expect(targetNode?.data?.contentWidget?.content).toBe('stored content')
    expect(targetNode?.data?.contentWidget?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns false when the target node is missing', () => {
    const store = useWorkflowDocumentStore()
    store.replaceDocument(createDefaultWorkflowDocument())

    const updated = store.upsertNodeContentWidget('missing-node', 'ignored')

    expect(updated).toBe(false)
  })
})