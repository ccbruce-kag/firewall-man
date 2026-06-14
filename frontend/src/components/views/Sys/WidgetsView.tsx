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

export default function WidgetsView() {
  const [textBase64Source, setTextBase64Source] = useState('')
  const [textBase64Result, setTextBase64Result] = useState('')
  const [fileBase64Result, setFileBase64Result] = useState('')
  const [fileName, setFileName] = useState('decoded.bin')
  const [fileBase64Input, setFileBase64Input] = useState('')
  const [urlSource, setUrlSource] = useState('')
  const [urlResult, setUrlResult] = useState('')
  const [uuidResult, setUuidResult] = useState('')
  const [jsSource, setJsSource] = useState('')
  const [jsResult, setJsResult] = useState('')
  const [regexPattern, setRegexPattern] = useState('')
  const [regexFlags, setRegexFlags] = useState('g')
  const [regexText, setRegexText] = useState('')

  const regexResult = useMemo(() => {
    if (!regexPattern) return { error: '', matches: [] as Array<{ index: number; at: number; text: string; groups: string[] }> }
    try {
      const re = new RegExp(regexPattern, regexFlags)
      if (regexFlags.includes('g')) {
        return { error: '', matches: Array.from(regexText.matchAll(re)).map((match, index) => ({
          index,
          at: match.index ?? 0,
          text: match[0],
          groups: match.slice(1),
        })) }
      }
      const match = regexText.match(re)
      return { error: '', matches: match ? [{ index: 0, at: match.index ?? 0, text: match[0], groups: match.slice(1) }] : [] }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err), matches: [] }
    }
  }, [regexPattern, regexFlags, regexText])

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
    <div id="widgetsView" style={{ display: 'none' }}>
      <div className="row g-3">
        <div className="col-xl-6">
          <div className="card h-100"><div className="card-body">
            <div className="fw-semibold mb-2">文字 Base64</div>
            <textarea className="form-control font-monospace mb-2" rows={5} value={textBase64Source} onChange={e => setTextBase64Source(e.target.value)} />
            <div className="btn-group btn-group-sm mb-2">
              <button className="btn btn-primary" onClick={() => setTextBase64Result(encodeBase64(textBase64Source))}><i className="bx bx-right-arrow-alt me-1"></i>Encode</button>
              <button className="btn btn-outline-primary" onClick={() => {
                try { setTextBase64Result(decodeBase64(textBase64Source)) } catch (err) { setTextBase64Result(err instanceof Error ? err.message : String(err)) }
              }}><i className="bx bx-left-arrow-alt me-1"></i>Decode</button>
            </div>
            <textarea className="form-control font-monospace" rows={5} value={textBase64Result} onChange={e => setTextBase64Result(e.target.value)} />
          </div></div>
        </div>
        <div className="col-xl-6">
          <div className="card h-100"><div className="card-body">
            <div className="fw-semibold mb-2">檔案 Base64</div>
            <input className="form-control mb-2" type="file" onChange={e => handleFileToBase64(e.target.files?.[0])} />
            <textarea className="form-control font-monospace mb-2" rows={5} value={fileBase64Result} onChange={e => setFileBase64Result(e.target.value)} />
            <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => navigator.clipboard?.writeText(fileBase64Result)}><i className="bx bx-copy me-1"></i>複製 Base64</button>
            <div className="row g-2">
              <div className="col-md-8"><input className="form-control" value={fileName} onChange={e => setFileName(e.target.value)} placeholder="decoded.bin" /></div>
              <div className="col-md-4"><button className="btn btn-primary w-100" onClick={handleBase64ToFile}><i className="bx bx-download me-1"></i>還原檔案</button></div>
              <div className="col-12"><textarea className="form-control font-monospace" rows={4} value={fileBase64Input} onChange={e => setFileBase64Input(e.target.value)} placeholder="貼上 base64" /></div>
            </div>
          </div></div>
        </div>
        <div className="col-xl-6">
          <div className="card h-100"><div className="card-body">
            <div className="fw-semibold mb-2">URL Encoder</div>
            <textarea className="form-control font-monospace mb-2" rows={4} value={urlSource} onChange={e => setUrlSource(e.target.value)} />
            <div className="btn-group btn-group-sm mb-2">
              <button className="btn btn-primary" onClick={() => setUrlResult(encodeURIComponent(urlSource))}>Encode</button>
              <button className="btn btn-outline-primary" onClick={() => {
                try { setUrlResult(decodeURIComponent(urlSource)) } catch (err) { setUrlResult(err instanceof Error ? err.message : String(err)) }
              }}>Decode</button>
            </div>
            <textarea className="form-control font-monospace" rows={4} value={urlResult} onChange={e => setUrlResult(e.target.value)} />
          </div></div>
        </div>
        <div className="col-xl-6">
          <div className="card h-100"><div className="card-body">
            <div className="fw-semibold mb-2">UUID</div>
            <div className="input-group">
              <input className="form-control font-monospace" value={uuidResult} onChange={e => setUuidResult(e.target.value)} />
              <button className="btn btn-primary" onClick={() => setUuidResult(crypto.randomUUID())}><i className="bx bx-refresh me-1"></i>產出</button>
              <button className="btn btn-outline-secondary" onClick={() => navigator.clipboard?.writeText(uuidResult)}><i className="bx bx-copy"></i></button>
            </div>
          </div></div>
        </div>
        <div className="col-xl-6">
          <div className="card h-100"><div className="card-body">
            <div className="fw-semibold mb-2">JavaScript String Encoder</div>
            <textarea className="form-control font-monospace mb-2" rows={5} value={jsSource} onChange={e => setJsSource(e.target.value)} />
            <button className="btn btn-sm btn-primary mb-2" onClick={() => setJsResult(jsEncode(jsSource))}><i className="bx bx-code-alt me-1"></i>Encode</button>
            <textarea className="form-control font-monospace" rows={5} value={jsResult} onChange={e => setJsResult(e.target.value)} />
          </div></div>
        </div>
        <div className="col-xl-6">
          <div className="card h-100"><div className="card-body">
            <div className="fw-semibold mb-2">Regular Expression Tester</div>
            <div className="input-group mb-2">
              <span className="input-group-text">/</span>
              <input className="form-control font-monospace" value={regexPattern} onChange={e => setRegexPattern(e.target.value)} />
              <span className="input-group-text">/</span>
              <input className="form-control font-monospace" style={{ maxWidth: 90 }} value={regexFlags} onChange={e => setRegexFlags(e.target.value)} />
            </div>
            <textarea className="form-control font-monospace mb-2" rows={5} value={regexText} onChange={e => setRegexText(e.target.value)} />
            {regexResult.error && <div className="text-danger small mb-2">{regexResult.error}</div>}
            <div className="table-responsive" style={{ maxHeight: 240, overflow: 'auto' }}>
              <table className="table table-sm table-bordered mb-0" style={{ fontSize: '.75rem' }}>
                <thead><tr><th>#</th><th>Index</th><th>Match</th><th>Groups</th></tr></thead>
                <tbody>
                  {regexResult.matches.length === 0 ? (
                    <tr><td colSpan={4} className="text-muted">無符合資料</td></tr>
                  ) : regexResult.matches.map(match => (
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
        </div>
      </div>
    </div>
  )
}
