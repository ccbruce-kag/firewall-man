import { useEffect } from 'react'

export default function Sidebar() {
  useEffect(() => {
    console.log('[Sidebar] rendered, menuDashLink exists:', !!document.getElementById('menuDashLink'));
  }, []);
  return (
    <aside id="layout-menu" className="layout-menu menu-vertical menu bg-menu-theme">
      <div className="app-brand demo">
        <a href="#" className="app-brand-link">
          <span className="app-brand-logo demo">
            <svg width="25" viewBox="0 0 25 42" version="1.1" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <path d="M13.7918663,0.358365126 L3.39788168,7.44174259 C0.566865006,9.69408886 -0.379795268,12.4788597 0.557900856,15.7960551 C0.68998853,16.2305145 1.09562888,17.7872135 3.12357076,19.2293357 C3.8146334,19.7207684 5.32369333,20.3834223 7.65075054,21.2172976 L7.59773219,21.2525164 L2.63468769,24.5493413 C0.445452254,26.3002124 0.0884951797,28.5083815 1.56381646,31.1738486 C2.83770406,32.8170431 5.20850219,33.2640127 7.09180128,32.5391577 C8.347334,32.0559211 11.4559176,30.0011079 16.4175519,26.3747182 C18.0338572,24.4997857 18.6973423,22.4544883 18.4080071,20.2388261 C17.963753,17.5346866 16.1776345,15.5799961 13.0496516,14.3747546 L10.9194936,13.4715819 L18.6192054,7.984237 L13.7918663,0.358365126 Z" id="path-1"></path>
                <path d="M5.47320593,6.00457225 C4.05321814,8.216144 4.36334763,10.0722806 6.40359441,11.5729822 C8.61520715,12.571656 10.0999176,13.2171421 10.8577257,13.5094407 L15.5088241,14.433041 L18.6192054,7.984237 C15.5364148,3.11535317 13.9273018,0.573395879 13.7918663,0.358365126 C13.5790555,0.511491653 10.8061687,2.3935607 5.47320593,6.00457225Z" id="path-3"></path>
                <path d="M7.50063644,21.2294429 L12.3234468,23.3159332 C14.1688022,24.7579751 14.397098,26.4880487 13.008334,28.506154 C11.6195701,30.5242593 10.3099883,31.790241 9.07958868,32.3040991 C5.78142938,33.4346997 4.13234973,34 4.13234973,34 C4.13234973,34 2.75489982,33.0538207 2.37032616e-14,31.1614621 C-0.55822714,27.8186216 -0.55822714,26.0572515 -4.05231404e-15,25.8773518 C0.83734071,25.6075023 2.77988457,22.8248993 3.3049379,22.52991 C3.65497346,22.3332504 5.05353963,21.8997614 7.50063644,21.2294429Z" id="path-4"></path>
              </defs>
              <use fill="currentColor" xlinkHref="#path-1"></use>
              <use fill="currentColor" xlinkHref="#path-3"></use>
              <use fill="currentColor" xlinkHref="#path-4"></use>
            </svg>
          </span>
          <span className="app-brand-text demo menu-text fw-bold ms-2">Firewall-Man</span>
        </a>
      </div>
      <div className="menu-divider mt-0"></div>
      <div className="menu-inner-shadow"></div>
      <ul className="menu-inner py-1">
        <li className="menu-item" id="menuGroupDash">
          <a href="#" className="menu-link menu-toggle">
            <i className="menu-icon tf-icons bx bx-bar-chart-alt-2"></i>
            <div className="text-truncate" id="menuGroupDashLabel">儀表板</div>
          </a>
          <ul className="menu-sub">
            <li className="menu-item" id="menuDash">
              <a href="#" className="menu-link" id="menuDashLink">
                <div className="text-truncate" id="menuDashLabel">一般性儀表板</div>
              </a>
            </li>
            <li className="menu-item" id="menuSys">
              <a href="#" className="menu-link" id="menuSysLink">
                <div className="text-truncate" id="menuSysLabel">系統現況</div>
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
