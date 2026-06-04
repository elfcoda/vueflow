export interface ControlPlaneProjectRegistryItem {
  project: string
  scope_path: string
  owner: string
  description: string
  prompt_hint: string
  tags: string[]
}

export interface ControlPlaneSnapshotResponse {
  ts: string
  project_scopes: string[]
  project_registry: ControlPlaneProjectRegistryItem[]
  work_items: Array<Record<string, unknown>>
  contracts: Array<Record<string, unknown>>
  dependency_edges: Array<Record<string, unknown>>
  decisions: Array<Record<string, unknown>>
}

export interface DelegateBatchItem {
  project: string
  task: string
}

export interface DelegateBatchResponse {
  ok: boolean
  message?: string
}

export interface DelegateBatchStatusResponse {
  ok: boolean
  batch_id: string
  status: string
}

export interface SchedulerTickResponse {
  ok: boolean
  result?: unknown
}

export interface ProjectAttributesResponse {
  ok: boolean
  project: string
  attributes: Record<string, unknown>
}

export interface DecisionQueueItem extends Record<string, unknown> {
  decision_id?: string
  work_item_id?: string
  decision_type?: string
  status?: string
  chosen_option?: string
}

export interface DecisionQueueResponse {
  ok: boolean
  generated_at: string
  count: number
  queue: DecisionQueueItem[]
}

export interface SubmitDecisionPayload {
  decisionId?: string
  workItemId: string
  decisionType: string
  status: 'approved' | 'rejected' | 'pending'
  chosenOption?: string
  rationale?: string
  options?: Array<Record<string, unknown>>
  metadata?: Record<string, unknown>
}

export interface SubmitDecisionResponse {
  ok: boolean
  decision: Record<string, unknown>
}

export interface WorkItemDegradationResponse {
  ok: boolean
  work_item: Record<string, unknown>
  decision_degradation: 'wait' | 'stub' | 'continue_partial'
}

export interface ControlPlaneClientOptions {
  apiBaseUrl?: string
  apiKey?: string
}

const defaultControlPlaneApiUrl = 'http://127.0.0.1:18790/api/control'

function normalizeApiBaseUrl(url?: string) {
  return (url?.trim() || defaultControlPlaneApiUrl).replace(/\/+$/, '')
}

function buildHeaders(apiKey?: string, contentType = false): Record<string, string> {
  const headers: Record<string, string> = {}

  if (apiKey?.trim()) {
    headers['X-Nanobot-API-Key'] = apiKey.trim()
  }

  if (contentType) {
    headers['Content-Type'] = 'application/json'
  }

  return headers
}

async function throwOnHttpError(response: Response) {
  if (response.ok) {
    return
  }

  const raw = await response.text()
  throw new Error(raw || `Request failed: ${response.status}`)
}

export async function fetchControlPlaneSnapshot(
  options?: ControlPlaneClientOptions,
): Promise<ControlPlaneSnapshotResponse> {
  const response = await fetch(`${normalizeApiBaseUrl(options?.apiBaseUrl)}/snapshot`, {
    method: 'GET',
    headers: buildHeaders(options?.apiKey),
  })

  await throwOnHttpError(response)
  return response.json() as Promise<ControlPlaneSnapshotResponse>
}

export async function delegateProjectsBatch(
  items: DelegateBatchItem[],
  options?: ControlPlaneClientOptions,
): Promise<DelegateBatchResponse> {
  const response = await fetch(`${normalizeApiBaseUrl(options?.apiBaseUrl)}/delegation/batch`, {
    method: 'POST',
    headers: buildHeaders(options?.apiKey, true),
    body: JSON.stringify({
      items,
      session_key: 'ui:parallel-demo',
      channel: 'workflow',
      chat_id: 'orchestration-dashboard',
    }),
  })

  await throwOnHttpError(response)
  return response.json() as Promise<DelegateBatchResponse>
}

export async function fetchDelegationBatchStatus(
  batchId: string,
  options?: ControlPlaneClientOptions,
): Promise<DelegateBatchStatusResponse> {
  const encodedBatchId = encodeURIComponent(batchId)
  const response = await fetch(`${normalizeApiBaseUrl(options?.apiBaseUrl)}/delegation/batch/${encodedBatchId}`, {
    method: 'GET',
    headers: buildHeaders(options?.apiKey),
  })

  await throwOnHttpError(response)
  return response.json() as Promise<DelegateBatchStatusResponse>
}

