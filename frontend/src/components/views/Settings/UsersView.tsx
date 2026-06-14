import { useEffect, useState } from 'react'
import { settingsApi, type Role, type Unit, type User } from './settingsApi'

type FormState = {
  id: number | null
  username: string
  display_name: string
  email: string
  phone: string
  password: string
  unit_id: number | null
  role_codes: string[]
  enabled: boolean
}

const emptyForm: FormState = {
  id: null,
  username: '',
  display_name: '',
  email: '',
  phone: '',
  password: '',
  unit_id: null,
  role_codes: [],
  enabled: true,
}

type ResetTarget = { id: number; username: string } | null

export default function UsersView() {
  const [records, setRecords] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgKind, setMsgKind] = useState<'success' | 'danger'>('danger')
  const [showForm, setShowForm] = useState(false)
  const [resetTarget, setResetTarget] = useState<ResetTarget>(null)
  const [resetPassword, setResetPassword] = useState('')

  const load = async () => {
    setBusy(true)
    setMsg('')
    try {
      const data = await settingsApi.listUsers()
      setRecords(data.users || [])
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
      setMsgKind('danger')
    } finally {
      setBusy(false)
    }
  }

  const loadRefs = async () => {
    try {
      const [r, u] = await Promise.all([settingsApi.listRoles(), settingsApi.listUnits()])
      setRoles(r.roles || [])
      setUnits(u.units || [])
    } catch { /* ignore */ }
  }

  useEffect(() => {
    let isMounted = false
    ;(async () => {
      setBusy(true)
      setMsg('')
      try {
        const data = await settingsApi.listUsers()
        if (!isMounted) setRecords(data.users || [])
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

  useEffect(() => {
    let isMounted = true
    ;(async () => {
      try {
        const r = await settingsApi.listRoles()
        if (!isMounted) return
        setRoles(r.roles || [])
        const u = await settingsApi.listUnits()
        if (!isMounted) return
        setUnits(u.units || [])
      } catch { /* ignore */ }
    })()
    return () => { isMounted = false }
  }, [])

  const filtered = records.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.username.toLowerCase().includes(q) ||
      (r.display_name || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q)
  })

  const unitNameMap: Record<number, string> = {}
  units.forEach((u) => { unitNameMap[u.id] = u.name })

  const openNew = () => { setForm(emptyForm); setShowForm(true) }
  const openEdit = (u: User) => {
    setForm({
      id: u.id,
      username: u.username,
      display_name: u.display_name || '',
      email: u.email || '',
      phone: u.phone || '',
      password: '',
      unit_id: u.unit_id,
      role_codes: u.role_codes || [],
      enabled: u.enabled,
    })
    setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setForm(emptyForm) }

  const save = async () => {
    if (!form.username.trim()) {
      setMsg('帳號為必填')
      setMsgKind('danger')
      return
    }
    if (form.id == null && form.password.length < 6) {
      setMsg('密碼至少需 6 個字元')
      setMsgKind('danger')
      return
    }
    if (form.password && form.password.length < 6) {
      setMsg('密碼至少需 6 個字元')
      setMsgKind('danger')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const body = {
        username: form.username.trim(),
        display_name: form.display_name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password || undefined,
        unit_id: form.unit_id,
        role_codes: form.role_codes,
        enabled: form.enabled,
      }
      if (form.id == null) {
        await settingsApi.createUser(body)
      } else {
        await settingsApi.updateUser(form.id, body)
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

  const remove = async (u: User) => {
    if (!window.confirm(`確認刪除使用者「${u.username}」？`)) return
    setBusy(true)
    try {
      await settingsApi.deleteUser(u.id)
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

  const openReset = (u: User) => {
    setResetTarget({ id: u.id, username: u.username })
    setResetPassword('')
  }
  const closeReset = () => { setResetTarget(null); setResetPassword('') }

  const submitReset = async () => {
    if (!resetTarget) return
    if (resetPassword.length < 6) {
      setMsg('密碼至少需 6 個字元')
      setMsgKind('danger')
      return
    }
    setBusy(true)
    try {
      await settingsApi.resetPassword(resetTarget.id, resetPassword)
      setMsg(`使用者 ${resetTarget.username} 密碼已重設`)
      setMsgKind('success')
      closeReset()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err))
      setMsgKind('danger')
    } finally {
      setBusy(false)
    }
  }

  const toggleRole = (code: string) => {
    setForm((f) => {
      const set = new Set(f.role_codes)
      if (set.has(code)) set.delete(code)
      else set.add(code)
      return { ...f, role_codes: Array.from(set) }
    })
  }

  return (
    <>
      <div id="userView" style={{ display: 'none' }}>
        <div className="row mb-3">
          <div className="col-12">
            <div className="card">
              <div className="card-header d-flex align-items-center py-2">
                <i className="bx bx-user me-2"></i>
                <strong style={{ fontSize: '.8125rem' }}>使用者資料維護</strong>
                <div className="ms-auto d-flex align-items-center gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => { load(); loadRefs() }} disabled={busy} type="button">
                    <i className="bx bx-refresh me-1"></i>重新整理
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={openNew} disabled={busy} type="button">
                    <i className="bx bx-plus me-1"></i>新增使用者
                  </button>
                </div>
              </div>
              <div className="card-body p-2">
                <div className="row g-2 mb-2">
                  <div className="col-md-4">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="搜尋帳號 / 顯示名稱 / Email"
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
                        <th style={{ width: '14%' }}>帳號</th>
                        <th style={{ width: '16%' }}>顯示名稱</th>
                        <th style={{ width: '20%' }}>Email</th>
                        <th style={{ width: '12%' }}>單位</th>
                        <th style={{ width: '16%' }}>角色</th>
                        <th style={{ width: '8%' }}>狀態</th>
                        <th style={{ width: '14%' }} className="text-end">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center text-muted py-4">
                            {records.length === 0 ? '尚無使用者，點擊「新增使用者」開始維護。' : '目前篩選條件下沒有資料。'}
                          </td>
                        </tr>
                      ) : filtered.map((u) => (
                        <tr key={u.id}>
                          <td className="font-monospace fw-semibold">{u.username}</td>
                          <td>{u.display_name || '—'}</td>
                          <td className="text-muted">{u.email || '—'}</td>
                          <td className="text-muted">{u.unit_id ? unitNameMap[u.unit_id] || `#${u.unit_id}` : '—'}</td>
                          <td>
                            {(u.role_codes || []).length === 0 ? <span className="text-muted">—</span> :
                              (u.role_codes || []).map((c) => <span key={c} className="badge bg-label-primary me-1">{c}</span>)}
                          </td>
                          <td>
                            <span className={`badge ${u.enabled ? 'bg-label-success' : 'bg-label-secondary'}`}>
                              {u.enabled ? '啟用' : '停用'}
                            </span>
                          </td>
                          <td className="text-end">
                            <div className="btn-group btn-group-sm">
                              <button className="btn btn-outline-primary" onClick={() => openEdit(u)} title="編輯" type="button">
                                <i className="bx bx-edit"></i>
                              </button>
                              <button className="btn btn-outline-warning" onClick={() => openReset(u)} title="重設密碼" type="button">
                                <i className="bx bx-key"></i>
                              </button>
                              <button className="btn btn-outline-danger" onClick={() => remove(u)} title="刪除" type="button">
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
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title">
                  <i className="bx bx-user me-1"></i>{form.id == null ? '新增使用者' : `編輯使用者 #${form.id}`}
                </h6>
                <button type="button" className="btn-close" onClick={closeForm} aria-label="Close"></button>
              </div>
              <div className="modal-body">
                <div className="row g-2">
                  <div className="col-md-4">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>帳號 *</label>
                    <input className="form-control form-control-sm font-monospace" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>顯示名稱</label>
                    <input className="form-control form-control-sm" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>狀態</label>
                    <div className="form-check form-switch mt-1">
                      <input className="form-check-input" type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} id="userEnabled" />
                      <label className="form-check-label" htmlFor="userEnabled" style={{ fontSize: '.8rem' }}>{form.enabled ? '啟用' : '停用'}</label>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>Email</label>
                    <input type="email" className="form-control form-control-sm" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>電話</label>
                    <input className="form-control form-control-sm" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>單位</label>
                    <select
                      className="form-select form-select-sm"
                      value={form.unit_id ?? ''}
                      onChange={(e) => setForm({ ...form, unit_id: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      <option value="">（未指派）</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.code} - {u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>{form.id == null ? '密碼 *' : '新密碼（留空表示不變）'}</label>
                    <input type="password" className="form-control form-control-sm" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="至少 6 個字元" />
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>角色（可多選）</label>
                    {roles.length === 0 ? (
                      <div className="text-muted" style={{ fontSize: '.75rem' }}>尚無角色資料</div>
                    ) : (
                      <div className="d-flex flex-wrap gap-2">
                        {roles.map((r) => {
                          const checked = form.role_codes.includes(r.code)
                          return (
                            <label
                              key={r.id}
                              className={`d-flex align-items-center gap-1 p-1 px-2 rounded ${checked ? 'bg-primary-subtle' : 'bg-light'}`}
                              style={{ cursor: 'pointer', fontSize: '.75rem' }}
                            >
                              <input
                                type="checkbox"
                                className="form-check-input m-0"
                                checked={checked}
                                onChange={() => toggleRole(r.code)}
                              />
                              <span className="fw-semibold">{r.name}</span>
                              <span className="text-muted font-monospace" style={{ fontSize: '.65rem' }}>{r.code}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}
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
      {resetTarget && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title">
                  <i className="bx bx-key me-1"></i>重設密碼
                </h6>
                <button type="button" className="btn-close" onClick={closeReset} aria-label="Close"></button>
              </div>
              <div className="modal-body">
                <p className="mb-2" style={{ fontSize: '.85rem' }}>
                  為使用者 <strong>{resetTarget.username}</strong> 設定新密碼
                </p>
                <label className="form-label" style={{ fontSize: '.75rem' }}>新密碼（至少 6 個字元）</label>
                <input
                  type="password"
                  className="form-control form-control-sm"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="modal-footer py-2">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeReset}>取消</button>
                <button type="button" className="btn btn-warning btn-sm" onClick={submitReset} disabled={busy}>
                  <i className="bx bx-key me-1"></i>{busy ? '重設中…' : '確認重設'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
