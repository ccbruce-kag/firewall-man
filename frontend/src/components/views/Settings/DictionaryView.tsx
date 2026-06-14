import { useEffect, useMemo, useState } from 'react'
import { settingsApi, type DictionaryEntry } from './settingsApi'

type FormState = {
  id: number | null
  category: string
  code: string
  label: string
  description: string
  sort_order: number
  extra_json: string
  enabled: boolean
}

const emptyForm: FormState = {
  id: null,
  category: '',
  code: '',
  label: '',
  description: '',
  sort_order: 0,
  extra_json: '',
  enabled: true,
}

export default function DictionaryView() {
  const [records, setRecords] = useState<DictionaryEntry[]>([])
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
      const data = await settingsApi.listDictionary()
      setRecords(data.entries || [])
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
        const data = await settingsApi.listDictionary()
        if (!isMounted) setRecords(data.entries || [])
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
    records.forEach((r) => set.add(r.category))
    return Array.from(set).sort()
  }, [records])

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filterCategory && r.category !== filterCategory) return false
      if (!search) return true
      const q = search.toLowerCase()
      return r.code.toLowerCase().includes(q) || r.label.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
    })
  }, [records, search, filterCategory])

  const grouped = useMemo(() => {
    const map: Record<string, DictionaryEntry[]> = {}
    filtered.forEach((r) => {
      if (!map[r.category]) map[r.category] = []
      map[r.category].push(r)
    })
    return map
  }, [filtered])

  const openNew = () => { setForm(emptyForm); setShowForm(true) }
  const openEdit = (r: DictionaryEntry) => {
    setForm({
      id: r.id,
      category: r.category,
      code: r.code,
      label: r.label,
      description: r.description || '',
      sort_order: r.sort_order,
      extra_json: r.extra_json || '',
      enabled: r.enabled,
    })
    setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setForm(emptyForm) }

  const save = async () => {
    if (!form.category.trim() || !form.code.trim() || !form.label.trim()) {
      setMsg('分類、代碼、標籤皆為必填')
      setMsgKind('danger')
      return
    }
    setBusy(true)
    setMsg('')
    try {
      const body = {
        category: form.category.trim(),
        code: form.code.trim(),
        label: form.label.trim(),
        description: form.description.trim(),
        sort_order: form.sort_order,
        extra_json: form.extra_json.trim() || undefined,
        enabled: form.enabled,
      }
      if (form.id == null) {
        await settingsApi.createDictionary(body)
      } else {
        await settingsApi.updateDictionary(form.id, body)
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

  const remove = async (r: DictionaryEntry) => {
    if (!window.confirm(`確認刪除字典「${r.category}/${r.code}」？`)) return
    setBusy(true)
    try {
      await settingsApi.deleteDictionary(r.id)
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
      <div id="dictionaryView" style={{ display: 'none' }}>
        <div className="row mb-3">
          <div className="col-12">
            <div className="card">
              <div className="card-header d-flex align-items-center py-2">
                <i className="bx bx-book me-2"></i>
                <strong style={{ fontSize: '.8125rem' }}>資料字典資料維護</strong>
                <div className="ms-auto d-flex align-items-center gap-2">
                  <button className="btn btn-sm btn-outline-secondary" onClick={load} disabled={busy} type="button">
                    <i className="bx bx-refresh me-1"></i>重新整理
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={openNew} disabled={busy} type="button">
                    <i className="bx bx-plus me-1"></i>新增條目
                  </button>
                </div>
              </div>
              <div className="card-body p-2">
                <div className="row g-2 mb-2">
                  <div className="col-md-4">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="搜尋代碼 / 標籤 / 描述"
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
                    {records.length === 0 ? '尚無字典條目，點擊「新增條目」開始維護。' : '目前篩選條件下沒有資料。'}
                  </div>
                ) : (
                  Object.entries(grouped).map(([category, entries]) => (
                    <div key={category} className="mb-3">
                      <div className="d-flex align-items-center mb-1">
                        <span className="badge bg-label-primary me-2">{category}</span>
                        <span className="text-muted" style={{ fontSize: '.7rem' }}>{entries.length} 條</span>
                      </div>
                      <div className="table-responsive">
                        <table className="table table-sm table-hover align-middle mb-0">
                          <thead className="table-light">
                            <tr>
                              <th style={{ width: '16%' }}>代碼</th>
                              <th style={{ width: '24%' }}>標籤</th>
                              <th style={{ width: '10%' }}>排序</th>
                              <th style={{ width: '30%' }}>描述</th>
                              <th style={{ width: '8%' }}>狀態</th>
                              <th style={{ width: '12%' }} className="text-end">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries.map((r) => (
                              <tr key={r.id}>
                                <td className="font-monospace">{r.code}</td>
                                <td className="fw-semibold">{r.label}</td>
                                <td>{r.sort_order}</td>
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
                  <i className="bx bx-book me-1"></i>{form.id == null ? '新增字典條目' : `編輯字典 #${form.id}`}
                </h6>
                <button type="button" className="btn-close" onClick={closeForm} aria-label="Close"></button>
              </div>
              <div className="modal-body">
                <div className="row g-2">
                  <div className="col-md-6">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>分類 *</label>
                    <input
                      className="form-control form-control-sm"
                      list="dictCategoryList"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="例如 rule_target"
                    />
                    <datalist id="dictCategoryList">
                      {categories.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div className="col-md-4">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>代碼 *</label>
                    <input className="form-control form-control-sm font-monospace" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>排序</label>
                    <input type="number" className="form-control form-control-sm" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>標籤 *</label>
                    <input className="form-control form-control-sm" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>描述</label>
                    <textarea className="form-control form-control-sm" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="col-12">
                    <label className="form-label" style={{ fontSize: '.75rem' }}>額外設定 (JSON)</label>
                    <textarea
                      className="form-control form-control-sm font-monospace"
                      rows={3}
                      value={form.extra_json}
                      onChange={(e) => setForm({ ...form, extra_json: e.target.value })}
                      placeholder='例如 {"color":"#ff0000","icon":"bx-bell"}'
                    />
                  </div>
                  <div className="col-12">
                    <div className="form-check form-switch">
                      <input className="form-check-input" type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} id="dictEnabled" />
                      <label className="form-check-label" htmlFor="dictEnabled" style={{ fontSize: '.8rem' }}>{form.enabled ? '啟用' : '停用'}</label>
                    </div>
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
