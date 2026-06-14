import { useEffect, useState } from 'react'
import { getApiBase } from '../../../../utils/api'
import ErdEditorModal, { type ErdRecord } from './ErdEditorModal'

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

async function erdApi<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBase()
  const url = base.includes('localhost:10002') || base.includes('127.0.0.1:10002')
    ? path
    : `${base}${path}`
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const json = await res.json()
  if (!res.ok || json.code !== 0) {
    throw new Error(json.msg || `HTTP ${res.status}`)
  }
  return json.data as T
}

function countJsonArray(json: string): number {
  try {
    const arr = JSON.parse(json || '[]')
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}

export default function ErdDiagramView() {
  const [records, setRecords] = useState<ErdRecord[]>([])
  const [connections, setConnections] = useState<DbConnection[]>([])
  const [editing, setEditing] = useState<ErdRecord | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const loadRecords = async () => {
    setBusy(true)
    setMsg('')
    try {
      const data = await erdApi<{ diagrams: ErdRecord[] }>('/api/erd-diagrams')
      setRecords(data.diagrams || [])
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const loadConnections = async () => {
    try {
      const data = await erdApi<{ connections: DbConnection[] }>('/api/dbman/connections')
      setConnections(data.connections || [])
    } catch {
      // 表單不阻塞列表
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      setMsg('')
      try {
        const data = await erdApi<{ diagrams: ErdRecord[] }>('/api/erd-diagrams')
        if (!cancelled) setRecords(data.diagrams || [])
      } catch (err) {
        if (!cancelled) setMsg(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    erdApi<{ connections: DbConnection[] }>('/api/dbman/connections')
      .then((data) => { if (!cancelled) setConnections(data.connections || []) })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [])

  const filtered = records.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
  })

  const openNew = async () => {
    if (connections.length === 0) await loadConnections()
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = async (record: ErdRecord) => {
    if (connections.length === 0) await loadConnections()
    setEditing(record)
    setModalOpen(true)
  }

  const deleteRecord = async (record: ErdRecord) => {
    if (!window.confirm(`確認刪除 ERD「${record.name}」？`)) return
    setBusy(true)
    setMsg('')
    try {
      await erdApi(`/api/erd-diagrams/${record.id}`, { method: 'DELETE' })
      await loadRecords()
      setMsg('已刪除')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleSaved = async () => {
    setModalOpen(false)
    await loadRecords()
  }

  return (
    <>
      <div id="erdDiagramView" style={{ display: 'none' }}>
        <div className="row mb-3">
          <div className="col-12">
            <div className="card">
              <div className="card-header d-flex align-items-center py-2">
                <i className="bx bx-sitemap me-2"></i>
                <strong style={{ fontSize: '.8125rem' }}>ER-Diagram 管理</strong>
                <div className="ms-auto d-flex align-items-center gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={loadRecords} disabled={busy} type="button">
                    <i className="bx bx-refresh me-1"></i>重新整理
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={openNew}
                    disabled={busy}
                    type="button"
                    id="erdNewBtn"
                  >
                    <i className="bx bx-plus me-1"></i>新增 ERD
                  </button>
                </div>
              </div>
              <div className="card-body p-2">
                <div className="row g-2 mb-2">
                  <div className="col-md-4">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="搜尋 ERD 名稱 / 描述"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="col-md-8 d-flex align-items-center">
                    {msg && (
                      <span className={msg === '已刪除' ? 'text-success small' : 'text-danger small'}>
                        {msg}
                      </span>
                    )}
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: '20%' }}>名稱</th>
                        <th style={{ width: '8%' }}>連線 ID</th>
                        <th style={{ width: '24%' }}>描述</th>
                        <th style={{ width: '8%' }}>資料表</th>
                        <th style={{ width: '8%' }}>關聯</th>
                        <th style={{ width: '16%' }}>最後更新</th>
                        <th style={{ width: '16%' }} className="text-end">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center text-muted py-4">
                            {records.length === 0
                              ? '尚無 ER-Diagram，點擊「新增 ERD」開始設計。'
                              : '目前篩選條件下沒有 ERD。'}
                          </td>
                        </tr>
                      ) : filtered.map((r) => (
                        <tr key={r.id}>
                          <td className="fw-semibold">{r.name}</td>
                          <td>
                            <span className="badge bg-label-primary">#{r.connection_id}</span>
                          </td>
                          <td className="text-muted">{r.description || '—'}</td>
                          <td><span className="badge bg-label-info">{countJsonArray(r.nodes_json)}</span></td>
                          <td><span className="badge bg-label-primary">{countJsonArray(r.edges_json)}</span></td>
                          <td className="text-nowrap" style={{ fontSize: '.75rem' }}>{r.updated_at}</td>
                          <td className="text-end">
                            <div className="btn-group btn-group-sm">
                              <button className="btn btn-outline-primary" onClick={() => openEdit(r)} title="編輯" type="button">
                                <i className="bx bx-edit"></i>
                              </button>
                              <button className="btn btn-outline-danger" onClick={() => deleteRecord(r)} title="刪除" type="button">
                                <i className="bx bx-trash"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="row mb-3">
          <div className="col-12">
            <div className="card">
              <div className="card-header py-2">
                <strong style={{ fontSize: '.8125rem' }}>使用說明</strong>
              </div>
              <div className="card-body p-2" style={{ fontSize: '.75rem' }}>
                <ol className="mb-0 ps-3">
                  <li>在「DbMan」群組中新增資料庫連線（支援 SQLite / MySQL / SQL Server）</li>
                  <li>點擊「新增 ERD」，從已建立的連線中選擇目標資料庫</li>
                  <li>勾選要加入 ERD 的資料表（可多選），系統會自動載入欄位結構</li>
                  <li>使用 ReactFlow 編輯器調整節點位置、從節點四角建立關聯連線</li>
                  <li>儲存後可隨時回來編輯或刪除</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
      {modalOpen && (
        <ErdEditorModal
          record={editing}
          connections={connections}
          onSaved={handleSaved}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
