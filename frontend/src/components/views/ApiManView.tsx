export default function ApiManView() {
  return (
    <div id="apimanView" style={{ display: 'none' }}>
      <div className="row g-3">
        <div className="col-lg-4 col-xl-3">
          <div className="card">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
              <strong style={{ fontSize: '.8125rem' }}><i className="bx bx-folder me-1"></i><span id="apimanTreeTitle">ApiMan</span></strong>
              <div className="dropdown">
                <button className="btn btn-sm btn-outline-secondary" data-bs-toggle="dropdown"><i className="bx bx-plus"></i></button>
                <ul className="dropdown-menu dropdown-menu-end" id="apimanAddMenu">
                  <li><a className="dropdown-item" href="#" id="apimanNewFolder"><i className="bx bx-folder-plus me-1"></i>新增資料夾</a></li>
                  <li><a className="dropdown-item" href="#" id="apimanNewRequest"><i className="bx bx-plus-circle me-1"></i>新增 Request</a></li>
                </ul>
              </div>
            </div>
            <div className="card-body p-2" id="apimanTreeBody" style={{ minHeight: 200, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}></div>
          </div>
        </div>
        <div className="col-lg-8 col-xl-9">
          <div className="card" id="apimanRequestCard" style={{ display: 'none' }}>
            <div className="card-body">
              <div className="row g-2 mb-2">
                <div className="col-md-2">
                  <select className="form-select form-select-sm font-monospace" id="apimanMethod">
                    <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option>
                  </select>
                </div>
                <div className="col-md-8">
                  <input type="text" className="form-control form-control-sm font-monospace" id="apimanUrl" placeholder="https://api.example.com/endpoint" />
                  <div id="apimanVarHints" className="text-muted mt-1" style={{ fontSize: '.65rem', display: 'flex', flexWrap: 'wrap', gap: '2px 6px' }}></div>
                </div>
                <div className="col-md-2">
                  <button className="btn btn-primary btn-sm w-100" id="apimanSendBtn"><i className="bx bx-send me-1"></i>送出</button>
                </div>
              </div>
              <ul className="nav nav-tabs nav-fill mb-2" id="apimanReqTabs" role="tablist">
                <li className="nav-item"><button className="nav-link active" id="apiman-params-tab" data-bs-toggle="tab" data-bs-target="#apimanParamsPane" type="button" role="tab">Params</button></li>
                <li className="nav-item"><button className="nav-link" id="apiman-auth-tab" data-bs-toggle="tab" data-bs-target="#apimanAuthPane" type="button" role="tab"><span id="apimanAuthBadge" className="badge bg-label-secondary rounded-pill">none</span> Auth</button></li>
                <li className="nav-item"><button className="nav-link" id="apiman-headers-tab" data-bs-toggle="tab" data-bs-target="#apimanHeadersPane" type="button" role="tab">Headers</button></li>
                <li className="nav-item"><button className="nav-link" id="apiman-body-tab" data-bs-toggle="tab" data-bs-target="#apimanBodyPane" type="button" role="tab">Body</button></li>
                <li className="nav-item"><button className="nav-link" id="apiman-vars-tab" data-bs-toggle="tab" data-bs-target="#apimanVarsPane" type="button" role="tab"><span className="badge bg-label-primary rounded-pill" id="apimanVarBadge">0</span> Vars</button></li>
              </ul>
              <div className="tab-content">
                <div className="tab-pane fade show active" id="apimanParamsPane" role="tabpanel">
                  <div id="apimanParamsList"></div>
                  <button className="btn btn-sm btn-outline-secondary mt-1" id="apimanAddParam"><i className="bx bx-plus me-1"></i>新增參數</button>
                </div>
                <div className="tab-pane fade" id="apimanAuthPane" role="tabpanel">
                  <div className="mb-2">
                    <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="apimanAuthType">授權類型</label>
                    <select className="form-select form-select-sm" id="apimanAuthType">
                      <option value="none">No Auth</option>
                      <option value="basic">Basic Auth</option>
                      <option value="bearer">Bearer Token</option>
                      <option value="apikey">API Key</option>
                    </select>
                  </div>
                  <div id="apimanAuthBasic" style={{ display: 'none' }}>
                    <div className="row g-2 mb-2">
                      <div className="col-md-6"><label style={{ fontSize: '.75rem' }}>Username</label><input type="text" className="form-control form-control-sm font-monospace" id="apimanAuthBasicUser" placeholder="admin" /></div>
                      <div className="col-md-6"><label style={{ fontSize: '.75rem' }}>Password</label><input type="password" className="form-control form-control-sm font-monospace" id="apimanAuthBasicPass" placeholder="••••••" /></div>
                    </div>
                  </div>
                  <div id="apimanAuthBearer" style={{ display: 'none' }}>
                    <div className="mb-2">
                      <label style={{ fontSize: '.75rem' }} htmlFor="apimanAuthBearerToken">Token</label>
                      <input type="text" className="form-control form-control-sm font-monospace" id="apimanAuthBearerToken" placeholder="eyJhbGciOiJIUzI1NiIs..." />
                    </div>
                  </div>
                  <div id="apimanAuthApiKey" style={{ display: 'none' }}>
                    <div className="row g-2 mb-2">
                      <div className="col-md-4"><label style={{ fontSize: '.75rem' }}>Key</label><input type="text" className="form-control form-control-sm font-monospace" id="apimanAuthApiKeyName" placeholder="X-API-Key" /></div>
                      <div className="col-md-4"><label style={{ fontSize: '.75rem' }}>Value</label><input type="text" className="form-control form-control-sm font-monospace" id="apimanAuthApiKeyValue" placeholder="your-api-key" /></div>
                      <div className="col-md-4"><label style={{ fontSize: '.75rem' }}>放�在</label><select className="form-select form-select-sm" id="apimanAuthApiKeyIn"><option value="header">Header</option><option value="query">Query Param</option></select></div>
                    </div>
                  </div>
                </div>
                <div className="tab-pane fade" id="apimanHeadersPane" role="tabpanel">
                  <div id="apimanHeadersList"></div>
                  <button className="btn btn-sm btn-outline-secondary mt-1" id="apimanAddHeader"><i className="bx bx-plus me-1"></i>新增 Header</button>
                </div>
                <div className="tab-pane fade" id="apimanBodyPane" role="tabpanel">
                  <div className="mb-2">
                    <select className="form-select form-select-sm" id="apimanBodyType" style={{ width: 'auto' }}>
                      <option value="none">none</option>
                      <option value="json">JSON</option>
                      <option value="form">Form Data</option>
                      <option value="text">Text</option>
                    </select>
                  </div>
                  <textarea className="form-control font-monospace" id="apimanBody" rows={6} style={{ fontSize: '.75rem' }} placeholder='{"key": "value"}'></textarea>
                </div>
                <div className="tab-pane fade" id="apimanVarsPane" role="tabpanel">
                  <div className="text-muted mb-2" style={{ fontSize: '.75rem' }}>在 URL、Headers、Body 中使用 <code>{'{{variable_name}}'}</code> 語法，發送時自動取代</div>
                  <div id="apimanVarsList"></div>
                  <div className="d-flex gap-1 mt-1">
                    <button className="btn btn-sm btn-outline-secondary" id="apimanAddVar"><i className="bx bx-plus me-1"></i>新增變數</button>
                    <button className="btn btn-sm btn-outline-primary" id="apimanSaveVars"><i className="bx bx-save me-1"></i>儲存變數</button>
                  </div>
                </div>
              </div>
              <div className="d-flex justify-content-end gap-2 mt-2">
                <button className="btn btn-sm btn-outline-success" id="apimanSaveReqBtn"><i className="bx bx-save me-1"></i>儲存</button>
                <button className="btn btn-sm btn-outline-info" id="apimanHistoryBtn" style={{ display: 'none' }}><i className="bx bx-history me-1"></i>歷史</button>
              </div>
              <div className="mt-2" id="apimanResponse"></div>
            </div>
          </div>
          <div className="card" id="apimanEmptyState">
            <div className="card-body text-center text-muted py-5">
              <i className="bx bx-folder-open" style={{ fontSize: '3rem', opacity: .3 }}></i>
              <p className="mt-2" id="apimanEmptyLabel">請選擇一個 Request 或建立新的</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
