export default function SystemView() {
  return (
    <div id="systemView" style={{ display: 'none' }}>
      <div className="row mb-3">
        <div className="col-md-12 mb-3">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center py-2">
              <strong style={{ fontSize: '.8125rem' }} id="sysInfoTitle">系統資訊</strong>
              <button className="btn btn-sm btn-outline-secondary" id="sysRefreshBtn"><i className="bx bx-refresh me-1"></i><span id="sysRefreshLabel">重新整理</span></button>
            </div>
            <div className="card-body" id="sysInfoBody"></div>
          </div>
        </div>
      </div>
      <div className="row mb-3" id="sysDiskRow">
        <div className="col-md-12">
          <div className="card">
            <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }} id="sysDiskTitle">磁碟</strong></div>
            <div className="card-body p-2" id="sysDiskBody"></div>
          </div>
        </div>
      </div>
      <div className="row mb-3" id="sysProcRow">
        <div className="col-md-12">
          <div className="card">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
              <strong style={{ fontSize: '.8125rem' }} id="sysProcTitle">處理程序</strong>
              <div>
                <select className="form-select form-select-sm" id="sysProcSort" style={{ width: 'auto', display: 'inline-block', fontSize: '.75rem' }}>
                  <option value="mem">MEM%</option>
                  <option value="cpu">CPU%</option>
                  <option value="pid">PID</option>
                  <option value="rss">RSS</option>
                </select>
              </div>
            </div>
            <div className="card-body p-2" id="sysProcBody"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