export async function schedulerTick(options?: ControlPlaneClientOptions): Promise<SchedulerTickResponse> {
  const response = await fetch(`${normalizeApiBaseUrl(options?.apiBaseUrl)}/workflow/manage`, {
    method: 'POST',
    headers: buildHeaders(options?.apiKey, true),
    body: JSON.stringify({
      entity: 'scheduler',
      action: 'tick',
      fields: {},
      filters: {},
    }),
  })

  await throwOnHttpError(response)
  return response.json() as Promise<SchedulerTickResponse>
}

export async function setProjectRuntimeAttributes(
  project: string,
  attributes: Record<string, unknown>,
  options?: ControlPlaneClientOptions,
): Promise<ProjectAttributesResponse> {
  const encodedProject = encodeURIComponent(project)
  const response = await fetch(
    `${normalizeApiBaseUrl(options?.apiBaseUrl)}/projects/${encodedProject}/attributes`,
    {
      method: 'PUT',
      headers: buildHeaders(options?.apiKey, true),
      body: JSON.stringify({ attributes }),
    },
  )

  await throwOnHttpError(response)
  return response.json() as Promise<ProjectAttributesResponse>
}

export async function fetchDecisionQueue(
  limit = 100,
  options?: ControlPlaneClientOptions,
): Promise<DecisionQueueResponse> {
  const safeLimit = Math.max(1, Math.min(limit, 500))
  const response = await fetch(`${normalizeApiBaseUrl(options?.apiBaseUrl)}/decisions/queue?limit=${safeLimit}`, {
    method: 'GET',
    headers: buildHeaders(options?.apiKey),
  })

  await throwOnHttpError(response)
  return response.json() as Promise<DecisionQueueResponse>
}

export async function submitDecision(
  payload: SubmitDecisionPayload,
  options?: ControlPlaneClientOptions,
): Promise<SubmitDecisionResponse> {
  const response = await fetch(`${normalizeApiBaseUrl(options?.apiBaseUrl)}/commands/decisions/submit`, {
    method: 'POST',
    headers: buildHeaders(options?.apiKey, true),
    body: JSON.stringify({
      decision_id: payload.decisionId,
      work_item_id: payload.workItemId,
      decision_type: payload.decisionType,
      status: payload.status,
      chosen_option: payload.chosenOption || '',
      decider: 'human',
      rationale: payload.rationale || '',
      options: payload.options || [],
      metadata: payload.metadata || {},
    }),
  })

  await throwOnHttpError(response)
  return response.json() as Promise<SubmitDecisionResponse>
}

export async function updateWorkItemDecisionDegradation(
  workItemId: string,
  mode: 'wait' | 'stub' | 'continue_partial',
  options?: ControlPlaneClientOptions,
): Promise<WorkItemDegradationResponse> {
  const encodedWorkItemId = encodeURIComponent(workItemId)
  const response = await fetch(
    `${normalizeApiBaseUrl(options?.apiBaseUrl)}/commands/work-items/${encodedWorkItemId}/decision-degradation`,
    {
      method: 'POST',
      headers: buildHeaders(options?.apiKey, true),
      body: JSON.stringify({
        decision_degradation: mode,
      }),
    },
  )

  await throwOnHttpError(response)
  return response.json() as Promise<WorkItemDegradationResponse>
}

export async function getProjectRuntimeAttributes(
  project: string,
  options?: ControlPlaneClientOptions,
): Promise<ProjectAttributesResponse> {
  const encodedProject = encodeURIComponent(project)
  const response = await fetch(
    `${normalizeApiBaseUrl(options?.apiBaseUrl)}/projects/${encodedProject}/attributes`,
    {
      method: 'GET',
      headers: buildHeaders(options?.apiKey),
    },
  )

  await throwOnHttpError(response)
  return response.json() as Promise<ProjectAttributesResponse>
}

export interface ChatMessagePayload {
  content: string
  session_id?: string
}

export interface ChatMessageResponse {
  ok: boolean
  reply: string
}

export async function sendChatMessage(
  payload: ChatMessagePayload,
  options?: ControlPlaneClientOptions,
): Promise<ChatMessageResponse> {
  const response = await fetch(`${normalizeApiBaseUrl(options?.apiBaseUrl)}/chat`, {
    method: 'POST',
    headers: buildHeaders(options?.apiKey, true),
    body: JSON.stringify(payload),
  })

  await throwOnHttpError(response)
  return response.json() as Promise<ChatMessageResponse>
}
