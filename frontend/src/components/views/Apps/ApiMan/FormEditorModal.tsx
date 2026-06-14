import { useEffect, useMemo, useState } from 'react'
import { getApiBase } from '../../../../utils/api'
import './form-editor-layout.css'

export type FormRecord = {
  id: number
  name: string
  description: string
  form_schema_json: string
  created_at: string
  updated_at: string
}

type FieldType = 'text' | 'textarea' | 'number' | 'email' | 'password' | 'select' | 'checkbox' | 'radio' | 'date'

type FormField = {
  id: string
  type: FieldType
  label: string
  name: string
  placeholder?: string
  required?: boolean
  options?: string[]
}

type Props = {
  record: FormRecord | null
  visible: boolean
  onSaved: () => void
  onClose: () => void
}

const fieldTypes: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: '文字' },
  { value: 'textarea', label: '多行文字' },
  { value: 'number', label: '數字' },
  { value: 'email', label: 'Email' },
  { value: 'password', label: '密碼' },
  { value: 'select', label: '下拉選單' },
  { value: 'checkbox', label: '核取方塊' },
  { value: 'radio', label: '單選' },
  { value: 'date', label: '日期' },
]

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
  if (!res.ok || json.code !== 0) {
    throw new Error(json.msg || `HTTP ${res.status}`)
  }
  return json.data as T
}

function newField(index: number): FormField {
  return {
    id: `field_${Date.now()}_${index}`,
    type: 'text',
    label: `欄位 ${index + 1}`,
    name: `field_${index + 1}`,
    placeholder: '',
    required: false,
    options: [],
  }
}

function normalizeField(raw: Record<string, unknown>, index: number): FormField {
  const type = fieldTypes.some((item) => item.value === raw.type) ? raw.type as FieldType : 'text'
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : `欄位 ${index + 1}`
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : `field_${index + 1}`
  const rawOptions = Array.isArray(raw.options) ? raw.options : []
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `field_${index + 1}`,
    type,
    label,
    name,
    placeholder: typeof raw.placeholder === 'string' ? raw.placeholder : '',
    required: Boolean(raw.required),
    options: rawOptions.map((item) => String(item)).filter(Boolean),
  }
}

function parseFields(schema: string | null | undefined): FormField[] {
  if (!schema?.trim()) return []
  try {
    const parsed = JSON.parse(schema)
    const rawFields = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.fields)
        ? parsed.fields
        : Array.isArray(parsed?.components)
          ? parsed.components
          : []
    return rawFields
      .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map(normalizeField)
  } catch {
    return []
  }
}

function stringifyFields(fields: FormField[]): string {
  return JSON.stringify(fields.map(({ id, ...field }) => ({ id, ...field })), null, 2)
}

function needsOptions(type: FieldType): boolean {
  return type === 'select' || type === 'radio'
}

