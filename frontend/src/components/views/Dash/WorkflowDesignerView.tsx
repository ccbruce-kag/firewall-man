import { useEffect, useMemo, useState } from 'react'
import { getApiBase } from '../../../utils/api'
import WorkflowEditorModal, { type WorkflowRecord } from './WorkflowEditorModal'

type Status = 'active' | 'paused' | 'draft' | 'archived'

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

function countNodes(record: WorkflowRecord): number {
  try {
    const arr = JSON.parse(record.nodes_json || '[]')
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active': return 'bg-label-success'
    case 'paused': return 'bg-label-warning'
    case 'draft': return 'bg-label-secondary'
    case 'archived': return 'bg-label-dark'
    default: return 'bg-label-info'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active': return '啟用中'
    case 'paused': return '暫停'
    case 'draft': return '草稿'
    case 'archived': return '封存'
    default: return status
  }
}

function triggerLabel(trigger: string): string {
  switch (trigger) {
    case 'manual': return '手動'
    case 'schedule': return '排程'
    case 'webhook': return 'Webhook'
    case 'event': return '事件'
    default: return trigger
  }
}

export default function WorkflowDesignerView() {
  const [records, setRecords] = useState<WorkflowRecord[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | Status>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const loadWorkflows = async () => {
    setBusy(true)
    setMsg('')
    try {
      const data = await workflowApi('/api/workflows')
      setRecords(data.workflows || [])
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
        const data = await workflowApi('/api/workflows')
        if (!cancelled) setRecords(data.workflows || [])
      } catch (err) {
        if (!cancelled) setMsg(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!r.name.toLowerCase().includes(q) && !(r.description || '').toLowerCase().includes(q)) {
          return false
        }
      }
      return true
    })
  }, [records, search, statusFilter])

  const activeCount = useMemo(() => records.filter((r) => r.status === 'active').length, [records])

  const openNew = () => {
    window.dispatchEvent(new CustomEvent('fwm:workflow:open', { detail: null }))
  }

  const openEdit = (record: WorkflowRecord) => {
    window.dispatchEvent(new CustomEvent('fwm:workflow:open', { detail: record }))
  }

  const deleteWorkflow = async (record: WorkflowRecord) => {
    if (!window.confirm(`確認刪除流程「${record.name}」？`)) return
    setBusy(true)
    setMsg('')
    try {
      await workflowApi(`/api/workflows/${record.id}`, { method: 'DELETE' })
      await loadWorkflows()
      setMsg('已刪除')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleStatus = async (record: WorkflowRecord) => {
    const next = record.status === 'active' ? 'paused' : 'active'
    setBusy(true)
    setMsg('')
    try {
      await workflowApi(`/api/workflows/${record.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next }),
      })
      await loadWorkflows()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div id="workflowView" style={{ display: 'none' }}>
        <div className="row mb-3">
          <div className="col-12">
            <div className="card">
              <div className="card-header d-flex align-items-center py-2">
                <i className="bx bx-sitemap me-2"></i>
                <strong style={{ fontSize: '.8125rem' }} id="workflowTitle">工作流程設計</strong>
                <div className="ms-auto d-flex align-items-center gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={loadWorkflows} disabled={busy} type="button">
                    <i className="bx bx-refresh me-1"></i><span id="workflowRefreshLabel">重新整理</span>
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={openNew} disabled={busy} type="button" id="workflowNewBtn">
                    <i className="bx bx-plus me-1"></i><span id="workflowNewLabel">新增流程</span>
                  </button>
                </div>
              </div>
              <div className="card-body p-2">
                <div className="row g-2 mb-2">
                  <div className="col-md-4">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="搜尋流程名稱 / 描述"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <select
                      className="form-select form-select-sm"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as '' | Status)}
                    >
                      <option value="">全部狀態</option>
                      <option value="active">啟用中</option>
                      <option value="paused">暫停</option>
                      <option value="draft">草稿</option>
                      <option value="archived">封存</option>
                    </select>
                  </div>
                  <div className="col-md-5 d-flex align-items-center">
                    {msg && <span className={msg === '已刪除' ? 'text-success small' : 'text-danger small'}>{msg}</span>}
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0" id="workflowTable">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: '24%' }}>名稱</th>
                        <th style={{ width: '28%' }}>描述</th>
                        <th style={{ width: '8%' }}>節點數</th>
                        <th style={{ width: '8%' }}>觸發</th>
                        <th style={{ width: '14%' }}>最後更新</th>
                        <th style={{ width: '8%' }}>狀態</th>
                        <th style={{ width: '10%' }} className="text-end">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center text-muted py-4" id="workflowEmpty">
                            {records.length === 0 ? '尚無工作流程，點擊「新增流程」開始設計。' : '目前篩選條件下沒有流程。'}
                          </td>
                        </tr>
                      ) : filtered.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <div className="fw-semibold">{r.name}</div>
                          </td>
                          <td className="text-muted">{r.description || '—'}</td>
                          <td><span className="badge bg-label-info">{countNodes(r)}</span></td>
                          <td><span className="badge bg-label-primary">{triggerLabel(r.trigger)}</span></td>
                          <td className="text-nowrap" style={{ fontSize: '.75rem' }}>{r.updated_at}</td>
                          <td>
                            <span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span>
                          </td>
                          <td className="text-end">
                            <div className="btn-group btn-group-sm">
                              <button className="btn btn-outline-primary" onClick={() => openEdit(r)} title="編輯" type="button">
                                <i className="bx bx-edit"></i>
                              </button>
                              <button
                                className="btn btn-outline-secondary"
                                onClick={() => toggleStatus(r)}
                                title={r.status === 'active' ? '暫停' : '啟用'}
                                type="button"
                              >
                                <i className={r.status === 'active' ? 'bx bx-pause' : 'bx bx-play'}></i>
                              </button>
                              <button className="btn btn-outline-danger" onClick={() => deleteWorkflow(r)} title="刪除" type="button">
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
          <div className="col-md-6 mb-3">
            <div className="card">
              <div className="card-header py-2">
                <strong style={{ fontSize: '.8125rem' }}>流程節點類型</strong>
              </div>
              <div className="card-body p-2" style={{ fontSize: '.75rem' }}>
                <p className="text-muted mb-2">在編輯流程時，從上方按鈕加入對應類型節點。</p>
                <div className="d-flex flex-wrap gap-2" id="workflowNodePalette">
                  <span className="badge bg-label-primary">觸發 (Trigger)</span>
                  <span className="badge bg-label-info">條件 (Condition)</span>
                  <span className="badge bg-label-warning">動作 (Action)</span>
                  <span className="badge bg-label-success">通知 (Notify)</span>
                  <span className="badge bg-label-secondary">等待 (Wait)</span>
                  <span className="badge bg-label-danger">例外 (Exception)</span>
                </div>
              </div>
            </div>
          </div>
          <div className="col-md-6 mb-3">
            <div className="card">
              <div className="card-header py-2">
                <strong style={{ fontSize: '.8125rem' }}>執行統計</strong>
              </div>
              <div className="card-body p-2" style={{ fontSize: '.75rem' }}>
                <div className="row text-center">
                  <div className="col-3">
                    <div className="text-muted" style={{ fontSize: '.7rem' }}>啟用流程</div>
                    <div className="fw-bold" id="workflowStatActive">{activeCount}</div>
                  </div>
                  <div className="col-3">
                    <div className="text-muted" style={{ fontSize: '.7rem' }}>全部流程</div>
                    <div className="fw-bold">{records.length}</div>
                  </div>
                  <div className="col-3">
                    <div className="text-muted" style={{ fontSize: '.7rem' }}>成功率</div>
                    <div className="fw-bold">--</div>
                  </div>
                  <div className="col-3">
                    <div className="text-muted" style={{ fontSize: '.7rem' }}>平均耗時</div>
                    <div className="fw-bold">--</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <WorkflowEditorModal onSaved={loadWorkflows} />
    </>
  )
}
