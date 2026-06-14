export default function NetplanView() {
  return (
    <div id="netplanView" style={{ display: 'none' }}>
      <ul className="nav nav-tabs nav-fill mb-3" id="netplanTabs" role="tablist">
        <li className="nav-item" role="presentation">
          <button className="nav-link active" id="netplan-config-tab" data-bs-toggle="tab" data-bs-target="#netplanConfigPane" type="button" role="tab"><i className="bx bx-cog me-1"></i><span id="netplanConfigTabLabel">IP 設定</span></button>
        </li>
        <li className="nav-item" role="presentation">
          <button className="nav-link" id="netplan-history-tab" data-bs-toggle="tab" data-bs-target="#netplanHistoryPane" type="button" role="tab"><i className="bx bx-history me-1"></i><span id="netplanHistoryTabLabel">歷史紀錄</span></button>
        </li>
      </ul>
      <div className="tab-content p-0">
        <div className="tab-pane fade show active" id="netplanConfigPane" role="tabpanel">
          <div className="row g-3">
            <div className="col-lg-5">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }}><i className="bx bx-wifi me-1"></i><span id="netplanFormTitle">網路介面設定</span></strong></div>
                <div className="card-body haproxy-form">
                  <div className="mb-2">
                    <label className="form-label" htmlFor="netplanInterface">網路介面</label>
                    <select className="form-select font-monospace" id="netplanInterface"></select>
                    <button className="btn btn-sm btn-outline-secondary mt-1" id="netplanRefreshIfaces"><i className="bx bx-refresh me-1"></i>重新整理介面</button>
                  </div>
                  <div className="mb-2">
                    <label className="form-label" htmlFor="netplanDhcp">
                      <input type="checkbox" id="netplanDhcp" defaultChecked />
                      <span id="netplanDhcpLabel">DHCP（自動取得 IP）</span>
                    </label>
                  </div>
                  <div id="netplanStaticFields">
                    <div className="mb-2">
                      <label className="form-label" htmlFor="netplanIpAddress">IP 位址</label>
                      <input type="text" className="form-control font-monospace" id="netplanIpAddress" placeholder="192.168.1.100" />
                    </div>
                    <div className="mb-2">
                      <label className="form-label" htmlFor="netplanPrefix">子網路遮罩 (CIDR)</label>
                      <input type="number" className="form-control" id="netplanPrefix" defaultValue={24} min={1} max={32} />
                    </div>
                    <div className="mb-2">
                      <label className="form-label" htmlFor="netplanGateway">默認閘道</label>
                      <input type="text" className="form-control font-monospace" id="netplanGateway" placeholder="192.168.1.1" />
                    </div>
                    <div className="mb-2">
                      <label className="form-label" htmlFor="netplanDns">DNS 伺服器（逗號分隔）</label>
                      <input type="text" className="form-control font-monospace" id="netplanDns" placeholder="8.8.8.8, 1.1.1.1" />
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="form-label" htmlFor="netplanYaml">Netplan YAML（自動產生，可手動編輯）</label>
                    <textarea className="form-control font-monospace" id="netplanYaml" rows={8} style={{ fontSize: '.75rem' }}></textarea>
                  </div>
                  <div className="d-flex gap-2">
                    <button className="btn btn-outline-primary" id="netplanPreviewBtn"><i className="bx bx-code-alt me-1"></i><span id="netplanPreviewLabel">產生 YAML</span></button>
                    <button className="btn btn-primary" id="netplanApplyBtn"><i className="bx bx-play me-1"></i><span id="netplanApplyLabel">套用設定</span></button>
                  </div>
                  <div className="mt-2" id="netplanResult"></div>
                </div>
              </div>
            </div>
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }}><i className="bx bx-info-circle me-1"></i><span id="netplanIfaceInfoTitle">目前介面資訊</span></strong></div>
                <div className="card-body" id="netplanIfaceInfo">
                  <div className="text-muted" style={{ fontSize: '.8125rem' }}>請選擇網路介面以查看目前設定</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="tab-pane fade" id="netplanHistoryPane" role="tabpanel">
          <div className="card">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
              <strong style={{ fontSize: '.8125rem' }}><i className="bx bx-history me-1"></i><span id="netplanHistoryTitle">歷史設定（保留最近 3 筆）</span></strong>
              <button className="btn btn-sm btn-outline-secondary" id="netplanRefreshHistory"><i className="bx bx-refresh me-1"></i><span className="netplanRefreshLabel">重新整理</span></button>
            </div>
            <div className="card-body p-2" id="netplanHistoryBody"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