export default function FormEditorModal({ record, visible, onSaved, onClose }: Props) {
  const [name, setName] = useState(record?.name || '')
  const [description, setDescription] = useState(record?.description || '')
  const [busy, setBusy] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [fields, setFields] = useState<FormField[]>([])
  const [jsonText, setJsonText] = useState('[]')
  const [jsonDirty, setJsonDirty] = useState(false)

  useEffect(() => {
    if (!visible) {
      setErrMsg('')
      setJsonDirty(false)
      return
    }
    const parsedFields = parseFields(record?.form_schema_json)
    setName(record?.name || '')
    setDescription(record?.description || '')
    setFields(parsedFields)
    setJsonText(stringifyFields(parsedFields))
    setJsonDirty(false)
  }, [visible, record])

  useEffect(() => {
    if (!jsonDirty) setJsonText(stringifyFields(fields))
  }, [fields, jsonDirty])

  const previewFields = useMemo(() => fields.filter((field) => field.label.trim() && field.name.trim()), [fields])

  const setField = (index: number, patch: Partial<FormField>) => {
    setFields((current) => current.map((field, i) => {
      if (i !== index) return field
      const next = { ...field, ...patch }
      if (patch.type && !needsOptions(patch.type)) next.options = []
      return next
    }))
    setJsonDirty(false)
  }

  const addField = () => {
    setFields((current) => [...current, newField(current.length)])
    setJsonDirty(false)
  }

  const removeField = (index: number) => {
    setFields((current) => current.filter((_, i) => i !== index))
    setJsonDirty(false)
  }

  const moveField = (index: number, offset: number) => {
    setFields((current) => {
      const target = index + offset
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
    setJsonDirty(false)
  }

  const applyJson = () => {
    try {
      const next = parseFields(jsonText)
      JSON.parse(jsonText)
      setFields(next)
      setJsonDirty(false)
      setErrMsg('')
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err))
    }
  }

  const schemaForSave = () => {
    if (!jsonDirty) return stringifyFields(fields)
    JSON.parse(jsonText)
    return stringifyFields(parseFields(jsonText))
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setErrMsg('請輸入名稱')
      return
    }
    setBusy(true)
    setErrMsg('')
    try {
      const body = { name: name.trim(), description: description.trim(), form_schema_json: schemaForSave() }
      if (record) {
        await formApi(`/api/apiman/forms/${record.id}`, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await formApi('/api/apiman/forms', { method: 'POST', body: JSON.stringify(body) })
      }
      onSaved()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExportJson = () => {
    const schema = jsonDirty ? jsonText : stringifyFields(fields)
    const blob = new Blob([schema], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.trim() || 'form'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="modal-backdrop fade show" style={{ display: visible ? undefined : 'none' }}></div>
      <div className={`modal fade${visible ? ' show' : ''}`} style={{ display: visible ? 'block' : 'none' }} tabIndex={-1}>
        <div className="modal-dialog modal-xl" style={{ maxWidth: '95vw' }}>
          <div className="modal-content" style={{ height: '92vh' }}>
            <div className="modal-header py-2">
              <h6 className="modal-title d-flex align-items-center gap-2">
                <i className="bx bx-list-check"></i>
                {record ? `編輯 Form #${record.id}` : '新增 Form'}
              </h6>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close"></button>
            </div>
            <div className="modal-body p-2 d-flex flex-column" style={{ overflow: 'hidden' }}>
              <div className="row g-2 mb-2">
                <div className="col-md-5">
                  <label className="form-label mb-1" style={{ fontSize: '.7rem' }}>名稱 *</label>
                  <input className="form-control form-control-sm" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="col-md-5">
                  <label className="form-label mb-1" style={{ fontSize: '.7rem' }}>描述</label>
                  <input className="form-control form-control-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="col-md-2 d-flex align-items-end">
                  <span className="badge bg-label-info">{fields.length} 欄位</span>
                </div>
              </div>
              {errMsg && <div className="alert alert-danger py-1 mb-2" style={{ fontSize: '.75rem' }}>{errMsg}</div>}
              <div className="kyklos-form-layout">
                <div className="kyklos-form-fields">
                  <div className="d-flex align-items-center mb-2">
                    <strong style={{ fontSize: '.8125rem' }}>欄位設定</strong>
                    <button type="button" className="btn btn-sm btn-primary ms-auto" onClick={addField}>
                      <i className="bx bx-plus me-1"></i>新增欄位
                    </button>
                  </div>
                  <div className="table-responsive kyklos-form-table">
                    <table className="table table-sm align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th style={{ width: '8%' }}>排序</th>
                          <th style={{ width: '14%' }}>類型</th>
                          <th style={{ width: '18%' }}>標籤</th>
                          <th style={{ width: '18%' }}>欄位名</th>
                          <th style={{ width: '18%' }}>提示</th>
                          <th style={{ width: '16%' }}>選項</th>
                          <th style={{ width: '8%' }} className="text-end">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.length === 0 ? (
                          <tr><td colSpan={7} className="text-center text-muted py-4">尚無欄位，點擊「新增欄位」開始。</td></tr>
                        ) : fields.map((field, index) => (
                          <tr key={field.id}>
                            <td>
                              <div className="btn-group btn-group-sm">
                                <button type="button" className="btn btn-outline-secondary" onClick={() => moveField(index, -1)} disabled={index === 0} title="上移"><i className="bx bx-up-arrow-alt"></i></button>
                                <button type="button" className="btn btn-outline-secondary" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} title="下移"><i className="bx bx-down-arrow-alt"></i></button>
                              </div>
                            </td>
                            <td>
                              <select className="form-select form-select-sm" value={field.type} onChange={(e) => setField(index, { type: e.target.value as FieldType })}>
                                {fieldTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                              </select>
                            </td>
                            <td><input className="form-control form-control-sm" value={field.label} onChange={(e) => setField(index, { label: e.target.value })} /></td>
                            <td><input className="form-control form-control-sm" value={field.name} onChange={(e) => setField(index, { name: e.target.value })} /></td>
                            <td><input className="form-control form-control-sm" value={field.placeholder || ''} onChange={(e) => setField(index, { placeholder: e.target.value })} /></td>
                            <td>
                              {needsOptions(field.type) ? (
                                <input className="form-control form-control-sm" value={(field.options || []).join(', ')} onChange={(e) => setField(index, { options: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="A, B, C" />
                              ) : (
                                <div className="form-check">
                                  <input className="form-check-input" type="checkbox" checked={Boolean(field.required)} onChange={(e) => setField(index, { required: e.target.checked })} id={`field-required-${field.id}`} />
                                  <label className="form-check-label small" htmlFor={`field-required-${field.id}`}>必填</label>
                                </div>
                              )}
                            </td>
                            <td className="text-end">
                              <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeField(index)} title="刪除"><i className="bx bx-trash"></i></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="kyklos-form-side">
                  <div className="kyklos-form-preview">
                    <strong style={{ fontSize: '.8125rem' }}>預覽</strong>
                    <div className="mt-2">
                      {previewFields.length === 0 ? <div className="text-muted small">尚無可預覽欄位</div> : previewFields.map((field) => (
                        <div className="mb-2" key={`preview-${field.id}`}>
                          <label className="form-label mb-1 small">{field.label}{field.required && <span className="text-danger ms-1">*</span>}</label>
                          {field.type === 'textarea' ? (
                            <textarea className="form-control form-control-sm" placeholder={field.placeholder}></textarea>
                          ) : field.type === 'select' ? (
                            <select className="form-select form-select-sm"><option>{field.placeholder || '請選擇'}</option>{(field.options || []).map((item) => <option key={item}>{item}</option>)}</select>
                          ) : field.type === 'radio' ? (
                            <div>{(field.options || ['選項']).map((item) => <div className="form-check form-check-inline" key={item}><input className="form-check-input" type="radio" name={`preview-${field.id}`} /><label className="form-check-label small">{item}</label></div>)}</div>
                          ) : field.type === 'checkbox' ? (
                            <div className="form-check"><input className="form-check-input" type="checkbox" /><label className="form-check-label small">{field.placeholder || field.label}</label></div>
                          ) : (
                            <input className="form-control form-control-sm" type={field.type} placeholder={field.placeholder} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="kyklos-form-json">
                    <div className="d-flex align-items-center mb-2">
                      <strong style={{ fontSize: '.8125rem' }}>JSON</strong>
                      <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={applyJson}>套用 JSON</button>
                    </div>
                    <textarea className="form-control form-control-sm" value={jsonText} onChange={(e) => { setJsonText(e.target.value); setJsonDirty(true) }} spellCheck={false}></textarea>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer py-2">
              <span className="text-muted me-auto" style={{ fontSize: '.7rem' }}>
                <i className="bx bx-info-circle me-1"></i>內建表單 Schema 編輯器
              </span>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleExportJson}>
                <i className="bx bx-download me-1"></i>匯出 JSON
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={busy}>取消</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={busy}>
                <i className="bx bx-save me-1"></i>{busy ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
