export default function SnmpView() {
  return (
    <div id="snmpView" style={{ display: 'none' }}>
      <div className="row g-3">
        <div className="col-lg-12">
          <div className="card"><div className="card-body">
            <div className="row g-2 align-items-end mb-2">
              <div className="col-md-3">
                <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="snmpHost">目標主機</label>
                <input type="text" className="form-control form-control-sm font-monospace" id="snmpHost" placeholder="192.168.1.1" />
              </div>
              <div className="col-md-1">
                <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="snmpPort">Port</label>
                <input type="number" className="form-control form-control-sm" id="snmpPort" defaultValue={161} min={1} max={65535} />
              </div>
              <div className="col-md-2">
                <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="snmpCommunity">Community</label>
                <input type="text" className="form-control form-control-sm font-monospace" id="snmpCommunity" defaultValue="public" />
              </div>
              <div className="col-md-3">
                <label className="form-label" style={{ fontSize: '.75rem' }} htmlFor="snmpOid">OID</label>
                <input type="text" className="form-control form-control-sm font-monospace" id="snmpOid" defaultValue="1.3.6.1.2.1.1" placeholder="OID (e.g. 1.3.6.1.2.1.1)" />
              </div>
              <div className="col-md-3 d-flex gap-1">
                <button className="btn btn-primary btn-sm flex-fill" id="snmpGetBtn"><i className="bx bx-search me-1"></i>GET</button>
                <button className="btn btn-success btn-sm flex-fill" id="snmpWalkBtn"><i className="bx bx-list-ul me-1"></i>WALK</button>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2 mb-2 flex-wrap" id="snmpPresetOids">
              <span style={{ fontSize: '.7rem', color: 'var(--bs-secondary-color)' }}>常用 OID：</span>
              <button className="btn btn-sm btn-outline-secondary snmp-preset" data-oid="1.3.6.1.2.1.1.1.0" style={{ fontSize: '.7rem' }}>sysDescr</button>
              <button className="btn btn-sm btn-outline-secondary snmp-preset" data-oid="1.3.6.1.2.1.1.2.0" style={{ fontSize: '.7rem' }}>sysObjectID</button>
              <button className="btn btn-sm btn-outline-secondary snmp-preset" data-oid="1.3.6.1.2.1.1.3.0" style={{ fontSize: '.7rem' }}>sysUptime</button>
              <button className="btn btn-sm btn-outline-secondary snmp-preset" data-oid="1.3.6.1.2.1.1.5.0" style={{ fontSize: '.7rem' }}>sysName</button>
              <button className="btn btn-sm btn-outline-secondary snmp-preset" data-oid="1.3.6.1.2.1.1.6.0" style={{ fontSize: '.7rem' }}>sysLocation</button>
              <button className="btn btn-sm btn-outline-secondary snmp-preset" data-oid="1.3.6.1.2.1.2" style={{ fontSize: '.7rem' }}>interfaces</button>
              <button className="btn btn-sm btn-outline-secondary snmp-preset" data-oid="1.3.6.1.2.1.4" style={{ fontSize: '.7rem' }}>ip</button>
              <button className="btn btn-sm btn-outline-secondary snmp-preset" data-oid="1.3.6.1.2.1.10" style={{ fontSize: '.7rem' }}>transmission</button>
            </div>
            <span id="snmpStatus" className="text-muted" style={{ fontSize: '.75rem' }}></span>
          </div></div>
        </div>
        <div className="col-lg-12">
          <div className="card"><div className="card-body p-2">
            <div className="table-responsive" style={{ maxHeight: 500, overflow: 'auto' }}>
              <table className="table table-sm table-hover mb-0 snmp-results-table" style={{ fontSize: '.75rem' }}>
                <thead><tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>OID</th>
                  <th style={{ width: 100 }}>Type</th>
                  <th>Value</th>
                </tr></thead>
                <tbody id="snmpResultsBody">
                  <tr><td colSpan={4} className="text-center text-muted py-4">輸入主機資訊與 OID，點擊 GET 或 WALK</td></tr>
                </tbody>
              </table>
            </div>
          </div></div>
        </div>
      </div>
    </div>
  )
}
