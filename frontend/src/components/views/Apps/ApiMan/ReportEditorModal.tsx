import { useCallback, useEffect, useRef, useState } from 'react'
import 'reportbro-designer/dist/reportbro.css'
import { getApiBase } from '../../../../utils/api'

export type ReportRecord = {
  id: number
  name: string
  description: string
  report_xml: string
  created_at: string
  updated_at: string
}

type Props = {
  record: ReportRecord | null
  onSaved: () => void
  onClose: () => void
}

type ReportBroInstance = {
  getData: () => string
  setData: (xml: string) => void
  save: () => void
  destroy?: () => void
}

declare global {
  interface Window {
    ReportBro?: new (element: HTMLElement) => ReportBroInstance
  }
}

let reportBroScriptPromise: Promise<void> | null = null

function loadReportBroScript(): Promise<void> {
  if (reportBroScriptPromise) return reportBroScriptPromise
  if (window.ReportBro) {
    reportBroScriptPromise = Promise.resolve()
    return reportBroScriptPromise
  }
  reportBroScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/reportbro-designer@3.12.0/dist/reportbro.js'
    script.async = true
    script.onload = () => {
      if (window.ReportBro) resolve()
      else reject(new Error('ReportBro global not found after script load'))
    }
    script.onerror = () => reject(new Error('Failed to load reportbro.js'))
    document.head.appendChild(script)
  })
  return reportBroScriptPromise
}

async function reportApi<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
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

export default function ReportEditorModal({ record, onSaved, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const reportRef = useRef<ReportBroInstance | null>(null)
  const [name, setName] = useState(record?.name || '')
  const [description, setDescription] = useState(record?.description || '')
  const [busy, setBusy] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let isMounted = true
    let instance: ReportBroInstance | null = null
    ;(async () => {
      try {
        await loadReportBroScript()
        if (!isMounted || !containerRef.current || !window.ReportBro) return
        instance = new window.ReportBro(containerRef.current)
        reportRef.current = instance
        if (record?.report_xml) {
          try { instance.setData(record.report_xml) } catch { /* ignore */ }
        }
        setReady(true)
      } catch (err) {
        if (isMounted) {
          setErrMsg(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      isMounted = false
      if (instance && typeof instance.destroy === 'function') {
        try { instance.destroy() } catch { /* ignore */ }
      }
      reportRef.current = null
    }
  }, [record?.id, record?.report_xml])

  const handleSave = async () => {
    if (!name.trim()) {
      setErrMsg('請輸入名稱')
      return
    }
    setBusy(true)
    setErrMsg('')
    try {
      const instance = reportRef.current
      const xml = instance ? instance.getData() : ''
      const body = {
        name: name.trim(),
        description: description.trim(),
        report_xml: xml,
      }
      if (record) {
        await reportApi(`/api/apiman/reports/${record.id}`, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await reportApi('/api/apiman/reports', { method: 'POST', body: JSON.stringify(body) })
      }
      onSaved()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExportXml = useCallback(() => {
    const instance = reportRef.current
    if (!instance) return
    const xml = instance.getData()
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.trim() || 'report'}.xml`
    a.click()
    URL.revokeObjectURL(url)
  }, [name])

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      tabIndex={-1}
    >
      <div className="modal-dialog modal-xl" style={{ maxWidth: '95vw' }}>
        <div className="modal-content" style={{ height: '92vh' }}>
          <div className="modal-header py-2">
            <h6 className="modal-title d-flex align-items-center gap-2">
              <i className="bx bx-file"></i>
              {record ? `編輯 Report #${record.id}` : '新增 Report'}
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
                {ready ? (
                  <span className="badge bg-label-success">已載入</span>
                ) : (
                  <span className="badge bg-label-secondary">載入中…</span>
                )}
              </div>
            </div>
            {errMsg && (
              <div className="alert alert-danger py-1 mb-2" style={{ fontSize: '.75rem' }}>{errMsg}</div>
            )}
            <div
              ref={containerRef}
              style={{
                flexGrow: 1,
                minHeight: 480,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 4,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {!ready && !errMsg && (
                <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                  <i className="bx bx-loader-alt bx-spin me-2"></i>ReportBro Designer 載入中…
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer py-2">
            <span className="text-muted me-auto" style={{ fontSize: '.7rem' }}>
              <i className="bx bx-info-circle me-1"></i>ReportBro Designer · 支援 PDF / Excel 報表模板設計
            </span>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleExportXml} disabled={!ready}>
              <i className="bx bx-download me-1"></i>匯出 XML
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={busy}>取消</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={busy || !ready}>
              <i className="bx bx-save me-1"></i>{busy ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
