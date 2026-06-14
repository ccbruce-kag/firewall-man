import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { getApiBase } from '../../../utils/api'

type Trigger = 'manual' | 'schedule' | 'webhook' | 'event'
type Status = 'active' | 'paused' | 'draft' | 'archived'

export type WorkflowRecord = {
  id: number
  name: string
  description: string
  trigger: string
  status: string
  nodes_json: string
  edges_json: string
  viewport_json: string | null
  created_at: string
  updated_at: string
}

export type WorkflowEditorHandle = {
  open: (record: WorkflowRecord | null) => void
  close: () => void
}

type Props = {
  onSaved: () => void
}

type NodeKind = 'start' | 'trigger' | 'condition' | 'action' | 'notify' | 'wait' | 'end' | 'finish'

const NODE_KINDS: { kind: NodeKind; label: string; color: string; icon: string }[] = [
  { kind: 'start',     label: '開始',  color: '#22c55e', icon: 'bx-play'          },
  { kind: 'trigger',   label: '觸發',  color: '#a78bfa', icon: 'bx-play-circle'   },
  { kind: 'condition', label: '條件',  color: '#60a5fa', icon: 'bx-help-circle'   },
  { kind: 'action',    label: '動作',  color: '#fbbf24', icon: 'bx-cog'           },
  { kind: 'notify',    label: '通知',  color: '#34d399', icon: 'bx-bell'          },
  { kind: 'wait',      label: '等待',  color: '#94a3b8', icon: 'bx-time'          },
  { kind: 'end',       label: '例外',  color: '#f87171', icon: 'bx-error-circle'  },
  { kind: 'finish',    label: '結束',  color: '#0ea5e9', icon: 'bx-stop-circle'   },
]

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300, 400]

type NodeData = {
  kind: NodeKind
  label: string
  description: string
  config: string
}

function makeNode(kind: NodeKind, position: { x: number; y: number }, index: number): Node<NodeData> {
  const def = NODE_KINDS.find((d) => d.kind === kind) || NODE_KINDS[0]
  return {
    id: `${kind}-${Date.now()}-${index}`,
    type: 'workflow',
    position,
    data: { kind, label: def.label, description: '', config: '{}' },
  }
}

