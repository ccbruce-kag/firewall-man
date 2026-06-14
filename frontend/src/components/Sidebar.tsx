import { useCallback } from 'react'

export default function Sidebar() {
  const toggleSidebar = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    document.documentElement.classList.toggle('layout-menu-collapsed');
  }, []);
  return (
    <aside id="layout-menu" className="layout-menu menu-vertical menu bg-menu-theme">
      <div className="app-brand demo">
        <a href="#" className="app-brand-link" onClick={toggleSidebar}>
          <span className="app-brand-logo kyklos">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
              <g>
                <linearGradient id="shieldLeft" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#4f46e5" />
                </linearGradient>
                <path d="M 18,2 C 11,2 2,4.5 2,8.5 L 2,18 C 2,26.5 11,31.5 18,34 Z" fill="url(#shieldLeft)" />

                <linearGradient id="shieldRight" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#c084fc" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
                <path d="M 18,2 C 25,2 34,4.5 34,8.5 L 34,18 C 34,26.5 25,31.5 18,34 Z" fill="url(#shieldRight)" />

                <path d="M 18,2 C 23,2 31,4 32,7.5 L 18,14 L 4,7.5 C 5,4 13,2 18,2 Z" fill="#ffffff" opacity="0.15" />
              </g>

              <g>
                <path d="M 11,7 h 3 v 18 h -3 Z" fill="#1e1b4b" opacity="0.25" />
                <path d="M 11.5,7.5 h 3 v 17 h -3 Z" fill="#FFFFFF" />

                <path d="M 22.8,7 h 3.5 L 19.5,14.8 L 16.5,11.5 Z" fill="#E2E8F0" />
                <path d="M 19.5,14.8 L 26.5,25 h -3.6 L 17,17.2 Z" fill="#FFFFFF" />
                <path d="M 17,17.2 L 15,19.5 v -3.8 Z" fill="#CBD5E1" />
              </g>
            </svg>

          </span>
          <span className="app-brand-text demo menu-text fw-bold ms-2">KyKlos</span>
        </a>
        <a href="#" className="layout-menu-toggle" onClick={toggleSidebar} aria-label="收合選單">
          <i className="bx bx-chevron-left bx-sm align-middle"></i>
        </a>
      </div>
      <div className="menu-divider mt-0"></div>
      <div className="menu-inner-shadow"></div>
      <ul className="menu-inner py-1">
        <li className="menu-item" id="menuGroupDash">
          <a href="#" className="menu-link menu-toggle">
            <i className="menu-icon tf-icons bx bx-bar-chart-alt-2"></i>
            <div className="text-truncate" id="menuGroupDashLabel">儀表板與工作流程</div>
          </a>
          <ul className="menu-sub">
            <li className="menu-item" id="menuDash">
              <a href="#" className="menu-link" id="menuDashLink">
                <i className="menu-icon tf-icons bx bx-bar-chart-alt-2"></i>
                <div className="text-truncate" id="menuDashLabel">一般性儀表板</div>
              </a>
            </li>
            <li className="menu-item" id="menuSys">
              <a href="#" className="menu-link" id="menuSysLink">
                <i className="menu-icon tf-icons bx bx-pulse"></i>
                <div className="text-truncate" id="menuSysLabel">系統現況</div>
              </a>
            </li>
            <li className="menu-item" id="menuWorkflow">
              <a href="#" className="menu-link" id="menuWorkflowLink">
                <i className="menu-icon tf-icons bx bx-sitemap"></i>
                <div className="text-truncate" id="menuWorkflowLabel">工作流程設計</div>
              </a>
            </li>
          </ul>
        </li>
        <li className="menu-item" id="menuGroupNet">
          <a href="#" className="menu-link menu-toggle">
            <i className="menu-icon tf-icons bx bx-globe"></i>
            <div className="text-truncate" id="menuGroupNetLabel">網路工具</div>
          </a>
          <ul className="menu-sub">
            <li className="menu-item active" id="menuFirewallMan">
              <a href="#" className="menu-link" id="menuFirewallManLink">
                <i className="menu-icon tf-icons bx bx-shield-quarter"></i>
                <div className="text-truncate" id="menuFirewallManLabel">防火牆管理</div>
              </a>
            </li>
            <li className="menu-item" id="menuHaproxy">
              <a href="#" className="menu-link" id="menuHaproxyLink">
                <i className="menu-icon tf-icons bx bx-transfer"></i>
                <div className="text-truncate" id="menuHaproxyLabel">HaProxy 管理</div>
              </a>
            </li>
            <li className="menu-item" id="menuNginx">
              <a href="#" className="menu-link" id="menuNginxLink">
                <i className="menu-icon tf-icons bx bx-windows"></i>
                <div className="text-truncate" id="menuNginxLabel">Nginx 管理</div>
              </a>
            </li>
            <li className="menu-item" id="menuJuniper">
              <a href="#" className="menu-link" id="menuJuniperLink">
                <i className="menu-icon tf-icons bx bx-network-chart"></i>
                <div className="text-truncate" id="menuJuniperLabel">Juniper 設定</div>
              </a>
            </li>
            <li className="menu-item" id="menuNetplan">
              <a href="#" className="menu-link" id="menuNetplanLink">
                <i className="menu-icon tf-icons bx bx-wifi"></i>
                <div className="text-truncate" id="menuNetplanLabel">Netplan 設定</div>
              </a>
            </li>
            <li className="menu-item" id="menuPcap">
              <a href="#" className="menu-link" id="menuPcapLink">
                <i className="menu-icon tf-icons bx bx-wifi"></i>
                <div className="text-truncate" id="menuPcapLabel">PCAP</div>
              </a>
            </li>
            <li className="menu-item" id="menuSnmp">
              <a href="#" className="menu-link" id="menuSnmpLink">
                <i className="menu-icon tf-icons bx bx-analyse"></i>
                <div className="text-truncate" id="menuSnmpLabel">SNMP</div>
              </a>
            </li>
            <li className="menu-item" id="menuSamba">
              <a href="#" className="menu-link" id="menuSambaLink">
                <i className="menu-icon tf-icons bx bx-folder"></i>
                <div className="text-truncate" id="menuSambaLabel">Samba</div>
              </a>
            </li>
            <li className="menu-item" id="menuSftp">
              <a href="#" className="menu-link" id="menuSftpLink">
                <i className="menu-icon tf-icons bx bx-folder"></i>
                <div className="text-truncate" id="menuSftpLabel">SFTP</div>
              </a>
            </li>
            <li className="menu-item" id="menuNetArch">
              <a href="#" className="menu-link" id="menuNetArchLink">
                <i className="menu-icon tf-icons bx bx-network-chart"></i>
                <div className="text-truncate" id="menuNetArchLabel">網路架構編輯</div>
              </a>
            </li>
          </ul>
        </li>
        <li className="menu-item" id="menuGroupSys">
          <a href="#" className="menu-link menu-toggle">
            <i className="menu-icon tf-icons bx bx-wrench"></i>
            <div className="text-truncate" id="menuGroupSysLabel">系統工具</div>
          </a>
          <ul className="menu-sub">
            <li className="menu-item" id="menuTools">
              <a href="#" className="menu-link" id="menuToolsLink">
                <i className="menu-icon tf-icons bx bx-wrench"></i>
                <div className="text-truncate" id="menuToolsLabel">系統工具</div>
              </a>
            </li>
            <li className="menu-item" id="menuShell">
              <a href="#" className="menu-link" id="menuShellLink">
                <i className="menu-icon tf-icons bx bx-terminal"></i>
                <div className="text-truncate" id="menuShellLabel">Shell</div>
              </a>
            </li>
            <li className="menu-item" id="menuWidgets">
              <a href="#" className="menu-link" id="menuWidgetsLink">
                <i className="menu-icon tf-icons bx bx-cube"></i>
                <div className="text-truncate" id="menuWidgetsLabel">Widgets</div>
              </a>
            </li>
            <li className="menu-item" id="menuLogViewer">
              <a href="#" className="menu-link" id="menuLogViewerLink">
                <i className="menu-icon tf-icons bx bx-file"></i>
                <div className="text-truncate" id="menuLogViewerLabel">Log Viewer</div>
              </a>
            </li>
            <li className="menu-item" id="menuCrontab">
              <a href="#" className="menu-link" id="menuCrontabLink">
                <i className="menu-icon tf-icons bx bx-time-five"></i>
                <div className="text-truncate" id="menuCrontabLabel">Crontab</div>
              </a>
            </li>
          </ul>
        </li>
        <li className="menu-item" id="menuGroupApiMan">
          <a href="#" className="menu-link menu-toggle">
            <i className="menu-icon tf-icons bx bx-link"></i>
            <div className="text-truncate" id="menuGroupApiManLabel">ApiMan</div>
          </a>
          <ul className="menu-sub">
            <li className="menu-item" id="menuApiManNew">
              <a href="#" className="menu-link" id="menuApiManNewLink">
                <i className="menu-icon tf-icons bx bx-plus-circle"></i>
                <div className="text-truncate" id="menuApiManNewLabel">新增工作區</div>
              </a>
            </li>
            <li className="menu-item" id="menuWireframe">
              <a href="#" className="menu-link" id="menuWireframeLink">
                <i className="menu-icon tf-icons bx bx-pen"></i>
                <div className="text-truncate" id="menuWireframeLabel">Wireframe 設計</div>
              </a>
            </li>
            <li className="menu-item" id="menuReportEditor">
              <a href="#" className="menu-link" id="menuReportEditorLink">
                <i className="menu-icon tf-icons bx bx-file"></i>
                <div className="text-truncate" id="menuReportEditorLabel">Report 編輯器</div>
              </a>
            </li>
            <li className="menu-item" id="menuFormEditor">
              <a href="#" className="menu-link" id="menuFormEditorLink">
                <i className="menu-icon tf-icons bx bx-list-check"></i>
                <div className="text-truncate" id="menuFormEditorLabel">Form 編輯器</div>
              </a>
            </li>
            <div id="menuApiManWsItems"></div>
          </ul>
        </li>
        <li className="menu-item" id="menuGroupDbMan">
          <a href="#" className="menu-link menu-toggle">
            <i className="menu-icon tf-icons bx bx-data"></i>
            <div className="text-truncate" id="menuGroupDbManLabel">DbMan</div>
          </a>
          <ul className="menu-sub">
            <li className="menu-item" id="menuDbManNew">
              <a href="#" className="menu-link" id="menuDbManNewLink">
                <i className="menu-icon tf-icons bx bx-plus-circle"></i>
                <div className="text-truncate" id="menuDbManNewLabel">新增連線</div>
              </a>
            </li>
            <li className="menu-item" id="menuErdDiagram">
              <a href="#" className="menu-link" id="menuErdDiagramLink">
                <i className="menu-icon tf-icons bx bx-sitemap"></i>
                <div className="text-truncate" id="menuErdDiagramLabel">ER-Diagram</div>
              </a>
            </li>
            <li style={{ height: 1, background: 'var(--bs-border-color)', margin: '2px 12px' }}></li>
            <div id="menuDbManConnItems"></div>
          </ul>
        </li>
        <li className="menu-item" id="menuGroupSecurity">
          <a href="#" className="menu-link menu-toggle">
            <i className="menu-icon tf-icons bx bx-shield"></i>
            <div className="text-truncate" id="menuGroupSecurityLabel">資安</div>
          </a>
          <ul className="menu-sub">
            <li className="menu-item" id="menuSecurityCvs">
              <a href="#" className="menu-link" id="menuSecurityCvsLink">
                <div className="text-truncate" id="menuSecurityCvsLabel">CVS 資料庫</div>
              </a>
            </li>
            <li className="menu-item" id="menuSecurityScan">
              <a href="#" className="menu-link" id="menuSecurityScanLink">
                <div className="text-truncate" id="menuSecurityScanLabel">網路掃描</div>
              </a>
            </li>
          </ul>
        </li>
        <li className="menu-item" id="menuGroupAI">
          <a href="#" className="menu-link menu-toggle">
            <i className="menu-icon tf-icons bx bx-bot"></i>
            <div className="text-truncate" id="menuGroupAILabel">AI</div>
          </a>
          <ul className="menu-sub">
            <li className="menu-item" id="menuAI">
              <a href="#" className="menu-link" id="menuAILink">
                <div className="text-truncate" id="menuAILabel">AI 助手</div>
              </a>
            </li>
          </ul>
        </li>
        <li className="menu-item" id="menuGroupSettings">
          <a href="#" className="menu-link menu-toggle">
            <i className="menu-icon tf-icons bx bx-cog"></i>
            <div className="text-truncate" id="menuGroupSettingsLabel">設定</div>
          </a>
          <ul className="menu-sub">
            <li className="menu-item" id="menuRole">
              <a href="#" className="menu-link" id="menuRoleLink">
                <i className="menu-icon tf-icons bx bx-id-card"></i>
                <div className="text-truncate" id="menuRoleLabel">角色資料維護</div>
              </a>
            </li>
            <li className="menu-item" id="menuUnit">
              <a href="#" className="menu-link" id="menuUnitLink">
                <i className="menu-icon tf-icons bx bx-buildings"></i>
                <div className="text-truncate" id="menuUnitLabel">單位資料維護</div>
              </a>
            </li>
            <li className="menu-item" id="menuUser">
              <a href="#" className="menu-link" id="menuUserLink">
                <i className="menu-icon tf-icons bx bx-user"></i>
                <div className="text-truncate" id="menuUserLabel">使用者資料維護</div>
              </a>
            </li>
            <li className="menu-item" id="menuDictionary">
              <a href="#" className="menu-link" id="menuDictionaryLink">
                <i className="menu-icon tf-icons bx bx-book"></i>
                <div className="text-truncate" id="menuDictionaryLabel">資料字典資料維護</div>
              </a>
            </li>
            <li className="menu-item" id="menuSystemSetting">
              <a href="#" className="menu-link" id="menuSystemSettingLink">
                <i className="menu-icon tf-icons bx bx-slider"></i>
                <div className="text-truncate" id="menuSystemSettingLabel">系統設定資料維護</div>
              </a>
            </li>
          </ul>
        </li>
        <li className="menu-divider my-2"></li>
        <li className="menu-item" id="menuGroupHelp">
          <a href="#" className="menu-link menu-toggle">
            <i className="menu-icon tf-icons bx bx-book-open"></i>
            <div className="text-truncate" id="menuGroupHelpLabel">協助</div>
          </a>
          <ul className="menu-sub">
            <li className="menu-item" id="menuDoc">
              <a href="#" className="menu-link" id="menuDocLink">
                <div className="text-truncate" id="menuDocLabel">命令文件</div>
              </a>
            </li>
          </ul>
        </li>
      </ul>
    </aside>
  )
}
