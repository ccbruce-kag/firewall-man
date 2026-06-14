export default function NginxView() {
  return (
    <div id="nginxView" style={{ display: 'none' }}>
      <ul className="nav nav-tabs nav-fill mb-3" id="nginxTabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button className="nav-link active" id="nginx-env-tab" data-bs-toggle="tab" data-bs-target="#nginxEnvPane" type="button" role="tab">
            <i className="bx bx-cog me-1"></i><span id="nginxEnvTabLabel">環境設定</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="nginx-sites-tab" data-bs-toggle="tab" data-bs-target="#nginxSitesPane" type="button" role="tab">
            <i className="bx bx-server me-1"></i><span id="nginxSitesTabLabel">網站管理</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="nginx-modules-tab" data-bs-toggle="tab" data-bs-target="#nginxModulesPane" type="button" role="tab">
            <i className="bx bx-puzzle me-1"></i><span id="nginxModulesTabLabel">模組管理</span>
          </button>
        </li>
      </ul>
      <div className="tab-content p-0">
        <div className="tab-pane fade show active" id="nginxEnvPane" role="tabpanel">
          <div className="card">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
              <strong style={{ fontSize: '.8125rem' }} id="nginxEnvTitle">Nginx 環境設定</strong>
            </div>
            <div className="card-body haproxy-form">
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="nginxBin">Nginx 執行檔路徑</label>
                  <input type="text" className="form-control font-monospace" id="nginxBin" placeholder="nginx" />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="nginxConfigDir">設定目錄</label>
                  <input type="text" className="form-control font-monospace" id="nginxConfigDir" placeholder="/etc/nginx" />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="nginxSitesEnabledDir">sites-enabled 目錄</label>
                  <input type="text" className="form-control font-monospace" id="nginxSitesEnabledDir" placeholder="/etc/nginx/sites-enabled" />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="nginxModulesEnabledDir">modules-enabled 目錄</label>
                  <input type="text" className="form-control font-monospace" id="nginxModulesEnabledDir" placeholder="/etc/nginx/modules-enabled" />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="nginxConfDDir">conf.d 目錄</label>
                  <input type="text" className="form-control font-monospace" id="nginxConfDDir" placeholder="/etc/nginx/conf.d" />
                </div>
              </div>
              <div className="d-flex justify-content-end gap-2 mt-3">
                <button className="btn btn-outline-success" id="nginxTestBtn"><i className="bx bx-check-shield me-1"></i><span id="nginxTestLabel">測試設定</span></button>
                <button className="btn btn-outline-info" id="nginxReloadBtn"><i className="bx bx-refresh me-1"></i><span id="nginxReloadLabel">重新載入</span></button>
                <button className="btn btn-primary" id="nginxSaveEnvBtn"><i className="bx bx-save me-1"></i><span id="nginxSaveEnvLabel">儲存環境設定</span></button>
              </div>
              <div className="mt-3" id="nginxEnvResult"></div>
            </div>
          </div>
        </div>
        <div className="tab-pane fade" id="nginxSitesPane" role="tabpanel">
          <div className="row g-3">
            <div className="col-lg-5">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }} id="nginxSiteFormTitle">網站設定</strong></div>
                <div className="card-body haproxy-form">
                  <input type="hidden" id="nginxEditSiteName" value="" />
                  <div className="mb-2">
                    <label className="form-label" htmlFor="nginxSiteName">網站名稱</label>
                    <input type="text" className="form-control font-monospace" id="nginxSiteName" placeholder="my-site" />
                  </div>
                  <div className="mb-2">
                    <label className="form-label" htmlFor="nginxServerName">Server Name</label>
                    <input type="text" className="form-control font-monospace" id="nginxServerName" placeholder="_" />
                  </div>
                  <div className="mb-2">
                    <label className="form-label" htmlFor="nginxSiteType">網站類型</label>
                    <select className="form-select" id="nginxSiteType">
                      <option value="server">靜態網站 (Server)</option>
                      <option value="reverse_proxy">反向代理 (Reverse Proxy)</option>
                    </select>
                  </div>
                  <div className="mb-2" id="nginxDocRootGroup">
                    <label className="form-label" htmlFor="nginxDocRoot">Document Root</label>
                    <input type="text" className="form-control font-monospace" id="nginxDocRoot" placeholder="/var/www/html" />
                  </div>
                  <div className="mb-2" id="nginxProxyPassGroup" style={{ display: 'none' }}>
                    <label className="form-label" htmlFor="nginxProxyPass">Proxy Pass</label>
                    <input type="text" className="form-control font-monospace" id="nginxProxyPass" placeholder="http://127.0.0.1:3000" />
                  </div>
                  <div className="mb-2">
                    <label className="form-label" htmlFor="nginxSiteEnabled">
                      <input type="checkbox" id="nginxSiteEnabled" defaultChecked />
                      <span id="nginxSiteEnabledLabel">啟用</span>
                    </label>
                  </div>
                  <div className="mb-2">
                    <label className="form-label" htmlFor="nginxSiteConfig">自訂 Config（留空自動產生）</label>
                    <textarea className="form-control font-monospace" id="nginxSiteConfig" rows={4} style={{ fontSize: '.75rem' }}></textarea>
                  </div>
                  <div className="d-flex gap-2">
                    <button className="btn btn-primary" id="nginxSaveSiteBtn"><i className="bx bx-save me-1"></i><span id="nginxSaveSiteLabel">儲存網站</span></button>
                    <button className="btn btn-outline-secondary" id="nginxPreviewSiteBtn"><i className="bx bx-code-alt me-1"></i><span id="nginxPreviewSiteLabel">預覽設定</span></button>
                    <button className="btn btn-outline-danger" id="nginxDeleteSiteBtn" style={{ display: 'none' }}><i className="bx bx-trash me-1"></i><span id="nginxDeleteSiteLabel">刪除</span></button>
                  </div>
                  <div className="mt-2" id="nginxSitePreviewResult"></div>
                </div>
              </div>
            </div>
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header py-2 d-flex justify-content-between align-items-center">
                  <strong style={{ fontSize: '.8125rem' }} id="nginxSiteListTitle">網站列表</strong>
                  <button className="btn btn-sm btn-outline-secondary" id="nginxRefreshSites"><i className="bx bx-refresh me-1"></i><span className="nginxRefreshLabel">重新整理</span></button>
                </div>
                <div className="card-body p-2" id="nginxSiteListBody"></div>
              </div>
            </div>
          </div>
        </div>
        <div className="tab-pane fade" id="nginxModulesPane" role="tabpanel">
          <div className="row g-3">
            <div className="col-lg-4">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }} id="nginxModuleAddTitle">新增模組</strong></div>
                <div className="card-body haproxy-form">
                  <div className="mb-2">
                    <label className="form-label" htmlFor="nginxModuleName">模組名稱</label>
                    <input type="text" className="form-control font-monospace" id="nginxModuleName" placeholder="ssl" />
                  </div>
                  <button className="btn btn-primary w-100" id="nginxAddModuleBtn"><i className="bx bx-plus me-1"></i><span id="nginxAddModuleLabel">新增模組</span></button>
                </div>
              </div>
              <div className="card mt-3">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }} id="nginxScanModulesTitle">掃描系統模組</strong></div>
                <div className="card-body">
                  <button className="btn btn-outline-secondary w-100" id="nginxScanModulesBtn"><i className="bx bx-search me-1"></i><span id="nginxScanModulesLabel">從系統掃描</span></button>
                  <div className="mt-2" id="nginxScanModulesResult"></div>
                </div>
              </div>
            </div>
            <div className="col-lg-8">
              <div className="card">
                <div className="card-header py-2 d-flex justify-content-between align-items-center">
                  <strong style={{ fontSize: '.8125rem' }} id="nginxModuleListTitle">模組列表</strong>
                  <button className="btn btn-sm btn-outline-secondary" id="nginxRefreshModules"><i className="bx bx-refresh me-1"></i><span className="nginxRefreshLabel">重新整理</span></button>
                </div>
                <div className="card-body p-2" id="nginxModuleListBody"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
