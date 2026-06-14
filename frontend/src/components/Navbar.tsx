export default function Navbar() {
  return (
    <nav className="layout-navbar container-xxl navbar-detached navbar navbar-expand-xl align-items-center bg-navbar-theme" id="layout-navbar">
      <div className="layout-menu-toggle navbar-nav align-items-xl-center me-4 me-xl-0 d-xl-none">
        <a className="nav-item nav-link px-0 me-xl-6" href="javascript:void(0)">
          <i className="icon-base bx bx-menu icon-md"></i>
        </a>
      </div>
      <div className="navbar-nav-right d-flex align-items-center justify-content-end w-100" id="navbar-collapse">
        <div className="navbar-nav align-items-center me-auto">
          <div className="nav-item d-flex align-items-center">
            <span className="ipc-title fw-semibold fs-5">網路與安全工具管理平臺</span>
            <span className="ipc-version badge bg-label-info rounded-pill ms-2"></span>
          </div>
        </div>
        <ul className="navbar-nav flex-row align-items-center ms-md-auto">
          <li className="nav-item dropdown me-3">
            <button className="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" id="docDropdown" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
              <i className="bx bx-book me-1"></i><span id="docDropdownLabel">文件協助</span>
            </button>
            <div className="dropdown-menu dropdown-menu-end doc-dropdown-menu" id="docDropdownMenu" aria-labelledby="docDropdown"></div>
          </li>
          <li className="nav-item dropdown me-3">
            <button className="btn btn-sm btn-outline-primary dropdown-toggle" type="button" id="languageDropdown" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
              <i className="bx bx-globe me-1"></i><span id="languageDropdownLabel">中文</span>
            </button>
            <ul className="dropdown-menu dropdown-menu-end" id="languageDropdownMenu" aria-labelledby="languageDropdown">
              <li><a className="dropdown-item" href="#" data-lang="zh">中文</a></li>
              <li><a className="dropdown-item" href="#" data-lang="en">English</a></li>
              <li><a className="dropdown-item" href="#" data-lang="ja">日本語</a></li>
            </ul>
          </li>
        </ul>
      </div>
    </nav>
  )
}
