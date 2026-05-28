# Parallel Coding Agent Orchestration Demo

This frontend demo visualizes a Core Agent orchestrating isolated Project Agents in parallel, with a human-in-the-loop decision console.

## Key capabilities

- Core Agent + multiple Project Agent topology on Vue Flow canvas
- Parallel delegation view with per-agent runtime states (queued/running/blocked/done/error)
- Live event stream panel for ongoing decisions instead of waiting for one long conversation turn
- Per-project attributes editor (mode/output/constraints/isolation/decision policy/prompt suffix)
- Runtime attribute push to nanobot control plane
- Scheduler tick and snapshot controls for orchestration loops
- Configurable module template for dynamic project-agent blueprint generation
- Decision Queue card with human approve/reject/degrade actions
- Fine-grained WS semantic mapping for contract wait/resume, decision queue, and batch status
- Workflow WebSocket stream support (`subscribe` with cursor resume)
- Mock mode for local UI-only demo without backend

## Quick start

```bash
npm install
npm run dev
```

Open the page and use the left panel section: `Decision Console`.

## Demo flow

1. Click `加载并行蓝图` to create Core + Project agents.
2. Keep mode as `Mock` for immediate front-end simulation.
3. Click `并行委托全部模块` and then `Scheduler Tick`.
4. Edit module template lines and re-click `加载并行蓝图` to regenerate topology.
5. Watch runtime list and event stream update continuously.
5. Select a node and open `Subagent` tab to edit project attributes and prompt.

## Nanobot backend integration

Switch mode to `Nanobot` and set addresses in the console:

- Control API: `http://127.0.0.1:18790/api/control`
- Workflow WS: `ws://127.0.0.1:18791/workflow`
- API key: optional (`X-Nanobot-API-Key`)

Supported control plane calls in this demo:

- `GET /snapshot`
- `POST /delegation/batch`
- `GET /delegation/batch/{batch_id}`
- `POST /workflow/manage` with `scheduler tick`
- `PUT /projects/{project}/attributes`
- `GET /decisions/queue`
- `POST /commands/decisions/submit`
- `POST /commands/work-items/{work_item_id}/decision-degradation`

The WebSocket client sends:

```json
{
	"type": "subscribe",
	"event_types": [],
	"since_cursor": 0
}
```

and consumes workflow events for UI runtime updates.

## Build and test

```bash
npm run build
npm test
```
