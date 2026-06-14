import { useEffect, useState } from 'react'
import { getApiBase } from '../../../utils/api'
import NetworkArchitectureEditorModal, { type NetworkArchitectureRecord } from './NetworkArchitectureEditorModal'

async function networkApi(path: string, options: RequestInit = {}) {
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

function countNodes(record: NetworkArchitectureRecord): number {
  try {
    const arr = JSON.parse(record.nodes_json || '[]')
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}

function countEdges(record: NetworkArchitectureRecord): number {
  try {
    const arr = JSON.parse(record.edges_json || '[]')
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}

export default function NetworkArchitectureView() {
  const [records, setRecords] = useState<NetworkArchitectureRecord[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const loadRecords = async () => {
    setBusy(true)
    setMsg('')
    try {
      const data = await networkApi('/api/network-architectures')
      setRecords(data.architectures || [])
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBusy(true)
      setMsg('')
      try {
        const data = await networkApi('/api/network-architectures')
        if (!cancelled) setRecords(data.architectures || [])
      } catch (err) {
        if (!cancelled) setMsg(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = records.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
  })

  const openNew = () => {
    window.dispatchEvent(new CustomEvent('fwm:netarch:open', { detail: null }))
  }

  const openEdit = (record: NetworkArchitectureRecord) => {
    window.dispatchEvent(new CustomEvent('fwm:netarch:open', { detail: record }))
  }

  const deleteRecord = async (record: NetworkArchitectureRecord) => {
    if (!window.confirm(`確認刪除架構「${record.name}」？`)) return
    setBusy(true)
    setMsg('')
    try {
      await networkApi(`/api/network-architectures/${record.id}`, { method: 'DELETE' })
      await loadRecords()
      setMsg('已刪除')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div id="networkArchView" style={{ display: 'none' }}>
        <div className="row mb-3">
          <div className="col-12">
            <div className="card">
              <div className="card-header d-flex align-items-center py-2">
                <i className="bx bx-network-chart me-2"></i>
                <strong style={{ fontSize: '.8125rem' }} id="netArchTitle">網路架構編輯</strong>
                <div className="ms-auto d-flex align-items-center gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={loadRecords} disabled={busy} type="button">
                    <i className="bx bx-refresh me-1"></i><span>重新整理</span>
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={openNew} disabled={busy} type="button">
                    <i className="bx bx-plus me-1"></i><span>新增架構</span>
                  </button>
                </div>
              </div>
              <div className="card-body p-2">
                <div className="row g-2 mb-2">
                  <div className="col-md-4">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="搜尋架構名稱 / 描述"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="col-md-8 d-flex align-items-center">
                    {msg && <span className={msg === '已刪除' ? 'text-success small' : 'text-danger small'}>{msg}</span>}
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: '24%' }}>名稱</th>
                        <th style={{ width: '30%' }}>描述</th>
                        <th style={{ width: '8%' }}>節點數</th>
                        <th style={{ width: '8%' }}>連線數</th>
                        <th style={{ width: '16%' }}>最後更新</th>
                        <th style={{ width: '14%' }} className="text-end">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center text-muted py-4">
                            {records.length === 0
                              ? '尚無網路架構，點擊「新增架構」開始設計。'
                              : '目前篩選條件下沒有架構。'}
                          </td>
                        </tr>
                      ) : filtered.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <div className="fw-semibold">{r.name}</div>
                          </td>
                          <td className="text-muted">{r.description || '—'}</td>
                          <td><span className="badge bg-label-info">{countNodes(r)}</span></td>
                          <td><span className="badge bg-label-primary">{countEdges(r)}</span></td>
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
          <div className="col-md-12">
            <div className="card">
              <div className="card-header py-2">
                <strong style={{ fontSize: '.8125rem' }}>支援的設備類型</strong>
              </div>
              <div className="card-body p-2" style={{ fontSize: '.75rem' }}>
                <p className="text-muted mb-2">在編輯架構時，從左側按鈕加入對應設備類型，並透過四角圓點建立拓樸連線。</p>
                <div className="d-flex flex-wrap gap-2">
                  <span className="badge bg-label-primary">路由器 (Router)</span>
                  <span className="badge bg-label-info">交換器 (Switch)</span>
                  <span className="badge bg-label-danger">防火牆 (Firewall)</span>
                  <span className="badge bg-label-success">伺服器 (Server)</span>
                  <span className="badge bg-label-warning">資料庫 (Database)</span>
                  <span className="badge bg-label-primary">負載平衡 (Load Balancer)</span>
                  <span className="badge bg-label-danger">無線 AP</span>
                  <span className="badge bg-label-secondary">終端 (Client)</span>
                  <span className="badge bg-label-info">雲端 (Cloud)</span>
                  <span className="badge bg-label-dark">網際網路 (Internet)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NetworkArchitectureEditorModal onSaved={loadRecords} />
    </>
  )
}
