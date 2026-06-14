export default function LogViewerView() {
  return (
    <div id="logViewerView" style={{ display: 'none' }}>
      <div className="card">
        <div className="card-body">
          <div className="row g-2 align-items-end mb-2">
            <div className="col-md-4">
              <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsLogSelect">選擇日誌檔案</label>
              <select className="form-select font-monospace" id="toolsLogSelect"><option value="">-- 自訂路徑 --</option></select>
            </div>
            <div className="col-md-4">
              <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsLogPath">或輸入路徑</label>
              <input type="text" className="form-control font-monospace" id="toolsLogPath" placeholder="/var/log/system.log" />
            </div>
            <div className="col-md-2">
              <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsLogLines">行數</label>
              <input type="number" className="form-control" id="toolsLogLines" defaultValue={50} min={10} max={5000} />
            </div>
            <div className="col-md-2">
              <button className="btn btn-primary w-100" id="toolsLogTailBtn"><i className="bx bx-play me-1"></i>Tail</button>
            </div>
          </div>
          <div className="d-flex align-items-center gap-3 mb-2">
            <div className="form-check form-switch mb-0">
              <input className="form-check-input" type="checkbox" id="toolsLogAutoRefresh" />
              <label className="form-check-label" htmlFor="toolsLogAutoRefresh" style={{ fontSize: '.75rem' }}>自動更新 (3秒)</label>
            </div>
            <span className="text-muted" id="toolsLogStatus" style={{ fontSize: '.75rem' }}></span>
            <button className="btn btn-sm btn-outline-secondary ms-auto" id="toolsLogClearBtn"><i className="bx bx-trash me-1"></i>清除</button>
          </div>
          <pre className="tools-output" id="toolsLogOutput" style={{ fontSize: '.75rem', background: '#1e1e2e', color: '#cdd6f4', padding: '.5rem', borderRadius: 4, maxHeight: 500, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: "'Cascadia Code', monospace" }}></pre>
        </div>
      </div>
    </div>
  )
}
