import { useEffect, useState } from 'react'
import { settingsApi, type Role } from './settingsApi'

type FormState = {
  id: number | null
  code: string
  name: string
  description: string
  enabled: boolean
}

const emptyForm: FormState = {
  id: null,
  code: '',
  name: '',
  description: '',
  enabled: true,
}

export default function RolesView() {
  const [records, setRecords] = useState<Role[]>([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgKind, setMsgKind] = useState<'success' | 'danger'>('danger')
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    setBusy(true)
    setMsg('')
    try {
      const data = await settingsApi.listRoles()
      setRecords(data.roles || [])
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
      setMsgKind('danger')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let isMounted = false
    ;(async () => {
      setBusy(true)
      setMsg('')
      try {
        const data = await settingsApi.listRoles()
        if (!isMounted) setRecords(data.roles || [])
      } catch (err) {
        if (!isMounted) {
          setMsg(err instanceof Error ? err.message : String(err))
          setMsgKind('danger')
        }
      } finally {
        if (!isMounted) setBusy(false)
      }
    })()
    return () => { isMounted = true }
  }, [])

  const filtered = records.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
  })

  const openNew = () => { setForm(emptyForm); setShowForm(true) }
  const openEdit = (r: Role) => {
    setForm({ id: r.id, code: r.code, name: r.name, description: r.description || '', enabled: r.enabled })
    setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setForm(emptyForm) }

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setMsg('代碼與名稱為必填')
      setMsgKind('danger')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const body = { code: form.code.trim(), name: form.name.trim(), description: form.description.trim(), enabled: form.enabled }
      if (form.id == null) {
        await settingsApi.createRole(body)
      } else {
        await settingsApi.updateRole(form.id, body)
      }
      await load()
      setMsg('已儲存')
      setMsgKind('success')
      closeForm()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
      setMsgKind('danger')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r: Role) => {
    if (!window.confirm(`確認刪除角色「${r.name}」？`)) return
    setBusy(true)
    try {
      await settingsApi.deleteRole(r.id)
      await load()
      setMsg('已刪除')
      setMsgKind('success')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
      setMsgKind('danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div id="roleView" style={{ display: 'none' }}>
        <div className="row mb-3">
          <div className="col-12">
            <div className="card">
              <div className="card-header d-flex align-items-center py-2">
                <i className="bx bx-id-card me-2"></i>
                <strong style={{ fontSize: '.8125rem' }}>角色資料維護</strong>
                <div className="ms-auto d-flex align-items-center gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={load} disabled={busy} type="button">
                    <i className="bx bx-refresh me-1"></i>重新整理
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={openNew} disabled={busy} type="button">
                    <i className="bx bx-plus me-1"></i>新增角色
                  </button>
                </div>
              </div>
              <div className="card-body p-2">
                <div className="row g-2 mb-2">
                  <div className="col-md-4">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="搜尋代碼 / 名稱 / 描述"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="col-md-8 d-flex align-items-center">
                    {msg && <span className={`text-${msgKind} small`}>{msg}</span>}
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: '15%' }}>代碼</th>
                        <th style={{ width: '20%' }}>名稱</th>
                        <th style={{ width: '40%' }}>描述</th>
                        <th style={{ width: '8%' }}>狀態</th>
                        <th style={{ width: '17%' }} className="text-end">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center text-muted py-4">
                            {records.length === 0 ? '尚無角色，點擊「新增角色」開始維護。' : '目前篩選條件下沒有資料。'}
                          </td>
                        </tr>
                      ) : filtered.map((r) => (
                        <tr key={r.id}>
                          <td className="font-monospace">{r.code}</td>
                          <td className="fw-semibold">{r.name}</td>
                          <td className="text-muted">{r.description || '—'}</td>
                          <td>
                            <span className={`badge ${r.enabled ? 'bg-label-success' : 'bg-label-secondary'}`}>
                              {r.enabled ? '啟用' : '停用'}
                            </span>
                          </td>
                          <td className="text-end">
                            <div className="btn-group btn-group-sm">
                              <button className="btn btn-outline-primary" onClick={() => openEdit(r)} title="編輯" type="button">
                                <i className="bx bx-edit"></i>
                              </button>
                              <button className="btn btn-outline-danger" onClick={() => remove(r)} title="刪除" type="button">
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
      </div>
      {showForm && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title">
                  <i className="bx bx-id-card me-1"></i>{form.id == null ? '新增角色' : `編輯角色 #${form.id}`}
                </h6>
                <button type="button" className="btn-close" onClick={closeForm} aria-label="Close"></button>
              </div>
              <div className="modal-body">
                <div className="row g-2">
                  <div className="col-md-4">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>代碼 *</label>
                    <input className="form-control form-control-sm font-monospace" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="例如 admin" />
                  </div>
                  <div className="col-md-5">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>名稱 *</label>
                    <input className="form-control form-control-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如 系統管理員" />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>狀態</label>
                    <div className="form-check form-switch mt-1">
                      <input className="form-check-input" type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} id="roleEnabled" />
                      <label className="form-check-label" htmlFor="roleEnabled" style={{ fontSize: '.8rem' }}>{form.enabled ? '啟用' : '停用'}</label>
                    </div>
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>描述</label>
                    <textarea className="form-control form-control-sm" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="modal-footer py-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeForm}>取消</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
                  <i className="bx bx-save me-1"></i>{busy ? '儲存中…' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
