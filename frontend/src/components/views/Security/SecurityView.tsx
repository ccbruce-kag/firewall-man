export default function SecurityView() {
  return (
    <div id="securityView" style={{ display: 'none' }}>
      <ul className="nav nav-tabs nav-fill mb-3" id="securityTabs" role="tablist">
        <li className="nav-item"><button className="nav-link active" id="security-cvs-tab" data-bs-toggle="tab" data-bs-target="#securityCvsPane" type="button" role="tab"><i className="bx bx-cloud-download me-1"></i><span className="securityTabLabel">CVS 資料庫</span></button></li>
        <li className="nav-item"><button className="nav-link" id="security-scan-tab" data-bs-toggle="tab" data-bs-target="#securityScanPane" type="button" role="tab"><i className="bx bx-scan me-1"></i><span className="securityTabLabel">網路掃描</span></button></li>
      </ul>
      <div className="tab-content p-0">
        <div className="tab-pane fade show active" id="securityCvsPane" role="tabpanel">
          <div className="row g-3">
            <div className="col-lg-5">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }}>CVS 來源</strong></div>
                <div className="card-body haproxy-form">
                  <div className="mb-2">
                    <label className="form-label" htmlFor="secCvsName">名稱</label>
                    <input type="text" className="form-control font-monospace" id="secCvsName" placeholder="Threat Intel Feed" />
                  </div>
                  <div className="mb-2">
                    <label className="form-label" htmlFor="secCvsUrl">URL</label>
                    <input type="text" className="form-control font-monospace" id="secCvsUrl" placeholder="https://example.com/data.csv" />
                  </div>
                  <div className="mb-2">
                    <label className="form-label" htmlFor="secCvsTable">資料表名稱</label>
                    <input type="text" className="form-control font-monospace" id="secCvsTable" defaultValue="cvs_import" />
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-md-4"><label className="form-label" htmlFor="secCvsDelimiter">分隔符</label><select className="form-select" id="secCvsDelimiter"><option value=",">逗號 (,)</option><option value="tab">Tab</option><option value=";">分號 (;)</option></select></div>
                    <div className="col-md-4"><label><input type="checkbox" id="secCvsHeader" defaultChecked /> 有標題列</label></div>
                  </div>
                  <div className="d-flex gap-2">
                    <button className="btn btn-outline-primary" id="secCvsPreviewBtn"><i className="bx bx-show me-1"></i>預覽</button>
                    <button className="btn btn-primary" id="secCvsImportBtn"><i className="bx bx-cloud-download me-1"></i>下載並匯入</button>
                    <button className="btn btn-outline-success" id="secCvsSaveSourceBtn"><i className="bx bx-save me-1"></i>儲存來源</button>
                  </div>
                  <div className="mt-2" id="secCvsResult"></div>
                </div>
              </div>
            </div>
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header py-2 d-flex justify-content-between align-items-center">
                  <strong style={{ fontSize: '.8125rem' }}>已儲存來源</strong>
                  <button className="btn btn-sm btn-outline-secondary" id="secCvsRefreshSources"><i className="bx bx-refresh"></i></button>
                </div>
                <div className="card-body p-2" id="secCvsSourceList"></div>
              </div>
            </div>
          </div>
        </div>
        <div className="tab-pane fade" id="securityScanPane" role="tabpanel">
          <div className="row g-3">
            <div className="col-lg-5">
              <div className="card">
                <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }}>新增掃描任務</strong></div>
                <div className="card-body haproxy-form">
                  <div className="mb-2"><label className="form-label" htmlFor="secScanName">任務名稱</label><input type="text" className="form-control font-monospace" id="secScanName" placeholder="Internal Scan" /></div>
                  <div className="mb-2"><label className="form-label" htmlFor="secScanTarget">目標</label><input type="text" className="form-control font-monospace" id="secScanTarget" placeholder="192.168.1.0/24 or 10.0.0.1-100" /></div>
                  <div className="mb-2"><label className="form-label" htmlFor="secScanPorts">埠號 (逗號分隔)</label><input type="text" className="form-control font-monospace" id="secScanPorts" defaultValue="22,80,443,3306,6379,8080,8443" /></div>
                  <div className="mb-2"><label className="form-label" htmlFor="secScanType">掃描類型</label><select className="form-select" id="secScanType"><option value="tcp">TCP Connect</option><option value="udp">UDP</option></select></div>
                  <button className="btn btn-primary w-100" id="secScanCreateBtn"><i className="bx bx-plus me-1"></i>建立並執行</button>
                  <div className="mt-2" id="secScanResult"></div>
                </div>
              </div>
            </div>
            <div className="col-lg-7">
              <div className="card">
                <div className="card-header py-2 d-flex justify-content-between align-items-center">
                  <strong style={{ fontSize: '.8125rem' }}>掃描紀錄</strong>
                  <button className="btn btn-sm btn-outline-secondary" id="secScanRefreshTasks"><i className="bx bx-refresh"></i></button>
                </div>
                <div className="card-body p-2" id="secScanTaskList"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
