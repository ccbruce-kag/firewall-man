export default function DbManView() {
  return (
    <div id="dbmanView" style={{ display: 'none' }}>
      <div className="row g-3">
        <div className="col-lg-4 col-xl-3">
          <div className="card">
            <div className="card-header py-2 d-flex justify-content-between align-items-center">
              <strong style={{ fontSize: '.8125rem' }}><i className="bx bx-data me-1"></i><span data-i18n="dbmanConnectionSettings">Connection Settings</span></strong>
              <button className="btn btn-sm btn-outline-primary" id="dbmanAddConnBtn"><i className="bx bx-plus"></i></button>
            </div>
            <div className="card-body p-2" style={{ minHeight: 200, maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
              <div id="dbmanConnList"></div>
              <div id="dbmanSchemaTree" className="mt-2 pt-2 border-top" style={{ display: 'none' }}></div>
            </div>
          </div>
        </div>
        <div className="col-lg-8 col-xl-9">
          <div id="dbmanConnView" style={{ display: 'none' }}>
            <div className="card mb-2">
              <div className="card-body py-2 d-flex justify-content-between align-items-center">
                <span><strong id="dbmanCurrentConnLabel"></strong></span>
                <button className="btn btn-sm btn-outline-secondary" id="dbmanDisconnectBtn"><i className="bx bx-log-out me-1"></i><span data-i18n="dbmanBack">Back</span></button>
              </div>
            </div>
            <div className="row g-2 mb-2">
              <div className="col-12">
                <div className="card">
                  <div className="card-header py-2 d-flex justify-content-between align-items-center">
                    <strong style={{ fontSize: '.8125rem' }}>SQL</strong>
                    <button className="btn btn-sm btn-outline-info" id="dbmanSaveQueryBtn" title="Save Query" data-i18n-title="dbmanSaveQuery"><i className="bx bx-bookmark me-1"></i><span data-i18n="save">Save</span></button>
                  </div>
                  <div className="card-body">
                    <div style={{ position: 'relative' }}>
                      <textarea className="form-control font-monospace dbman-sql-editor" id="dbmanSql" rows={4} style={{ fontSize: '.75rem', resize: 'vertical', minHeight: 80 }} placeholder="SELECT * FROM ..."></textarea>
                      <button className="btn btn-sm btn-outline-secondary dbman-sql-expand" style={{ position: 'absolute', bottom: 4, right: 4, padding: '0 4px', fontSize: '.65rem' }} title="Expand" data-i18n-title="dbmanExpand"><i className="bx bx-expand"></i></button>
                    </div>
                    <button className="btn btn-primary btn-sm mt-2" id="dbmanRunSql"><i className="bx bx-play me-1"></i><span data-i18n="dbmanRun">Run</span></button>
                    <div id="dbmanSqlResult" className="mt-2"></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="card mb-2">
              <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }} data-i18n="dbmanSavedQueries">Saved Queries</strong></div>
              <div className="card-body p-2" id="dbmanSavedQueries"></div>
            </div>
          </div>
          <div id="dbmanConnForm" style={{ display: 'none' }}>
            <div className="card">
              <div className="card-header py-2"><strong style={{ fontSize: '.8125rem' }} id="dbmanFormTitle" data-i18n="dbmanNewConnection">New Connection</strong></div>
              <div className="card-body haproxy-form">
                <input type="hidden" id="dbmanEditConnId" value="" />
                <div className="mb-2">
                  <label className="form-label" htmlFor="dbmanFormName" data-i18n="fieldName">Name</label>
                  <input type="text" className="form-control font-monospace" id="dbmanFormName" placeholder="My Database" />
                </div>
                <div className="mb-2">
                  <label className="form-label" htmlFor="dbmanFormType" data-i18n="fieldType">Type</label>
                  <select className="form-select" id="dbmanFormType">
                    <option value="sqlite">SQLite</option>
                    <option value="mysql">MySQL</option>
                    <option value="sqlserver">SQL Server</option>
                  </select>
                </div>
                <div className="mb-2" id="dbmanFormSqliteGroup">
                  <label className="form-label" htmlFor="dbmanFormFilePath" data-i18n="fieldFilePath">File Path</label>
                  <input type="text" className="form-control font-monospace" id="dbmanFormFilePath" placeholder="/path/to/db.sqlite3" />
                </div>
                <div id="dbmanFormServerGroup" style={{ display: 'none' }}>
                  <div className="row g-2 mb-2">
                    <div className="col-md-6"><label className="form-label" htmlFor="dbmanFormHost">Host</label><input type="text" className="form-control font-monospace" id="dbmanFormHost" placeholder="127.0.0.1" /></div>
                    <div className="col-md-3"><label className="form-label" htmlFor="dbmanFormPort">Port</label><input type="number" className="form-control" id="dbmanFormPort" placeholder="3306" /></div>
                    <div className="col-md-3"><label className="form-label" htmlFor="dbmanFormDb" data-i18n="dbmanDatabase">Database</label><input type="text" className="form-control font-monospace" id="dbmanFormDb" placeholder="database" /></div>
                  </div>
                  <div className="row g-2 mb-2">
                    <div className="col-md-6"><label className="form-label" htmlFor="dbmanFormUser" data-i18n="fieldUser">User</label><input type="text" className="form-control font-monospace" id="dbmanFormUser" placeholder="root" /></div>
                    <div className="col-md-6"><label className="form-label" htmlFor="dbmanFormPass" data-i18n="fieldPassword">Password</label><input type="password" className="form-control font-monospace" id="dbmanFormPass" /></div>
                  </div>
                  <div className="mb-2">
                    <label><input type="checkbox" id="dbmanFormTrustCert" /> Trust Server Certificate</label>
                  </div>
                </div>
                <div className="d-flex gap-2">
                  <button className="btn btn-primary" id="dbmanFormSaveBtn"><i className="bx bx-save me-1"></i><span data-i18n="save">Save</span></button>
                  <button className="btn btn-outline-success" id="dbmanFormTestBtn"><i className="bx bx-plug me-1"></i><span data-i18n="testConnection">Test Connection</span></button>
                  <button className="btn btn-outline-secondary" id="dbmanFormCancelBtn" data-i18n="cancel">Cancel</button>
                </div>
                <div id="dbmanFormResult" className="mt-2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
