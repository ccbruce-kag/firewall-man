export default function SftpView() {
  return (
    <div id="sftpView" style={{ display: 'none' }}>
      <div className="card mb-2"><div className="card-body py-2">
        <div className="row g-1 align-items-end">
          <div className="col-md-2">
            <label className="form-label" style={{ fontSize: '.7rem' }} htmlFor="sftpHost">主機</label>
            <input type="text" className="form-control form-control-sm font-monospace" id="sftpHost" placeholder="192.168.1.100" />
          </div>
          <div className="col-md-1">
            <label className="form-label" style={{ fontSize: '.7rem' }} htmlFor="sftpPort">Port</label>
            <input type="number" className="form-control form-control-sm" id="sftpPort" defaultValue={22} />
          </div>
          <div className="col-md-2">
            <label className="form-label" style={{ fontSize: '.7rem' }} htmlFor="sftpUser">使用者</label>
            <input type="text" className="form-control form-control-sm font-monospace" id="sftpUser" defaultValue="root" />
          </div>
          <div className="col-md-3">
            <label className="form-label" style={{ fontSize: '.7rem' }} htmlFor="sftpPass">密碼</label>
            <input type="password" className="form-control form-control-sm" id="sftpPass" />
          </div>
          <div className="col-md-2">
            <button className="btn btn-primary btn-sm w-100" id="sftpConnectBtn"><i className="bx bx-link me-1"></i>連線</button>
          </div>
          <div className="col-md-2">
            <button className="btn btn-outline-secondary btn-sm w-100" id="sftpDisconnectBtn"><i className="bx bx-unlink me-1"></i>斷線</button>
          </div>
        </div>
        <div className="mt-1"><span id="sftpStatus" className="text-muted" style={{ fontSize: '.7rem' }}></span></div>
      </div></div>

      <div className="row g-2" style={{ minHeight: 400 }}>
        <div className="col-md-3">
          <div className="card h-100"><div className="card-header py-1 px-2"><strong style={{ fontSize: '.75rem' }}>目錄</strong></div>
            <div className="card-body p-1" id="sftpDirTree" style={{ maxHeight: 420, overflow: 'auto', fontSize: '.75rem' }}>
              <div className="text-muted text-center p-3" style={{ fontSize: '.75rem' }}>請先連線</div>
            </div>
          </div>
        </div>
        <div className="col-md-9">
          <div className="card h-100"><div className="card-header py-1 px-2 d-flex justify-content-between align-items-center">
            <strong style={{ fontSize: '.75rem' }} id="sftpCurrentPathLabel">/</strong>
            <div className="d-flex gap-1">
              <button className="btn btn-sm btn-outline-primary" id="sftpMkdirBtn" style={{ fontSize: '.7rem' }}><i className="bx bx-folder-plus me-1"></i>新增目錄</button>
              <button className="btn btn-sm btn-outline-success" id="sftpDownloadBtn" style={{ fontSize: '.7rem' }} disabled><i className="bx bx-download me-1"></i>下載</button>
              <button className="btn btn-sm btn-outline-danger" id="sftpDeleteBtn" style={{ fontSize: '.7rem' }} disabled><i className="bx bx-trash me-1"></i>刪除</button>
            </div>
          </div>
            <div className="card-body p-1">
              <div id="sftpDropZone" style={{ minHeight: 350, border: '2px dashed var(--bs-border-color)', borderRadius: 4, padding: 4, position: 'relative' }}>
                <div id="sftpDropOverlay" style={{ display: 'none', position: 'absolute', inset: 0, background: 'rgba(13,110,253,0.06)', border: '2px dashed #0d6efd', borderRadius: 4, zIndex: 5, alignItems:'center', justifyContent:'center', fontSize:'1rem', color:'var(--bs-primary)' }}>拖放檔案以上傳</div>
                <table className="table table-sm table-hover mb-0" style={{ fontSize: '.75rem' }}>
                  <thead><tr><th style={{ width: 28 }}><input type="checkbox" id="sftpSelectAll" /></th><th>名稱</th><th style={{ width: 80 }}>大小</th><th style={{ width: 140 }}>修改時間</th></tr></thead>
                  <tbody id="sftpFileList">
                    <tr><td colSpan={4} className="text-center text-muted py-4">請連線至 SFTP 伺服器</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-2"><div className="card-header py-1 px-2 d-flex justify-content-between">
        <strong style={{ fontSize: '.75rem' }}>記錄</strong>
        <button className="btn btn-sm btn-outline-secondary" id="sftpLogClear" style={{ fontSize: '.7rem' }}><i className="bx bx-trash me-1"></i>清除</button>
      </div>
        <div className="card-body p-1">
          <pre id="sftpLog" style={{ fontSize: '.7rem', maxHeight: 120, overflow: 'auto', margin: 0, background: 'var(--bs-tertiary-bg)', padding: '4px 8px', borderRadius: 4, whiteSpace: 'pre-wrap' }}></pre>
        </div>
      </div>
    </div>
  )
}
