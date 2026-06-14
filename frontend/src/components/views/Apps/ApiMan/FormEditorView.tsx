import { useEffect, useState } from 'react'
import { getApiBase } from '../../../../utils/api'
import FormEditorModal, { type FormRecord } from './FormEditorModal'

async function formApi<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBase()
  const url = base.includes('localhost:10002') || base.includes('127.0.0.1:10002')
    ? path
    : `${base}${path}`
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const json = await res.json()
  if (!res.ok || json.code !== 0) throw new Error(json.msg || `HTTP ${res.status}`)
  return json.data as T
}

function countFields(json: string): number {
  try {
    const parsed = JSON.parse(json || '[]')
    if (Array.isArray(parsed)) return parsed.length
    if (Array.isArray(parsed?.fields)) return parsed.fields.length
    if (Array.isArray(parsed?.components)) return parsed.components.length
    return 0
  } catch { return 0 }
}

function formatSize(json: string): string {
  const bytes = new Blob([json || '']).size
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function FormEditorView() {
  const [records, setRecords] = useState<FormRecord[]>([])
  const [editing, setEditing] = useState<FormRecord | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgKind, setMsgKind] = useState<'success' | 'danger'>('danger')
  const [showModal, setShowModal] = useState(false)

  const load = async () => {
    setBusy(true); setMsg('')
    try { const data = await formApi<{ forms: FormRecord[] }>('/api/apiman/forms'); setRecords(data.forms || []) }
    catch (err) { setMsg(err instanceof Error ? err.message : String(err)); setMsgKind('danger') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    let isMounted = true
    ;(async () => {
      setBusy(true); setMsg('')
      try { const data = await formApi<{ forms: FormRecord[] }>('/api/apiman/forms'); if (!isMounted) return; setRecords(data.forms || []) }
      catch (err) { if (isMounted) { setMsg(err instanceof Error ? err.message : String(err)); setMsgKind('danger') } }
      finally { if (isMounted) setBusy(false) }
    })()
    return () => { isMounted = false }
  }, [])

  const filtered = records.filter((r) => {
    if (!search) return true
    const q = search.toLowerCase()
    return r.name.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q)
  })

  const openNew = () => { setEditing(null); setShowModal(true) }
  const openEdit = (r: FormRecord) => { setEditing(r); setShowModal(true) }
  const closeModal = () => { setShowModal(false); setEditing(null) }
  const handleSaved = async () => { setShowModal(false); setEditing(null); await load(); setMsg('已儲存'); setMsgKind('success') }

  const remove = async (r: FormRecord) => {
    if (!window.confirm(`確認刪除 Form「${r.name}」？`)) return
    setBusy(true)
    try { await formApi(`/api/apiman/forms/${r.id}`, { method: 'DELETE' }); await load(); setMsg('已刪除'); setMsgKind('success') }
    catch (err) { setMsg(err instanceof Error ? err.message : String(err)); setMsgKind('danger') }
    finally { setBusy(false) }
  }

  const downloadJson = (r: FormRecord) => {
    const blob = new Blob([r.form_schema_json || '[]'], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${r.name}.json`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <>
      <div id="formEditorView" style={{ display: 'none' }}>
        <div className="row mb-3"><div className="col-12"><div className="card">
          <div className="card-header d-flex align-items-center py-2">
            <i className="bx bx-list-check me-2"></i>
            <strong style={{ fontSize: '.8125rem' }}>Form 表單編輯</strong>
            <div className="ms-auto d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-outline-secondary" onClick={load} disabled={busy} type="button"><i className="bx bx-refresh me-1"></i>重新整理</button>
              <button className="btn btn-sm btn-primary" onClick={openNew} disabled={busy} type="button"><i className="bx bx-plus me-1"></i>新增 Form</button>
            </div>
          </div>
          <div className="card-body p-2">
            <div className="row g-2 mb-2">
              <div className="col-md-4"><input type="text" className="form-control form-control-sm" placeholder="搜尋名稱 / 描述" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <div className="col-md-8 d-flex align-items-center">{msg && <span className={`text-${msgKind} small`}>{msg}</span>}</div>
            </div>
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light"><tr><th style={{ width: '20%' }}>名稱</th><th style={{ width: '30%' }}>描述</th><th style={{ width: '10%' }}>欄位數</th><th style={{ width: '10%' }}>大小</th><th style={{ width: '15%' }}>最後更新</th><th style={{ width: '15%' }} className="text-end">操作</th></tr></thead>
                <tbody>
                  {filtered.length === 0 ? <tr><td colSpan={6} className="text-center text-muted py-4">{records.length === 0 ? '尚無 Form，點擊「新增 Form」開始設計。' : '目前篩選條件下沒有資料。'}</td></tr> :
                    filtered.map((r) => (<tr key={r.id}>
                      <td className="fw-semibold">{r.name}</td><td className="text-muted">{r.description || '—'}</td><td><span className="badge bg-label-info">{countFields(r.form_schema_json)}</span></td>
                      <td className="text-muted" style={{ fontSize: '.75rem' }}>{formatSize(r.form_schema_json)}</td><td className="text-nowrap" style={{ fontSize: '.75rem' }}>{r.updated_at}</td>
                      <td className="text-end"><div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-primary" onClick={() => openEdit(r)} title="編輯" type="button"><i className="bx bx-edit"></i></button>
                        <button className="btn btn-outline-info" onClick={() => downloadJson(r)} title="下載 JSON" type="button"><i className="bx bx-download"></i></button>
                        <button className="btn btn-outline-danger" onClick={() => remove(r)} title="刪除" type="button"><i className="bx bx-trash"></i></button>
                      </div></td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </div>
        </div></div></div>
        <div className="row mb-3"><div className="col-12"><div className="card"><div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }}>關於 Form 表單編輯</strong></div>
          <div className="card-body p-2" style={{ fontSize: '.75rem' }}>
            <p className="mb-2">Form 模組使用內建 schema 編輯器，提供常用欄位維護與 JSON schema 匯出：</p>
            <ul className="mb-0 ps-3"><li>Input / TextArea / Dropdown / Checkbox / Radio / DatePicker 等欄位</li><li>欄位排序、新增、修改、刪除</li><li>JSON schema 編輯、套用與匯出</li><li>搭配後端生成對應表單</li></ul>
          </div>
        </div></div></div>
      </div>
      <FormEditorModal record={editing} onSaved={handleSaved} onClose={closeModal} visible={showModal} />
    </>
  )
}
