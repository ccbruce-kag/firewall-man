import { useEffect, useMemo, useState } from 'react'
import { settingsApi, type SystemSetting } from './settingsApi'

type FormState = {
  id: number | null
  key: string
  value: string
  category: string
  data_type: string
  description: string
  is_secret: boolean
}

const emptyForm: FormState = {
  id: null,
  key: '',
  value: '',
  category: 'general',
  data_type: 'string',
  description: '',
  is_secret: false,
}

export default function SystemSettingsView() {
  const [records, setRecords] = useState<SystemSetting[]>([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgKind, setMsgKind] = useState<'success' | 'danger'>('danger')
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    setBusy(true)
    setMsg('')
    try {
      const data = await settingsApi.listSettings()
      setRecords(data.settings || [])
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
        const data = await settingsApi.listSettings()
        if (!isMounted) setRecords(data.settings || [])
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

  const categories = useMemo(() => {
    const set = new Set<string>()
    records.forEach((s) => set.add(s.category))
    return Array.from(set).sort()
  }, [records])

  const filtered = useMemo(() => {
    return records.filter((s) => {
      if (filterCategory && s.category !== filterCategory) return false
      if (!search) return true
      const q = search.toLowerCase()
      return s.key.toLowerCase().includes(q) || s.value.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q)
    })
  }, [records, search, filterCategory])

  const grouped = useMemo(() => {
    const map: Record<string, SystemSetting[]> = {}
    filtered.forEach((s) => {
      if (!map[s.category]) map[s.category] = []
      map[s.category].push(s)
    })
    return map
  }, [filtered])

  const openNew = () => { setForm(emptyForm); setShowForm(true) }
  const openEdit = (s: SystemSetting) => {
    setForm({
      id: s.id,
      key: s.key,
      value: s.is_secret ? '' : s.value,
      category: s.category,
      data_type: s.data_type,
      description: s.description,
      is_secret: s.is_secret,
    })
    setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setForm(emptyForm) }

  const save = async () => {
    if (!form.key.trim()) {
      setMsg('鍵名為必填')
      setMsgKind('danger')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const body = {
        key: form.key.trim(),
        value: form.value,
        category: form.category.trim() || 'general',
        data_type: form.data_type,
        description: form.description.trim(),
        is_secret: form.is_secret,
      }
      if (form.id == null) {
        await settingsApi.createSetting(body)
      } else {
        await settingsApi.updateSetting(form.id, body)
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

  const remove = async (s: SystemSetting) => {
    if (!window.confirm(`確認刪除設定「${s.key}」？`)) return
    setBusy(true)
    try {
      await settingsApi.deleteSetting(s.id)
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

  const renderValue = (s: SystemSetting): string => {
    if (s.is_secret) return '••••••••'
    if (s.data_type === 'boolean') return s.value
    if (s.data_type === 'json' && s.value) {
      try {
        const obj = JSON.parse(s.value)
        const s2 = JSON.stringify(obj)
        return s2.length > 80 ? s2.slice(0, 80) + '…' : s2
      } catch {
        return s.value
      }
    }
    return s.value || <span className="text-muted">（空）</span> as unknown as string
  }

  return (
    <>
      <div id="systemSettingView" style={{ display: 'none' }}>
        <div className="row mb-3">
          <div className="col-12">
            <div className="card">
              <div className="card-header d-flex align-items-center py-2">
                <i className="bx bx-cog me-2"></i>
                <strong style={{ fontSize: '.8125rem' }}>系統設定資料維護</strong>
                <div className="ms-auto d-flex align-items-center gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={load} disabled={busy} type="button">
                    <i className="bx bx-refresh me-1"></i>重新整理
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={openNew} disabled={busy} type="button">
                    <i className="bx bx-plus me-1"></i>新增設定
                  </button>
                </div>
              </div>
              <div className="card-body p-2">
                <div className="row g-2 mb-2">
                  <div className="col-md-4">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="搜尋鍵名 / 值 / 描述"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <select
                      className="form-select form-select-sm"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                    >
                      <option value="">全部分類</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-5 d-flex align-items-center">
                    {msg && <span className={`text-${msgKind} small`}>{msg}</span>}
                  </div>
                </div>
                {Object.keys(grouped).length === 0 ? (
                  <div className="text-center text-muted py-4">
                    {records.length === 0 ? '尚無系統設定，點擊「新增設定」開始維護。' : '目前篩選條件下沒有資料。'}
                  </div>
                ) : (
                  Object.entries(grouped).map(([category, items]) => (
                    <div key={category} className="mb-3">
                      <div className="d-flex align-items-center mb-1">
                        <span className="badge bg-label-primary me-2">{category}</span>
                        <span className="text-muted" style={{ fontSize: '.7rem' }}>{items.length} 個</span>
                      </div>
                      <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle mb-0">
                          <thead className="table-light">
                            <tr>
                              <th style={{ width: '22%' }}>鍵名</th>
                              <th style={{ width: '10%' }}>類型</th>
                              <th style={{ width: '30%' }}>值</th>
                              <th style={{ width: '20%' }}>描述</th>
                              <th style={{ width: '8%' }}>機密</th>
                              <th style={{ width: '10%' }} className="text-end">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((s) => (
                              <tr key={s.id}>
                                <td className="font-monospace">{s.key}</td>
                                <td>
                                  <span className="badge bg-label-info">{s.data_type}</span>
                                </td>
                                <td style={{ fontSize: '.75rem', fontFamily: 'monospace', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {renderValue(s)}
                                </td>
                                <td className="text-muted">{s.description || '—'}</td>
                                <td>
                                  {s.is_secret ? <i className="bx bx-lock text-danger" title="機密"></i> : <span className="text-muted">—</span>}
                                </td>
                                <td className="text-end">
                                  <div className="btn-group btn-group-sm">
                                    <button className="btn btn-outline-primary" onClick={() => openEdit(s)} title="編輯" type="button">
                                      <i className="bx bx-edit"></i>
                                    </button>
                                    <button className="btn btn-outline-danger" onClick={() => remove(s)} title="刪除" type="button">
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
                  ))
                )}
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
                  <i className="bx bx-cog me-1"></i>{form.id == null ? '新增系統設定' : `編輯設定 #${form.id}`}
                </h6>
                <button type="button" className="btn-close" onClick={closeForm} aria-label="Close"></button>
              </div>
              <div className="modal-body">
                <div className="row g-2">
                  <div className="col-md-7">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>鍵名 *</label>
                    <input className="form-control form-control-sm font-monospace" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
                  </div>
                  <div className="col-md-5">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>分類</label>
                    <input
                      className="form-control form-control-sm"
                      list="sysCategoryList"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    />
                    <datalist id="sysCategoryList">
                      {categories.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>資料類型</label>
                    <select className="form-select form-select-sm" value={form.data_type} onChange={(e) => setForm({ ...form, data_type: e.target.value })}>
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="json">json</option>
                    </select>
                  </div>
                  <div className="col-md-6 d-flex align-items-end">
                    <div className="form-check form-switch mb-1">
                      <input className="form-check-input" type="checkbox" checked={form.is_secret} onChange={(e) => setForm({ ...form, is_secret: e.target.checked })} id="sysSecret" />
                      <label className="form-check-label" htmlFor="sysSecret" style={{ fontSize: '.8rem' }}>
                        <i className="bx bx-lock me-1"></i>機密設定
                      </label>
                    </div>
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>值{form.is_secret ? '（機密，編輯時留空表示不變）' : ''}</label>
                    {form.data_type === 'boolean' ? (
                      <select className="form-select form-select-sm" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : form.data_type === 'json' ? (
                      <textarea
                        className="form-control form-control-sm font-monospace"
                        rows={4}
                        value={form.value}
                        onChange={(e) => setForm({ ...form, value: e.target.value })}
                        placeholder='{"key":"value"}'
                      />
                    ) : (
                      <input
                        className="form-control form-control-sm"
                        type={form.is_secret ? 'password' : 'text'}
                        value={form.value}
                        onChange={(e) => setForm({ ...form, value: e.target.value })}
                      />
                    )}
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>描述</label>
                    <textarea className="form-control form-control-sm" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
