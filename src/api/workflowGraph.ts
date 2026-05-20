import type { WorkflowGraphExportData } from '../services/workflowGraph'

const defaultWorkflowGraphApiUrl = 'http://127.0.0.1:8000/api/workflow-graph'
const defaultWorkflowGraphEventsUrl = 'http://127.0.0.1:8000/api/workflow-graph/events'

export interface WorkflowGraphPushMessage<TPayload = unknown> {
  event: string
  data: TPayload
  raw: MessageEvent<string>
}

export interface WorkflowGraphPushTransport {
  onmessage: ((event: MessageEvent<string>) => void) | null
  onerror: ((event: Event) => void) | null
  close: () => void
}

export interface WorkflowGraphPushSubscription {
  close: () => void
}

export interface WorkflowGraphPushSubscribeOptions {
  url?: string
  createEventSource?: (url: string) => WorkflowGraphPushTransport
}

function resolveWorkflowGraphApiUrl() {
  return import.meta.env.VITE_WORKFLOW_GRAPH_API_URL?.trim() || defaultWorkflowGraphApiUrl
}

function resolveWorkflowGraphEventsUrl() {
  return import.meta.env.VITE_WORKFLOW_GRAPH_EVENTS_URL?.trim() || defaultWorkflowGraphEventsUrl
}

export async function sendWorkflowGraphToBackend(payload: WorkflowGraphExportData) {
  const response = await fetch(resolveWorkflowGraphApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const responseText = await response.text()
    throw new Error(responseText || `Request failed with status ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

export function subscribeWorkflowGraphPush<TPayload = unknown>(
  onMessage: (message: WorkflowGraphPushMessage<TPayload>) => void,
  onError?: (error: Event) => void,
  options?: WorkflowGraphPushSubscribeOptions,
) {
  const eventSource = options?.createEventSource?.(options.url ?? resolveWorkflowGraphEventsUrl())
    ?? new EventSource(options?.url ?? resolveWorkflowGraphEventsUrl())

  eventSource.onmessage = (event) => {
    let parsedData: TPayload

    try {
      parsedData = JSON.parse(event.data) as TPayload
    } catch {
      parsedData = event.data as TPayload
    }

    onMessage({
      event: 'message',
      data: parsedData,
      raw: event,
    })
  }

  eventSource.onerror = (error) => {
    onError?.(error)
  }

  return {
    close: () => {
      eventSource.close()
    },
  } satisfies WorkflowGraphPushSubscription
}