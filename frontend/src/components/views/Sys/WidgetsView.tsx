import { useMemo, useState } from 'react'

function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function decodeBase64(text: string) {
  const binary = atob(text.trim())
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function jsEncode(text: string) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/[\b]/g, '\\b')
    .replace(/\f/g, '\\f')
    .replace(/[<>\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

function downloadBlob(filename: string, content: BlobPart, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

type TabKey = 'base64' | 'url' | 'js' | 'uuid' | 'regex'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'base64', label: 'Base64',     icon: 'bx-data'         },
  { key: 'url',    label: 'URL',        icon: 'bx-link'         },
  { key: 'js',     label: 'JavaScript', icon: 'bx-code-alt'     },
  { key: 'uuid',   label: 'UUID',       icon: 'bx-fingerprint'  },
  { key: 'regex',  label: 'Regex',      icon: 'bx-search-alt'   },
]

function Base64Tab() {
  const [textSource, setTextSource] = useState('')
  const [textResult, setTextResult] = useState('')
  const [fileBase64Result, setFileBase64Result] = useState('')
  const [fileName, setFileName] = useState('decoded.bin')
  const [fileBase64Input, setFileBase64Input] = useState('')

  const handleFileToBase64 = async (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      setFileName(file.name)
      setFileBase64Result(dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleBase64ToFile = () => {
    const clean = fileBase64Input.trim()
    if (!clean) return
    const binary = atob(clean.includes(',') ? clean.split(',').pop() || '' : clean)
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    downloadBlob(fileName || 'decoded.bin', bytes, 'application/octet-stream')
  }

  return (
    <div className="row g-3">
      <div className="col-12">
        <h6 className="text-muted mb-2" style={{ fontSize: '.8rem' }}>
          <i className="bx bx-text me-1"></i>文字 Base64
        </h6>
        <div className="card"><div className="card-body">
          <textarea
            className="form-control font-monospace mb-2"
            rows={5}
            placeholder="輸入或貼上文字"
            value={textSource}
            onChange={e => setTextSource(e.target.value)}
          />
          <div className="btn-group btn-group-sm mb-2">
            <button className="btn btn-primary" onClick={() => setTextResult(encodeBase64(textSource))}>
              <i className="bx bx-right-arrow-alt me-1"></i>Encode
            </button>
            <button className="btn btn-outline-primary" onClick={() => {
              try { setTextResult(decodeBase64(textSource)) } catch (err) { setTextResult(err instanceof Error ? err.message : String(err)) }
            }}>
              <i className="bx bx-left-arrow-alt me-1"></i>Decode
            </button>
            <button className="btn btn-outline-secondary" onClick={() => navigator.clipboard?.writeText(textResult)}>
              <i className="bx bx-copy me-1"></i>複製
            </button>
          </div>
          <textarea
            className="form-control font-monospace"
            rows={5}
            placeholder="結果"
            value={textResult}
            onChange={e => setTextResult(e.target.value)}
          />
        </div></div>
      </div>
      <div className="col-12">
        <h6 className="text-muted mb-2" style={{ fontSize: '.8rem' }}>
          <i className="bx bx-file me-1"></i>檔案 Base64
        </h6>
        <div className="card"><div className="card-body">
          <input className="form-control mb-2" type="file" onChange={e => handleFileToBase64(e.target.files?.[0])} />
          <textarea
            className="form-control font-monospace mb-2"
            rows={5}
            placeholder="Base64 結果"
            value={fileBase64Result}
            onChange={e => setFileBase64Result(e.target.value)}
          />
          <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => navigator.clipboard?.writeText(fileBase64Result)}>
            <i className="bx bx-copy me-1"></i>複製 Base64
          </button>
          <div className="row g-2">
            <div className="col-md-8">
              <input className="form-control" value={fileName} onChange={e => setFileName(e.target.value)} placeholder="decoded.bin" />
            </div>
            <div className="col-md-4">
              <button className="btn btn-primary w-100" onClick={handleBase64ToFile}>
                <i className="bx bx-download me-1"></i>還原檔案
              </button>
            </div>
            <div className="col-12">
              <textarea
                className="form-control font-monospace"
                rows={4}
                value={fileBase64Input}
                onChange={e => setFileBase64Input(e.target.value)}
                placeholder="貼上 base64"
              />
            </div>
          </div>
        </div></div>
      </div>
    </div>
  )
}

function UrlTab() {
  const [source, setSource] = useState('')
  const [result, setResult] = useState('')
  return (
    <div className="card"><div className="card-body">
      <textarea
        className="form-control font-monospace mb-2"
        rows={4}
        placeholder="輸入要編碼或解碼的文字"
        value={source}
        onChange={e => setSource(e.target.value)}
      />
      <div className="btn-group btn-group-sm mb-2">
        <button className="btn btn-primary" onClick={() => setResult(encodeURIComponent(source))}>
          <i className="bx bx-right-arrow-alt me-1"></i>Encode
        </button>
        <button className="btn btn-outline-primary" onClick={() => {
          try { setResult(decodeURIComponent(source)) } catch (err) { setResult(err instanceof Error ? err.message : String(err)) }
        }}>
          <i className="bx bx-left-arrow-alt me-1"></i>Decode
        </button>
        <button className="btn btn-outline-secondary" onClick={() => navigator.clipboard?.writeText(result)}>
          <i className="bx bx-copy me-1"></i>複製
        </button>
      </div>
      <textarea
        className="form-control font-monospace"
        rows={4}
        placeholder="結果"
        value={result}
        onChange={e => setResult(e.target.value)}
      />
    </div></div>
  )
}

function JsEncodeTab() {
  const [source, setSource] = useState('')
  const [result, setResult] = useState('')
  return (
    <div className="card"><div className="card-body">
      <textarea
        className="form-control font-monospace mb-2"
        rows={5}
        placeholder="輸入字串，將編碼為可在 JavaScript 原始碼中安全使用的字面值"
        value={source}
        onChange={e => setSource(e.target.value)}
      />
      <div className="btn-group btn-group-sm mb-2">
        <button className="btn btn-primary" onClick={() => setResult(jsEncode(source))}>
          <i className="bx bx-code-alt me-1"></i>Encode
        </button>
        <button className="btn btn-outline-secondary" onClick={() => navigator.clipboard?.writeText(result)}>
          <i className="bx bx-copy me-1"></i>複製
        </button>
      </div>
      <textarea
        className="form-control font-monospace"
        rows={5}
        placeholder="結果"
        value={result}
        onChange={e => setResult(e.target.value)}
      />
    </div></div>
  )
}

function UuidTab() {
  const [result, setResult] = useState('')
  const [history, setHistory] = useState<string[]>([])
  return (
    <div className="card"><div className="card-body">
      <div className="input-group mb-3">
        <input className="form-control font-monospace" placeholder="點擊「產出」生成 UUID" value={result} onChange={e => setResult(e.target.value)} />
        <button className="btn btn-primary" onClick={() => {
          const id = crypto.randomUUID()
          setResult(id)
          setHistory(prev => [id, ...prev].slice(0, 10))
        }}>
          <i className="bx bx-refresh me-1"></i>產出
        </button>
        <button className="btn btn-outline-secondary" onClick={() => navigator.clipboard?.writeText(result)}>
          <i className="bx bx-copy me-1"></i>複製
        </button>
      </div>
      <div className="text-muted mb-1" style={{ fontSize: '.75rem' }}>最近 10 筆</div>
      <ul className="list-group" style={{ fontSize: '.75rem' }}>
        {history.length === 0 ? (
          <li className="list-group-item text-muted">尚無紀錄</li>
        ) : history.map((id, idx) => (
          <li key={`${id}-${idx}`} className="list-group-item d-flex align-items-center gap-2 font-monospace">
            <span className="text-muted" style={{ minWidth: 24 }}>{idx + 1}.</span>
            <span className="flex-grow-1" style={{ wordBreak: 'break-all' }}>{id}</span>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => navigator.clipboard?.writeText(id)} title="複製">
              <i className="bx bx-copy"></i>
            </button>
          </li>
        ))}
      </ul>
    </div></div>
  )
}

function RegexTab() {
  const [pattern, setPattern] = useState('')
  const [flags, setFlags] = useState('g')
  const [text, setText] = useState('')

  const result = useMemo(() => {
    if (!pattern) return { error: '', matches: [] as Array<{ index: number; at: number; text: string; groups: string[] }> }
    try {
      const re = new RegExp(pattern, flags)
      if (flags.includes('g')) {
        return {
          error: '',
          matches: Array.from(text.matchAll(re)).map((match, index) => ({
            index,
            at: match.index ?? 0,
            text: match[0],
            groups: match.slice(1),
          })),
        }
      }
      const match = text.match(re)
      return {
        error: '',
        matches: match ? [{ index: 0, at: match.index ?? 0, text: match[0], groups: match.slice(1) }] : [],
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), matches: [] }
    }
  }, [pattern, flags, text])

  return (
    <div className="card"><div className="card-body">
      <div className="input-group mb-2">
        <span className="input-group-text">/</span>
        <input className="form-control font-monospace" placeholder="正則表達式" value={pattern} onChange={e => setPattern(e.target.value)} />
        <span className="input-group-text">/</span>
        <input className="form-control font-monospace" style={{ maxWidth: 90 }} placeholder="flags" value={flags} onChange={e => setFlags(e.target.value)} />
      </div>
      <textarea
        className="form-control font-monospace mb-2"
        rows={6}
        placeholder="待測試的文字"
        value={text}
        onChange={e => setText(e.target.value)}
      />
      {result.error && <div className="text-danger small mb-2">錯誤：{result.error}</div>}
      <div className="d-flex align-items-center gap-2 mb-1">
        <strong style={{ fontSize: '.8rem' }}>符合結果</strong>
        <span className="badge bg-label-info">{result.matches.length} 筆</span>
      </div>
      <div className="table-responsive" style={{ maxHeight: 280, overflow: 'auto' }}>
        <table className="table table-sm table-bordered mb-0" style={{ fontSize: '.75rem' }}>
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th style={{ width: 80 }}>Index</th>
              <th>Match</th>
              <th>Groups</th>
            </tr>
          </thead>
          <tbody>
            {result.matches.length === 0 ? (
              <tr><td colSpan={4} className="text-muted">無符合資料</td></tr>
            ) : result.matches.map(match => (
              <tr key={`${match.index}-${match.at}`}>
                <td>{match.index + 1}</td>
                <td>{match.at}</td>
                <td className="font-monospace">{match.text}</td>
                <td className="font-monospace">{match.groups.filter(Boolean).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div></div>
  )
}

export default function WidgetsView() {
  const [activeTab, setActiveTab] = useState<TabKey>('base64')

  return (
    <div id="widgetsView" style={{ display: 'none' }}>
      <div className="card">
        <div className="card-header d-flex align-items-center py-2">
          <i className="bx bx-cube me-2"></i>
          <strong style={{ fontSize: '.8125rem' }}>Widgets 工具集</strong>
        </div>
        <div className="card-body p-0">
          <ul className="nav nav-tabs px-3 pt-2" role="tablist">
            {TABS.map(tab => (
              <li key={tab.key} className="nav-item" role="presentation">
                <button
                  type="button"
                  className={`nav-link d-flex align-items-center gap-1 ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                  style={{ fontSize: '.8rem' }}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                >
                  <i className={`bx ${tab.icon}`}></i>
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="tab-content p-3" style={{ minHeight: 400 }}>
            {activeTab === 'base64' && <Base64Tab />}
            {activeTab === 'url' && <UrlTab />}
            {activeTab === 'js' && <JsEncodeTab />}
            {activeTab === 'uuid' && <UuidTab />}
            {activeTab === 'regex' && <RegexTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