async function workflowApi(path: string, options: RequestInit = {}) {
  const base = getApiBase()
  const url = base.includes('localhost:10002') || base.includes('127.0.0.1:10002')
    ? path
    : `${base}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const json = await res.json()
  if (!res.ok || json.code !== 0) {
    throw new Error(json.msg || `HTTP ${res.status}`)
  }
  return json.data
}

const handleStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  background: '#a78bfa',
  border: '2px solid #fff',
  boxShadow: '0 0 0 2px rgba(167, 139, 250, .35)',
}

function NodeView({ data, selected }: { data: NodeData; selected?: boolean }) {
  const def = NODE_KINDS.find((d) => d.kind === data.kind) || NODE_KINDS[0]
  return (
    <div
      style={{
        background: '#1e1e2e',
        color: '#fff',
        border: `2px solid ${def.color}`,
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 140,
        fontSize: 13,
        fontWeight: 500,
        boxShadow: selected
          ? `0 0 0 3px ${def.color}55, 0 4px 12px rgba(0,0,0,.25)`
          : '0 4px 12px rgba(0,0,0,.25)',
      }}
    >
      <Handle id="t-top-target" type="target" position={Position.Top}    style={handleStyle} />
      <Handle id="t-top-source" type="source" position={Position.Top}    style={handleStyle} />
      <Handle id="t-right-target" type="target" position={Position.Right}  style={handleStyle} />
      <Handle id="t-right-source" type="source" position={Position.Right}  style={handleStyle} />
      <Handle id="t-bottom-target" type="target" position={Position.Bottom} style={handleStyle} />
      <Handle id="t-bottom-source" type="source" position={Position.Bottom} style={handleStyle} />
      <Handle id="t-left-target" type="target" position={Position.Left}   style={handleStyle} />
      <Handle id="t-left-source" type="source" position={Position.Left}   style={handleStyle} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className={`bx ${def.icon}`} style={{ color: def.color }}></i>
        <span>{data.label}</span>
      </div>
      <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{data.kind}</div>
    </div>
  )
}

function EditorInner({ onSaved }: Props) {
  const [editing, setEditing] = useState<WorkflowRecord | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [trigger, setTrigger] = useState<Trigger>('manual')
  const [status, setStatus] = useState<Status>('active')
  const [busy, setBusy] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [zoomPct, setZoomPct] = useState(100)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  )

  const updateSelectedNode = useCallback(
    (patch: Partial<NodeData>) => {
      if (!selectedNodeId) return
      setNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNodeId
            ? { ...n, data: { ...n.data, ...patch } }
            : n,
        ),
      )
    },
    [selectedNodeId, setNodes],
  )

  const removeSelectedNode = useCallback(() => {
    if (!selectedNodeId) return
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
  }, [selectedNodeId, setNodes, setEdges])

  const onNodeClick = useCallback(
    (_e: unknown, node: Node) => {
      setSelectedNodeId(node.id)
    },
    [],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  const applyZoom = useCallback((pct: number) => {
    const safe = Math.max(10, Math.min(400, Math.round(pct)))
    setZoomPct(safe)
    instance?.zoomTo(safe / 100, { duration: 0 })
  }, [instance])

  const onMove = useCallback(
    (_e: unknown, viewport: { zoom: number }) => {
      const pct = Math.round(viewport.zoom * 100)
      setZoomPct(Math.max(10, Math.min(400, pct)))
    },
    [],
  )

  const nodeTypes: NodeTypes = useMemo(() => ({ workflow: NodeView }), [])

  const reset = useCallback(() => {
    setEditing(null)
    setNodes([])
    setEdges([])
    setName('')
    setDescription('')
    setTrigger('manual')
    setStatus('active')
    setErrMsg('')
  }, [setNodes, setEdges])

  const openEditor = useCallback((record: WorkflowRecord | null) => {
    setErrMsg('')
    if (record) {
      setEditing(record)
      setName(record.name)
      setDescription(record.description || '')
      setTrigger((record.trigger as Trigger) || 'manual')
      setStatus((record.status as Status) || 'active')
      try {
        const parsedNodes = JSON.parse(record.nodes_json || '[]') as Node<NodeData>[]
        const parsedEdges = JSON.parse(record.edges_json || '[]') as Edge[]
        setNodes(parsedNodes)
        setEdges(parsedEdges)
        setTimeout(() => {
          if (record.viewport_json) {
            try {
              const vp = JSON.parse(record.viewport_json)
              instance?.setViewport(vp)
            } catch { /* */ }
          }
        }, 50)
      } catch {
        setNodes([])
        setEdges([])
      }
    } else {
      reset()
      setNodes([
        makeNode('trigger', { x: 80, y: 120 }, 0),
      ])
    }
    const modal = document.getElementById('workflowEditorModal')
    if (modal && window.bootstrap) {
      window.bootstrap.Modal.getOrCreateInstance(modal).show()
    }
  }, [instance, reset, setNodes, setEdges])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<WorkflowRecord | null>).detail
      openEditor(detail)
    }
    window.addEventListener('fwm:workflow:open', handler as EventListener)
    return () => window.removeEventListener('fwm:workflow:open', handler as EventListener)
  }, [openEditor])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  )

  const addNodeOfKind = useCallback((kind: NodeKind) => {
    setNodes((nds) => {
      const vp = instance?.getViewport() || { x: 0, y: 0, zoom: 1 }
      const center = {
        x: (-vp.x + 360) / vp.zoom,
        y: (-vp.y + 200) / vp.zoom,
      }
      return [...nds, makeNode(kind, center, nds.length + 1)]
    })
  }, [instance, setNodes])

  const handleSave = async () => {
    if (!name.trim()) {
      setErrMsg('請輸入流程名稱')
      return
    }
    setBusy(true)
    setErrMsg('')
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        trigger,
        status,
        nodes_json: JSON.stringify(nodes),
        edges_json: JSON.stringify(edges),
        viewport_json: instance ? JSON.stringify(instance.getViewport()) : null,
      }
      if (editing) {
        await workflowApi(`/api/workflows/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await workflowApi('/api/workflows', { method: 'POST', body: JSON.stringify(payload) })
      }
      const modal = document.getElementById('workflowEditorModal')
      if (modal && window.bootstrap) {
        window.bootstrap.Modal.getOrCreateInstance(modal).hide()
      }
      onSaved()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleClose = () => {
    const modal = document.getElementById('workflowEditorModal')
    if (modal && window.bootstrap) {
      window.bootstrap.Modal.getOrCreateInstance(modal).hide()
    }
  }

  return (
    <div
      className="modal fade"
      id="workflowEditorModal"
      tabIndex={-1}
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content" style={{ height: '85vh' }}>
          <div className="modal-header py-2">
            <h6 className="modal-title">
              <i className="bx bx-sitemap me-1"></i>
              {editing ? `編輯流程 #${editing.id}` : '新增流程'}
            </h6>
            <button type="button" className="btn-close" onClick={handleClose} aria-label="Close"></button>
          </div>
          <div className="modal-body p-0 d-flex flex-column" style={{ overflow: 'hidden' }}>
            <div className="row g-2 m-2 mb-0">
              <div className="col-md-5">
                <label className="form-label" style={{ fontSize: '.7rem' }}>名稱 *</label>
                <input className="form-control form-control-sm" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label" style={{ fontSize: '.7rem' }}>觸發</label>
                <select className="form-select form-select-sm" value={trigger} onChange={(e) => setTrigger(e.target.value as Trigger)}>
                  <option value="manual">手動</option>
                  <option value="schedule">排程</option>
                  <option value="webhook">Webhook</option>
                  <option value="event">事件</option>
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label" style={{ fontSize: '.7rem' }}>狀態</label>
                <select className="form-select form-select-sm" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                  <option value="active">啟用</option>
                  <option value="paused">暫停</option>
                  <option value="draft">草稿</option>
                  <option value="archived">封存</option>
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label" style={{ fontSize: '.7rem' }}>節點數</label>
                <input className="form-control form-control-sm" value={nodes.length} readOnly />
              </div>
              <div className="col-12">
                <label className="form-label" style={{ fontSize: '.7rem' }}>描述</label>
                <input className="form-control form-control-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
            <div className="d-flex flex-grow-1" style={{ minHeight: 380, overflow: 'hidden' }}>
              <div
                className="border-end bg-light d-flex flex-column p-2"
                style={{ width: 180, flexShrink: 0, overflowY: 'auto' }}
              >
                <div className="text-muted mb-2" style={{ fontSize: '.7rem' }}>節點類型（點擊加入畫布）</div>
                {NODE_KINDS.map((d) => (
                  <button
                    key={d.kind}
                    type="button"
                    className="btn btn-sm d-flex align-items-center gap-2 mb-2 w-100 text-start"
                    style={{
                      background: d.color + '22',
                      borderColor: d.color,
                      color: d.color,
                      fontSize: '.75rem',
                      padding: '6px 10px',
                      fontWeight: 500,
                    }}
                    onClick={() => addNodeOfKind(d.kind)}
                  >
                    <i className={`bx ${d.icon}`} style={{ fontSize: '1rem' }}></i>
                    <span>{d.label}</span>
                  </button>
                ))}
                <div className="mt-auto pt-2 border-top">
                  <label className="form-label mb-1" style={{ fontSize: '.7rem' }}>放大縮小比例</label>
                  <select
                    className="form-select form-select-sm mb-2"
                    value={ZOOM_PRESETS.includes(zoomPct) ? zoomPct : ''}
                    onChange={(e) => applyZoom(Number(e.target.value))}
                  >
                    {ZOOM_PRESETS.map((z) => (
                      <option key={z} value={z}>{z}%</option>
                    ))}
                    {!ZOOM_PRESETS.includes(zoomPct) && zoomPct > 0 && (
                      <option value={zoomPct}>{zoomPct}%</option>
                    )}
                  </select>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      className="form-control"
                      min={10}
                      max={400}
                      step={5}
                      value={zoomPct}
                      onChange={(e) => applyZoom(Number(e.target.value) || 100)}
                    />
                    <span className="input-group-text">%</span>
                  </div>
                </div>
              </div>
              <div style={{ flexGrow: 1, background: '#0f0f1a', position: 'relative' }}>
                <ReactFlow
                  nodes={nodes as unknown as Node[]}
                  edges={edges}
                  onNodesChange={onNodesChange as unknown as (changes: unknown) => void}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onInit={setInstance}
                  onMove={onMove}
                  onNodeClick={onNodeClick}
                  onPaneClick={onPaneClick}
                  nodeTypes={nodeTypes}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="#1f2937" gap={20} />
                  <Controls position="bottom-right" />
                  <MiniMap
                    pannable
                    zoomable
                    nodeColor={(n) => {
                      const kind = (n.data?.kind || 'trigger') as NodeKind
                      return NODE_KINDS.find((d) => d.kind === kind)?.color || '#888'
                    }}
                    maskColor="rgba(15,15,26,0.6)"
                  />
                </ReactFlow>
              </div>
              <div
                className="border-start bg-light d-flex flex-column p-2"
                style={{ width: 240, flexShrink: 0, overflowY: 'auto' }}
              >
                <div className="text-muted mb-2 d-flex align-items-center" style={{ fontSize: '.7rem' }}>
                  <i className="bx bx-cog me-1"></i>節點屬性
                </div>
                {selectedNode ? (
                  <>
                    <div className="mb-2 p-2 rounded" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                      <div className="d-flex align-items-center gap-2 mb-1">
                        {(() => {
                          const def = NODE_KINDS.find((d) => d.kind === selectedNode.data.kind) || NODE_KINDS[0]
                          return <i className={`bx ${def.icon}`} style={{ color: def.color, fontSize: '1.1rem' }}></i>
                        })()}
                        <span className="fw-semibold" style={{ fontSize: '.8rem' }}>
                          {(NODE_KINDS.find((d) => d.kind === selectedNode.data.kind) || NODE_KINDS[0]).label}
                        </span>
                      </div>
                      <div className="text-muted" style={{ fontSize: '.65rem', wordBreak: 'break-all' }}>ID: {selectedNode.id}</div>
                    </div>
                    <div className="mb-2">
                      <label className="form-label mb-1" style={{ fontSize: '.7rem' }}>標籤</label>
                      <input
                        className="form-control form-control-sm"
                        value={selectedNode.data.label}
                        onChange={(e) => updateSelectedNode({ label: e.target.value })}
                      />
                    </div>
                    <div className="mb-2">
                      <label className="form-label mb-1" style={{ fontSize: '.7rem' }}>節點類型</label>
                      <select
                        className="form-select form-select-sm"
                        value={selectedNode.data.kind}
                        onChange={(e) => {
                          const newKind = e.target.value as NodeKind
                          const def = NODE_KINDS.find((d) => d.kind === newKind) || NODE_KINDS[0]
                          updateSelectedNode({ kind: newKind, label: def.label })
                        }}
                      >
                        {NODE_KINDS.map((d) => (
                          <option key={d.kind} value={d.kind}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="form-label mb-1" style={{ fontSize: '.7rem' }}>描述</label>
                      <textarea
                        className="form-control form-control-sm"
                        rows={2}
                        value={selectedNode.data.description}
                        onChange={(e) => updateSelectedNode({ description: e.target.value })}
                      />
                    </div>
                    <div className="mb-2">
                      <label className="form-label mb-1" style={{ fontSize: '.7rem' }}>設定值 (JSON)</label>
                      <textarea
                        className="form-control form-control-sm font-monospace"
                        rows={5}
                        value={selectedNode.data.config}
                        onChange={(e) => updateSelectedNode({ config: e.target.value })}
                        style={{ fontSize: '.7rem' }}
                      />
                    </div>
                    <div className="mt-auto pt-2 border-top d-flex gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger flex-grow-1"
                        onClick={removeSelectedNode}
                      >
                        <i className="bx bx-trash me-1"></i>刪除節點
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-muted text-center py-4" style={{ fontSize: '.75rem' }}>
                    <i className="bx bx-pointer-alt mb-2" style={{ fontSize: '1.5rem', display: 'block' }}></i>
                    點選畫布中的節點<br />以編輯其屬性
                  </div>
                )}
              </div>
            </div>
            {errMsg && (
              <div className="alert alert-danger m-2 py-1 mb-2" style={{ fontSize: '.75rem' }}>{errMsg}</div>
            )}
          </div>
          <div className="modal-footer py-2">
            <span className="text-muted me-auto" style={{ fontSize: '.7rem' }}>
              提示：點擊左側按鈕新增節點，從任一節點四角的圓點拖曳可建立連線
            </span>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleClose}>取消</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={busy}>
              <i className="bx bx-save me-1"></i>{busy ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WorkflowEditorModal(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  )
}
