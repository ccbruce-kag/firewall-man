export default function ToolsView() {
  return (
    <div id="toolsView" style={{ display: 'none' }}>
      <ul className="nav nav-tabs nav-fill mb-3" id="toolsTabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button className="nav-link active" id="tools-ping-tab" data-bs-toggle="tab" data-bs-target="#toolsPingPane" type="button" role="tab"><i className="bx bx-signal-5 me-1"></i><span className="toolsTabLabel">Ping</span></button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="tools-pingc-tab" data-bs-toggle="tab" data-bs-target="#toolsPingCPane" type="button" role="tab"><i className="bx bx-grid-small me-1"></i><span className="toolsTabLabel">Ping Class C</span></button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="tools-lsof-tab" data-bs-toggle="tab" data-bs-target="#toolsLsofPane" type="button" role="tab"><i className="bx bx-list-ul me-1"></i><span className="toolsTabLabel">Lsof</span></button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="tools-traceroute-tab" data-bs-toggle="tab" data-bs-target="#toolsTraceroutePane" type="button" role="tab"><i className="bx bx-transfer-alt me-1"></i><span className="toolsTabLabel">Traceroute</span></button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="tools-nslookup-tab" data-bs-toggle="tab" data-bs-target="#toolsNslookupPane" type="button" role="tab"><i className="bx bx-search me-1"></i><span className="toolsTabLabel">Nslookup</span></button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="tools-iploc-tab" data-bs-toggle="tab" data-bs-target="#toolsIpLocPane" type="button" role="tab"><i className="bx bx-map me-1"></i><span className="toolsTabLabel">IP 位置</span></button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="tools-netstat-tab" data-bs-toggle="tab" data-bs-target="#toolsNetstatPane" type="button" role="tab"><i className="bx bx-analyse me-1"></i><span className="toolsTabLabel">Netstat</span></button>
        </li>
      </ul>
      <div className="tab-content p-0">
        <div className="tab-pane fade show active" id="toolsPingPane" role="tabpanel">
          <div className="card"><div className="card-body">
            <div className="row g-2 align-items-end mb-2">
              <div className="col-md-5"><label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsPingHost">目標主機</label><input type="text" className="form-control font-monospace" id="toolsPingHost" placeholder="8.8.8.8" /></div>
              <div className="col-md-2"><label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsPingCount">次數</label><input type="number" className="form-control" id="toolsPingCount" defaultValue={4} min={1} max={100} /></div>
              <div className="col-md-2"><label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsPingTimeout">逾時(秒)</label><input type="number" className="form-control" id="toolsPingTimeout" defaultValue={10} min={1} max={60} /></div>
              <div className="col-md-3"><button className="btn btn-primary w-100" id="toolsPingBtn"><i className="bx bx-play me-1"></i>執行 Ping</button></div>
            </div>
            <pre className="tools-output" id="toolsPingOutput" style={{ fontSize: '.75rem', background: 'var(--bs-tertiary-bg)', padding: '.5rem', borderRadius: 4, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}></pre>
          </div></div>
        </div>
        <div className="tab-pane fade" id="toolsPingCPane" role="tabpanel">
          <div className="card"><div className="card-body">
            <div className="row g-2 align-items-end mb-2">
              <div className="col-md-4">
                <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsPingCNetwork">Class C 網路</label>
                <input type="text" className="form-control font-monospace" id="toolsPingCNetwork" placeholder="192.168.1" />
              </div>
              <div className="col-md-3">
                <button className="btn btn-primary w-100" id="toolsPingCBtn"><i className="bx bx-play me-1"></i>掃描所有 IP</button>
              </div>
              <div className="col-md-3">
                <span id="toolsPingCStatus" className="text-muted" style={{ fontSize: '.75rem' }}></span>
              </div>
            </div>
            <div className="table-responsive" style={{ maxHeight: 450, overflow: 'auto' }}>
              <table className="table table-sm table-bordered mb-0" style={{ fontSize: '.75rem' }} id="toolsPingCTable">
                <thead><tr><th style={{ width: 40 }}>#</th><th>IP</th><th>狀態</th><th>延遲 (ms)</th></tr></thead>
                <tbody id="toolsPingCTbody"></tbody>
              </table>
            </div>
          </div></div>
        </div>
        <div className="tab-pane fade" id="toolsLsofPane" role="tabpanel">
          <div className="card"><div className="card-body">
            <div className="row g-2 align-items-end mb-2">
              <div className="col-md-4"><label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsLsofPort">Port</label><input type="number" className="form-control" id="toolsLsofPort" placeholder="80" min={1} max={65535} /></div>
              <div className="col-md-3"><label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsLsofProtocol">協定</label><select className="form-select" id="toolsLsofProtocol"><option value="">全部</option><option value="tcp">TCP</option><option value="udp">UDP</option></select></div>
              <div className="col-md-5"><button className="btn btn-primary w-100" id="toolsLsofBtn"><i className="bx bx-play me-1"></i>執行 Lsof</button></div>
            </div>
            <pre className="tools-output" id="toolsLsofOutput" style={{ fontSize: '.75rem', background: 'var(--bs-tertiary-bg)', padding: '.5rem', borderRadius: 4, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}></pre>
          </div></div>
        </div>
        <div className="tab-pane fade" id="toolsTraceroutePane" role="tabpanel">
          <div className="card"><div className="card-body">
            <div className="row g-2 align-items-end mb-2">
              <div className="col-md-6"><label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsTraceHost">目標主機</label><input type="text" className="form-control font-monospace" id="toolsTraceHost" placeholder="8.8.8.8" /></div>
              <div className="col-md-3"><label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsTraceHops">最大跳數</label><input type="number" className="form-control" id="toolsTraceHops" defaultValue={30} min={1} max={64} /></div>
              <div className="col-md-3"><button className="btn btn-primary w-100" id="toolsTracerouteBtn"><i className="bx bx-play me-1"></i>執行 Traceroute</button></div>
            </div>
            <pre className="tools-output" id="toolsTracerouteOutput" style={{ fontSize: '.75rem', background: 'var(--bs-tertiary-bg)', padding: '.5rem', borderRadius: 4, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}></pre>
          </div></div>
        </div>
        <div className="tab-pane fade" id="toolsNslookupPane" role="tabpanel">
          <div className="card"><div className="card-body">
            <div className="row g-2 align-items-end mb-2">
              <div className="col-md-5"><label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsNslookupDomain">網域名稱</label><input type="text" className="form-control font-monospace" id="toolsNslookupDomain" placeholder="google.com" /></div>
              <div className="col-md-4"><label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsNslookupDns">DNS Server（選填）</label><input type="text" className="form-control font-monospace" id="toolsNslookupDns" placeholder="8.8.8.8" /></div>
              <div className="col-md-3"><button className="btn btn-primary w-100" id="toolsNslookupBtn"><i className="bx bx-play me-1"></i>執行 Nslookup</button></div>
            </div>
            <pre className="tools-output" id="toolsNslookupOutput" style={{ fontSize: '.75rem', background: 'var(--bs-tertiary-bg)', padding: '.5rem', borderRadius: 4, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}></pre>
          </div></div>
        </div>
        <div className="tab-pane fade" id="toolsIpLocPane" role="tabpanel">
          <div className="card"><div className="card-body">
            <div className="row g-2 align-items-end mb-2">
              <div className="col-md-6"><label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="toolsIpLocIp">IP 位址</label><input type="text" className="form-control font-monospace" id="toolsIpLocIp" placeholder="8.8.8.8 (留空查自己)" /></div>
              <div className="col-md-3"><button className="btn btn-primary w-100" id="toolsIpLocBtn"><i className="bx bx-search me-1"></i>查詢位置</button></div>
            </div>
            <div id="toolsIpLocResult" style={{ fontSize: '.8125rem' }}></div>
          </div></div>
        </div>
        <div className="tab-pane fade" id="toolsNetstatPane" role="tabpanel">
          <div className="card"><div className="card-body">
            <div className="mb-2"><span className="badge bg-label-info tools-netstat-cmd-badge"></span></div>
            <button className="btn btn-primary mb-2" id="toolsNetstatBtn"><i className="bx bx-play me-1"></i>執行 Netstat</button>
            <pre className="tools-output" id="toolsNetstatOutput" style={{ fontSize: '.75rem', background: 'var(--bs-tertiary-bg)', padding: '.5rem', borderRadius: 4, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}></pre>
          </div></div>
        </div>
      </div>
    </div>
  )
}
