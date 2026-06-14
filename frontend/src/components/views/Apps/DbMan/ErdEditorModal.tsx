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
import { getApiBase } from '../../../../utils/api'
import ErdNode, { type ErdColumn, type ErdNodeData } from './ERDNode'

export type ErdRecord = {
  id: number
  connection_id: number
  name: string
  description: string
  nodes_json: string
  edges_json: string
  viewport_json: string | null
  created_at: string
  updated_at: string
}

type DbConnection = {
  id: number
  name: string
  db_type: string
  file_path: string | null
  host: string | null
  port: number | null
  username: string | null
  database_name: string | null
}

type TableInfo = { name: string }

type SchemaPayload = {
  connection: { id: number; name: string; db_type: string }
  tables: TableInfo[]
  columns: Record<string, ErdColumn[] | { error: string }>
}

type Step = 'selectConnection' | 'selectTables' | 'edit'

const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300, 400]

type Props = {
  record: ErdRecord | null
  connections: DbConnection[]
  onSaved: () => void
  onClose: () => void
}

const handleStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  background: '#1e40af',
  border: '1.5px solid #fff',
}

function MiniErdNode({ data }: { data: ErdNodeData }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #d1d5db',
        borderRadius: 4,
        padding: '4px 6px',
        fontSize: 10,
        fontWeight: 600,
        color: '#1e40af',
        minWidth: 80,
      }}
    >
      <Handle id="t-top-target" type="target" position={Position.Top} style={handleStyle} />
      <Handle id="t-top-source" type="source" position={Position.Top} style={handleStyle} />
      <Handle id="t-bottom-target" type="target" position={Position.Bottom} style={handleStyle} />
      <Handle id="t-bottom-source" type="source" position={Position.Bottom} style={handleStyle} />
      {data.tableName}
    </div>
  )
}

async function apiPost<T>(path: string, body: Record<string, unknown> | FormData): Promise<T> {
  const base = getApiBase()
  const url = base.includes('localhost:10002') || base.includes('127.0.0.1:10002')
    ? path
    : `${base}${path}`
  const opts: RequestInit = { method: 'POST' }
  if (body instanceof FormData) {
    opts.body = body
  } else {
    opts.body = new URLSearchParams(
      Object.entries(body).reduce<Record<string, string>>((acc, [k, v]) => {
        acc[k] = v == null ? '' : String(v)
        return acc
      }, {}),
    ).toString()
    opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  if (!res.ok || json.code !== 0) {
    throw new Error(json.msg || `HTTP ${res.status}`)
  }
  return json.data as T
}

async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const base = getApiBase()
  const url = base.includes('localhost:10002') || base.includes('127.0.0.1:10002')
    ? path
    : `${base}${path}`
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok || json.code !== 0) {
    throw new Error(json.msg || `HTTP ${res.status}`)
  }
  return json.data as T
}

function buildNodeForTable(table: TableInfo, columns: ErdColumn[], index: number): Node<ErdNodeData> {
  const cols = Array.isArray(columns) ? columns : []
  const colsPerRow = 320
  const col = index % colsPerRow
  const row = Math.floor(index / colsPerRow)
  return {
    id: `t-${table.name}-${index}`,
    type: 'erd',
    position: { x: 60 + col * 280, y: 60 + row * 320 },
    data: { tableName: table.name, columns: cols },
  }
}

