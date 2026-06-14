import { useCallback, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { getApiBase } from '../../../../utils/api'

export type WireframeRecord = {
  id: number
  name: string
  description: string
  scene_json: string
  viewport_json: string | null
  created_at: string
  updated_at: string
}

type Props = {
  record: WireframeRecord | null
  onSaved: () => void
  onClose: () => void
}

type ExcalidrawElement = Record<string, unknown>
type ExcalidrawAppState = Record<string, unknown>

type ExcalidrawInitialData = {
  elements?: readonly ExcalidrawElement[]
  appState?: ExcalidrawAppState
  scrollToContent?: boolean
}

async function wireframeApi<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
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

function parseInitialScene(sceneJson: string | null | undefined): ExcalidrawInitialData {
  if (!sceneJson) return { elements: [], appState: {} }
  try {
    const parsed = JSON.parse(sceneJson)
    if (Array.isArray(parsed)) {
      return { elements: parsed as readonly ExcalidrawElement[], appState: {} }
    }
    if (parsed && typeof parsed === 'object') {
      return {
        elements: Array.isArray(parsed.elements) ? (parsed.elements as readonly ExcalidrawElement[]) : [],
        appState: parsed.appState && typeof parsed.appState === 'object' ? parsed.appState : {},
      }
    }
  } catch { /* fall through */ }
  return { elements: [], appState: {} }
}

export default function WireframeEditorModal({ record, onSaved, onClose }: Props) {
  const apiRef = useRef<{
    getSceneElements: () => readonly ExcalidrawElement[]
    getAppState: () => ExcalidrawAppState
    updateScene: (data: { elements: ExcalidrawElement[] }) => void
  } | null>(null)
  const [name, setName] = useState(record?.name || '')
  const [description, setDescription] = useState(record?.description || '')
  const [busy, setBusy] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [elementCount, setElementCount] = useState(0)

  const [initialData] = useState<ExcalidrawInitialData>(
    () => parseInitialScene(record?.scene_json),
  )

  const onExcalidrawChange = useCallback(() => {
    setElementCount(apiRef.current?.getSceneElements().length ?? 0)
  }, [])

  const setExcalidrawApi = useCallback((api: { getSceneElements: () => readonly ExcalidrawElement[]; getAppState: () => ExcalidrawAppState; updateScene: (data: { elements: ExcalidrawElement[] }) => void } | null) => {
    apiRef.current = api
  }, [])

  const handleSave = async () => {
    if (!name.trim()) {
      setErrMsg('請輸入名稱')
      return
    }
    setBusy(true)
    setErrMsg('')
    try {
      const api = apiRef.current
      const elements: readonly ExcalidrawElement[] = api ? api.getSceneElements() : []
      const appState: ExcalidrawAppState = api ? api.getAppState() : {}
      const scenePayload = {
        elements: elements.map((el: { [k: string]: unknown }) => {
          const { ...rest } = el
          return rest
        }),
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        },
      }
      const body = {
        name: name.trim(),
        description: description.trim(),
        scene_json: JSON.stringify(scenePayload),
        viewport_json: JSON.stringify({
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom,
        }),
      }
      if (record) {
        await wireframeApi(`/api/apiman/wireframes/${record.id}`, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await wireframeApi('/api/apiman/wireframes', { method: 'POST', body: JSON.stringify(body) })
      }
      onSaved()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleClear = () => {
    if (!window.confirm('確認清空畫布？')) return
    const api = apiRef.current
    if (api) {
      api.updateScene({ elements: [] })
    }
  }

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
              <i className="bx bx-pen"></i>
              {record ? `編輯 Wireframe #${record.id}` : '新增 Wireframe'}
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
                <div className="text-muted" style={{ fontSize: '.7rem' }}>
                  元素數：<span className="badge bg-label-primary ms-1">{elementCount}</span>
                </div>
              </div>
            </div>
            {errMsg && (
              <div className="alert alert-danger py-1 mb-2" style={{ fontSize: '.75rem' }}>{errMsg}</div>
            )}
            <div style={{ flexGrow: 1, position: 'relative', border: '1px solid #e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
              <Excalidraw
                excalidrawAPI={setExcalidrawApi as never}
                initialData={initialData as never}
                onChange={onExcalidrawChange as never}
                viewModeEnabled={false}
                gridModeEnabled={false}
                zenModeEnabled={false}
                UIOptions={{
                  canvasActions: { saveAsImage: true, loadScene: false },
                }}
              />
            </div>
          </div>
          <div className="modal-footer py-2">
            <span className="text-muted me-auto" style={{ fontSize: '.7rem' }}>
              <i className="bx bx-info-circle me-1"></i>Excalidraw 編輯器 · 支援手繪風格圖形、矩形、箭頭、文字等
            </span>
            <button type="button" className="btn btn-outline-warning btn-sm" onClick={handleClear} disabled={busy}>
              <i className="bx bx-eraser me-1"></i>清空畫布
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose} disabled={busy}>取消</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={busy}>
              <i className="bx bx-save me-1"></i>{busy ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
