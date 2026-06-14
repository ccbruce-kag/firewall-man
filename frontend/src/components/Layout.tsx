import Sidebar from './Sidebar'
import Navbar from './Navbar'
import Logger from './Logger'
import DashboardView from './views/DashboardView'
import TablesView from './views/TablesView'
import JuniperView from './views/JuniperView'
import HaproxyView from './views/HaproxyView'
import NginxView from './views/NginxView'
import NetplanView from './views/NetplanView'
import AiView from './views/AiView'
import ShellView from './views/ShellView'
import ToolsView from './views/ToolsView'
import SystemView from './views/SystemView'
import ApiManView from './views/ApiManView'
import DbManView from './views/DbManView'
import SecurityView from './views/SecurityView'

export default function Layout() {
  return (
    <div className="layout-wrapper layout-content-navbar">
      <div className="layout-container">
        <Sidebar />
        <div className="layout-page">
          <Navbar />
          <div className="content-wrapper">
            <div className="container-xxl flex-grow-1 container-p-y d-flex flex-column" style={{ paddingBottom: 0 }}>
              <div className="tab-bar" id="tabBar"></div>
              <div id="tabContentRoot" className="flex-grow-1" style={{ paddingTop: '.75rem' }}>
                <div className="row mb-3">
                  <div className="col-12 d-flex align-items-center gap-3">
                    <div className="protocol-switch" id="protocolSwitch">
                      <div className="btn-group btn-group-sm" role="group">
                        <input type="radio" className="btn-check" name="protocol" id="proto4" value="ipv4" defaultChecked />
                        <label className="btn btn-outline-primary" htmlFor="proto4">IPv4</label>
                        <input type="radio" className="btn-check" name="protocol" id="proto6" value="ipv6" />
                        <label className="btn btn-outline-primary" htmlFor="proto6">IPv6</label>
                      </div>
                    </div>
                  </div>
                </div>
                <DashboardView />
                <TablesView />
                <JuniperView />
                <HaproxyView />
                <NginxView />
                <NetplanView />
                <AiView />
                <ShellView />
                <ToolsView />
                <SystemView />
                <ApiManView />
                <DbManView />
                <SecurityView />
              </div>
            </div>
            <Logger />
            <footer className="content-footer footer bg-footer-theme">
              <div className="container-xxl">
                <div className="footer-container d-flex align-items-center justify-content-between py-3 flex-md-row flex-column">
                  <div className="d-flex align-items-center gap-2">
                    <small>MiCopa 網路與安全工具管理平臺 &copy; {new Date().getFullYear()}</small>
                    <small className="badge bg-label-info rounded-pill" id="footerVersion">-</small>
                  </div>
                </div>
              </div>
            </footer>
            <div className="content-backdrop fade"></div>
          </div>
        </div>
      </div>
      <div className="layout-overlay layout-menu-toggle"></div>
    </div>
  )
}
