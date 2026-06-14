export default function DashboardView() {
  return (
    <div id="dashboardView" style={{ display: 'none' }}>
      <div className="row mb-3" id="dashKpiRow"></div>
      <div className="row mb-3">
        <div className="col-12"><div className="card dash-card">
          <div className="card-header"><i className="bx bx-line-chart"></i><span id="dashTrendLabel">Traffic Trend (5s interval)</span><span className="ms-auto dash-trend-legend"><span><span className="sw" style={{ background: '#a6e3a1' }}></span>In</span><span><span className="sw" style={{ background: '#89b4fa' }}></span>Out</span></span></div>
          <div className="card-body"><div className="dash-trend-wrap"><canvas id="dashTrendChart" width="800" height="220" style={{ width: '100%', height: '220px', display: 'block' }}></canvas><div id="dashTrendTooltip"></div></div></div>
        </div></div>
      </div>
      <div className="row mb-3">
        <div className="col-md-6 mb-3"><div className="card dash-card">
          <div className="card-header"><i className="bx bx-transfer-alt"></i>Port Traffic In/Out</div>
          <div className="card-body" id="dashPortInOut"></div>
        </div></div>
        <div className="col-md-6 mb-3"><div className="card dash-card">
          <div className="card-header"><i className="bx bx-pie-chart-alt-2"></i>Protocol Distribution</div>
          <div className="card-body" id="dashProtocolDist"></div>
        </div></div>
      </div>
      <div className="row mb-3">
        <div className="col-md-6 mb-3"><div className="card dash-card">
          <div className="card-header"><i className="bx bx-log-in-circle"></i>Top Source IPs</div>
          <div className="card-body" id="dashTopSrc"></div>
        </div></div>
        <div className="col-md-6 mb-3"><div className="card dash-card">
          <div className="card-header"><i className="bx bx-log-out-circle"></i>Top Destination IPs</div>
          <div className="card-body" id="dashTopDst"></div>
        </div></div>
      </div>
      <div className="row mb-3">
        <div className="col-md-6 mb-3"><div className="card dash-card">
          <div className="card-header"><i className="bx bx-target-lock"></i>Target Distribution</div>
          <div className="card-body" id="dashTargetDist"></div>
        </div></div>
        <div className="col-md-6 mb-3"><div className="card dash-card">
          <div className="card-header"><i className="bx bx-rss"></i>Top Ports</div>
          <div className="card-body" id="dashTopPorts"></div>
        </div></div>
      </div>
      <div className="row mb-3">
        <div className="col-12"><div className="card dash-card">
          <div className="card-header"><i className="bx bx-list-ul"></i><span>最近活動</span></div>
          <div className="card-body" id="dashActivityBody" style={{ maxHeight: 260, overflowY: 'auto', fontSize: '.75rem' }}></div>
        </div></div>
      </div>
      <div className="dash-updated" id="dashUpdated"></div>
    </div>
  )
}
