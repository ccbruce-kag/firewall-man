export default function TablesView() {
  return (
    <div id="tablesView">
      <div className="row" style={{ paddingRight: 145 }}>
        <div className="col-12">
          <ul className="nav nav-tabs nav-fill mb-3 iptables-table" id="tableTabs" role="tablist">
            <li className="nav-item" role="presentation">
              <button className="nav-link" id="tab-raw" data-bs-toggle="tab" data-bs-target="#tabContent" type="button" role="tab">raw</button>
            </li>
            <li className="nav-item" role="presentation">
              <button className="nav-link" id="tab-mangle" data-bs-toggle="tab" data-bs-target="#tabContent" type="button" role="tab">mangle</button>
            </li>
            <li className="nav-item" role="presentation">
              <button className="nav-link" id="tab-nat" data-bs-toggle="tab" data-bs-target="#tabContent" type="button" role="tab">nat</button>
            </li>
            <li className="nav-item" role="presentation">
              <button className="nav-link active" id="tab-filter" data-bs-toggle="tab" data-bs-target="#tabContent" type="button" role="tab">filter</button>
            </li>
          </ul>
        </div>
      </div>
      <div id="table-body"></div>
      <div className="action-buttons" id="actionButtons">
        <button id="clear-all-rule" className="btn btn-outline-danger btn-sm"><i className="bx bx-trash me-1"></i>清空所有表規則</button><br />
        <button id="clear-current-table-rule" className="btn btn-outline-warning btn-sm"><i className="bx bx-trash me-1"></i>清空當前表規則</button><br />
        <button id="clear-all-empty-chain" className="btn btn-outline-secondary btn-sm"><i className="bx bx-x-circle me-1"></i>清空自定義空鏈</button><br />
        <button id="clear-all-metrics" className="btn btn-outline-info btn-sm"><i className="bx bx-reset me-1"></i>清零所有表計數</button><br />
        <button id="clear-current-table-metrics" className="btn btn-outline-info btn-sm"><i className="bx bx-reset me-1"></i>清零當前表計數</button><br />
        <button id="self-iptables" className="btn btn-outline-primary btn-sm"><i className="bx bx-list-ul me-1"></i>查看當前表規則</button><br />
        <button id="exec-iptables" className="btn btn-outline-dark btn-sm"><i className="bx bx-terminal me-1"></i>執行命令</button><br />
        <button id="export-all-rule" className="btn btn-outline-success btn-sm"><i className="bx bx-export me-1"></i>導出規則</button><br />
        <button id="import-all-rule" className="btn btn-outline-success btn-sm"><i className="bx bx-import me-1"></i>導入規則</button><br />
        <button id="open-iptables-doc" className="btn btn-outline-primary btn-sm"><i className="bx bx-book me-1"></i>命令文件</button>
      </div>
    </div>
  )
}
