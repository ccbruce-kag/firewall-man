import { useEffect, useMemo, useState } from 'react'
import { settingsApi, type Unit } from './settingsApi'

type FormState = {
  id: number | null
  code: string
  name: string
  parent_id: number | null
  description: string
  enabled: boolean
}

const emptyForm: FormState = {
  id: null,
  code: '',
  name: '',
  parent_id: null,
  description: '',
  enabled: true,
}

function buildTree(units: Unit[]): { unit: Unit; depth: number }[] {
  const byParent: Record<string, Unit[]> = {}
  units.forEach((u) => {
    const key = u.parent_id == null ? '__root__' : String(u.parent_id)
    if (!byParent[key]) byParent[key] = []
    byParent[key].push(u)
  })
  const result: { unit: Unit; depth: number }[] = []
  const visit = (parentId: number | null, depth: number) => {
    const key = parentId == null ? '__root__' : String(parentId)
    const list = byParent[key] || []
    list.forEach((u) => {
      result.push({ unit: u, depth })
      visit(u.id, depth + 1)
    })
  }
  visit(null, 0)
  return result
}

export default function UnitsView() {
  const [records, setRecords] = useState<Unit[]>([])
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
      const data = await settingsApi.listUnits()
      setRecords(data.units || [])
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
        const data = await settingsApi.listUnits()
        if (!isMounted) setRecords(data.units || [])
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

  const tree = useMemo(() => buildTree(records), [records])
  const filtered = tree.filter(({ unit }) => {
    if (!search) return true
    const q = search.toLowerCase()
    return unit.code.toLowerCase().includes(q) || unit.name.toLowerCase().includes(q) || (unit.description || '').toLowerCase().includes(q)
  })

  const nameMap = useMemo(() => {
    const m: Record<number, string> = {}
    records.forEach((u) => { m[u.id] = u.name })
    return m
  }, [records])

  const openNew = () => { setForm(emptyForm); setShowForm(true) }
  const openEdit = (u: Unit) => {
    setForm({ id: u.id, code: u.code, name: u.name, parent_id: u.parent_id, description: u.description || '', enabled: u.enabled })
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
      const body = { code: form.code.trim(), name: form.name.trim(), parent_id: form.parent_id, description: form.description.trim(), enabled: form.enabled }
      if (form.id == null) {
        await settingsApi.createUnit(body)
      } else {
        await settingsApi.updateUnit(form.id, body)
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

  const remove = async (u: Unit) => {
    if (!window.confirm(`確認刪除單位「${u.name}」？`)) return
    setBusy(true)
    try {
      await settingsApi.deleteUnit(u.id)
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
      <div id="unitView" style={{ display: 'none' }}>
        <div className="row mb-3">
          <div className="col-12">
            <div className="card">
              <div className="card-header d-flex align-items-center py-2">
                <i className="bx bx-buildings me-2"></i>
                <strong style={{ fontSize: '.8125rem' }}>單位資料維護</strong>
                <div className="ms-auto d-flex align-items-center gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={load} disabled={busy} type="button">
                    <i className="bx bx-refresh me-1"></i>重新整理
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={openNew} disabled={busy} type="button">
                    <i className="bx bx-plus me-1"></i>新增單位
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
                        <th style={{ width: '25%' }}>名稱</th>
                        <th style={{ width: '20%' }}>上層單位</th>
                        <th style={{ width: '20%' }}>描述</th>
                        <th style={{ width: '8%' }}>狀態</th>
                        <th style={{ width: '12%' }} className="text-end">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center text-muted py-4">
                            {records.length === 0 ? '尚無單位，點擊「新增單位」開始維護。' : '目前篩選條件下沒有資料。'}
                          </td>
                        </tr>
                      ) : filtered.map(({ unit, depth }) => (
                        <tr key={unit.id}>
                          <td className="font-monospace">{unit.code}</td>
                          <td className="fw-semibold" style={{ paddingLeft: 8 + depth * 18 }}>
                            {depth > 0 && <span className="text-muted me-1">└</span>}
                            {unit.name}
                          </td>
                          <td className="text-muted">{unit.parent_id ? (nameMap[unit.parent_id] || `#${unit.parent_id}`) : '—'}</td>
                          <td className="text-muted">{unit.description || '—'}</td>
                          <td>
                            <span className={`badge ${unit.enabled ? 'bg-label-success' : 'bg-label-secondary'}`}>
                              {unit.enabled ? '啟用' : '停用'}
                            </span>
                          </td>
                          <td className="text-end">
                            <div className="btn-group btn-group-sm">
                              <button className="btn btn-outline-primary" onClick={() => openEdit(unit)} title="編輯" type="button">
                                <i className="bx bx-edit"></i>
                              </button>
                              <button className="btn btn-outline-danger" onClick={() => remove(unit)} title="刪除" type="button">
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
                  <i className="bx bx-buildings me-1"></i>{form.id == null ? '新增單位' : `編輯單位 #${form.id}`}
                </h6>
                <button type="button" className="btn-close" onClick={closeForm} aria-label="Close"></button>
              </div>
              <div className="modal-body">
                <div className="row g-2">
                  <div className="col-md-4">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>代碼 *</label>
                    <input className="form-control form-control-sm font-monospace" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="例如 HQ-IT" />
                  </div>
                  <div className="col-md-5">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>名稱 *</label>
                    <input className="form-control form-control-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如 資訊部" />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>狀態</label>
                    <div className="form-check form-switch mt-1">
                      <input className="form-check-input" type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} id="unitEnabled" />
                      <label className="form-check-label" htmlFor="unitEnabled" style={{ fontSize: '.8rem' }}>{form.enabled ? '啟用' : '停用'}</label>
                    </div>
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>上層單位</label>
                    <select
                      className="form-select form-select-sm"
                      value={form.parent_id ?? ''}
                      onChange={(e) => setForm({ ...form, parent_id: e.target.value === '' ? null : Number(e.target.value) })}
                    >
                      <option value="">（無，頂層單位）</option>
                      {records
                        .filter((u) => u.id !== form.id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>{u.code} - {u.name}</option>
                        ))}
                    </select>
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