function EditorInner({ record, connections, onSaved, onClose }: Props) {
  const [step, setStep] = useState<Step>(record ? 'edit' : 'selectConnection')
  const [name, setName] = useState(record?.name || '')
  const [description, setDescription] = useState(record?.description || '')
  const [connectionId, setConnectionId] = useState<number | null>(record?.connection_id || null)
  const [schema, setSchema] = useState<SchemaPayload | null>(null)
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set())
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ErdNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null)
  const [zoomPct, setZoomPct] = useState(100)
  const [busy, setBusy] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [searchTable, setSearchTable] = useState('')

  const nodeTypes: NodeTypes = useMemo(
    () => ({ erd: ErdNode, 'mini-erd': MiniErdNode }),
    [],
  )

  const connection = useMemo(
    () => connections.find((c) => c.id === connectionId) || null,
    [connections, connectionId],
  )

  useEffect(() => {
    if (step === 'selectTables' && connectionId && !schema) {
      let cancelled = false
      ;(async () => {
        setSchemaLoading(true)
        setErrMsg('')
        try {
          const data = await apiPost<SchemaPayload>('/api/erd-diagrams/schema', { connection_id: connectionId })
          if (!cancelled) setSchema(data)
        } catch (err) {
          if (!cancelled) {
            setErrMsg(err instanceof Error ? err.message : String(err))
            setSchema(null)
          }
        } finally {
          if (!cancelled) setSchemaLoading(false)
        }
      })()
      return () => { cancelled = true }
    }
  }, [step, connectionId, schema])

  const applyZoom = useCallback((pct: number) => {
    const safe = Math.max(10, Math.min(400, Math.round(pct)))
    setZoomPct(safe)
    instance?.zoomTo(safe / 100, { duration: 0 })
  }, [instance])

  const onMove = useCallback((_e: unknown, viewport: { zoom: number }) => {
    const pct = Math.round(viewport.zoom * 100)
    setZoomPct(Math.max(10, Math.min(400, pct)))
  }, [])

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  )

  useEffect(() => {
    if (step === 'edit' && record && instance) {
      let cancelled = false
      let parsedNodes: Node<ErdNodeData>[] = []
      let parsedEdges: Edge[] = []
      let parseError = ''
      try {
        parsedNodes = JSON.parse(record.nodes_json || '[]') as Node<ErdNodeData>[]
        parsedEdges = JSON.parse(record.edges_json || '[]') as Edge[]
      } catch (e) {
        parseError = `解析既有 ERD 內容失敗：${e instanceof Error ? e.message : String(e)}`
      }
      queueMicrotask(() => {
        if (cancelled) return
        if (parseError) {
          setErrMsg(parseError)
        } else {
          setNodes(parsedNodes)
          setEdges(parsedEdges)
        }
      })
      if (record.viewport_json) {
        setTimeout(() => {
          if (cancelled) return
          try {
            const vp = JSON.parse(record.viewport_json || '{}')
            instance.setViewport(vp)
          } catch { /* */ }
        }, 50)
      }
      return () => { cancelled = true }
    }
  }, [step, record, instance, setNodes, setEdges])

  const goEditFromTables = () => {
    if (selectedTables.size === 0) {
      setErrMsg('請至少選擇一個資料表')
      return
    }
    setErrMsg('')
    const newNodes: Node<ErdNodeData>[] = []
    let idx = 0
    selectedTables.forEach((tableName) => {
      const cols = schema?.columns?.[tableName]
      const columns: ErdColumn[] = Array.isArray(cols) ? cols : []
      newNodes.push(buildNodeForTable({ name: tableName }, columns, idx))
      idx++
    })
    setNodes(newNodes)
    setEdges([])
    setStep('edit')
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setErrMsg('請輸入 ERD 名稱')
      return
    }
    if (!connectionId) {
      setErrMsg('請選擇連線')
      return
    }
    setBusy(true)
    setErrMsg('')
    try {
      const payload = {
        connection_id: connectionId,
        name: name.trim(),
        description: description.trim(),
        nodes_json: JSON.stringify(nodes),
        edges_json: JSON.stringify(edges),
        viewport_json: instance ? JSON.stringify(instance.getViewport()) : null,
      }
      if (record) {
        await apiSend(`/api/erd-diagrams/${record.id}`, 'PUT', payload)
      } else {
        await apiSend('/api/erd-diagrams', 'POST', payload)
      }
      onSaved()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const goClose = () => onClose()

  const filteredTables = useMemo(() => {
    if (!schema) return []
    if (!searchTable.trim()) return schema.tables
    const q = searchTable.toLowerCase()
    return schema.tables.filter((t) => t.name.toLowerCase().includes(q))
  }, [schema, searchTable])

  const toggleTable = (name: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div
      className="modal fade"
      id="erdEditorModal"
      tabIndex={-1}
      aria-hidden="true"
      data-bs-backdrop="static"
    >
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content" style={{ height: '88vh' }}>
          <div className="modal-header py-2">
            <h6 className="modal-title">
              <i className="bx bx-sitemap me-1"></i>
              {record ? `編輯 ERD #${record.id}` : '新增 ERD'}
            </h6>
            <button type="button" className="btn-close" onClick={goClose} aria-label="Close"></button>
          </div>
          <div className="modal-body p-3" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <ul className="nav nav-pills mb-3" role="tablist">
              <li className="nav-item">
                <span className={`nav-link ${step === 'selectConnection' ? 'active' : 'disabled'}`} style={{ cursor: step === 'selectConnection' ? 'default' : 'pointer' }}>
                  <i className="bx bx-data me-1"></i>1. 選擇連線
                </span>
              </li>
              <li className="nav-item">
                <span className={`nav-link ${step === 'selectTables' ? 'active' : (step === 'edit' ? 'bg-success-subtle' : 'disabled')}`} style={{ cursor: 'pointer' }} onClick={() => connectionId && setStep('selectTables')}>
                  <i className="bx bx-table me-1"></i>2. 選擇資料表
                </span>
              </li>
              <li className="nav-item">
                <span className={`nav-link ${step === 'edit' ? 'active' : 'disabled'}`}>
                  <i className="bx bx-pencil me-1"></i>3. ERD 編輯
                </span>
              </li>
            </ul>

            {step === 'selectConnection' && (
              <div className="row g-3 flex-grow-1">
                <div className="col-md-7">
                  <div className="card h-100">
                    <div className="card-header py-2">
                      <strong style={{ fontSize: '.8rem' }}>
                        <i className="bx bx-data me-1"></i>從已建立的 DbMan 連線選擇
                      </strong>
                    </div>
                    <div className="card-body p-2" style={{ maxHeight: 360, overflowY: 'auto' }}>
                      {connections.length === 0 ? (
                        <div className="text-center text-muted py-4" style={{ fontSize: '.8rem' }}>
                          尚無 DbMan 連線，請先到 DbMan 新增連線
                        </div>
                      ) : connections.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`btn btn-sm w-100 text-start mb-2 d-flex align-items-center gap-2 ${connectionId === c.id ? 'btn-primary' : 'btn-outline-secondary'}`}
                          onClick={() => setConnectionId(c.id)}
                        >
                          <i className="bx bx-data"></i>
                          <span className="flex-grow-1">
                            <div className="fw-semibold">{c.name}</div>
                            <div style={{ fontSize: '.7rem', opacity: 0.7 }}>
                              {c.db_type} · {c.file_path || `${c.host || ''}:${c.port || ''}/${c.database_name || ''}`}
                            </div>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="col-md-5">
                  <div className="card h-100">
                    <div className="card-header py-2">
                      <strong style={{ fontSize: '.8rem' }}>ERD 資訊</strong>
                    </div>
                    <div className="card-body">
                      <div className="mb-2">
                        <label className="form-label" style={{ fontSize: '.7rem' }}>名稱 *</label>
                        <input
                          className="form-control form-control-sm"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="例如 訂單系統 ERD"
                        />
                      </div>
                      <div className="mb-2">
                        <label className="form-label" style={{ fontSize: '.7rem' }}>描述</label>
                        <textarea
                          className="form-control form-control-sm"
                          rows={3}
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>
                      {connection && (
                        <div className="alert alert-info py-2 mb-0" style={{ fontSize: '.7rem' }}>
                          已選擇連線：<strong>{connection.name}</strong>（{connection.db_type}）
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'selectTables' && (
              <div className="d-flex flex-grow-1" style={{ minHeight: 0 }}>
                <div className="border-end p-2" style={{ width: '60%', display: 'flex', flexDirection: 'column' }}>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <input
                      className="form-control form-control-sm"
                      placeholder="搜尋資料表"
                      value={searchTable}
                      onChange={(e) => setSearchTable(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => schema && setSelectedTables(new Set(schema.tables.map((t) => t.name)))}
                    >
                      全選
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setSelectedTables(new Set())}
                    >
                      清除
                    </button>
                  </div>
                  {schemaLoading ? (
                    <div className="text-center text-muted py-4" style={{ fontSize: '.8rem' }}>
                      <i className="bx bx-loader-alt bx-spin me-1"></i>載入中…
                    </div>
                  ) : !schema ? (
                    <div className="text-center text-danger py-4" style={{ fontSize: '.8rem' }}>{errMsg || '載入失敗'}</div>
                  ) : (
                    <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                      {filteredTables.length === 0 ? (
                        <div className="text-muted text-center py-3" style={{ fontSize: '.8rem' }}>沒有資料表</div>
                      ) : filteredTables.map((t) => {
                        const cols = schema.columns?.[t.name]
                        const colCount = Array.isArray(cols) ? cols.length : 0
                        const checked = selectedTables.has(t.name)
                        return (
                          <label
                            key={t.name}
                            className={`d-flex align-items-center gap-2 p-2 mb-1 rounded ${checked ? 'bg-primary-subtle' : 'bg-light'}`}
                            style={{ cursor: 'pointer', fontSize: '.8rem' }}
                          >
                            <input
                              type="checkbox"
                              className="form-check-input m-0"
                              checked={checked}
                              onChange={() => toggleTable(t.name)}
                            />
                            <i className="bx bx-table text-primary"></i>
                            <span className="fw-semibold flex-grow-1">{t.name}</span>
                            <span className="badge bg-label-info">{colCount} 欄位</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="p-2" style={{ width: '40%', display: 'flex', flexDirection: 'column' }}>
                  <div className="text-muted mb-1" style={{ fontSize: '.7rem' }}>已選擇</div>
                  <div className="d-flex flex-wrap gap-1 mb-2" style={{ minHeight: 32 }}>
                    {selectedTables.size === 0 ? (
                      <span className="text-muted" style={{ fontSize: '.75rem' }}>尚未選擇資料表</span>
                    ) : Array.from(selectedTables).map((t) => (
                      <span key={t} className="badge bg-primary d-flex align-items-center gap-1">
                        {t}
                        <button
                          type="button"
                          className="btn-close btn-close-white ms-1"
                          style={{ fontSize: '.5rem' }}
                          onClick={() => toggleTable(t)}
                          aria-label="Remove"
                        ></button>
                      </span>
                    ))}
                  </div>
                  <div className="text-muted mb-1" style={{ fontSize: '.7rem' }}>欄位預覽（第一個選擇）</div>
                  <div className="border rounded p-2 flex-grow-1" style={{ overflowY: 'auto', maxHeight: 200 }}>
                    {selectedTables.size === 0 ? (
                      <div className="text-muted text-center py-2" style={{ fontSize: '.7rem' }}>請選擇資料表</div>
                    ) : (() => {
                      const first = Array.from(selectedTables)[0]
                      const cols = schema?.columns?.[first]
                      if (!Array.isArray(cols)) return <div className="text-muted" style={{ fontSize: '.7rem' }}>無欄位</div>
                      return (
                        <div style={{ fontSize: '.7rem', fontFamily: 'monospace' }}>
                          {cols.map((c) => (
                            <div key={c.name} className="d-flex gap-1 border-bottom py-1">
                              {c.primary_key ? <i className="bx bx-key text-warning"></i> : <span style={{ width: 14 }}></span>}
                              <span className="fw-semibold flex-grow-1">{c.name}</span>
                              <span className="text-muted">{c.data_type}</span>
                              {!c.nullable && !c.primary_key && <span className="text-danger">NN</span>}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )}

            {step === 'edit' && (
              <>
                <div className="row g-2 mb-2">
                  <div className="col-md-5">
                    <label className="form-label" style={{ fontSize: '.7rem' }}>名稱 *</label>
                    <input className="form-control form-control-sm" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" style={{ fontSize: '.7rem' }}>連線</label>
                    <input className="form-control form-control-sm" value={connection?.name || ''} readOnly />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label" style={{ fontSize: '.7rem' }}>統計</label>
                    <input className="form-control form-control-sm" value={`${nodes.length} 個資料表 / ${edges.length} 條關聯`} readOnly />
                  </div>
                </div>
                <div className="d-flex flex-grow-1" style={{ minHeight: 0, overflow: 'hidden' }}>
                  <div className="border-end p-2 bg-light" style={{ width: 200, flexShrink: 0, overflowY: 'auto' }}>
                    <div className="text-muted mb-2" style={{ fontSize: '.7rem' }}>已加入資料表</div>
                    {nodes.length === 0 ? (
                      <div className="text-muted" style={{ fontSize: '.7rem' }}>畫布上沒有資料表</div>
                    ) : (
                      <ul className="list-group list-group-flush">
                        {nodes.map((n) => (
                          <li
                            key={n.id}
                            className="list-group-item d-flex align-items-center gap-1 p-1"
                            style={{ fontSize: '.75rem', cursor: 'pointer' }}
                            onClick={() => instance?.setCenter(n.position.x + 100, n.position.y + 50, { zoom: 1, duration: 300 })}
                          >
                            <i className="bx bx-table text-primary"></i>
                            <span className="flex-grow-1 text-truncate">{n.data.tableName}</span>
                            <button
                              type="button"
                              className="btn-close"
                              style={{ fontSize: '.5rem' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                setNodes((nds) => nds.filter((x) => x.id !== n.id))
                                setEdges((eds) => eds.filter((x) => x.source !== n.id && x.target !== n.id))
                              }}
                              aria-label="Remove"
                            ></button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 pt-2 border-top">
                      <label className="form-label mb-1" style={{ fontSize: '.7rem' }}>放大縮小</label>
                      <select
                        className="form-select form-select-sm mb-1"
                        value={ZOOM_PRESETS.includes(zoomPct) ? zoomPct : ''}
                        onChange={(e) => applyZoom(Number(e.target.value))}
                      >
                        {ZOOM_PRESETS.map((z) => (
                          <option key={z} value={z}>{z}%</option>
                        ))}
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
                  <div style={{ flexGrow: 1, background: '#f8fafc', position: 'relative' }}>
                    <ReactFlow
                      nodes={nodes as unknown as Node[]}
                      edges={edges}
                      onNodesChange={onNodesChange as unknown as (changes: unknown) => void}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      onInit={setInstance}
                      onMove={onMove}
                      nodeTypes={nodeTypes}
                      fitView
                      proOptions={{ hideAttribution: true }}
                    >
                      <Background color="#cbd5e1" gap={20} />
                      <Controls position="bottom-right" />
                      <MiniMap
                        pannable
                        zoomable
                        nodeColor="#3b82f6"
                        maskColor="rgba(248, 250, 252, 0.6)"
                      />
                    </ReactFlow>
                  </div>
                </div>
              </>
            )}

            {errMsg && (
              <div className="alert alert-danger py-1 mb-0 mt-2" style={{ fontSize: '.75rem' }}>{errMsg}</div>
            )}
          </div>
          <div className="modal-footer py-2">
            {step === 'selectConnection' && (
              <>
                <span className="text-muted me-auto" style={{ fontSize: '.7rem' }}>步驟 1/3：選擇連線</span>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goClose}>取消</button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!connectionId}
                  onClick={() => setStep('selectTables')}
                >
                  下一步
                  <i className="bx bx-right-arrow-alt ms-1"></i>
                </button>
              </>
            )}
            {step === 'selectTables' && (
              <>
                <span className="text-muted me-auto" style={{ fontSize: '.7rem' }}>
                  步驟 2/3：已選擇 {selectedTables.size} 個資料表
                </span>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setStep('selectConnection')}>
                  <i className="bx bx-left-arrow-alt me-1"></i>上一步
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={goEditFromTables} disabled={selectedTables.size === 0}>
                  下一步<i className="bx bx-right-arrow-alt ms-1"></i>
                </button>
              </>
            )}
            {step === 'edit' && (
              <>
                <span className="text-muted me-auto" style={{ fontSize: '.7rem' }}>
                  步驟 3/3：拖曳節點、從任一節點四角建立關聯連線
                </span>
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setStep('selectTables')}>
                  <i className="bx bx-left-arrow-alt me-1"></i>上一步
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={busy}>
                  <i className="bx bx-save me-1"></i>{busy ? '儲存中…' : '儲存'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ErdEditorModal(props: Props) {
  return (
    <ReactFlowProvider>
      <EditorInner {...props} />
    </ReactFlowProvider>
  )
}
