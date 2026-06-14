export default function HaproxyView() {
  return (
    <div id="haproxyView" style={{ display: 'none' }}>
      <ul className="nav nav-tabs nav-fill mb-3" id="haproxyTabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button className="nav-link active" id="haproxy-status-tab" data-bs-toggle="tab" data-bs-target="#haproxyStatusPane" type="button" role="tab">
            <i className="bx bx-pulse me-1"></i><span id="haproxyStatusTabLabel">HAProxy 狀態</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="haproxy-web-tab" data-bs-toggle="tab" data-bs-target="#haproxyWebPane" type="button" role="tab">
            <i className="bx bx-world me-1"></i><span id="haproxyWebTabLabel">Web 負載平衡</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="haproxy-sql-tab" data-bs-toggle="tab" data-bs-target="#haproxySqlPane" type="button" role="tab">
            <i className="bx bx-data me-1"></i><span id="haproxySqlTabLabel">SQL Server 負載平衡</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="haproxy-test-tab" data-bs-toggle="tab" data-bs-target="#haproxyTestPane" type="button" role="tab">
            <i className="bx bx-plug me-1"></i><span id="haproxyTestTabLabel">連線測試</span>
          </button>
        </li>
      </ul>
      <div className="tab-content p-0">
        <div className="tab-pane fade show active" id="haproxyStatusPane" role="tabpanel">
          <div className="card mb-3">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
              <strong style={{ fontSize: '.8125rem' }} id="haproxyStatusTitle">HAProxy 狀態</strong>
              <button className="btn btn-sm btn-outline-secondary" id="haproxyStatusRefresh"><i className="bx bx-refresh me-1"></i><span className="haproxyRefreshLabel">重新整理</span></button>
            </div>
            <div className="card-body" id="haproxyStatusBody"></div>
          </div>
          <div className="d-flex gap-2 justify-content-end">
            <button className="btn btn-outline-primary" id="haproxyReloadBtn"><i className="bx bx-refresh me-1"></i><span id="haproxyReloadLabel">Reload HAProxy</span></button>
            <button className="btn btn-outline-warning" id="haproxyRestartBtn"><i className="bx bx-power-off me-1"></i><span id="haproxyRestartLabel">Restart HAProxy</span></button>
          </div>
          <div className="card mt-3">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
              <strong style={{ fontSize: '.8125rem' }} id="haproxySavedTitle">已儲存負載平衡設定</strong>
              <button className="btn btn-sm btn-outline-secondary" id="haproxySavedRefresh"><i className="bx bx-refresh me-1"></i><span className="haproxyRefreshLabel">重新整理</span></button>
            </div>
            <div className="card-body" id="haproxySavedBody"></div>
          </div>
        </div>
        <div className="tab-pane fade" id="haproxyWebPane" role="tabpanel">
          <div className="row g-3">
            <div className="col-12">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }} id="haproxyWebTitle">Web Load Balance</strong></div>
                <div className="card-body haproxy-form">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="haproxyWebName">Frontend Name</label>
                      <input type="text" className="form-control font-monospace" id="haproxyWebName" defaultValue="web" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="haproxyWebPort">Listen Port</label>
                      <input type="number" className="form-control font-monospace" id="haproxyWebPort" min={1} max={65535} defaultValue={80} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="haproxyWebBalance">Balance Method</label>
                      <select className="form-select" id="haproxyWebBalance">
                        <option value="roundrobin">roundrobin</option>
                        <option value="leastconn">leastconn</option>
                        <option value="source">source</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="haproxyWebHealthPath">Health Check Path</label>
                      <input type="text" className="form-control font-monospace" id="haproxyWebHealthPath" defaultValue="/" />
                    </div>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mt-3 mb-2">
                    <strong style={{ fontSize: '.8125rem' }} id="haproxyWebBackendTitle">Backend Servers</strong>
                    <button className="btn btn-sm btn-outline-primary" id="haproxyWebAddServer"><i className="bx bx-plus me-1"></i><span className="haproxyAddServerLabel">新增 Server</span></button>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-sm haproxy-table mb-0" id="haproxyWebServers">
                      <thead><tr><th>Name</th><th>IP</th><th>Port</th><th>Status</th><th>操作</th></tr></thead>
                      <tbody></tbody>
                    </table>
                  </div>
                  <button className="btn btn-primary w-100 mt-3" id="haproxyWebGenerate"><i className="bx bx-code-alt me-1"></i><span className="haproxyGenerateLabel">產生設定預覽</span></button>
                </div>
              </div>
            </div>
            <div className="col-12">
              <div className="card">
                <div className="card-header py-2">
                  <strong style={{ fontSize: '.8125rem' }} className="haproxyPreviewTitle">HAProxy Config Preview</strong>
                </div>
                <div className="card-body">
                  <pre className="haproxy-preview" id="haproxyWebPreview"></pre>
                  <div className="haproxy-preview-actions">
                    <button className="btn btn-outline-primary haproxy-validate-preview" data-target="#haproxyWebPreview"><i className="bx bx-check-shield me-1"></i><span className="haproxyValidateLabel">驗證設定</span></button>
                    <button className="btn btn-success haproxy-apply-preview" data-kind="web" data-target="#haproxyWebPreview"><i className="bx bx-check me-1"></i><span className="haproxyApplyLabel">驗證並套用</span></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="tab-pane fade" id="haproxySqlPane" role="tabpanel">
          <div className="row g-3">
            <div className="col-12">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }} id="haproxySqlTitle">SQL Server Load Balance</strong></div>
                <div className="card-body haproxy-form">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="haproxySqlName">Frontend Name</label>
                      <input type="text" className="form-control font-monospace" id="haproxySqlName" defaultValue="msql" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="haproxySqlPort">Listen Port</label>
                      <input type="number" className="form-control font-monospace" id="haproxySqlPort" min={1} max={65535} defaultValue={1433} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label" htmlFor="haproxySqlBalance">Balance Method</label>
                      <select className="form-select" id="haproxySqlBalance">
                        <option value="source">source</option>
                        <option value="leastconn">leastconn</option>
                        <option value="roundrobin">roundrobin</option>
                      </select>
                    </div>
                    <div className="col-md-6 d-flex align-items-end">
                      <div className="form-check">
                        <input className="form-check-input" type="checkbox" id="haproxySqlHealth" defaultChecked />
                        <label className="form-check-label" htmlFor="haproxySqlHealth" id="haproxySqlHealthLabel">TCP Health Check</label>
                      </div>
                    </div>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mt-3 mb-2">
                    <strong style={{ fontSize: '.8125rem' }} id="haproxySqlBackendTitle">Backend Servers</strong>
                    <button className="btn btn-sm btn-outline-primary" id="haproxySqlAddServer"><i className="bx bx-plus me-1"></i><span className="haproxyAddServerLabel">新增 Server</span></button>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-sm haproxy-table mb-0" id="haproxySqlServers">
                      <thead><tr><th>Name</th><th>IP</th><th>Port</th><th>Status</th><th>操作</th></tr></thead>
                      <tbody></tbody>
                    </table>
                  </div>
                  <button className="btn btn-primary w-100 mt-3" id="haproxySqlGenerate"><i className="bx bx-code-alt me-1"></i><span className="haproxyGenerateLabel">產生設定預覽</span></button>
                </div>
              </div>
            </div>
            <div className="col-12">
              <div className="card">
                <div className="card-header py-2">
                  <strong style={{ fontSize: '.8125rem' }} className="haproxyPreviewTitle">HAProxy Config Preview</strong>
                </div>
                <div className="card-body">
                  <pre className="haproxy-preview" id="haproxySqlPreview"></pre>
                  <div className="haproxy-preview-actions">
                    <button className="btn btn-outline-primary haproxy-validate-preview" data-target="#haproxySqlPreview"><i className="bx bx-check-shield me-1"></i><span className="haproxyValidateLabel">驗證設定</span></button>
                    <button className="btn btn-success haproxy-apply-preview" data-kind="sql" data-target="#haproxySqlPreview"><i className="bx bx-check me-1"></i><span className="haproxyApplyLabel">驗證並套用</span></button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="tab-pane fade" id="haproxyTestPane" role="tabpanel">
          <div className="row g-3">
            <div className="col-lg-6">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }}>Web 測試</strong></div>
                <div className="card-body haproxy-form">
                  <div className="row g-3">
                    <div className="col-md-8">
                      <label className="form-label" htmlFor="haproxyTestWebUrl">URL</label>
                      <input type="text" className="form-control font-monospace" id="haproxyTestWebUrl" defaultValue="http://10.20.100.241" />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label" htmlFor="haproxyTestWebCount">測試次數</label>
                      <input type="number" className="form-control font-monospace" id="haproxyTestWebCount" min={1} max={50} defaultValue={5} />
                    </div>
                  </div>
                  <button className="btn btn-primary w-100 mt-3" id="haproxyRunWebTest"><i className="bx bx-play me-1"></i>執行 Web 測試</button>
                  <div className="table-responsive mt-3" id="haproxyWebTestResult"></div>
                </div>
              </div>
            </div>
            <div className="col-lg-6">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }}>SQL/TCP 測試</strong></div>
                <div className="card-body haproxy-form">
                  <div className="row g-3">
                    <div className="col-md-5">
                      <label className="form-label" htmlFor="haproxyTestSqlHost">Host</label>
                      <input type="text" className="form-control font-monospace" id="haproxyTestSqlHost" defaultValue="10.20.100.241" />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label" htmlFor="haproxyTestSqlPort">Port</label>
                      <input type="number" className="form-control font-monospace" id="haproxyTestSqlPort" min={1} max={65535} defaultValue={1433} />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label" htmlFor="haproxyTestSqlCount">次數</label>
                      <input type="number" className="form-control font-monospace" id="haproxyTestSqlCount" min={1} max={50} defaultValue={5} />
                    </div>
                    <div className="col-md-2">
                      <label className="form-label" htmlFor="haproxyTestSqlTimeout">Timeout</label>
                      <input type="number" className="form-control font-monospace" id="haproxyTestSqlTimeout" min={1} max={30} defaultValue={3} />
                    </div>
                  </div>
                  <button className="btn btn-primary w-100 mt-3" id="haproxyRunSqlTest"><i className="bx bx-play me-1"></i>執行 TCP 測試</button>
                  <div className="table-responsive mt-3" id="haproxySqlTestResult"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
