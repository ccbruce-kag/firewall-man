export default function JuniperView() {
  return (
    <div id="juniperView" style={{ display: 'none' }}>
      <ul className="nav nav-tabs nav-fill mb-3" id="juniperTabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button className="nav-link active" id="juniper-info-tab" data-bs-toggle="tab" data-bs-target="#juniperInfoPane" type="button" role="tab">
            <i className="bx bx-info-circle me-1"></i><span id="juniperInfoTabLabel">設備資訊</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="juniper-vlan-tab" data-bs-toggle="tab" data-bs-target="#juniperVlanPane" type="button" role="tab">
            <i className="bx bx-layer me-1"></i><span id="juniperVlanTabLabel">VLAN 管理</span>
          </button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="juniper-port-tab" data-bs-toggle="tab" data-bs-target="#juniperPortPane" type="button" role="tab">
            <i className="bx bx-git-branch me-1"></i><span id="juniperPortTabLabel">Port 管理</span>
          </button>
        </li>
      </ul>
      <div className="tab-content p-0">
        <div className="tab-pane fade show active" id="juniperInfoPane" role="tabpanel">
          <div className="card mb-3">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
              <strong style={{ fontSize: '.8125rem' }} id="juniperInfoTitle">設備資訊</strong>
              <button className="btn btn-sm btn-outline-secondary" id="juniperInfoRefresh"><i className="bx bx-refresh me-1"></i><span className="juniperRefreshLabel">重新整理</span></button>
            </div>
            <div className="card-body" id="juniperInfoBody"></div>
          </div>
          <div className="card">
            <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }} id="juniperSettingsTitle">連線設定</strong></div>
            <div className="card-body juniper-form">
              <div className="row g-3">
                <div className="col-md-3">
                  <label className="form-label" htmlFor="juniperDeviceName">設備名稱</label>
                  <input type="text" className="form-control font-monospace" id="juniperDeviceName" placeholder="default" />
                </div>
                <div className="col-md-3">
                  <label className="form-label" htmlFor="juniperHost">管理 IP / Host</label>
                  <input type="text" className="form-control font-monospace" id="juniperHost" placeholder="10.20.50.2" />
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="juniperPort">SSH Port</label>
                  <input type="number" className="form-control font-monospace" id="juniperPort" min={1} max={65535} placeholder="22" />
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="juniperUsername">Username</label>
                  <input type="text" className="form-control font-monospace" id="juniperUsername" placeholder="root" />
                </div>
                <div className="col-md-2">
                  <label className="form-label" htmlFor="juniperTimeout">Timeout</label>
                  <input type="number" className="form-control font-monospace" id="juniperTimeout" min={1} max={120} placeholder="10" />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="juniperPassword">Password</label>
                  <input type="password" className="form-control font-monospace" id="juniperPassword" autoComplete="new-password" />
                  <div className="text-muted mt-1" style={{ fontSize: '.75rem' }} id="juniperPasswordHint">留空代表保留既有密碼</div>
                </div>
                <div className="col-md-4 d-flex align-items-end">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" id="juniperClearPassword" />
                    <label className="form-check-label" htmlFor="juniperClearPassword" id="juniperClearPasswordLabel">清除已儲存密碼</label>
                  </div>
                </div>
                <div className="col-md-4 d-flex align-items-end">
                  <div className="form-check">
                    <input className="form-check-input" type="checkbox" id="juniperStrictHostKey" />
                    <label className="form-check-label" htmlFor="juniperStrictHostKey" id="juniperStrictHostKeyLabel">Strict Host Key Checking</label>
                  </div>
                </div>
              </div>
              <div className="d-flex justify-content-end mt-3">
                <button className="btn btn-primary" id="juniperSettingsSaveBtn"><i className="bx bx-save me-1"></i><span id="juniperSettingsSaveLabel">儲存設定</span></button>
              </div>
            </div>
          </div>
        </div>
        <div className="tab-pane fade" id="juniperVlanPane" role="tabpanel">
          <div className="row g-3">
            <div className="col-lg-4">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }} id="juniperVlanCreateTitle">新增 VLAN</strong></div>
                <div className="card-body juniper-form">
                  <div className="mb-3">
                    <label className="form-label" htmlFor="juniperVlanName">VLAN 名稱</label>
                    <input type="text" className="form-control font-monospace" id="juniperVlanName" placeholder="VLAN10" />
                  </div>
                  <div className="mb-3">
                    <label className="form-label" htmlFor="juniperVlanId">VLAN ID</label>
                    <input type="number" className="form-control font-monospace" id="juniperVlanId" min={1} max={4094} placeholder="10" />
                  </div>
                  <button className="btn btn-primary w-100" id="juniperVlanCreateBtn"><i className="bx bx-plus me-1"></i><span id="juniperCreateVlanLabel">新增 VLAN</span></button>
                </div>
              </div>
            </div>
            <div className="col-lg-8">
              <div className="card">
                <div className="card-header py-2 d-flex justify-content-between align-items-center">
                  <strong style={{ fontSize: '.8125rem' }} id="juniperVlanListTitle">VLAN 列表</strong>
                  <button className="btn btn-sm btn-outline-secondary" id="juniperVlanRefresh"><i className="bx bx-refresh me-1"></i><span className="juniperRefreshLabel">重新整理</span></button>
                </div>
                <div className="card-body p-2" id="juniperVlanBody"></div>
              </div>
            </div>
          </div>
        </div>
        <div className="tab-pane fade" id="juniperPortPane" role="tabpanel">
          <div className="card">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
              <strong style={{ fontSize: '.8125rem' }} id="juniperPortListTitle">Port 管理</strong>
              <button className="btn btn-sm btn-outline-secondary" id="juniperPortRefresh"><i className="bx bx-refresh me-1"></i><span className="juniperRefreshLabel">重新整理</span></button>
            </div>
            <div className="card-body">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <div>
                  <strong style={{ fontSize: '.8125rem' }} id="juniperPortMapTitle">Port 狀態面板</strong>
                  <span className="text-muted ms-2" style={{ fontSize: '.75rem' }} id="juniperPortSelectedCount">已選取 0 個 Port</span>
                </div>
                <div className="d-flex gap-1">
                  <button className="btn btn-sm btn-outline-secondary" id="juniperPortSelectAll"><i className="bx bx-select-multiple me-1"></i><span id="juniperPortSelectAllLabel">全選</span></button>
                  <button className="btn btn-sm btn-outline-secondary" id="juniperPortClearSelection"><i className="bx bx-x me-1"></i><span id="juniperPortClearSelectionLabel">清除選取</span></button>
                </div>
              </div>
              <div className="juniper-port-map" id="juniperPortMap"></div>
              <div className="juniper-port-legend">
                <span><i className="legend-up"></i><span id="juniperLegendInUse">使用中</span></span>
                <span><i className="legend-unused"></i><span id="juniperLegendUnused">未使用</span></span>
                <span><i className="legend-disabled"></i><span id="juniperLegendDisabled">停用</span></span>
                <span><i className="legend-selected"></i><span id="juniperLegendSelected">已選取</span></span>
              </div>
              <div className="row g-3 align-items-end juniper-form border-top pt-2">
                <div className="col-lg-3">
                  <label className="form-label" htmlFor="juniperBulkMode" id="juniperBulkModeLabel">Port Mode</label>
                  <select className="form-select" id="juniperBulkMode">
                    <option value="access">Access</option>
                    <option value="trunk">Trunk</option>
                  </select>
                </div>
                <div className="col-lg-4">
                  <label className="form-label" htmlFor="juniperBulkVlans" id="juniperBulkVlansLabel">VLAN Members</label>
                  <select className="form-select font-monospace" id="juniperBulkVlans" multiple size={3}></select>
                </div>
                <div className="col-lg-3">
                  <label className="form-label" htmlFor="juniperBulkEnabled" id="juniperBulkEnabledLabel">Admin Status</label>
                  <select className="form-select" id="juniperBulkEnabled">
                    <option value="" id="juniperBulkKeepOption">保持原狀</option>
                    <option value="1" id="juniperBulkEnableOption">啟用</option>
                    <option value="0" id="juniperBulkDisableOption">停用</option>
                  </select>
                </div>
                <div className="col-lg-2">
                  <button className="btn btn-primary w-100" id="juniperBulkApply"><i className="bx bx-check me-1"></i><span id="juniperBulkApplyLabel">套用至選取 Port</span></button>
                </div>
              </div>
              <div className="juniper-selected-ports mt-2" id="juniperSelectedPorts"></div>
              <div className="alert alert-warning py-2 mt-2 mb-0 d-none" id="juniperManagementPortWarning" style={{ fontSize: '.75rem' }}></div>
              <div className="border-top mt-3 pt-2" id="juniperPortBody"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
