import { describe, expect, it, vi } from 'vitest'
import type { WorkflowGraphExportData } from '../services/workflowGraph'
import {
  sendWorkflowGraphToBackend,
  subscribeWorkflowGraphPush,
  type WorkflowGraphPushTransport,
} from './workflowGraph'

class MockPushTransport implements WorkflowGraphPushTransport {
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  closed = false

  emitMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>)
  }

  emitError(error: Event) {
    this.onerror?.(error)
  }

  close() {
    this.closed = true
  }
}

describe('workflowGraph api', () => {
  it('parses pushed json payloads from subscribeWorkflowGraphPush', () => {
    const transport = new MockPushTransport()
    const onMessage = vi.fn()

    subscribeWorkflowGraphPush(onMessage, undefined, {
      createEventSource: () => transport,
    })

    transport.emitMessage(JSON.stringify({ nodeId: 'action-1', content: 'hello' }))

    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'message',
        data: {
          nodeId: 'action-1',
          content: 'hello',
        },
      }),
    )
  })

  it('closes the push subscription', () => {
    const transport = new MockPushTransport()
    const subscription = subscribeWorkflowGraphPush(() => undefined, undefined, {
      createEventSource: () => transport,
    })

    subscription.close()

    expect(transport.closed).toBe(true)
  })

  it('posts workflow graph payloads to the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({ status: 'ok' }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const payload: WorkflowGraphExportData = {
      nodes: [{
        id: 'action-1',
        type: 'workflow',
        data: {
          title: 'Action 1',
          subtitle: 'Mock subtitle',
          icon: 'A1',
          kind: 'action',
        },
      }],
      edges: [],
    }

    const result = await sendWorkflowGraphToBackend(payload)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/workflow-graph',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )
    expect(result).toEqual({ status: 'ok' })

    vi.unstubAllGlobals()
  })
})