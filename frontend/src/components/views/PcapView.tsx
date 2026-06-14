export default function PcapView() {
  return (
    <div id="pcapView" style={{ display: 'none' }}>
      <div className="card"><div className="card-body">
        <div className="row g-2 align-items-end mb-2">
          <div className="col-md-4">
            <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="pcapInterface">網路介面</label>
            <select className="form-select form-select-sm font-monospace" id="pcapInterface">
              <option value="">-- 載入中 --</option>
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="pcapFilter">BPF 過濾器（選填）</label>
            <input type="text" className="form-control form-control-sm font-monospace" id="pcapFilter" placeholder="tcp port 80 or udp" />
          </div>
          <div className="col-md-2">
            <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="pcapCount">封包數</label>
            <input type="number" className="form-control form-control-sm" id="pcapCount" defaultValue={50} min={1} max={10000} />
          </div>
          <div className="col-md-2">
            <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="pcapTimeout">逾時(秒)</label>
            <input type="number" className="form-control form-control-sm" id="pcapTimeout" defaultValue={10} min={1} max={60} />
          </div>
        </div>
        <div className="d-flex gap-2 mb-2">
          <button className="btn btn-primary btn-sm" id="pcapStartBtn"><i className="bx bx-play me-1"></i>開始擷取</button>
          <div className="d-flex align-items-center"><span id="pcapStatus" className="text-muted" style={{ fontSize: '.75rem' }}></span></div>
        </div>
        <div className="table-responsive" style={{ maxHeight: 350, overflow: 'auto', fontSize: '.7rem' }}>
          <table className="table table-sm table-hover mb-0" id="pcapTable" style={{ fontSize: '.7rem', fontFamily: "'Cascadia Code', monospace" }}>
            <thead><tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ width: 85 }}>Time</th>
              <th>Source</th>
              <th>Destination</th>
              <th style={{ width: 60 }}>Proto</th>
              <th style={{ width: 50 }}>Len</th>
              <th>Info</th>
            </tr></thead>
            <tbody id="pcapTbody"></tbody>
          </table>
        </div>
        <div className="mt-2">
          <div className="d-flex justify-content-between align-items-center">
            <span style={{ fontSize: '.75rem', fontWeight: 600 }}>Hex Dump</span>
            <button className="btn btn-sm btn-outline-secondary" id="pcapClearBtn" style={{ fontSize: '.7rem' }}><i className="bx bx-trash me-1"></i>清除</button>
          </div>
          <pre id="pcapHex" className="tools-output mt-1" style={{ fontSize: '.65rem', background: '#1e1e2e', color: '#cdd6f4', padding: '.5rem', borderRadius: 4, maxHeight: 250, overflow: 'auto', whiteSpace: 'pre', fontFamily: "'Cascadia Code', monospace", display: 'none' }}></pre>
        </div>
      </div></div>
    </div>
  )
}
