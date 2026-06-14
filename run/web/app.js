console.log('[app.js] loaded, jQuery=', typeof $, 'readyState=', document.readyState);
var _orig_ready = $;
  
    // ─── layer polyfill (layui.layer → Bootstrap) ───
    let modalInstance = null;
    let toastIdx = 0;
    const layer = {
      msg(text, opts) {
        const idx = ++toastIdx;
        const icon = (opts && opts.icon === 1) ? 'bx-check-circle text-success' : 'bx-info-circle text-primary';
        const html = `<div id="t${idx}" class="toast" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="2000">
          <div class="toast-body"><i class="bx ${icon} me-2"></i>${text}</div></div>`;
        $('#toastContainer').append(html);
        const t = new bootstrap.Toast(document.getElementById('t' + idx));
        t.show();
        setTimeout(() => { $(`#t${idx}`).remove(); }, 2500);
      },
      alert(content, opts) {
        const title = (typeof opts === 'object' && opts.title) ? opts.title : ((i18n[currentLang] || i18n.en).warning || 'Warning');
        const btnText = i18n ? i18n[currentLang || 'en'].confirm : 'OK';
        $('#commonModalTitle').text(title);
        $('#commonModalBody').html(typeof content === 'string' ? content : content.join ? content.join('') : String(content));
        $('#commonModalFooter').html(`<button type="button" class="btn btn-primary" data-bs-dismiss="modal">${btnText}</button>`);
        _showModal();
      },
      confirm(content, yesCallback, noCallback) {
        const lang = i18n ? i18n[currentLang || 'en'] : { confirm: 'OK', cancel: 'Cancel', warning: 'Warning' };
        $('#commonModalTitle').text(lang.warning || 'Warning');
        $('#commonModalBody').text(content);
        $('#commonModalFooter').html(`<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${lang.cancel}</button><button type="button" class="btn btn-primary" id="confirmYes">${lang.confirm}</button>`);
        _showModal();
        $('#confirmYes').off('click').on('click', function () { _hideModal(); if (yesCallback) yesCallback(); });
      },
      open(opts) {
        $('#commonModalTitle').text(opts.title || '');
        $('#commonModalBody').html(opts.content || '');
        if (opts.btn && opts.btn.length) {
          let html = '';
          const actions = ['confirm', 'download', 'cancel'];
          opts.btn.forEach((text, i) => {
            const cls = i === 0 ? 'btn-primary' : i === opts.btn.length - 1 ? 'btn-secondary' : 'btn-outline-primary';
            html += `<button type="button" class="btn ${cls} me-2" data-idx="${i}">${text}</button>`;
          });
          $('#commonModalFooter').html(html);
          $('#commonModalFooter button').off('click').on('click', function () {
            const idx = parseInt($(this).data('idx'));
            if (opts['btn' + (idx + 1)]) opts['btn' + (idx + 1)]();
            if (idx === opts.btn.length - 1) _hideModal();
          });
        } else {
          $('#commonModalFooter').html('');
        }
        if (opts.area) {
          const w = opts.area[0] === 'auto' ? 'auto' : opts.area[0];
          const h = opts.area[1] || 'auto';
          $('.modal-dialog').css({ maxWidth: w, width: w });
        }
        opts.success && opts.success($('#commonModalBody'));
        _showModal();
      },
      close() { _hideModal(); },
      prompt(opts, callback) {
        const lang = i18n ? i18n[currentLang || 'en'] : { confirm: 'OK', cancel: 'Cancel' };
        const title = opts.title || '';
        const val = opts.value || '';
        const placeholder = '';
        $('#commonModalTitle').text(title);
        $('#commonModalBody').html(`<textarea class="form-control" style="min-height:200px;font-family:monospace">${val}</textarea>`);
        $('#commonModalFooter').html(`<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">${lang.cancel}</button><button type="button" class="btn btn-primary" id="promptConfirm">${lang.confirm}</button>`);
        _showModal();
        $('#promptConfirm').off('click').on('click', function () {
          const v = $('#commonModalBody textarea').val();
          _hideModal();
          if (callback) callback(v, 0, null);
        });
      }
    };
    function _showModal() {
      const el = document.getElementById('commonModal');
      if (!el || !window.bootstrap || !bootstrap.Modal) return;
      if (modalInstance) modalInstance.dispose();
      modalInstance = new bootstrap.Modal(el, { backdrop: true, keyboard: true, focus: true });
      modalInstance.show();
    }
    function _hideModal() { if (modalInstance) { modalInstance.hide(); modalInstance.dispose(); modalInstance = null; } }
  
  
    // ─── Application Logic ───
    let currentProtocol = "ipv4";
    let currentPlatform = "linux";
    const TAB_STORAGE_KEY = "fwm_tabs";
    const TAB_VIEW_PREFIX = "tabView_";
    let tabState = { tabs: [], activeId: null };
    function saveTabs() {
      try { localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(tabState)); } catch(e) {}
    }
    function loadTabs() {
      try {
        var raw = localStorage.getItem(TAB_STORAGE_KEY);
        if (raw) tabState = JSON.parse(raw);
      } catch(e) { tabState = { tabs: [], activeId: null }; }
    }
    function findTab(mode) {
      for (var i = 0; i < tabState.tabs.length; i++) {
        if (tabState.tabs[i].id === mode) return i;
      }
      return -1;
    }
    function tabLabel(mode) {
      var lang = i18n[currentLang] || {};
      var map = {
        tables: lang.tablesLabel || 'Tables',
        dashboard: lang.dashLabel || 'General Dashboard',
        system: lang.systemLabel || 'System',
        shell: lang.shellLabel || 'Shell',
        ai: lang.aiLabel || 'AI Assistant',
        tools: lang.toolsLabel || 'Tools',
        haproxy: lang.haproxyLabel || 'HAProxy Management',
        nginx: lang.nginxLabel || 'Nginx Management',
        juniper: lang.juniperLabel || 'Juniper Settings',
        netplan: lang.netplanLabel || 'Netplan Config',
        apiman: 'ApiMan',
        dbman: 'DbMan',
        security: lang.securityLabel || 'Security',
      };
      return map[mode] || mode;
    }
    function tabIcon(mode) {
      var map = {
        tables: 'bx-shield-quarter', dashboard: 'bx-bar-chart-alt-2', system: 'bx-desktop',
        shell: 'bx-terminal', ai: 'bx-bot', tools: 'bx-wrench', haproxy: 'bx-transfer',
        nginx: 'bx-windows', juniper: 'bx-network-chart', netplan: 'bx-wifi',
        apiman: 'bx-link', dbman: 'bx-data', security: 'bx-shield',
      };
      return map[mode] || 'bx-file';
    }
    function viewId(mode) {
      var map = { tables: 'firewallView' };
      return map[mode] || (mode + 'View');
    }
    function renderTabs() {
      var $bar = $('#tabBar').empty();
      tabState.tabs.forEach(function (t, i) {
        var active = t.id === tabState.activeId ? ' active' : '';
        $bar.append('<div class="tab-item' + active + '" data-idx="' + i + '" data-mode="' + t.id + '" title="' + tabLabel(t.id) + '">' +
          '<i class="bx ' + tabIcon(t.id) + '"></i> ' + tabLabel(t.id) +
          '<span class="tab-close" data-mode="' + t.id + '">&times;</span></div>');
      });
      if (!$bar.find('.active').length && $bar.find('.tab-item').length) {
        $bar.find('.tab-item:first').addClass('active');
      }
    }
    function activateTabImpl(mode) {
      tabState.activeId = mode;
      // Hide all tab panes
      $('.tab-content-pane').removeClass('active').hide();
      var paneId = TAB_VIEW_PREFIX + mode;
      var $pane = $('#' + paneId);
      if (!$pane.length) {
        // Find the original view element and wrap it in a tab pane
        var $origView = $('#' + viewId(mode));
        if ($origView.length) {
          // Remove inline display:none from original view so pane visibility controls it
          if ($origView.css('display') === 'none') $origView.css('display', '');
          $origView.wrap('<div id="' + paneId + '" class="tab-content-pane"></div>');
          $pane = $('#' + paneId);
        }
      }
      if ($pane.length) {
        $pane.addClass('active').show();
      }
      renderTabs();
      saveTabs();
    }
    function ensureTab(mode) {
      loadTabs();
      var idx = findTab(mode);
      if (idx >= 0) {
        tabState.activeId = mode;
        saveTabs();
        return false; // tab already exists
      }
      tabState.tabs.push({ id: mode });
      tabState.activeId = mode;
      saveTabs();
      return true; // new tab
    }
    function closeTab(mode) {
      loadTabs();
      var idx = findTab(mode);
      if (idx < 0) return;
      tabState.tabs.splice(idx, 1);
      if (tabState.activeId === mode) {
        tabState.activeId = tabState.tabs.length > 0 ? tabState.tabs[Math.min(idx, tabState.tabs.length - 1)].id : null;
      }
      saveTabs();
      // Remove the pane
      var paneId = TAB_VIEW_PREFIX + mode;
      var $pane = $('#' + paneId);
      if ($pane.length) {
        var $view = $pane.find('#' + viewId(mode));
        if ($view.length) {
          $view.unwrap();
          $view.css('display', 'none');
        }
        $pane.remove();
      }
      if (tabState.activeId && findTab(tabState.activeId) >= 0) {
        activateTabImpl(tabState.activeId);
      }
    }
    const languageKey = "iptables_lang";
    const storedLang = localStorage.getItem(languageKey);
    const browserLang = (function () { var l = ((navigator.languages && navigator.languages[0]) || navigator.language || "en").toLowerCase(); if (l.startsWith("zh")) return "zh"; if (l.startsWith("ja")) return "ja"; return "en"; })();
    const langOrder = ['zh', 'en', 'ja'];
    const langNames = { zh: '中文', en: 'English', ja: '日本語' };
    let currentLang = langOrder.includes(storedLang) ? storedLang : browserLang;
    if (!langOrder.includes(currentLang)) currentLang = 'en';
    const i18n = {
      zh: {
        title: "{cmd} 管理平臺", docAssistTitle: "文件協助", chainLabel: "鏈", defaultPolicy: "默認策略",
        packets: "經過的包數量", bytes: "字節數", references: "被引用數量", tableLabel: "表", tableWord: "表", chainWord: "鏈",
        clearAllRule: "清空所有表規則", clearCurrentRule: "清空當前表規則", clearEmptyChain: "清空自定義空鏈",
        clearAllMetrics: "清零所有表計數", clearCurrentMetrics: "清零當前表計數", clearChain: "清空規則",
        viewTable: "查看當前表規則", execCmd: "執行命令", exportRule: "導出規則", importRule: "導入規則", doc: "命令文件",
        protocolLabel: "協議", tabRaw: "raw", tabMangle: "mangle", tabNat: "nat", tabFilter: "filter",
        nativeChain: "原生鏈", customChain: "自定義鏈", insert: "插入", append: "添加", zero: "清零",
        zeroCounters: "清零計數", delete: "刪除", refresh: "刷新", refreshSuccess: "刷新成功", viewCmd: "查看命令",
        warning: "提示", confirm: "確認", cancel: "取消", insertRuleTitle: "插入規則", appendRuleTitle: "添加規則",
        rulePlaceholder: "請輸入規則", execCommandTitleTpl: "執行 {cmd} 命令", inputCommand: "輸入命令",
        commandSuccess: "命令執行成功", importPromptTpl: "粘貼 {cmd} 規則", importSuccess: "導入規則成功！",
        flushRuleSuccess: "清除規則成功！", flushMetricsSuccess: "清除統計數據成功！", clearEmptySuccess: "清空自定義空鏈成功！",
        insertSuccess: "插入規則成功！", appendSuccess: "添加規則成功！", updateSuccess: "修改規則成功！",
        copySuccess: "複製成功，可直接粘貼至文件！", exportDialogTitle: "全部規則命令",
        btnCopy: "複製", btnDownload: "導出", btnOk: "確定",
        clearConfirmPrefix: "確認清除", allRulesSuffix: "所有規則？", chainRulesSuffix: " 鏈的所有規則？",
        allMetricsSuffix: "所有統計數據？", ruleMetricsPrefix: "第 ", ruleMetricsSuffix: " 條規則的統計數據？",
        ruleNumberPrefix: "第", ruleNumberSuffix: "條規則", clearEmptyPrompt: "確認清除用戶自定義的所有空鏈？",
        menuGroupDash: "儀表板", dashLabel: "一般性儀表板", menuGroupNet: "網路工具", tablesLabel: "防火牆管理",         menuGroupSys: "系統工具", toolsLabel: "工具集合",         menuGroupApiMan: "ApiMan", menuGroupDbMan: "DbMan", menuGroupSecurity: "資安",
        menuApiManNew: "新增工作區", menuDbManNew: "新增連線",
        menuSecurityCvs: "CVS 資料庫", menuSecurityScan: "網路掃描",
        menuGroupAI: "AI", menuGroupHelp: "協助", systemLabel: "系統現況", docLabel: "命令文件",
        juniperLabel: "Juniper 設定", juniperInfo: "設備資訊", juniperVlan: "VLAN 管理", juniperPort: "Port 管理",
        juniperRefresh: "重新整理", juniperCreateVlan: "新增 VLAN", juniperVlanList: "VLAN 列表", juniperPortList: "Port 管理",
        juniperConnected: "已連線", juniperDisconnected: "未連線", juniperMgmtIp: "管理 IP", juniperHostname: "Hostname",
        juniperModel: "Model", juniperVersion: "JunOS Version", juniperUptime: "Uptime", juniperSerial: "Serial Number",
        juniperSettings: "連線設定", juniperDeviceName: "設備名稱", juniperHost: "管理 IP / Host", juniperPortNo: "SSH Port",
        juniperUsername: "Username", juniperPassword: "Password", juniperTimeout: "Timeout", juniperPasswordHint: "留空代表保留既有密碼",
        juniperClearPassword: "清除已儲存密碼", juniperStrictHostKey: "Strict Host Key Checking", juniperSaveSettings: "儲存設定",
        juniperSettingsSaved: "Juniper 連線設定已儲存",
        juniperVlanName: "VLAN 名稱", juniperVlanId: "VLAN ID", juniperInterfaces: "綁定介面", juniperAction: "操作",
        juniperAdmin: "Admin Status", juniperLink: "Link Status", juniperMode: "Mode", juniperMembers: "VLAN Members",
        juniperSetAccess: "設定 Access VLAN", juniperSetTrunk: "設定 Trunk VLAN", juniperCommandPreview: "指令預覽",
        juniperEnabled: "啟用", juniperDisabled: "停用", juniperEnablePort: "啟用 Port", juniperDisablePort: "停用 Port",
        juniperLinkInUse: "使用中", juniperLinkUnused: "未使用",
        juniperPortMap: "Port 狀態面板", juniperSelectedCount: "已選取 {count} 個 Port", juniperSelectAll: "全選", juniperClearSelection: "清除選取",
        juniperSelected: "已選取", juniperBulkKeep: "保持原狀", juniperBulkApply: "套用至選取 Port", juniperBulkTitle: "批次設定 Port",
        juniperNoPortSelected: "請至少選取一個 Port", juniperAccessOneVlan: "Access 模式只能選擇一個 VLAN",
        juniperMgmtPortWarning: "注意：ge-0/0/23 是 Firewall-Man 管理連線 Port，修改或停用可能造成 Juniper 失聯。",
        juniperConfirmApply: "確認下發這些 JunOS 指令？", juniperApplied: "Juniper 設定已套用", juniperDeleted: "已刪除 VLAN",
        netplanLabel: "Netplan 設定",
        nginxLabel: "Nginx 管理", nginxEnv: "環境設定", nginxSites: "網站管理", nginxModules: "模組管理",
        nginxEnvTitle: "Nginx 環境設定", nginxBin: "Nginx 執行檔路徑", nginxConfigDir: "設定目錄", nginxSitesDir: "sites-enabled 目錄",
        nginxModulesDir: "modules-enabled 目錄", nginxConfDDir: "conf.d 目錄", nginxTest: "測試設定", nginxReload: "重新載入",
        nginxSaveEnv: "儲存環境設定", nginxSiteFormTitle: "網站設定", nginxSiteName: "網站名稱", nginxServerName: "Server Name",
        nginxSiteType: "網站類型", nginxStaticSite: "靜態網站 (Server)", nginxReverseProxy: "反向代理 (Reverse Proxy)",
        nginxDocRoot: "Document Root", nginxProxyPass: "Proxy Pass", nginxEnabled: "啟用", nginxCustomConfig: "自訂 Config（留空自動產生）",
        nginxSaveSite: "儲存網站", nginxPreviewSite: "預覽設定", nginxDeleteSite: "刪除", nginxSiteList: "網站列表",
        nginxRefresh: "重新整理", nginxModuleAdd: "新增模組", nginxModuleName: "模組名稱", nginxAddModule: "新增模組",
        nginxScanModules: "從系統掃描", nginxModuleList: "模組列表", nginxType: "類型", nginxStatus: "狀態", nginxActions: "操作",
        nginxConfirmDelete: "確認刪除此網站？", nginxConfirmDeleteFile: "確認刪除 sites-enabled 中的檔案？",
        nginxSiteAdded: "網站已新增", nginxSiteUpdated: "網站已更新", nginxSiteDeleted: "網站已刪除",
        nginxEnvSaved: "環境設定已儲存", nginxTestSuccess: "設定測試完成", nginxReloadSuccess: "Nginx 已重新載入",
        nginxModuleAdded: "模組已新增", nginxModuleToggled: "模組狀態已切換",
        haproxyLabel: "HAProxy 管理", haproxyStatus: "HAProxy 狀態", haproxyWeb: "Web 負載平衡", haproxySql: "SQL Server 負載平衡", haproxyTest: "連線測試",
        haproxyReload: "Reload HAProxy", haproxyRestart: "Restart HAProxy", haproxyInstalled: "是否已安裝", haproxyService: "Service 狀態",
        haproxyConfigPath: "設定檔路徑", haproxyConfigValid: "設定檔驗證", haproxyVersion: "版本", haproxyGenerate: "產生設定預覽",
        haproxyValidate: "驗證設定", haproxyApply: "驗證並套用", haproxyAddServer: "新增 Server", haproxyPreview: "HAProxy Config Preview",
        haproxyConfirmApply: "確認寫入設定、備份原設定並 reload HAProxy？", haproxyApplied: "HAProxy 設定已套用",
        dashTotalRules: "規則總數", dashTotalChains: "鏈總數", dashTotalPkts: "封包總計", dashTotalBytes: "位元組總計",
        dashTrendLabel: "流量趨勢 (5 秒取樣)", dashIn: "入站", dashOut: "出站", dashPkt: "封包", dashPortIn: "入封包", dashPortOut: "出封包", dashPortTotal: "總計",
        dashNoData: "無資料", dashUpdated: "更新時間",
        sysHostname: "主機名稱", sysUptime: "運作時間", sysOS: "作業系統", sysIP: "IP 位址",
        sysMemory: "記憶體", sysSwap: "Swap", sysUsed: "已用", sysFree: "可用", sysTotal: "總計",
        sysDisk: "磁碟", sysMount: "掛載點", sysFilesystem: "檔案系統", sysUsePct: "使用率",
        sysProcess: "處理程序", sysPID: "PID", sysName: "名稱", sysCPU: "CPU%", sysMEM: "MEM%", sysRSS: "RSS", sysState: "狀態",
        sysRefresh: "重新整理", sysSortBy: "排序",
        shellLabel: "Shell", aiLabel: "AI 助手", aiSend: "送出", aiInputPlaceholder: "輸入需求...",
        aiStatusIdle: "閒置", aiStatusRunning: "執行中", aiStatusDone: "完成", aiStatusError: "錯誤",
        aiCopy: "複製", aiExecute: "執行", aiExecuted: "已執行", aiCopyOk: "已複製", aiConfirmExec: "確認執行此命令？",
        aiHeader: "AI 助手 (opencode)", aiIntroName: "AI 助手",
        aiIntroText: "輸入你的需求，我會產生對應的防火牆命令。例如：<br>· 封鎖所有來自 192.168.1.0/24 的流量<br>· 允許 SSH (port 22) 從任何地方連入<br>· 列出目前所有 DROP 規則",
        closeTab: "關閉", closeAll: "關閉全部", closeLeft: "關閉左方", closeRight: "關閉右方",
        securityLabel: "資安", loading: "載入中...", noData: "無資料",
        apimanCreateWorkspace: "建立工作區", apimanWorkspaceName: "工作區名稱", apimanWorkspaceDescription: "說明",
        apimanWorkspaceDescriptionPlaceholder: "用途、環境或 API 說明", apimanWorkspaceNameRequired: "請輸入工作區名稱",
        apimanWorkspaceCreated: "工作區已建立", apimanNoWorkspace: "尚無工作區", apimanCreateFirstWorkspace: "建立第一個工作區",
        dbmanDatabase: "資料庫", dbmanSchema: "資料庫結構", dbmanNoTables: "無資料表",
        dbmanTable: "table", dbmanView: "view", dbmanStoredProcedure: "stored procedure", dbmanStoredFunction: "stored function",
        dbmanConnectionSettings: "連線設定", dbmanBack: "返回", dbmanSaveQuery: "儲存查詢", dbmanExpand: "放大",
        dbmanRun: "執行", dbmanSavedQueries: "已儲存查詢", dbmanNewConnection: "新增連線",
        dbmanEditConnection: "編輯連線",
        fieldName: "名稱", fieldType: "類型", fieldFilePath: "檔案路徑", fieldUser: "使用者", fieldPassword: "密碼",
        testConnection: "測試連線", save: "儲存", dbmanNoConnections: "尚無連線", dbmanQuickConnectLocal: "快速連線至本機資料庫",
        dbmanNoSavedQueries: "尚無儲存查詢",
      },
      en: {
        title: "{cmd} Web Console", docAssistTitle: "Quick Help", chainLabel: "Chain", defaultPolicy: "Default policy",
        packets: "Packets", bytes: "Bytes", references: "References", tableLabel: "Table", tableWord: "table", chainWord: "chain",
        clearAllRule: "Flush All Tables", clearCurrentRule: "Flush Current Table", clearEmptyChain: "Drop Empty Custom Chains",
        clearAllMetrics: "Zero All Counters", clearCurrentMetrics: "Zero Current Table", clearChain: "Flush Rules",
        viewTable: "View Current Table", execCmd: "Run Command", exportRule: "Export Rules", importRule: "Import Rules", doc: "Command Reference",
        protocolLabel: "Protocol", tabRaw: "raw", tabMangle: "mangle", tabNat: "nat", tabFilter: "filter",
        nativeChain: "System Chains", customChain: "Custom Chains", insert: "Insert", append: "Append", zero: "Zero",
        zeroCounters: "Zero Counters", delete: "Delete", refresh: "Refresh", refreshSuccess: "Refreshed", viewCmd: "View Command",
        warning: "Warning", confirm: "OK", cancel: "Cancel", insertRuleTitle: "Insert Rule", appendRuleTitle: "Append Rule",
        rulePlaceholder: "Enter rule arguments", execCommandTitleTpl: "Run {cmd} command", inputCommand: "Command",
        commandSuccess: "Command executed successfully", importPromptTpl: "Paste {cmd} rules",
        importSuccess: "Rules imported successfully!", flushRuleSuccess: "Rules cleared successfully!",
        flushMetricsSuccess: "Counters reset successfully!", clearEmptySuccess: "Empty custom chains removed!",
        insertSuccess: "Rule inserted successfully!", appendSuccess: "Rule appended successfully!",
        updateSuccess: "Rule updated successfully!", copySuccess: "Copied! You can paste it into a file.",
        exportDialogTitle: "All rules", btnCopy: "Copy", btnDownload: "Download", btnOk: "OK",
        clearConfirmPrefix: "Confirm to clear", allRulesSuffix: "all rules?", chainRulesSuffix: " chain rules?",
        allMetricsSuffix: "all counters?", ruleMetricsPrefix: "Rule #", ruleMetricsSuffix: " counters?",
        ruleNumberPrefix: "Rule #", ruleNumberSuffix: "", clearEmptyPrompt: "Clear all empty custom chains?",
        menuGroupDash: "Dashboard", dashLabel: "General Dashboard", menuGroupNet: "Network Tools", tablesLabel: "Tables",         menuGroupSys: "System Tools", toolsLabel: "Tools",         menuGroupApiMan: "ApiMan", menuGroupDbMan: "DbMan", menuGroupSecurity: "Security",
        menuApiManNew: "New Workspace", menuDbManNew: "New Connection",
        menuSecurityCvs: "CVS Database", menuSecurityScan: "Network Scan",
        menuGroupAI: "AI", menuGroupHelp: "Help", systemLabel: "System", docLabel: "Command Reference",
        juniperLabel: "Juniper Settings", juniperInfo: "Device Info", juniperVlan: "VLAN Management", juniperPort: "Port Management",
        juniperRefresh: "Refresh", juniperCreateVlan: "Create VLAN", juniperVlanList: "VLAN List", juniperPortList: "Port Management",
        juniperConnected: "Connected", juniperDisconnected: "Disconnected", juniperMgmtIp: "Management IP", juniperHostname: "Hostname",
        juniperModel: "Model", juniperVersion: "JunOS Version", juniperUptime: "Uptime", juniperSerial: "Serial Number",
        juniperSettings: "Connection Settings", juniperDeviceName: "Device Name", juniperHost: "Management IP / Host", juniperPortNo: "SSH Port",
        juniperUsername: "Username", juniperPassword: "Password", juniperTimeout: "Timeout", juniperPasswordHint: "Leave blank to keep the stored password",
        juniperClearPassword: "Clear stored password", juniperStrictHostKey: "Strict Host Key Checking", juniperSaveSettings: "Save Settings",
        juniperSettingsSaved: "Juniper connection settings saved",
        juniperVlanName: "VLAN Name", juniperVlanId: "VLAN ID", juniperInterfaces: "Interfaces", juniperAction: "Action",
        juniperAdmin: "Admin Status", juniperLink: "Link Status", juniperMode: "Mode", juniperMembers: "VLAN Members",
        juniperSetAccess: "Set Access VLAN", juniperSetTrunk: "Set Trunk VLAN", juniperCommandPreview: "Command Preview",
        juniperEnabled: "Enabled", juniperDisabled: "Disabled", juniperEnablePort: "Enable Port", juniperDisablePort: "Disable Port",
        juniperLinkInUse: "In Use", juniperLinkUnused: "Unused",
        juniperPortMap: "Port Status Panel", juniperSelectedCount: "{count} ports selected", juniperSelectAll: "Select All", juniperClearSelection: "Clear Selection",
        juniperSelected: "Selected", juniperBulkKeep: "Keep unchanged", juniperBulkApply: "Apply to Selected Ports", juniperBulkTitle: "Bulk Port Configuration",
        juniperNoPortSelected: "Select at least one port", juniperAccessOneVlan: "Access mode requires exactly one VLAN",
        juniperMgmtPortWarning: "Warning: ge-0/0/23 is the Firewall-Man management port. Changing or disabling it may disconnect Juniper.",
        juniperConfirmApply: "Apply these JunOS commands?", juniperApplied: "Juniper setting applied", juniperDeleted: "VLAN deleted",
        netplanLabel: "Netplan Config",
        nginxLabel: "Nginx Management", nginxEnv: "Environment", nginxSites: "Sites", nginxModules: "Modules",
        nginxEnvTitle: "Nginx Environment", nginxBin: "Nginx Binary", nginxConfigDir: "Config Dir", nginxSitesDir: "sites-enabled Dir",
        nginxModulesDir: "modules-enabled Dir", nginxConfDDir: "conf.d Dir", nginxTest: "Test Config", nginxReload: "Reload",
        nginxSaveEnv: "Save Environment", nginxSiteFormTitle: "Site Settings", nginxSiteName: "Site Name", nginxServerName: "Server Name",
        nginxSiteType: "Site Type", nginxStaticSite: "Static Site (Server)", nginxReverseProxy: "Reverse Proxy",
        nginxDocRoot: "Document Root", nginxProxyPass: "Proxy Pass", nginxEnabled: "Enabled", nginxCustomConfig: "Custom Config (leave blank to auto-generate)",
        nginxSaveSite: "Save Site", nginxPreviewSite: "Preview Config", nginxDeleteSite: "Delete", nginxSiteList: "Site List",
        nginxRefresh: "Refresh", nginxModuleAdd: "Add Module", nginxModuleName: "Module Name", nginxAddModule: "Add Module",
        nginxScanModules: "Scan from System", nginxModuleList: "Module List", nginxType: "Type", nginxStatus: "Status", nginxActions: "Actions",
        nginxConfirmDelete: "Confirm delete this site?", nginxConfirmDeleteFile: "Confirm delete file from sites-enabled?",
        nginxSiteAdded: "Site added", nginxSiteUpdated: "Site updated", nginxSiteDeleted: "Site deleted",
        nginxEnvSaved: "Environment saved", nginxTestSuccess: "Config test completed", nginxReloadSuccess: "Nginx reloaded",
        nginxModuleAdded: "Module added", nginxModuleToggled: "Module toggled",
        haproxyLabel: "HAProxy Management", haproxyStatus: "HAProxy Status", haproxyWeb: "Web Load Balance", haproxySql: "SQL Server Load Balance", haproxyTest: "Connection Test",
        haproxyReload: "Reload HAProxy", haproxyRestart: "Restart HAProxy", haproxyInstalled: "Installed", haproxyService: "Service Status",
        haproxyConfigPath: "Config Path", haproxyConfigValid: "Config Valid", haproxyVersion: "Version", haproxyGenerate: "Generate Preview",
        haproxyValidate: "Validate Config", haproxyApply: "Validate & Apply", haproxyAddServer: "Add Server", haproxyPreview: "HAProxy Config Preview",
        haproxyConfirmApply: "Write config, back up current file, and reload HAProxy?", haproxyApplied: "HAProxy config applied",
        dashTotalRules: "Total Rules", dashTotalChains: "Chains", dashTotalPkts: "Packets", dashTotalBytes: "Bytes",
        dashTrendLabel: "Traffic Trend (5s interval)", dashIn: "In", dashOut: "Out", dashPkt: "pkt", dashPortIn: "In (pkts)", dashPortOut: "Out (pkts)", dashPortTotal: "Total",
        dashNoData: "No data", dashUpdated: "Updated",
        sysHostname: "Hostname", sysUptime: "Uptime", sysOS: "OS", sysIP: "IP Address",
        sysMemory: "Memory", sysSwap: "Swap", sysUsed: "Used", sysFree: "Free", sysTotal: "Total",
        sysDisk: "Disk", sysMount: "Mount", sysFilesystem: "Filesystem", sysUsePct: "Use%",
        sysProcess: "Processes", sysPID: "PID", sysName: "Name", sysCPU: "CPU%", sysMEM: "MEM%", sysRSS: "RSS", sysState: "State",
        sysRefresh: "Refresh", sysSortBy: "Sort",
        shellLabel: "Shell", aiLabel: "AI Assistant", aiSend: "Send", aiInputPlaceholder: "Enter your request...",
        aiStatusIdle: "Idle", aiStatusRunning: "Running", aiStatusDone: "Done", aiStatusError: "Error",
        aiCopy: "Copy", aiExecute: "Execute", aiExecuted: "Executed", aiCopyOk: "Copied", aiConfirmExec: "Confirm to execute this command?",
        aiHeader: "AI Assistant (opencode)", aiIntroName: "AI Assistant",
        aiIntroText: "Enter your request and I will generate matching firewall commands. For example:<br>· Block all traffic from 192.168.1.0/24<br>· Allow SSH (port 22) from anywhere<br>· List all current DROP rules",
        closeTab: "Close", closeAll: "Close All", closeLeft: "Close Left", closeRight: "Close Right",
        securityLabel: "Security", loading: "Loading...", noData: "No data",
        apimanCreateWorkspace: "Create Workspace", apimanWorkspaceName: "Workspace Name", apimanWorkspaceDescription: "Description",
        apimanWorkspaceDescriptionPlaceholder: "Purpose, environment, or API notes", apimanWorkspaceNameRequired: "Enter a workspace name",
        apimanWorkspaceCreated: "Workspace created", apimanNoWorkspace: "No workspaces yet", apimanCreateFirstWorkspace: "Create first workspace",
        dbmanDatabase: "Database", dbmanSchema: "Database Schema", dbmanNoTables: "No tables",
        dbmanTable: "table", dbmanView: "view", dbmanStoredProcedure: "stored procedure", dbmanStoredFunction: "stored function",
        dbmanConnectionSettings: "Connection Settings", dbmanBack: "Back", dbmanSaveQuery: "Save Query", dbmanExpand: "Expand",
        dbmanRun: "Run", dbmanSavedQueries: "Saved Queries", dbmanNewConnection: "New Connection",
        dbmanEditConnection: "Edit Connection",
        fieldName: "Name", fieldType: "Type", fieldFilePath: "File Path", fieldUser: "User", fieldPassword: "Password",
        testConnection: "Test Connection", save: "Save", dbmanNoConnections: "No connections yet", dbmanQuickConnectLocal: "Quick connect to local database",
        dbmanNoSavedQueries: "No saved queries",
      },
      ja: {
        title: "{cmd} 管理コンソール", docAssistTitle: "クイックヘルプ", chainLabel: "チェイン", defaultPolicy: "デフォルトポリシー",
        packets: "パケット数", bytes: "バイト数", references: "参照数", tableLabel: "テーブル", tableWord: "テーブル", chainWord: "チェイン",
        clearAllRule: "全テーブルをフラッシュ", clearCurrentRule: "現在のテーブルをフラッシュ", clearEmptyChain: "空のカスタムチェインを削除",
        clearAllMetrics: "全カウンタをゼロ", clearCurrentMetrics: "現在のテーブルカウンタをゼロ", clearChain: "ルールをクリア",
        viewTable: "現在のテーブルを表示", execCmd: "コマンドを実行", exportRule: "ルールをエクスポート", importRule: "ルールをインポート", doc: "コマンドリファレンス",
        protocolLabel: "プロトコル", tabRaw: "raw", tabMangle: "mangle", tabNat: "nat", tabFilter: "filter",
        nativeChain: "システムチェイン", customChain: "カスタムチェイン", insert: "挿入", append: "追加", zero: "ゼロ",
        zeroCounters: "カウンタをゼロ", delete: "削除", refresh: "更新", refreshSuccess: "更新完了", viewCmd: "コマンドを表示",
        warning: "確認", confirm: "OK", cancel: "キャンセル", insertRuleTitle: "ルールを挿入", appendRuleTitle: "ルールを追加",
        rulePlaceholder: "ルールを入力", execCommandTitleTpl: "{cmd} コマンドを実行", inputCommand: "コマンドを入力",
        commandSuccess: "コマンドが正常に実行されました", importPromptTpl: "{cmd} ルールを貼り付け", importSuccess: "ルールのインポートが完了しました！",
        flushRuleSuccess: "ルールのクリアが完了しました！", flushMetricsSuccess: "統計データのクリアが完了しました！", clearEmptySuccess: "空のカスタムチェインを削除しました！",
        insertSuccess: "ルールを挿入しました！", appendSuccess: "ルールを追加しました！", updateSuccess: "ルールを更新しました！",
        copySuccess: "コピーしました！ファイルに貼り付けてください。", exportDialogTitle: "全ルールコマンド",
        btnCopy: "コピー", btnDownload: "ダウンロード", btnOk: "OK",
        clearConfirmPrefix: "確認", allRulesSuffix: "すべてのルールをクリアしますか？", chainRulesSuffix: " チェインの全ルールをクリアしますか？",
        allMetricsSuffix: "すべての統計データをクリアしますか？", ruleMetricsPrefix: "ルール #", ruleMetricsSuffix: " の統計データをクリアしますか？",
        ruleNumberPrefix: "ルール #", ruleNumberSuffix: "", clearEmptyPrompt: "空のカスタムチェインをすべて削除しますか？",
        menuGroupDash: "ダッシュボード", dashLabel: "一般ダッシュボード", menuGroupNet: "ネットワークツール", tablesLabel: "ファイアウォール管理",         menuGroupSys: "システムツール", toolsLabel: "ツール集",         menuGroupApiMan: "ApiMan", menuGroupDbMan: "DbMan", menuGroupSecurity: "セキュリティ",
        menuApiManNew: "新規ワークスペース", menuDbManNew: "新規接続",
        menuSecurityCvs: "CVS データベース", menuSecurityScan: "ネットワークスキャン",
        menuGroupAI: "AI", menuGroupHelp: "ヘルプ", systemLabel: "システム情報", docLabel: "コマンドリファレンス",
        juniperLabel: "Juniper 設定", juniperInfo: "デバイス情報", juniperVlan: "VLAN 管理", juniperPort: "Port 管理",
        juniperRefresh: "更新", juniperCreateVlan: "VLAN 作成", juniperVlanList: "VLAN 一覧", juniperPortList: "Port 管理",
        juniperConnected: "接続済み", juniperDisconnected: "未接続", juniperMgmtIp: "管理 IP", juniperHostname: "Hostname",
        juniperModel: "Model", juniperVersion: "JunOS Version", juniperUptime: "Uptime", juniperSerial: "Serial Number",
        juniperSettings: "接続設定", juniperDeviceName: "デバイス名", juniperHost: "管理 IP / Host", juniperPortNo: "SSH Port",
        juniperUsername: "Username", juniperPassword: "Password", juniperTimeout: "Timeout", juniperPasswordHint: "空欄の場合は保存済みパスワードを維持します",
        juniperClearPassword: "保存済みパスワードを削除", juniperStrictHostKey: "Strict Host Key Checking", juniperSaveSettings: "設定を保存",
        juniperSettingsSaved: "Juniper 接続設定を保存しました",
        juniperVlanName: "VLAN 名", juniperVlanId: "VLAN ID", juniperInterfaces: "インターフェース", juniperAction: "操作",
        juniperAdmin: "Admin Status", juniperLink: "Link Status", juniperMode: "Mode", juniperMembers: "VLAN Members",
        juniperSetAccess: "Access VLAN 設定", juniperSetTrunk: "Trunk VLAN 設定", juniperCommandPreview: "コマンドプレビュー",
        juniperEnabled: "有効", juniperDisabled: "無効", juniperEnablePort: "Port を有効化", juniperDisablePort: "Port を無効化",
        juniperLinkInUse: "使用中", juniperLinkUnused: "未使用",
        juniperPortMap: "Port ステータスパネル", juniperSelectedCount: "{count} Port 選択中", juniperSelectAll: "すべて選択", juniperClearSelection: "選択解除",
        juniperSelected: "選択済み", juniperBulkKeep: "変更しない", juniperBulkApply: "選択 Port に適用", juniperBulkTitle: "Port 一括設定",
        juniperNoPortSelected: "Port を1つ以上選択してください", juniperAccessOneVlan: "Access モードでは VLAN を1つだけ選択してください",
        juniperMgmtPortWarning: "注意: ge-0/0/23 は Firewall-Man 管理 Port です。変更または無効化すると Juniper に接続できなくなる可能性があります。",
        juniperConfirmApply: "これらの JunOS コマンドを適用しますか？", juniperApplied: "Juniper 設定を適用しました", juniperDeleted: "VLAN を削除しました",
        netplanLabel: "Netplan 設定",
        nginxLabel: "Nginx 管理", nginxEnv: "環境設定", nginxSites: "サイト管理", nginxModules: "モジュール管理",
        nginxEnvTitle: "Nginx 環境設定", nginxBin: "Nginx 実行ファイル", nginxConfigDir: "設定ディレクトリ", nginxSitesDir: "sites-enabled ディレクトリ",
        nginxModulesDir: "modules-enabled ディレクトリ", nginxConfDDir: "conf.d ディレクトリ", nginxTest: "設定テスト", nginxReload: "再読み込み",
        nginxSaveEnv: "環境設定を保存", nginxSiteFormTitle: "サイト設定", nginxSiteName: "サイト名", nginxServerName: "Server Name",
        nginxSiteType: "サイトタイプ", nginxStaticSite: "静的サイト (Server)", nginxReverseProxy: "リバースプロキシ",
        nginxDocRoot: "Document Root", nginxProxyPass: "Proxy Pass", nginxEnabled: "有効", nginxCustomConfig: "カスタム Config（空欄で自動生成）",
        nginxSaveSite: "サイトを保存", nginxPreviewSite: "設定をプレビュー", nginxDeleteSite: "削除", nginxSiteList: "サイト一覧",
        nginxRefresh: "更新", nginxModuleAdd: "モジュール追加", nginxModuleName: "モジュール名", nginxAddModule: "追加",
        nginxScanModules: "システムからスキャン", nginxModuleList: "モジュール一覧", nginxType: "タイプ", nginxStatus: "状態", nginxActions: "操作",
        nginxConfirmDelete: "このサイトを削除しますか？", nginxConfirmDeleteFile: "sites-enabled のファイルを削除しますか？",
        nginxSiteAdded: "サイトを追加しました", nginxSiteUpdated: "サイトを更新しました", nginxSiteDeleted: "サイトを削除しました",
        nginxEnvSaved: "環境設定を保存しました", nginxTestSuccess: "設定テストが完了しました", nginxReloadSuccess: "Nginx を再読み込みしました",
        nginxModuleAdded: "モジュールを追加しました", nginxModuleToggled: "モジュール状態を変更しました",
        haproxyLabel: "HAProxy 管理", haproxyStatus: "HAProxy 状態", haproxyWeb: "Web ロードバランス", haproxySql: "SQL Server ロードバランス", haproxyTest: "接続テスト",
        haproxyReload: "HAProxy Reload", haproxyRestart: "HAProxy Restart", haproxyInstalled: "インストール済み", haproxyService: "Service 状態",
        haproxyConfigPath: "設定ファイル", haproxyConfigValid: "設定検証", haproxyVersion: "バージョン", haproxyGenerate: "設定プレビュー生成",
        haproxyValidate: "設定を検証", haproxyApply: "検証して適用", haproxyAddServer: "Server 追加", haproxyPreview: "HAProxy Config Preview",
        haproxyConfirmApply: "設定を書き込み、現設定をバックアップして HAProxy を reload しますか？", haproxyApplied: "HAProxy 設定を適用しました",
        dashTotalRules: "ルール総数", dashTotalChains: "チェイン数", dashTotalPkts: "パケット総数", dashTotalBytes: "バイト総数",
        dashTrendLabel: "トラフィック傾向 (5秒間隔)", dashIn: "入力", dashOut: "出力", dashPkt: "pkt", dashPortIn: "入力 (pkt)", dashPortOut: "出力 (pkt)", dashPortTotal: "合計",
        dashNoData: "データなし", dashUpdated: "更新時間",
        sysHostname: "ホスト名", sysUptime: "稼働時間", sysOS: "OS", sysIP: "IP アドレス",
        sysMemory: "メモリ", sysSwap: "スワップ", sysUsed: "使用中", sysFree: "空き", sysTotal: "合計",
        sysDisk: "ディスク", sysMount: "マウント", sysFilesystem: "ファイルシステム", sysUsePct: "使用率",
        sysProcess: "プロセス", sysPID: "PID", sysName: "名前", sysCPU: "CPU%", sysMEM: "MEM%", sysRSS: "RSS", sysState: "状態",
        sysRefresh: "更新", sysSortBy: "並び替え",
        shellLabel: "Shell", aiLabel: "AI アシスタント", aiSend: "送信", aiInputPlaceholder: "リクエストを入力...",
        aiStatusIdle: "アイドル", aiStatusRunning: "実行中", aiStatusDone: "完了", aiStatusError: "エラー",
        aiCopy: "コピー", aiExecute: "実行", aiExecuted: "実行済み", aiCopyOk: "コピーしました", aiConfirmExec: "このコマンドを実行しますか？",
        aiHeader: "AI アシスタント (opencode)", aiIntroName: "AI アシスタント",
        aiIntroText: "要望を入力すると、対応するファイアウォールコマンドを生成します。例：<br>· 192.168.1.0/24 からの通信をすべてブロック<br>· 任意の場所から SSH (port 22) を許可<br>· 現在の DROP ルールを一覧表示",
        closeTab: "閉じる", closeAll: "すべて閉じる", closeLeft: "左を閉じる", closeRight: "右を閉じる",
        securityLabel: "セキュリティ", loading: "読み込み中...", noData: "データなし",
        apimanCreateWorkspace: "ワークスペース作成", apimanWorkspaceName: "ワークスペース名", apimanWorkspaceDescription: "説明",
        apimanWorkspaceDescriptionPlaceholder: "用途、環境、API メモ", apimanWorkspaceNameRequired: "ワークスペース名を入力してください",
        apimanWorkspaceCreated: "ワークスペースを作成しました", apimanNoWorkspace: "ワークスペースがありません", apimanCreateFirstWorkspace: "最初のワークスペースを作成",
        dbmanDatabase: "データベース", dbmanSchema: "データベース構造", dbmanNoTables: "テーブルなし",
        dbmanTable: "table", dbmanView: "view", dbmanStoredProcedure: "stored procedure", dbmanStoredFunction: "stored function",
        dbmanConnectionSettings: "接続設定", dbmanBack: "戻る", dbmanSaveQuery: "クエリを保存", dbmanExpand: "拡大",
        dbmanRun: "実行", dbmanSavedQueries: "保存済みクエリ", dbmanNewConnection: "新規接続",
        dbmanEditConnection: "接続を編集",
        fieldName: "名前", fieldType: "タイプ", fieldFilePath: "ファイルパス", fieldUser: "ユーザー", fieldPassword: "パスワード",
        testConnection: "接続テスト", save: "保存", dbmanNoConnections: "接続がありません", dbmanQuickConnectLocal: "ローカルデータベースにクイック接続",
        dbmanNoSavedQueries: "保存済みクエリがありません",
      }
    };
    function t(key) {
      let s = i18n[currentLang][key];
      if (typeof s === "string" && s.indexOf("{cmd}") !== -1) s = s.replace("{cmd}", fwDisplayName());
      return s;
    }
    function setLanguage(lang, persist) {
      currentLang = langOrder.includes(lang) ? lang : 'en';
      window.currentLang = currentLang;
      document.documentElement.lang = currentLang;
      if (persist) localStorage.setItem(languageKey, currentLang);
      $(".ipc-title").text(t("title"));
      document.title = t("title");
      $("#docDropdownLabel").text(t("docAssistTitle"));
      var lng = i18n[currentLang];
      $('#menuGroupDashLabel').text(lng.menuGroupDash || '儀表板');
      $('#menuDashLabel').text(lng.dashLabel || 'General Dashboard');
      $('#menuSysLabel').text(lng.systemLabel || 'System');
      $('#menuGroupNetLabel').text(lng.menuGroupNet || 'Network Tools');
      $('#menuTablesLabel').text(lng.tablesLabel || 'Tables');
      $('#menuHaproxyLabel').text(lng.haproxyLabel || 'HaProxy 管理');
      $('#menuNginxLabel').text(lng.nginxLabel || 'Nginx 管理');
      $('#menuNetplanLabel').text(lng.netplanLabel || 'Netplan 設定');
      $('#menuJuniperLabel').text(lng.juniperLabel || 'Juniper 設定');
      $('#menuGroupSysLabel').text(lng.menuGroupSys || '系統工具');
      $('#menuToolsLabel').text(lng.toolsLabel || '系統工具');
      $('#menuShellLabel').text(lng.shellLabel || 'Shell');
      $('#menuGroupApiManLabel').text(lng.menuGroupApiMan || 'ApiMan');
      $('#menuApiManNewLabel').text(lng.menuApiManNew || 'New Workspace');
      $('#menuGroupDbManLabel').text(lng.menuGroupDbMan || 'DbMan');
      $('#menuDbManNewLabel').text(lng.menuDbManNew || 'New Connection');
      $('#menuGroupSecurityLabel').text(lng.menuGroupSecurity || 'Security');
      $('#menuSecurityCvsLabel').text(lng.menuSecurityCvs || 'CVS 資料庫');
      $('#menuSecurityScanLabel').text(lng.menuSecurityScan || '網路掃描');
      $('#menuGroupAILabel').text(lng.menuGroupAI || 'AI');
      $('#menuAILabel').text(lng.aiLabel || 'AI Assistant');
      $('#menuGroupHelpLabel').text(lng.menuGroupHelp || 'Help');
      $('#menuDocLabel').text(lng.docLabel || 'Command Reference');
      $('#juniperInfoTabLabel,#juniperInfoTitle').text(lng.juniperInfo || 'Device Info');
      $('#juniperVlanTabLabel').text(lng.juniperVlan || 'VLAN Management');
      $('#juniperPortTabLabel,#juniperPortListTitle').text(lng.juniperPort || 'Port Management');
      $('#juniperPortMapTitle').text(lng.juniperPortMap || 'Port Status Panel');
      $('#juniperPortSelectAllLabel').text(lng.juniperSelectAll || 'Select All');
      $('#juniperPortClearSelectionLabel').text(lng.juniperClearSelection || 'Clear Selection');
      $('#juniperBulkApplyLabel').text(lng.juniperBulkApply || 'Apply to Selected Ports');
      $('#juniperBulkKeepOption').text(lng.juniperBulkKeep || 'Keep unchanged');
      $('#juniperBulkEnableOption').text(lng.juniperEnabled || 'Enabled');
      $('#juniperBulkDisableOption,#juniperLegendDisabled').text(lng.juniperDisabled || 'Disabled');
      $('#juniperLegendInUse').text(lng.juniperLinkInUse || 'In Use');
      $('#juniperLegendUnused').text(lng.juniperLinkUnused || 'Unused');
      $('#juniperLegendSelected').text(lng.juniperSelected || 'Selected');
      $('#juniperBulkModeLabel').text(lng.juniperMode || 'Mode');
      $('#juniperBulkVlansLabel').text(lng.juniperMembers || 'VLAN Members');
      $('#juniperBulkEnabledLabel').text(lng.juniperAdmin || 'Admin Status');
      $('#juniperVlanCreateTitle,#juniperCreateVlanLabel').text(lng.juniperCreateVlan || 'Create VLAN');
      $('#juniperVlanListTitle').text(lng.juniperVlanList || 'VLAN List');
      $('.juniperRefreshLabel').text(lng.juniperRefresh || 'Refresh');
      $('#juniperSettingsTitle').text(lng.juniperSettings || 'Connection Settings');
      $('label[for="juniperDeviceName"]').text(lng.juniperDeviceName || 'Device Name');
      $('label[for="juniperHost"]').text(lng.juniperHost || 'Management IP / Host');
      $('label[for="juniperPort"]').text(lng.juniperPortNo || 'SSH Port');
      $('label[for="juniperUsername"]').text(lng.juniperUsername || 'Username');
      $('label[for="juniperPassword"]').text(lng.juniperPassword || 'Password');
      $('label[for="juniperTimeout"]').text(lng.juniperTimeout || 'Timeout');
      $('#juniperPasswordHint').text(lng.juniperPasswordHint || 'Leave blank to keep the stored password');
      $('#juniperClearPasswordLabel').text(lng.juniperClearPassword || 'Clear stored password');
      $('#juniperStrictHostKeyLabel').text(lng.juniperStrictHostKey || 'Strict Host Key Checking');
      $('#juniperSettingsSaveLabel').text(lng.juniperSaveSettings || 'Save Settings');
      $('label[for="juniperVlanName"]').text(lng.juniperVlanName || 'VLAN Name');
      $('label[for="juniperVlanId"]').text(lng.juniperVlanId || 'VLAN ID');
      if (typeof updateJuniperPortSelection === 'function') updateJuniperPortSelection();
      $('#haproxyStatusTabLabel,#haproxyStatusTitle').text(lng.haproxyStatus || 'HAProxy Status');
      $('#haproxyWebTabLabel,#haproxyWebTitle').text(lng.haproxyWeb || 'Web Load Balance');
      $('#haproxySqlTabLabel,#haproxySqlTitle').text(lng.haproxySql || 'SQL Server Load Balance');
      $('#haproxyTestTabLabel').text(lng.haproxyTest || 'Connection Test');
      $('#haproxyReloadLabel').text(lng.haproxyReload || 'Reload HAProxy');
      $('#haproxyRestartLabel').text(lng.haproxyRestart || 'Restart HAProxy');
      $('.haproxyRefreshLabel').text(lng.juniperRefresh || 'Refresh');
      $('.haproxyGenerateLabel').text(lng.haproxyGenerate || 'Generate Preview');
      $('.haproxyValidateLabel').text(lng.haproxyValidate || 'Validate Config');
      $('.haproxyApplyLabel').text(lng.haproxyApply || 'Validate & Apply');
      $('.haproxyAddServerLabel').text(lng.haproxyAddServer || 'Add Server');
      $('.haproxyPreviewTitle').text(lng.haproxyPreview || 'HAProxy Config Preview');
      if (lng.aiSend) $('#aiSendLabel').text(lng.aiSend);
      if (lng.aiInputPlaceholder) $('#aiInput').attr('placeholder', lng.aiInputPlaceholder);
      const labels = [
        ["#clear-all-rule", "clearAllRule"], ["#clear-current-table-rule", "clearCurrentRule"],
        ["#clear-all-empty-chain", "clearEmptyChain"], ["#clear-all-metrics", "clearAllMetrics"],
        ["#clear-current-table-metrics", "clearCurrentMetrics"], ["#self-iptables", "viewTable"],
        ["#exec-iptables", "execCmd"], ["#export-all-rule", "exportRule"],
        ["#import-all-rule", "importRule"], ["#open-iptables-doc", "doc"],
      ];
      labels.forEach(([sel, k]) => { const el = $(sel); if (el.length) el.html(el.html().replace(/(<\/i>)\s*.*/, '$1 ' + t(k))); });
      const tabs = ["tabRaw", "tabMangle", "tabNat", "tabFilter"];
      $(".iptables-table .nav-link").each((i, el) => { if (tabs[i]) $(el).text(t(tabs[i])); });
      $("#languageDropdownLabel").text(langNames[currentLang] || 'English');
      $("#languageDropdownMenu .dropdown-item").each(function () {
        $(this).toggleClass("active fw-semibold", $(this).data("lang") === lang);
        $(this).find(".bx-check").remove();
        if ($(this).data("lang") === lang) {
          $(this).append('<i class="bx bx-check ms-auto text-primary"></i>');
        }
      });
      $('[data-i18n]').each(function () {
        var key = $(this).data('i18n');
        if (key && lng[key]) $(this).text(lng[key]);
      });
      $('[data-i18n-html]').each(function () {
        var key = $(this).data('i18n-html');
        if (key && lng[key]) $(this).html(lng[key]);
      });
      $('[data-i18n-placeholder]').each(function () {
        var key = $(this).data('i18n-placeholder');
        if (key && lng[key]) $(this).attr('placeholder', lng[key]);
      });
      $('[data-i18n-title]').each(function () {
        var key = $(this).data('i18n-title');
        if (key && lng[key]) $(this).attr('title', lng[key]);
      });
    }
    // ─── Logger ───
    let logCount = 0;
    const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    const consoleMethods = { DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' };
    const consoleStyles = {
      DEBUG: 'color:#6c7086',
      INFO:  'color:#89b4fa;font-weight:600',
      WARN:  'color:#f9e2af;font-weight:600',
      ERROR: 'color:#f38ba8;font-weight:600',
    };
    const logger = {
      _append(level, msg, cmd) {
        logCount++;
        const time = new Date().toLocaleTimeString();
        const cls = Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === level) || 'DEBUG';
        const entry = document.createElement('div');
        entry.className = 'log-entry log-' + cls.toLowerCase();
        let html = `<span class="log-time">[${time}]</span><span class="log-msg">${msg}</span>`;
        if (cmd) html += `<span class="log-cmd">&#8594; ${cmd}</span>`;
        entry.innerHTML = html;
        document.getElementById('logContent').appendChild(entry);
        document.getElementById('logBadge').textContent = logCount;
        const c = document.getElementById('logContainer');
        if (c.classList.contains('open')) c.scrollTop = c.scrollHeight;
        // Mirror to browser developer console
        if (typeof console !== 'undefined') {
          const tag = '%c[' + cls + '][' + time + ']';
          const style = consoleStyles[cls] || '';
          const args = [tag, style, msg];
          if (cmd) args.push('→ ' + cmd);
          const fn = console[consoleMethods[cls]] || console.log;
          fn.apply(console, args);
        }
        // Mirror to server-side Rust console via /log endpoint (fire-and-forget)
        try {
          if (typeof fetch !== 'undefined') {
            const body = new URLSearchParams();
            body.set('level', cls.toLowerCase());
            body.set('msg', String(msg));
            if (cmd) body.set('cmd', String(cmd));
            fetch('/log', { method: 'POST', body: body, keepalive: true }).catch(function () {});
          }
        } catch (e) { /* silently ignore */ }
      },
      debug(msg, cmd) { this._append(LOG_LEVELS.DEBUG, msg, cmd); },
      info(msg, cmd) { this._append(LOG_LEVELS.INFO, msg, cmd); },
      warn(msg, cmd) { this._append(LOG_LEVELS.WARN, msg, cmd); },
      error(msg, cmd) { this._append(LOG_LEVELS.ERROR, msg, cmd); },
      clear() {
        document.getElementById('logContent').innerHTML = '';
        logCount = 0;
        document.getElementById('logBadge').textContent = '0';
        if (typeof console !== 'undefined' && console.clear) console.clear();
      }
    };
    // ─── Dashboard ───
    let dashTimer = null;
    function parseCounter(val) {
      if (!val) return 0;
      val = val.trim();
      const m = val.toUpperCase().match(/^([\d.]+)([KMG]?)$/);
      if (!m) return parseInt(val) || 0;
      const n = parseFloat(m[1]);
      switch (m[2]) { case 'K': return n * 1e3; case 'M': return n * 1e6; case 'G': return n * 1e9; default: return n; }
    }
    function fmtNum(n) {
      if (n >= 1e9) return (n / 1e9).toFixed(1) + 'G';
      if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return n.toString();
    }
    function extractPortIn(action) { var m = action.match(/dpt[:=](\d+)/); return m ? m[1] : null; }
    function extractPortOut(action) { var m = action.match(/spt[:=](\d+)/); return m ? m[1] : null; }
    function isInboundChain(name) { return name === 'INPUT' || name === 'FORWARD'; }
    function isOutboundChain(name) { return name === 'OUTPUT'; }
    var dashTrend = [];
    function aggregateRules(data) {
      var stats = { totalRules: 0, totalChains: 0, totalPkts: 0, totalBytes: 0,
        chainTraffic: {}, protocols: {}, targets: {}, srcIPs: {}, dstIPs: {},
        portsIn: {}, portsOut: {}, ports: {}, inPkts: 0, outPkts: 0, inBytes: 0, outBytes: 0 };
      ['system', 'custom'].forEach(function (type) {
        (data[type] || []).forEach(function (chain) {
          stats.totalChains++;
          var cname = chain.title.chain;
          var inbound = isInboundChain(cname);
          var outbound = isOutboundChain(cname);
          var chainPkts = chain.title.packets ? parseCounter(chain.title.packets) : 0;
          var chainBytes = chain.title.bytes ? parseCounter(chain.title.bytes) : 0;
          (chain.list || []).forEach(function (r) {
            stats.totalRules++;
            var pkts = parseCounter(r.pkts);
            var bytes = parseCounter(r.bytes);
            stats.totalPkts += pkts;
            stats.totalBytes += bytes;
            stats.chainTraffic[cname] = stats.chainTraffic[cname] || { pkts: 0, bytes: 0 };
            stats.chainTraffic[cname].pkts += pkts;
            stats.chainTraffic[cname].bytes += bytes;
            stats.protocols[r.prot] = (stats.protocols[r.prot] || 0) + 1;
            stats.targets[r.target] = (stats.targets[r.target] || 0) + pkts;
            var src = r.source.replace(/^!/, '');
            if (src && src !== '0.0.0.0/0' && src !== '::/0') { stats.srcIPs[src] = (stats.srcIPs[src] || 0) + pkts; }
            var dst = r.destination.replace(/^!/, '');
            if (dst && dst !== '0.0.0.0/0' && dst !== '::/0') { stats.dstIPs[dst] = (stats.dstIPs[dst] || 0) + pkts; }
            // Port in/out by chain direction
            var pIn = inbound ? extractPortIn(r.action) : null;
            var pOut = outbound ? extractPortOut(r.action) : null;
            // Also match dpt in OUTPUT for replies or spt in INPUT
            if (inbound && !pIn) pIn = extractPortIn(r.action);
            if (outbound && !pOut) pOut = extractPortOut(r.action);
            // Also check FORWARD for both directions
            if (cname === 'FORWARD') {
              var fp = extractPortIn(r.action);
              if (fp) { stats.portsIn[fp] = (stats.portsIn[fp] || 0) + pkts; }
              var fp2 = extractPortOut(r.action);
              if (fp2) { stats.portsOut[fp2] = (stats.portsOut[fp2] || 0) + pkts; }
            } else {
              if (pIn) { stats.portsIn[pIn] = (stats.portsIn[pIn] || 0) + pkts; }
              if (pOut) { stats.portsOut[pOut] = (stats.portsOut[pOut] || 0) + pkts; }
            }
            // Legacy ports aggregate
            var port = extractPortIn(r.action) || extractPortOut(r.action);
            if (port) stats.ports[port] = (stats.ports[port] || 0) + pkts;
            // Direction totals
            if (inbound) { stats.inPkts += pkts; stats.inBytes += bytes; }
            if (outbound) { stats.outPkts += pkts; stats.outBytes += bytes; }
          });
          if (chain.list && chain.list.length === 0) {
            stats.chainTraffic[cname] = { pkts: chainPkts, bytes: chainBytes };
          }
        });
      });
      return stats;
    }
    function topN(obj, n) {
      return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; }).slice(0, n).map(function (k) { return { key: k, val: obj[k] }; });
    }
    function donutGradient(items, total, colors) {
      if (total === 0) return 'conic-gradient(#eee 0deg 360deg)';
      let pct = 0, stops = [];
      items.forEach(function (item, i) {
        const v = (item.val / total) * 360;
        stops.push((colors[i % colors.length]) + ' ' + pct + 'deg ' + (pct + v) + 'deg');
        pct += v;
      });
      if (pct < 360) stops.push('#eee ' + pct + 'deg 360deg');
      return 'conic-gradient(' + stops.join(', ') + ')';
    }
    var KNOWN_PORTS = { '22':'SSH','80':'HTTP','443':'HTTPS','53':'DNS','25':'SMTP','3306':'MySQL','5432':'PostgreSQL','6379':'Redis','8080':'HTTP-Alt','8443':'HTTPS-Alt','993':'IMAPS','587':'SMTP-Submit','3389':'RDP','27017':'MongoDB' };
    var TREND_MAX = 120;
    var prevCumulative = null;
    function drawTrend(animate) {
      var canvas = document.getElementById('dashTrendChart');
      if (!canvas || dashTrend.length < 2) return;
      var ctx = canvas.getContext('2d');
      var dpr = window.devicePixelRatio || 1;
      var cssW = canvas.clientWidth || 800;
      var cssH = 220;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        canvas.style.height = cssH + 'px';
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var W = cssW, H = cssH;
      var pad = { top: 18, right: 18, bottom: 30, left: 52 };
      var plotW = W - pad.left - pad.right, plotH = H - pad.top - pad.bottom;
      // Nice max value (round up to a friendly number)
      var rawMax = 0, i;
      for (i = 0; i < dashTrend.length; i++) {
        rawMax = Math.max(rawMax, dashTrend[i].inPkts || 0, dashTrend[i].outPkts || 0);
      }
      if (rawMax < 1) rawMax = 1;
      var maxVal;
      if (rawMax <= 10) maxVal = 10;
      else if (rawMax <= 50) maxVal = 50;
      else if (rawMax <= 100) maxVal = 100;
      else if (rawMax <= 500) maxVal = 500;
      else if (rawMax <= 1000) maxVal = 1000;
      else if (rawMax <= 5000) maxVal = 5000;
      else if (rawMax <= 10000) maxVal = 10000;
      else {
        var exp = Math.pow(10, Math.floor(Math.log10(rawMax)));
        maxVal = Math.ceil(rawMax / exp) * exp;
      }
      var inData = [], outData = [];
      for (i = 0; i < dashTrend.length; i++) {
        inData.push(dashTrend[i].inPkts || 0);
        outData.push(dashTrend[i].outPkts || 0);
      }
      function xAt(i) { return pad.left + (i / Math.max(1, dashTrend.length - 1)) * plotW; }
      function yAt(v) { return pad.top + plotH - (v / maxVal) * plotH; }
      // Catmull-Rom smoothing → cubic Bezier
      function smoothPath(data) {
        if (data.length < 2) return null;
        var pts = [];
        for (var j = 0; j < data.length; j++) {
          if (data[j] !== undefined && data[j] !== null) {
            pts.push({ x: xAt(j), y: yAt(data[j]) });
          }
        }
        if (pts.length < 2) return null;
        var path = new Path2D();
        path.moveTo(pts[0].x, pts[0].y);
        for (var k = 0; k < pts.length - 1; k++) {
          var p0 = pts[k - 1] || pts[k];
          var p1 = pts[k];
          var p2 = pts[k + 1];
          var p3 = pts[k + 2] || p2;
          var t = 0.18;
          var c1x = p1.x + (p2.x - p0.x) * t;
          var c1y = p1.y + (p2.y - p0.y) * t;
          var c2x = p2.x - (p3.x - p1.x) * t;
          var c2y = p2.y - (p3.y - p1.y) * t;
          path.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
        }
        return { path: path, last: pts[pts.length - 1] };
      }
      var frames = animate ? 24 : 1, frame = 0;
      function doDraw(f) {
        var progress = f / frames;
        ctx.clearRect(0, 0, W, H);
        // Background subtle gradient
        var bg = ctx.createLinearGradient(0, pad.top, 0, H - pad.bottom);
        bg.addColorStop(0, 'rgba(166, 227, 161, 0.02)');
        bg.addColorStop(1, 'rgba(137, 180, 250, 0.02)');
        ctx.fillStyle = bg;
        ctx.fillRect(pad.left, pad.top, plotW, plotH);
        // Horizontal grid lines + Y-axis labels
        ctx.strokeStyle = 'rgba(108, 112, 134, 0.18)';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#6c7086';
        ctx.font = '10px "Cascadia Code", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        var yLabels = 4;
        for (i = 0; i <= yLabels; i++) {
          var yVal = (maxVal * i) / yLabels;
          var y = pad.top + plotH - (i / yLabels) * plotH;
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(pad.right !== undefined ? W - pad.right : W - 18, y);
          ctx.stroke();
          ctx.fillText(fmtNum(yVal) + ' pps', pad.left - 6, y);
        }
        // Vertical "now" line at the rightmost sample
        var nowX = xAt(dashTrend.length - 1);
        ctx.strokeStyle = 'rgba(166, 227, 161, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(nowX, pad.top);
        ctx.lineTo(nowX, pad.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        // X-axis: smart time labels (max ~6)
        ctx.fillStyle = '#6c7086';
        ctx.font = '10px "Cascadia Code", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        var timeCount = Math.min(6, dashTrend.length);
        for (i = 0; i < timeCount; i++) {
          var idx = Math.floor((dashTrend.length - 1) * (i / (timeCount - 1 || 1)));
          var d = new Date(dashTrend[idx].ts);
          var lbl = String(d.getHours()).padStart(2,'0') + ':' +
                    String(d.getMinutes()).padStart(2,'0') + ':' +
                    String(d.getSeconds()).padStart(2,'0');
          ctx.fillText(lbl, xAt(idx), pad.top + plotH + 6);
        }
        // Build smooth paths
        var inS = smoothPath(inData);
        var outS = smoothPath(outData);
        // Animate the path drawing by clipping to a horizontal reveal
        if (progress < 1) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(pad.left, pad.top, plotW * progress, plotH);
          ctx.clip();
        }
        function drawSeries(s, baseColor, fillAlpha) {
          if (!s) return;
          // Filled area
          var fill = new Path2D(s.path);
          fill.lineTo(s.last.x, pad.top + plotH);
          fill.lineTo(xAt(0), pad.top + plotH);
          fill.closePath();
          var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
          grad.addColorStop(0, baseColor + 'cc');
          grad.addColorStop(1, baseColor + '00');
          ctx.fillStyle = grad;
          ctx.fill(fill);
          // Glow under-line (broad)
          ctx.save();
          ctx.shadowColor = baseColor;
          ctx.shadowBlur = 8;
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 1.5;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke(s.path);
          ctx.restore();
          // Crisp top line
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 2;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke(s.path);
          // Latest point dot
          ctx.save();
          ctx.shadowColor = baseColor;
          ctx.shadowBlur = 10;
          ctx.fillStyle = baseColor;
          ctx.beginPath();
          ctx.arc(s.last.x, s.last.y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          // Halo
          ctx.fillStyle = baseColor + '30';
          ctx.beginPath();
          ctx.arc(s.last.x, s.last.y, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        drawSeries(outS, '#89b4fa', 0.3);
        drawSeries(inS,  '#a6e3a1', 0.3);
        if (progress < 1) ctx.restore();
        // Stats overlay (top-right): current in/out rate
        var curIn = inData[inData.length - 1] || 0;
        var curOut = outData[outData.length - 1] || 0;
        var ox = W - pad.right - 4;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.font = '600 11px "Cascadia Code", monospace';
        ctx.fillStyle = '#a6e3a1';
        ctx.fillText('▼ ' + fmtNum(curIn) + ' pps', ox, pad.top + 2);
        ctx.fillStyle = '#89b4fa';
        ctx.fillText('▲ ' + fmtNum(curOut) + ' pps', ox, pad.top + 18);
        if (frame < frames) { frame++; requestAnimationFrame(function () { doDraw(frame); }); }
      }
      doDraw(0);
    }
    // ─── Trend chart tooltip ───
    (function setupTrendTooltip() {
      var canvas = document.getElementById('dashTrendChart');
      var tooltip = document.getElementById('dashTrendTooltip');
      if (!canvas || !tooltip) return;
      var pad = { top: 18, right: 18, bottom: 30, left: 52 };
      canvas.addEventListener('mousemove', function (e) {
        if (dashTrend.length < 2) { tooltip.style.opacity = 0; return; }
        var rect = canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;
        var cssW = rect.width, cssH = rect.height;
        var plotW = cssW - pad.left - pad.right;
        if (mx < pad.left || mx > cssW - pad.right || my < pad.top || my > cssH - pad.bottom) {
          tooltip.style.opacity = 0;
          return;
        }
        var ratio = (mx - pad.left) / plotW;
        var idx = Math.round(ratio * (dashTrend.length - 1));
        idx = Math.max(0, Math.min(dashTrend.length - 1, idx));
        var d = dashTrend[idx];
        var time = new Date(d.ts);
        var ts = String(time.getHours()).padStart(2,'0') + ':' +
                 String(time.getMinutes()).padStart(2,'0') + ':' +
                 String(time.getSeconds()).padStart(2,'0');
        var inVal = d.inPkts || 0, outVal = d.outPkts || 0;
        tooltip.innerHTML =
          '<div class="tt-time">' + ts + '</div>' +
          '<div class="tt-row"><span class="tt-dot" style="background:#a6e3a1"></span><span>入站</span><span class="tt-val">' + fmtNum(inVal) + ' pps</span></div>' +
          '<div class="tt-row"><span class="tt-dot" style="background:#89b4fa"></span><span>出站</span><span class="tt-val">' + fmtNum(outVal) + ' pps</span></div>';
        // Position tooltip relative to canvas parent
        var tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
        var left = mx + 14;
        if (left + tw > cssW - 4) left = mx - tw - 14;
        var top = my - th - 8;
        if (top < 0) top = my + 14;
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.style.opacity = 1;
      });
      canvas.addEventListener('mouseleave', function () { tooltip.style.opacity = 0; });
    })();
    function renderDash(res) {
      var data = res.data || { system: [], custom: [] };
      var stats = aggregateRules(data);
      var lang = i18n[currentLang];
      var noData = '<div class="dash-empty"><i class="bx bx-data"></i>' + (lang.dashNoData || 'No data') + '</div>';
      var colors = ['#0d6efd','#198754','#dc3545','#ffc107','#6f42c1','#fd7e14','#20c997','#d63384'];
      function rankClass(i) { return i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-n'; }
      function rankHtml(i) { return '<span class="rank ' + rankClass(i) + '">' + (i + 1) + '</span>'; }
      // KPI row (icon + value layout)
      $('#dashKpiRow').html(
        '<div class="col-md-3 mb-2"><div class="card dash-card"><div class="card-body"><div class="dash-kpi-row"><div><div class="dash-kpi-label">' + (lang.dashTotalRules || 'Rules') + '</div><div class="dash-kpi">' + stats.totalRules + '</div></div><div class="dash-kpi-icon dash-kpi-icon-primary"><i class="bx bx-shield-quarter"></i></div></div></div></div></div>' +
        '<div class="col-md-3 mb-2"><div class="card dash-card"><div class="card-body"><div class="dash-kpi-row"><div><div class="dash-kpi-label">' + (lang.dashTotalChains || 'Chains') + '</div><div class="dash-kpi">' + stats.totalChains + '</div></div><div class="dash-kpi-icon dash-kpi-icon-success"><i class="bx bx-link"></i></div></div></div></div></div>' +
        '<div class="col-md-3 mb-2"><div class="card dash-card"><div class="card-body"><div class="dash-kpi-row"><div><div class="dash-kpi-label">' + (lang.dashTotalPkts || 'Packets') + '</div><div class="dash-kpi">' + fmtNum(stats.totalPkts) + ' <span class="dash-kpi-unit">pkt</span></div></div><div class="dash-kpi-icon dash-kpi-icon-info"><i class="bx bx-package"></i></div></div></div></div></div>' +
        '<div class="col-md-3 mb-2"><div class="card dash-card"><div class="card-body"><div class="dash-kpi-row"><div><div class="dash-kpi-label">' + (lang.dashTotalBytes || 'Bytes') + '</div><div class="dash-kpi">' + fmtNum(stats.totalBytes) + ' <span class="dash-kpi-unit">B</span></div></div><div class="dash-kpi-icon dash-kpi-icon-warning"><i class="bx bx-data"></i></div></div></div></div></div>'
      );
      // Trend label
      $('#dashTrendLabel').text(lang.dashTrendLabel || 'Traffic Trend (5s interval)');
      // Trend data (compute rate from cumulative counters)
      if (prevCumulative) {
        var dt = (Date.now() - prevCumulative.ts) / 1000;
        if (dt > 0) {
          var rateIn = Math.round((stats.inPkts - prevCumulative.inPkts) / dt);
          var rateOut = Math.round((stats.outPkts - prevCumulative.outPkts) / dt);
          dashTrend.push({ ts: Date.now(), inPkts: Math.max(0, rateIn), outPkts: Math.max(0, rateOut) });
          if (dashTrend.length > TREND_MAX) dashTrend.shift();
        }
      } else {
        dashTrend.push({ ts: Date.now(), inPkts: 0, outPkts: 0 });
      }
      prevCumulative = { ts: Date.now(), inPkts: stats.inPkts, outPkts: stats.outPkts };
      drawTrend(true);
      // Port Traffic In/Out
      var allPorts = new Set();
      Object.keys(stats.portsIn).forEach(function (p) { allPorts.add(p); });
      Object.keys(stats.portsOut).forEach(function (p) { allPorts.add(p); });
      var portList = [];
      allPorts.forEach(function (p) {
        portList.push({ port: p, inPkts: stats.portsIn[p] || 0, outPkts: stats.portsOut[p] || 0, total: (stats.portsIn[p] || 0) + (stats.portsOut[p] || 0) });
      });
      portList.sort(function (a, b) { return b.total - a.total; });
      var pioHtml = '<table class="table table-sm dash-top-table mb-0"><thead><tr><th>Port</th><th class="num">' + (lang.dashPortIn || 'In (pkts)') + '</th><th class="num">' + (lang.dashPortOut || 'Out (pkts)') + '</th><th class="num">' + (lang.dashPortTotal || 'Total') + '</th></tr></thead><tbody>';
      portList.slice(0, 10).forEach(function (p) {
        var name = KNOWN_PORTS[p.port] ? '<span class="dash-port-name">' + KNOWN_PORTS[p.port] + '</span>' : '';
        pioHtml += '<tr><td><strong>' + p.port + '</strong>' + name + '</td><td class="num" style="color:#a6e3a1;font-weight:600">' + fmtNum(p.inPkts) + '</td><td class="num" style="color:#89b4fa;font-weight:600">' + fmtNum(p.outPkts) + '</td><td class="num"><strong>' + fmtNum(p.total) + '</strong></td></tr>';
      });
      pioHtml += '</tbody></table>';
      $('#dashPortInOut').append('<div>' + (portList.length ? pioHtml : noData) + '</div>');
      // Protocol distribution (donut)
      var protItems = topN(stats.protocols, 6);
      var protTotal = protItems.reduce(function (s, i) { return s + i.val; }, 0);
      var protGrad = donutGradient(protItems, protTotal, colors);
      var protHtml = '<div class="dash-donut" style="background:' + protGrad + '"><div class="dash-donut-center">' + fmtNum(protTotal) + '<small>' + (lang.dashPkt || 'pkt') + '</small></div></div><div class="dash-donut-legend">';
      protItems.forEach(function (p, i) { protHtml += '<span class="item"><span class="dot" style="background:' + colors[i % colors.length] + '"></span>' + p.key + ' · ' + fmtNum(p.val) + '</span>'; });
      protHtml += '</div>';
      $('#dashProtocolDist').append('<div>' + (protItems.length ? protHtml : noData) + '</div>');
      // Top source IPs
      var srcItems = topN(stats.srcIPs, 8);
      var srcHtml = '<table class="table table-sm dash-top-table mb-0"><thead><tr><th style="width:40px">#</th><th>Source IP</th><th class="num">Packets</th></tr></thead><tbody>';
      srcItems.forEach(function (s, i) { srcHtml += '<tr><td>' + rankHtml(i) + '</td><td><code style="font-size:.75rem;background:var(--bs-tertiary-bg);padding:.05rem .375rem;border-radius:3px">' + s.key + '</code></td><td class="num"><strong>' + fmtNum(s.val) + '</strong></td></tr>'; });
      srcHtml += '</tbody></table>';
      $('#dashTopSrc').append('<div>' + (srcItems.length ? srcHtml : noData) + '</div>');
      // Top destination IPs
      var dstItems = topN(stats.dstIPs, 8);
      var dstHtml = '<table class="table table-sm dash-top-table mb-0"><thead><tr><th style="width:40px">#</th><th>Destination IP</th><th class="num">Packets</th></tr></thead><tbody>';
      dstItems.forEach(function (s, i) { dstHtml += '<tr><td>' + rankHtml(i) + '</td><td><code style="font-size:.75rem;background:var(--bs-tertiary-bg);padding:.05rem .375rem;border-radius:3px">' + s.key + '</code></td><td class="num"><strong>' + fmtNum(s.val) + '</strong></td></tr>'; });
      dstHtml += '</tbody></table>';
      $('#dashTopDst').append('<div>' + (dstItems.length ? dstHtml : noData) + '</div>');
      // Target distribution (donut)
      var tgtItems = topN(stats.targets, 6);
      var tgtTotal = tgtItems.reduce(function (s, i) { return s + i.val; }, 0);
      var tgtGrad = donutGradient(tgtItems, tgtTotal, colors);
      var tgtHtml = '<div class="dash-donut" style="background:' + tgtGrad + '"><div class="dash-donut-center">' + fmtNum(tgtTotal) + '<small>' + (lang.dashPkt || 'pkt') + '</small></div></div><div class="dash-donut-legend">';
      tgtItems.forEach(function (t, i) { tgtHtml += '<span class="item"><span class="dot" style="background:' + colors[i % colors.length] + '"></span>' + t.key + ' · ' + fmtNum(t.val) + '</span>'; });
      tgtHtml += '</div>';
      $('#dashTargetDist').append('<div>' + (tgtItems.length ? tgtHtml : noData) + '</div>');
      // Top ports (legacy)
      var portItems = topN(stats.ports, 8);
      var portHtml = '<table class="table table-sm dash-top-table mb-0"><thead><tr><th style="width:40px">#</th><th>Port</th><th class="num">Packets</th></tr></thead><tbody>';
      portItems.forEach(function (p, i) {
        var name = KNOWN_PORTS[p.key] ? '<span class="dash-port-name">' + KNOWN_PORTS[p.key] + '</span>' : '';
        portHtml += '<tr><td>' + rankHtml(i) + '</td><td><strong>' + p.key + '</strong>' + name + '</td><td class="num"><strong>' + fmtNum(p.val) + '</strong></td></tr>';
      });
      portHtml += '</tbody></table>';
      $('#dashTopPorts').append('<div>' + (portItems.length ? portHtml : noData) + '</div>');
      // Timestamp
      $('#dashUpdated').html('<span class="dot-pulse"></span>' + (lang.dashUpdated || 'Updated') + ': ' + new Date().toLocaleTimeString());
    }
    let dashLoading = false;
    function loadDash() {
      if (dashLoading) return;
      dashLoading = true;
      const tn = currentTableName();
      const protocol = currentPlatform === 'linux' ? currentProtocol : 'ipv4';
      $.post('/listRule', { table: tn, chain: '', protocol: protocol }, function (res) {
        dashLoading = false;
        if (res.code === 0) {
          $('#dashKpiRow,#dashPortInOut,#dashProtocolDist,#dashTopSrc,#dashTopDst,#dashTargetDist,#dashTopPorts,#dashActivityBody').empty();
          renderDash(res);
          logger.debug('Dashboard 更新', tn);
        }
      }, 'json');
      // Load activity feed
      $.get('/activity', function (res) {
        if (res.code === 0 && res.data) {
          var items = res.data || [];
          var html = '<div style="display:flex;flex-direction:column;gap:2px">';
          items.forEach(function (item) {
            var time = (item.time || '').substring(0, 19).replace('T', ' ');
            var icon = item.icon || 'bx-circle';
            var statusCls = item.status === 'completed' || item.status === 'enabled' ? 'text-success' :
              item.status === 'running' || item.status === 'pending' ? 'text-primary' : 'text-muted';
            html += '<div class="d-flex align-items-center gap-2 py-1" style="border-bottom:1px solid var(--bs-border-color)">' +
              '<i class="bx ' + icon + ' ' + statusCls + '"></i>' +
              '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(item.label) + '</span>' +
              '<small class="text-muted" style="flex-shrink:0">' + escHtml(time) + '</small></div>';
          });
          html += '</div>';
          $('#dashActivityBody').html(html || '<div class="text-muted">尚無活動記錄</div>');
        }
      });
    }
    // ─── System Info ───
    var sysProcData = [];
    var sysSortField = 'mem';
    function fmtSize(n) {
      if (n >= 1073741824) return (n / 1073741824).toFixed(1) + 'G';
      if (n >= 1048576) return (n / 1048576).toFixed(1) + 'M';
      if (n >= 1024) return (n / 1024).toFixed(1) + 'K';
      return n + 'B';
    }
    function fmtPct(n) { return parseFloat(n).toFixed(1) + '%'; }
    function renderSysInfo(data) {
      var lang = i18n[currentLang];
      var ips = (data.ip_addresses || []).join(', ') || 'N/A';
      var memTotal = data.memory ? data.memory.total : 0;
      var memUsed = data.memory ? data.memory.used : 0;
      var memFree = data.memory ? data.memory.free : 0;
      var memPct = memTotal > 0 ? ((memUsed / memTotal) * 100).toFixed(1) : 0;
      var swapTotal = data.swap ? data.swap.total : 0;
      var swapUsed = data.swap ? data.swap.used : 0;
      var swapPct = swapTotal > 0 ? ((swapUsed / swapTotal) * 100).toFixed(1) : 0;
      var memColor = memPct > 80 ? '#dc3545' : memPct > 50 ? '#ffc107' : '#198754';
      var swapColor = swapPct > 80 ? '#dc3545' : swapPct > 50 ? '#ffc107' : '#198754';
      $('#sysInfoBody').html(
        '<div class="row">' +
          '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + lang.sysHostname + '</div><div class="sys-card-val">' + (data.hostname || 'N/A') + '</div></div>' +
          '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + lang.sysOS + '</div><div class="sys-card-val" style="font-size:1rem">' + (data.os || 'N/A') + '</div></div>' +
          '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + lang.sysUptime + '</div><div class="sys-card-val" style="font-size:1rem">' + (data.uptime || 'N/A') + '</div></div>' +
          '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + lang.sysIP + '</div><div class="sys-card-val" style="font-size:.875rem">' + ips + '</div></div>' +
        '</div>' +
        '<div class="row mt-2">' +
          '<div class="col-md-6 mb-3">' +
            '<div class="sys-card-label">' + lang.sysMemory + '</div>' +
            '<div class="d-flex justify-content-between" style="font-size:.75rem"><span>' + lang.sysUsed + ': ' + memUsed + ' MB</span><span>' + lang.sysFree + ': ' + memFree + ' MB</span><span>' + lang.sysTotal + ': ' + memTotal + ' MB</span></div>' +
            '<div class="sys-mem-bar"><div class="sys-mem-fill" style="width:' + memPct + '%;background:' + memColor + '"></div></div>' +
            '<div style="font-size:.6875rem;color:var(--bs-secondary-color);text-align:right">' + memPct + '%</div>' +
          '</div>' +
          '<div class="col-md-6 mb-3">' +
            '<div class="sys-card-label">' + lang.sysSwap + '</div>' +
            '<div class="d-flex justify-content-between" style="font-size:.75rem"><span>' + lang.sysUsed + ': ' + swapUsed + ' MB</span><span>' + lang.sysFree + ': ' + (swapTotal - swapUsed) + ' MB</span><span>' + lang.sysTotal + ': ' + swapTotal + ' MB</span></div>' +
            '<div class="sys-mem-bar"><div class="sys-mem-fill" style="width:' + swapPct + '%;background:' + swapColor + '"></div></div>' +
            '<div style="font-size:.6875rem;color:var(--bs-secondary-color);text-align:right">' + swapPct + '%</div>' +
          '</div>' +
        '</div>'
      );
    }
    function renderSysDisks(data) {
      var lang = i18n[currentLang];
      var disks = data.disks || [];
      if (!disks.length) { $('#sysDiskBody').html('<div class="text-muted" style="font-size:.75rem;padding:.5rem">' + (lang.dashNoData || 'No data') + '</div>'); return; }
      var html = '<table class="table table-sm sys-disk-table mb-0"><thead><tr><th>' + lang.sysFilesystem + '</th><th>' + lang.sysMount + '</th><th>' + lang.sysTotal + '</th><th>' + lang.sysUsed + '</th><th>' + lang.sysFree + '</th><th>' + lang.sysUsePct + '</th><th></th></tr></thead><tbody>';
      disks.forEach(function (d) {
        var pct = parseInt(d.use_pct) || 0;
        var color = pct > 80 ? '#dc3545' : pct > 50 ? '#ffc107' : '#198754';
        html += '<tr><td>' + d.filesystem + '</td><td>' + d.mount + '</td><td>' + d.total + '</td><td>' + d.used + '</td><td>' + d.available + '</td><td>' + d.use_pct + '</td><td><div class="sys-disk-bar"><div class="sys-disk-fill" style="width:' + pct + '%;background:' + color + '"></div></div></td></tr>';
      });
      html += '</tbody></table>';
      $('#sysDiskBody').html(html);
    }
    function sortProcs(data, field) {
      var order = { mem: -1, cpu: -1, pid: 1, rss: -1 };
      return data.sort(function (a, b) {
        var va = parseFloat(a[field]) || 0;
        var vb = parseFloat(b[field]) || 0;
        return (va - vb) * (order[field] || -1);
      });
    }
    function renderSysProcs(data) {
      var lang = i18n[currentLang];
      sysProcData = data;
      var sorted = sortProcs(data.slice(), sysSortField);
      if (!sorted.length) { $('#sysProcBody').html('<div class="text-muted" style="font-size:.75rem;padding:.5rem">' + (lang.dashNoData || 'No data') + '</div>'); return; }
      var html = '<div style="max-height:500px;overflow-y:auto"><table class="table table-sm sys-proc-table mb-0" id="sysProcTable"><thead><tr>' +
        '<th data-field="pid">' + lang.sysPID + ' <span class="sort-icon">&#9650;</span></th>' +
        '<th data-field="name">' + lang.sysName + '</th>' +
        '<th data-field="cpu" class="active">' + lang.sysCPU + ' <span class="sort-icon">&#9660;</span></th>' +
        '<th data-field="mem" class="active">' + lang.sysMEM + ' <span class="sort-icon">&#9660;</span></th>' +
        '<th data-field="rss">' + lang.sysRSS + ' <span class="sort-icon">&#9660;</span></th>' +
        '<th data-field="state">' + lang.sysState + '</th>' +
        '<th>Path</th></tr></thead><tbody>';
      sorted.forEach(function (p) {
        html += '<tr><td>' + p.pid + '</td><td>' + p.name + '</td><td>' + fmtPct(p.cpu) + '</td><td>' + fmtPct(p.mem) + '</td><td>' + fmtSize(parseInt(p.rss) * 1024) + '</td><td>' + p.state + '</td><td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + p.path + '</td></tr>';
      });
      html += '</tbody></table></div>';
      $('#sysProcBody').html(html);
    }
    function loadSystemInfo() {
      logger.debug('Loading system info…');
      $.get('/system/info', function (res) {
        if (res.code === 0 && res.data) {
          renderSysInfo(res.data);
          renderSysDisks(res.data);
          logger.debug('System info loaded');
        }
      }, 'json');
      $.get('/system/processes', function (res) {
        if (res.code === 0 && res.data) {
          renderSysProcs(res.data);
          logger.debug('Process list loaded (' + res.data.length + ' procs)');
        }
      }, 'json');
    }
    $(document).on('click', '#sysProcTable th', function () {
      var field = $(this).data('field');
      if (!field) return;
      sysSortField = field;
      renderSysProcs(sysProcData);
    });
    $(document).on('change', '#sysProcSort', function () {
      sysSortField = $(this).val();
      renderSysProcs(sysProcData);
    });
    $(document).on('click', '#sysRefreshBtn', function () {
      loadSystemInfo();
      logger.info('System info refreshed');
    });
    // ─── Juniper ───
    var juniperVlanNames = [];
    var juniperPortRows = [];
    var juniperSelectedPorts = {};
    function escHtml(v) { return $('<div>').text(v === undefined || v === null ? '' : String(v)).html(); }
    function renderJuniperChips(items) {
      if (!items || !items.length) return '<span class="text-muted">-</span>';
      return items.map(function (item) { return '<span class="juniper-chip">' + escHtml(item) + '</span>'; }).join('');
    }
    function juniperPreview(commands) {
      return (commands || []).join('\n');
    }
    var juniperBase = null;
    var juniperBaseCandidates = ['/juniper', '/api/juniper', 'juniper', 'api/juniper'];
    function juniperUrl(path) { return juniperBase + path; }
    function juniperCandidateUrl(base, path) { return base + path; }
    function juniperPortPath(port) { return String(port || '').replace(/\//g, '~'); }
    function renderJuniperBulkVlanOptions() {
      var current = $('#juniperBulkVlans').val();
      var selected = Array.isArray(current) ? current : current ? [current] : [];
      var html = juniperVlanNames.map(function (name) {
        return '<option value="' + escHtml(name) + '"' + (selected.indexOf(name) !== -1 ? ' selected' : '') + '>' + escHtml(name) + '</option>';
      }).join('');
      $('#juniperBulkVlans').html(html);
      updateJuniperBulkVlanMode();
    }
    function updateJuniperBulkVlanMode() {
      var mode = $('#juniperBulkMode').val();
      var select = $('#juniperBulkVlans');
      var selected = select.val() || [];
      if (mode === 'access') {
        select.prop('multiple', false).attr('size', 1);
        if (selected.length > 1) select.val(selected[0]);
      } else {
        select.prop('multiple', true).attr('size', 3);
        select.val(selected);
      }
    }
    function selectedJuniperPorts() {
      return Object.keys(juniperSelectedPorts).filter(function (port) { return !!juniperSelectedPorts[port]; }).sort();
    }
    function updateJuniperPortSelection() {
      var lang = i18n[currentLang];
      var ports = selectedJuniperPorts();
      var countText = (lang.juniperSelectedCount || '{count} ports selected').replace('{count}', ports.length);
      $('#juniperPortSelectedCount').text(countText);
      $('#juniperSelectedPorts').html(ports.length ? renderJuniperChips(ports) : '<span class="text-muted">-</span>');
      $('.juniper-port-tile').each(function () {
        $(this).toggleClass('is-selected', !!juniperSelectedPorts[$(this).data('port')]);
      });
      $('.juniper-port-select').each(function () {
        $(this).prop('checked', !!juniperSelectedPorts[$(this).data('port')]);
      });
      var hasManagementPort = ports.indexOf('ge-0/0/23') !== -1;
      $('#juniperManagementPortWarning')
        .toggleClass('d-none', !hasManagementPort)
        .text(lang.juniperMgmtPortWarning || 'Warning: ge-0/0/23 is the Firewall-Man management port.');
    }
    function renderJuniperPortMap(rows) {
      var lang = i18n[currentLang];
      var groups = {};
      rows.forEach(function (p) {
        var slash = p.port.lastIndexOf('/');
        var group = slash === -1 ? p.port : p.port.substring(0, slash);
        var label = slash === -1 ? p.port : p.port.substring(slash + 1);
        if (!groups[group]) groups[group] = [];
        groups[group].push({ port: p, label: label });
      });
      var html = '';
      Object.keys(groups).sort().forEach(function (group) {
        groups[group].sort(function (a, b) { return Number(a.label) - Number(b.label); });
        if (groups[group].length > 4 && groups[group].every(function (item) { return /^\d+$/.test(item.label); })) {
          groups[group] = groups[group].filter(function (item) { return Number(item.label) % 2 === 0; })
            .concat(groups[group].filter(function (item) { return Number(item.label) % 2 === 1; }));
        }
        html += '<div class="juniper-port-group"><div class="juniper-port-group-title">' + escHtml(group) + '</div><div class="juniper-port-grid">';
        groups[group].forEach(function (item) {
          var p = item.port;
          var stateClass = p.enabled === false ? 'is-disabled' : p.link_status === 'up' ? 'is-up' : 'is-unused';
          var stateLabel = p.enabled === false ? (lang.juniperDisabled || 'Disabled') : p.link_status === 'up' ? (lang.juniperLinkInUse || 'In Use') : (lang.juniperLinkUnused || 'Unused');
          var title = p.port + ' · ' + stateLabel + ' · ' + p.mode + ' · ' + (p.vlan_members || []).join(', ');
          html += '<button type="button" class="juniper-port-tile ' + stateClass + '" data-port="' + escHtml(p.port) + '" title="' + escHtml(title) + '">' +
            '<span class="juniper-port-jack"></span><span>' + escHtml(item.label) + '</span></button>';
        });
        html += '</div></div>';
      });
      $('#juniperPortMap').html(html || '<span class="text-muted">' + (lang.dashNoData || 'No data') + '</span>');
      updateJuniperPortSelection();
    }
    function showJuniperError(msg) {
      logger.error('Juniper API 錯誤', msg || '');
      layer.alert('<pre class="modal-pre">' + escHtml(msg || 'Unknown error') + '</pre>', { title: 'Juniper' });
    }
    function showHaproxyError(msg) {
      logger.error('HAProxy API 錯誤', msg || '');
      layer.alert('<pre class="modal-pre">' + escHtml(msg || 'Unknown error') + '</pre>', { title: 'HAProxy' });
    }
    function juniperAjaxError(xhr, textStatus, errorThrown) {
      if (xhr && xhr.responseJSON && xhr.responseJSON.msg) return xhr.responseJSON.msg;
      if (xhr && xhr.responseText) return xhr.responseText;
      var parts = [];
      if (xhr && xhr.status) parts.push('HTTP ' + xhr.status);
      if (xhr && xhr.statusText) parts.push(xhr.statusText);
      if (textStatus) parts.push(textStatus);
      if (errorThrown) parts.push(errorThrown);
      return parts.join(' · ') || 'Request failed without response body';
    }
    function renderJuniperSettings(d) {
      $('#juniperDeviceName').val(d.name || 'default');
      $('#juniperHost').val(d.host || '');
      $('#juniperPort').val(d.port || 22);
      $('#juniperUsername').val(d.username || '');
      $('#juniperPassword').val('');
      $('#juniperTimeout').val(d.connect_timeout_secs || 10);
      $('#juniperStrictHostKey').prop('checked', !!d.strict_host_key_checking);
      $('#juniperClearPassword').prop('checked', false);
      logger.debug('Juniper 連線設定已載入', (d.host || '') + ':' + (d.port || ''));
    }
    function detectJuniperApi(done) {
      if (juniperBase) { if (done) done(); return; }
      var candidates = juniperBaseCandidates.slice();
      var errors = [];
      function tryNext() {
        if (!candidates.length) {
          var msg = 'Juniper API route not found. Tried: ' + juniperBaseCandidates.join(', ') + (errors.length ? '\n' + errors.join('\n') : '');
          $('#juniperInfoBody').html('<div class="text-danger p-2">' + escHtml(msg) + '</div>');
          logger.error('Juniper API route not found', msg);
          return;
        }
        var base = candidates.shift();
        $.ajax({ url: juniperCandidateUrl(base, '/settings'), dataType: 'json', method: 'GET' })
          .done(function (res) {
            juniperBase = base;
            logger.debug('Juniper API base selected', base);
            if (res.code === 0) renderJuniperSettings(res.data || {});
            if (done) done(res);
          })
          .fail(function (xhr, textStatus, errorThrown) {
            errors.push(base + ' -> ' + juniperAjaxError(xhr, textStatus, errorThrown));
            tryNext();
          });
      }
      tryNext();
    }
    function confirmJuniperCommands(title, commands, cb) {
      var lang = i18n[currentLang];
      layer.open({
        title: title || (lang.juniperCommandPreview || 'Command Preview'),
        content:
          '<div class="mb-2 text-muted" style="font-size:.8125rem">' + escHtml(lang.juniperConfirmApply || 'Apply these JunOS commands?') + '</div>' +
          '<pre class="juniper-preview">' + escHtml(juniperPreview(commands)) + '</pre>',
        area: ['720px', 'auto'],
        btn: [lang.confirm, lang.cancel],
        btn1: function () { _hideModal(); cb && cb(); },
        btn2: function () { _hideModal(); }
      });
    }
    function loadJuniperInfo() {
      var lang = i18n[currentLang];
      $('#juniperInfoBody').html('<div class="text-muted p-2">Loading...</div>');
      detectJuniperApi(function () {
      $.get(juniperUrl('/info'), function (res) {
        if (res.code !== 0) { $('#juniperInfoBody').html('<div class="text-danger p-2">' + escHtml(res.msg) + '</div>'); logger.warn('Juniper 設備資訊載入失敗', res.msg); return; }
        var d = res.data || {};
        var dot = d.connected ? 'juniper-status-up' : 'juniper-status-down';
        var text = d.connected ? (lang.juniperConnected || 'Connected') : (lang.juniperDisconnected || 'Disconnected');
        $('#juniperInfoBody').html(
          '<div class="row">' +
            '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + lang.juniperHostname + '</div><div class="sys-card-val">' + escHtml(d.hostname || 'N/A') + '</div></div>' +
            '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + lang.juniperModel + '</div><div class="sys-card-val" style="font-size:1rem">' + escHtml(d.model || 'N/A') + '</div></div>' +
            '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + lang.juniperVersion + '</div><div class="sys-card-val" style="font-size:1rem">' + escHtml(d.junos_version || 'N/A') + '</div></div>' +
            '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + lang.juniperMgmtIp + '</div><div class="sys-card-val" style="font-size:1rem">' + escHtml(d.management_ip || 'N/A') + '</div></div>' +
            '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + lang.juniperUptime + '</div><div class="sys-card-val" style="font-size:1rem">' + escHtml(d.uptime || 'N/A') + '</div></div>' +
            '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + lang.juniperSerial + '</div><div class="sys-card-val" style="font-size:1rem">' + escHtml(d.serial_number || 'N/A') + '</div></div>' +
            '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">Status</div><div class="sys-card-val" style="font-size:1rem"><span class="juniper-status-dot ' + dot + '"></span>' + escHtml(text) + '</div></div>' +
          '</div>'
        );
        logger.debug('Juniper 設備資訊已載入', d.management_ip || '');
      }, 'json').fail(function (xhr, textStatus, errorThrown) {
        var msg = juniperAjaxError(xhr, textStatus, errorThrown);
        $('#juniperInfoBody').html('<div class="text-danger p-2">' + escHtml(msg) + '</div>');
        logger.warn('Juniper 設備資訊載入失敗', msg);
      });
      });
    }
    function loadJuniperSettings() {
      detectJuniperApi(function (preloaded) {
      if (preloaded && preloaded.code === 0) return;
      $.get(juniperUrl('/settings'), function (res) {
        if (res.code !== 0) { showJuniperError(res.msg); return; }
        renderJuniperSettings(res.data || {});
      }, 'json').fail(function (xhr, textStatus, errorThrown) { showJuniperError(juniperAjaxError(xhr, textStatus, errorThrown)); });
      });
    }
    function loadJuniperVlans() {
      var lang = i18n[currentLang];
      $('#juniperVlanBody').html('<div class="text-muted p-2">Loading...</div>');
      detectJuniperApi(function () {
      $.get(juniperUrl('/vlans'), function (res) {
        if (res.code !== 0) { $('#juniperVlanBody').html('<div class="text-danger p-2">' + escHtml(res.msg) + '</div>'); logger.warn('Juniper VLAN 載入失敗', res.msg); return; }
        var rows = res.data || [];
        juniperVlanNames = rows.map(function (v) { return v.name; });
        renderJuniperBulkVlanOptions();
        if (!rows.length) { $('#juniperVlanBody').html('<div class="text-muted p-2">' + (lang.dashNoData || 'No data') + '</div>'); return; }
        var html = '<div class="table-responsive"><table class="table table-sm table-hover juniper-table mb-0"><thead><tr>' +
          '<th>' + lang.juniperVlanName + '</th><th>' + lang.juniperVlanId + '</th><th>' + lang.juniperInterfaces + '</th><th style="width:90px">' + lang.juniperAction + '</th></tr></thead><tbody>';
        rows.forEach(function (v) {
          html += '<tr><td><strong>' + escHtml(v.name) + '</strong></td><td><code>' + escHtml(v.vlan_id) + '</code></td><td>' + renderJuniperChips(v.interfaces) + '</td>' +
            '<td><button class="btn btn-sm btn-outline-danger juniper-delete-vlan" data-name="' + escHtml(v.name) + '"><i class="bx bx-trash"></i></button></td></tr>';
        });
        html += '</tbody></table></div>';
        $('#juniperVlanBody').html(html);
        logger.debug('Juniper VLAN 已載入', rows.length + ' VLANs');
      }, 'json').fail(function (xhr, textStatus, errorThrown) {
        var msg = juniperAjaxError(xhr, textStatus, errorThrown);
        $('#juniperVlanBody').html('<div class="text-danger p-2">' + escHtml(msg) + '</div>');
        logger.warn('Juniper VLAN 載入失敗', msg);
      });
      });
    }
    function loadJuniperPorts() {
      var lang = i18n[currentLang];
      $('#juniperPortBody').html('<div class="text-muted p-2">Loading...</div>');
      detectJuniperApi(function () {
      $.get(juniperUrl('/ports'), function (res) {
        if (res.code !== 0) { $('#juniperPortBody').html('<div class="text-danger p-2">' + escHtml(res.msg) + '</div>'); logger.warn('Juniper Port 載入失敗', res.msg); return; }
        var rows = res.data || [];
        juniperPortRows = rows;
        var existingPorts = {};
        rows.forEach(function (p) { existingPorts[p.port] = true; });
        Object.keys(juniperSelectedPorts).forEach(function (port) {
          if (!existingPorts[port]) delete juniperSelectedPorts[port];
        });
        renderJuniperPortMap(rows);
        if (!rows.length) { $('#juniperPortBody').html('<div class="text-muted p-2">' + (lang.dashNoData || 'No data') + '</div>'); return; }
        var html = '<div class="table-responsive"><table class="table table-sm table-hover juniper-table mb-0"><thead><tr>' +
          '<th style="width:32px"></th><th>Port</th><th>' + lang.juniperAdmin + '</th><th>' + lang.juniperLink + '</th><th>' + lang.juniperMode + '</th><th>' + lang.juniperMembers + '</th><th style="width:210px">' + lang.juniperAction + '</th></tr></thead><tbody>';
        rows.forEach(function (p) {
          var linkCls = p.link_status === 'up' ? 'text-success' : 'text-muted';
          var linkLabel = p.link_status === 'up' ? (lang.juniperLinkInUse || 'In Use') : (lang.juniperLinkUnused || 'Unused');
          var enabled = p.enabled !== false;
          var enabledLabel = enabled ? (lang.juniperEnabled || 'Enabled') : (lang.juniperDisabled || 'Disabled');
          html += '<tr><td><input class="form-check-input juniper-port-select" type="checkbox" data-port="' + escHtml(p.port) + '"' + (juniperSelectedPorts[p.port] ? ' checked' : '') + '></td><td><code>' + escHtml(p.port) + '</code></td><td>' +
            '<div class="form-check form-switch juniper-port-switch">' +
              '<input class="form-check-input juniper-port-enabled" type="checkbox" role="switch" data-port="' + escHtml(p.port) + '"' + (enabled ? ' checked' : '') + '>' +
              '<span class="form-check-label">' + escHtml(enabledLabel) + '</span>' +
            '</div></td><td class="' + linkCls + '">' + escHtml(linkLabel) + '</td>' +
            '<td><span class="badge bg-label-' + (p.mode === 'trunk' ? 'primary' : p.mode === 'access' ? 'success' : 'secondary') + '">' + escHtml(p.mode) + '</span></td>' +
            '<td>' + renderJuniperChips(p.vlan_members) + '</td><td>' +
            '<button class="btn btn-sm btn-outline-primary me-1 juniper-set-access" data-port="' + escHtml(p.port) + '"><i class="bx bx-link me-1"></i>Access</button>' +
            '<button class="btn btn-sm btn-outline-info juniper-set-trunk" data-port="' + escHtml(p.port) + '"><i class="bx bx-git-merge me-1"></i>Trunk</button>' +
            '</td></tr>';
        });
        html += '</tbody></table></div>';
        $('#juniperPortBody').html(html);
        updateJuniperPortSelection();
        logger.debug('Juniper Port 已載入', rows.length + ' ports');
      }, 'json').fail(function (xhr, textStatus, errorThrown) {
        var msg = juniperAjaxError(xhr, textStatus, errorThrown);
        $('#juniperPortBody').html('<div class="text-danger p-2">' + escHtml(msg) + '</div>');
        logger.warn('Juniper Port 載入失敗', msg);
      });
      });
    }
    function loadJuniperAll() {
      loadJuniperSettings();
      loadJuniperInfo();
    }
    function applyJuniperPost(path, data, done) {
      detectJuniperApi(function () {
      $.post(juniperUrl(path), data, function (res) {
        if (res.code !== 0) { showJuniperError(res.msg); return; }
        var lang = i18n[currentLang];
        layer.open({
          title: lang.juniperApplied || 'Juniper setting applied',
          content: '<pre class="modal-pre">' + escHtml((res.data && res.data.output) || '') + '</pre>',
          btn: [lang.btnOk || 'OK']
        });
        done && done(res);
      }, 'json').fail(function (xhr, textStatus, errorThrown) { showJuniperError(juniperAjaxError(xhr, textStatus, errorThrown)); });
      });
    }
    function vlanOptionsHtml(selected) {
      var opts = juniperVlanNames.map(function (name) {
        return '<option value="' + escHtml(name) + '"' + (name === selected ? ' selected' : '') + '>' + escHtml(name) + '</option>';
      }).join('');
      return opts || '<option value="">-</option>';
    }
    function juniperBulkCommands(ports, mode, vlans, enabled) {
      var commands = ['configure'];
      var members = vlans.join(' ');
      ports.forEach(function (port) {
        commands.push('delete interfaces ' + port + ' unit 0 family ethernet-switching vlan members');
        if (mode === 'access') {
          commands.push('delete interfaces ' + port + ' unit 0 family ethernet-switching port-mode');
          commands.push('set interfaces ' + port + ' unit 0 family ethernet-switching vlan members ' + vlans[0]);
        } else {
          commands.push('set interfaces ' + port + ' unit 0 family ethernet-switching port-mode trunk');
          commands.push('set interfaces ' + port + ' unit 0 family ethernet-switching vlan members [ ' + members + ' ]');
        }
        if (enabled === '1') commands.push('delete interfaces ' + port + ' disable');
        if (enabled === '0') commands.push('set interfaces ' + port + ' disable');
      });
      commands.push('commit and-quit');
      return commands;
    }
    $(document).on('click', '#juniperInfoRefresh', loadJuniperInfo);
    $(document).on('click', '#juniperSettingsSaveBtn', function () {
      var lang = i18n[currentLang];
      var data = {
        name: $('#juniperDeviceName').val().trim(),
        host: $('#juniperHost').val().trim(),
        port: $('#juniperPort').val(),
        username: $('#juniperUsername').val().trim(),
        password: $('#juniperPassword').val(),
        clear_password: $('#juniperClearPassword').is(':checked') ? '1' : '0',
        connect_timeout_secs: $('#juniperTimeout').val(),
        strict_host_key_checking: $('#juniperStrictHostKey').is(':checked') ? '1' : '0'
      };
      logger.info('Juniper 儲存連線設定', data.host + ':' + data.port);
      detectJuniperApi(function () {
      $.post(juniperUrl('/settings'), data, function (res) {
        if (res.code !== 0) { showJuniperError(res.msg); return; }
        layer.msg(lang.juniperSettingsSaved || 'Juniper connection settings saved', { icon: 1 });
        $('#juniperPassword').val('');
        $('#juniperClearPassword').prop('checked', false);
        loadJuniperAll();
      }, 'json').fail(function (xhr, textStatus, errorThrown) { showJuniperError(juniperAjaxError(xhr, textStatus, errorThrown)); });
      });
    });
    $(document).on('click', '#juniperVlanRefresh', loadJuniperVlans);
    $(document).on('click', '#juniperPortRefresh', loadJuniperPorts);
    $(document).on('click', '.juniper-port-tile', function () {
      var port = $(this).data('port');
      juniperSelectedPorts[port] = !juniperSelectedPorts[port];
      updateJuniperPortSelection();
    });
    $(document).on('click', '.juniper-port-select', function (e) {
      e.stopPropagation();
    });
    $(document).on('change', '.juniper-port-select', function (e) {
      e.stopPropagation();
      juniperSelectedPorts[$(this).data('port')] = $(this).is(':checked');
      updateJuniperPortSelection();
    });
    $(document).on('click', '#juniperPortSelectAll', function () {
      juniperPortRows.forEach(function (p) { juniperSelectedPorts[p.port] = true; });
      updateJuniperPortSelection();
    });
    $(document).on('click', '#juniperPortClearSelection', function () {
      juniperSelectedPorts = {};
      updateJuniperPortSelection();
    });
    $(document).on('change', '#juniperBulkMode', updateJuniperBulkVlanMode);
    $(document).on('click', '#juniperBulkApply', function () {
      var lang = i18n[currentLang];
      var ports = selectedJuniperPorts();
      var mode = $('#juniperBulkMode').val();
      var selectedVlans = $('#juniperBulkVlans').val();
      var vlans = Array.isArray(selectedVlans) ? selectedVlans : selectedVlans ? [selectedVlans] : [];
      var enabled = $('#juniperBulkEnabled').val();
      if (!ports.length) { layer.msg(lang.juniperNoPortSelected || 'Select at least one port', { icon: 2 }); return; }
      if (!vlans.length) { layer.msg(lang.juniperMembers || 'VLAN Members', { icon: 2 }); return; }
      if (mode === 'access' && vlans.length !== 1) { layer.msg(lang.juniperAccessOneVlan || 'Access mode requires exactly one VLAN', { icon: 2 }); return; }
      var commands = juniperBulkCommands(ports, mode, vlans, enabled);
      confirmJuniperCommands(lang.juniperBulkTitle || 'Bulk Port Configuration', commands, function () {
        logger.info('Juniper 批次設定 Port', ports.join(', '));
        applyJuniperPost('/ports/bulk-config', {
          ports: ports.join(','),
          mode: mode,
          vlan_names: vlans.join(' '),
          enabled: enabled
        }, function () {
          loadJuniperVlans();
          loadJuniperPorts();
        });
      });
    });
    $(document).on('shown.bs.tab', '#juniperTabs .nav-link', function () {
      var target = $(this).attr('data-bs-target');
      if (target === '#juniperInfoPane') { loadJuniperSettings(); loadJuniperInfo(); }
      if (target === '#juniperVlanPane') loadJuniperVlans();
      if (target === '#juniperPortPane') { loadJuniperVlans(); loadJuniperPorts(); }
    });
    $(document).on('click', '#juniperVlanCreateBtn', function () {
      var lang = i18n[currentLang];
      var name = $('#juniperVlanName').val().trim();
      var id = $('#juniperVlanId').val().trim();
      var commands = ['configure', 'set vlans ' + name + ' vlan-id ' + id, 'commit and-quit'];
      confirmJuniperCommands(lang.juniperCreateVlan, commands, function () {
        logger.info('Juniper 新增 VLAN', name + ' id=' + id);
        applyJuniperPost('/vlans', { name: name, vlan_id: id }, function () {
          $('#juniperVlanName,#juniperVlanId').val('');
          loadJuniperVlans();
          loadJuniperPorts();
        });
      });
    });
    $(document).on('click', '.juniper-delete-vlan', function () {
      var lang = i18n[currentLang];
      var name = $(this).data('name');
      var commands = ['configure', 'delete vlans ' + name, 'commit and-quit'];
      confirmJuniperCommands((lang.delete || 'Delete') + ' ' + name, commands, function () {
        logger.info('Juniper 刪除 VLAN', name);
        $.ajax({ url: juniperUrl('/vlans/') + encodeURIComponent(name), type: 'DELETE', dataType: 'json' })
          .done(function (res) {
            if (res.code !== 0) { showJuniperError(res.msg); return; }
            layer.msg(lang.juniperDeleted || 'VLAN deleted', { icon: 1 });
            loadJuniperVlans();
            loadJuniperPorts();
          })
          .fail(function (xhr, textStatus, errorThrown) { showJuniperError(juniperAjaxError(xhr, textStatus, errorThrown)); });
      });
    });
    $(document).on('click', '.juniper-set-access', function () {
      var lang = i18n[currentLang];
      var port = $(this).data('port');
      layer.open({
        title: (lang.juniperSetAccess || 'Set Access VLAN') + ' · ' + port,
        content: '<div class="juniper-form"><label class="form-label">' + lang.juniperVlanName + '</label><select class="form-select font-monospace" id="juniperAccessVlanSelect">' + vlanOptionsHtml('') + '</select></div>',
        area: ['520px', 'auto'],
        btn: [lang.confirm, lang.cancel],
        btn1: function () {
          var vlan = $('#juniperAccessVlanSelect').val();
          var commands = [
            'configure',
            'delete interfaces ' + port + ' unit 0 family ethernet-switching vlan members',
            'delete interfaces ' + port + ' unit 0 family ethernet-switching port-mode',
            'set interfaces ' + port + ' unit 0 family ethernet-switching vlan members ' + vlan,
            'commit and-quit'
          ];
          _hideModal();
          confirmJuniperCommands(lang.juniperSetAccess + ' · ' + port, commands, function () {
            logger.info('Juniper 設定 Access VLAN', port + ' → ' + vlan);
            applyJuniperPost('/ports/' + juniperPortPath(port) + '/access-vlan', { vlan_name: vlan }, function () { loadJuniperPorts(); });
          });
        },
        btn2: function () { _hideModal(); }
      });
    });
    $(document).on('click', '.juniper-set-trunk', function () {
      var lang = i18n[currentLang];
      var port = $(this).data('port');
      layer.open({
        title: (lang.juniperSetTrunk || 'Set Trunk VLAN') + ' · ' + port,
        content:
          '<div class="juniper-form"><label class="form-label">' + lang.juniperMembers + '</label>' +
          '<input type="text" class="form-control font-monospace" id="juniperTrunkVlansInput" placeholder="VLAN10 VLAN20">' +
          '<div class="text-muted mt-1" style="font-size:.75rem">' + renderJuniperChips(juniperVlanNames) + '</div></div>',
        area: ['560px', 'auto'],
        btn: [lang.confirm, lang.cancel],
        btn1: function () {
          var vlans = $('#juniperTrunkVlansInput').val().trim();
          var bracketVlans = vlans.split(/[,\s]+/).filter(Boolean).join(' ');
          var commands = [
            'configure',
            'delete interfaces ' + port + ' unit 0 family ethernet-switching vlan members',
            'set interfaces ' + port + ' unit 0 family ethernet-switching port-mode trunk',
            'set interfaces ' + port + ' unit 0 family ethernet-switching vlan members [ ' + bracketVlans + ' ]',
            'commit and-quit'
          ];
          _hideModal();
          confirmJuniperCommands(lang.juniperSetTrunk + ' · ' + port, commands, function () {
            logger.info('Juniper 設定 Trunk VLAN', port + ' → ' + bracketVlans);
            applyJuniperPost('/ports/' + juniperPortPath(port) + '/trunk-vlan', { vlan_names: vlans }, function () { loadJuniperPorts(); });
          });
        },
        btn2: function () { _hideModal(); }
      });
    });
    $(document).on('change', '.juniper-port-enabled', function () {
      var lang = i18n[currentLang];
      var input = $(this);
      var port = input.data('port');
      var enabled = input.is(':checked');
      var title = enabled ? (lang.juniperEnablePort || 'Enable Port') : (lang.juniperDisablePort || 'Disable Port');
      var command = enabled ? 'delete interfaces ' + port + ' disable' : 'set interfaces ' + port + ' disable';
      var commands = ['configure', command, 'commit and-quit'];
      // Keep the displayed state authoritative until JunOS confirms the commit.
      input.prop('checked', !enabled);
      confirmJuniperCommands(title + ' · ' + port, commands, function () {
        logger.info('Juniper ' + title, port);
        applyJuniperPost('/ports/' + juniperPortPath(port) + '/enabled', { enabled: enabled ? '1' : '0' }, function () {
          loadJuniperPorts();
        });
      });
    });
    // ─── HAProxy ───
    var haproxyBase = null;
    var haproxyBaseCandidates = ['/haproxy', '/api/haproxy', 'haproxy', 'api/haproxy'];
    function haproxyUrl(path) { return haproxyBase + path; }
    function detectHaproxyApi(done) {
      if (haproxyBase) { if (done) done(); return; }
      var candidates = haproxyBaseCandidates.slice();
      var errors = [];
      function tryNext() {
        if (!candidates.length) {
          var msg = 'HAProxy API route not found. Tried: ' + haproxyBaseCandidates.join(', ') + (errors.length ? '\n' + errors.join('\n') : '');
          $('#haproxyStatusBody').html('<div class="text-danger p-2">' + escHtml(msg) + '</div>');
          logger.error('HAProxy API route not found', msg);
          return;
        }
        var base = candidates.shift();
        $.ajax({ url: base + '/status', dataType: 'json', method: 'GET' })
          .done(function () { haproxyBase = base; if (done) done(); })
          .fail(function (xhr, textStatus, errorThrown) {
            errors.push(base + ' -> ' + juniperAjaxError(xhr, textStatus, errorThrown));
            tryNext();
          });
      }
      tryNext();
    }
    function haproxyServerRow(prefix, data) {
      data = data || {};
      var name = data.name || '';
      var ip = data.ip || '';
      var port = data.port || '';
      var health = data.health_check !== false;
      var healthClass = health ? '' : ' is-off';
      var healthText = health ? '啟用' : '停用';
      return '<tr>' +
        '<td><input class="form-control form-control-sm font-monospace haproxy-server-name" value="' + escHtml(name) + '"></td>' +
        '<td><input class="form-control form-control-sm font-monospace haproxy-server-ip" value="' + escHtml(ip) + '"></td>' +
        '<td><input type="number" class="form-control form-control-sm font-monospace haproxy-server-port" min="1" max="65535" value="' + escHtml(port) + '"></td>' +
        '<td><label class="form-check form-switch haproxy-status-switch' + healthClass + '"><input class="form-check-input haproxy-server-health-toggle" type="checkbox" data-enabled="' + (health ? '1' : '0') + '"' + (health ? ' checked' : '') + '><span class="form-check-label">' + healthText + '</span></label></td>' +
        '<td><div class="btn-group btn-group-sm"><button type="button" class="btn btn-outline-primary haproxy-test-backend" data-kind="' + escHtml(prefix || 'web') + '"><i class="bx bx-plug me-1"></i>測試</button><button type="button" class="btn btn-outline-danger haproxy-remove-server"><i class="bx bx-trash me-1"></i>刪除</button></div></td>' +
      '</tr>';
    }
    function ensureHaproxyDefaults() {
      if (!$('#haproxyWebServers tbody tr').length) {
        $('#haproxyWebServers tbody')
          .append(haproxyServerRow('web', { name: 'web1', ip: '192.168.1.10', port: 80 }))
          .append(haproxyServerRow('web', { name: 'web2', ip: '192.168.1.11', port: 80 }));
      }
      if (!$('#haproxySqlServers tbody tr').length) {
        $('#haproxySqlServers tbody')
          .append(haproxyServerRow('sql', { name: 'sql_node1', ip: '10.0.0.10', port: 1433 }))
          .append(haproxyServerRow('sql', { name: 'sql_node2', ip: '10.0.0.11', port: 1433 }));
      }
    }
    function collectHaproxyServers(table) {
      var servers = [];
      $(table).find('tbody tr').each(function () {
        var row = $(this);
        servers.push({
          name: row.find('.haproxy-server-name').val().trim(),
          ip: row.find('.haproxy-server-ip').val().trim(),
          port: Number(row.find('.haproxy-server-port').val()),
          health_check: row.find('.haproxy-server-health-toggle').is(':checked')
        });
      });
      return servers;
    }
    function haproxyFormData(kind) {
      if (kind === 'web') {
        return {
          name: $('#haproxyWebName').val().trim(),
          bind_port: $('#haproxyWebPort').val(),
          balance_method: $('#haproxyWebBalance').val(),
          health_check_path: $('#haproxyWebHealthPath').val().trim(),
          servers: JSON.stringify(collectHaproxyServers('#haproxyWebServers'))
        };
      }
      return {
        name: $('#haproxySqlName').val().trim(),
        bind_port: $('#haproxySqlPort').val(),
        balance_method: $('#haproxySqlBalance').val(),
        health_check: $('#haproxySqlHealth').is(':checked') ? '1' : '0',
        servers: JSON.stringify(collectHaproxyServers('#haproxySqlServers'))
      };
    }
    function loadHaproxyStatus() {
      var lang = i18n[currentLang];
      $('#haproxyStatusBody').html('<div class="text-muted p-2">Loading...</div>');
      detectHaproxyApi(function () {
        $.get(haproxyUrl('/status'), function (res) {
          if (res.code !== 0) { $('#haproxyStatusBody').html('<div class="text-danger p-2">' + escHtml(res.msg) + '</div>'); return; }
          var d = res.data || {};
          var installed = d.installed ? 'Yes' : 'No';
          var valid = d.config_valid ? 'OK' : 'Failed';
          var refreshedAt = new Date().toLocaleString();
          $('#haproxyStatusBody').html(
            '<div class="row">' +
              '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + (lang.haproxyInstalled || 'Installed') + '</div><div class="haproxy-status-value">' + escHtml(installed) + '</div></div>' +
              '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + (lang.haproxyService || 'Service Status') + '</div><div class="haproxy-status-value">' + escHtml(d.service_status || 'unknown') + '</div></div>' +
              '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + (lang.haproxyConfigValid || 'Config Valid') + '</div><div class="haproxy-status-value">' + escHtml(valid) + '</div></div>' +
              '<div class="col-md-3 col-6 mb-3"><div class="sys-card-label">' + (lang.haproxyConfigPath || 'Config Path') + '</div><div class="haproxy-status-value" style="font-size:.875rem">' + escHtml(d.config_path || '') + '</div></div>' +
              '<div class="col-12 mb-2"><div class="sys-card-label">' + (lang.haproxyVersion || 'Version') + '</div><pre class="modal-pre mb-0">' + escHtml(d.version || '') + '</pre></div>' +
              '<div class="col-12"><div class="sys-card-label">Validation</div><pre class="modal-pre mb-0">' + escHtml(d.validation_output || '') + '</pre></div>' +
              '<div class="col-12 mt-2 text-end text-muted" style="font-size:.75rem">Updated: ' + escHtml(refreshedAt) + '</div>' +
            '</div>'
          );
          logger.debug('HAProxy 狀態已載入', d.service_status || '');
        }, 'json').fail(function (xhr, textStatus, errorThrown) {
          $('#haproxyStatusBody').html('<div class="text-danger p-2">' + escHtml(juniperAjaxError(xhr, textStatus, errorThrown)) + '</div>');
        });
      });
    }
    function refreshHaproxyPage(button) {
      var btn = button ? $(button) : $();
      var original = btn.html();
      if (btn.length) btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>重新整理');
      logger.info('重新整理 HAProxy 狀態頁');
      loadHaproxyStatus();
      loadHaproxySaved();
      setTimeout(function () {
        if (btn.length) btn.prop('disabled', false).html(original);
      }, 900);
    }
    function loadHaproxySaved() {
      detectHaproxyApi(function () {
        $.get(haproxyUrl('/lbs'), function (res) {
          if (res.code !== 0) { $('#haproxySavedBody').html('<div class="text-danger">' + escHtml(res.msg) + '</div>'); return; }
          var items = res.data || [];
          if (!items.length) {
            $('#haproxySavedBody').html('<div class="text-muted">尚未儲存 HAProxy 負載平衡設定</div>');
            return;
          }
          var rows = items.map(function (item) {
            var servers = (item.servers || []).map(function (server) {
              var serverEnabled = server.health_check !== false;
              var serverStatusText = serverEnabled ? '啟用' : '停用';
              var serverStatusClass = serverEnabled ? '' : ' is-off';
              return '<div class="haproxy-saved-server">' +
                '<span class="haproxy-saved-server-main">' + escHtml(server.name || '') + ' ' + escHtml(server.ip || '') + ':' + escHtml(server.port || '') + '</span>' +
                '<label class="form-check form-switch haproxy-status-switch is-static' + serverStatusClass + '">' +
                  '<input type="checkbox" class="form-check-input" tabindex="-1"' + (serverEnabled ? ' checked' : '') + '>' +
                  '<span class="form-check-label">' + serverStatusText + '</span>' +
                '</label>' +
              '</div>';
            }).join('');
            var enabled = item.enabled !== false;
            var statusText = enabled ? '啟用' : '停用';
            var statusClass = enabled ? '' : ' is-off';
            return '<tr>' +
              '<td><span class="badge bg-label-primary">' + escHtml(item.lb_type || '') + '</span></td>' +
              '<td class="font-monospace">' + escHtml(item.name || '') + '</td>' +
              '<td class="font-monospace">' + escHtml(item.bind_port || '') + '</td>' +
              '<td class="font-monospace">' + escHtml(item.balance_method || '') + '</td>' +
              '<td><label class="form-check form-switch haproxy-status-switch' + statusClass + '"><input type="checkbox" class="form-check-input haproxy-toggle-lb" data-id="' + escHtml(item.id) + '" data-enabled="' + (enabled ? '1' : '0') + '"' + (enabled ? ' checked' : '') + '><span class="form-check-label">' + statusText + '</span></label></td>' +
              '<td class="font-monospace">' + servers + '</td>' +
              '<td><button type="button" class="btn btn-sm btn-outline-danger haproxy-delete-lb" data-id="' + escHtml(item.id) + '"><i class="bx bx-trash me-1"></i>刪除</button></td>' +
            '</tr>';
          }).join('');
          $('#haproxySavedBody').html(
            '<div class="table-responsive"><table class="table table-sm mb-0">' +
            '<thead><tr><th>Type</th><th>Name</th><th>Port</th><th>Balance</th><th>LB Status</th><th>Backend Servers</th><th></th></tr></thead>' +
            '<tbody>' + rows + '</tbody></table></div>'
          );
        }, 'json').fail(function (xhr, textStatus, errorThrown) {
          $('#haproxySavedBody').html('<div class="text-danger">' + escHtml(juniperAjaxError(xhr, textStatus, errorThrown)) + '</div>');
        });
      });
    }
    function haproxyPost(path, data, done) {
      detectHaproxyApi(function () {
        $.post(haproxyUrl(path), data, function (res) {
          if (res.code !== 0) { showHaproxyError(res.msg); return; }
          if (done) done(res);
        }, 'json').fail(function (xhr, textStatus, errorThrown) { showHaproxyError(juniperAjaxError(xhr, textStatus, errorThrown)); });
      });
    }
    function showHaproxyToast(enabled, detail) {
      var idx = ++toastIdx;
      var title = enabled ? 'HAProxy 負載平衡已啟用' : 'HAProxy 負載平衡已停用';
      var message = enabled ? '設定已寫入並重新載入 HAProxy。' : '設定已保留在資料庫，但不再產生到 HAProxy config。';
      var icon = enabled ? 'bx-check-circle' : 'bx-pause-circle';
      var disabledClass = enabled ? '' : ' is-disabled';
      var html = '<div id="haproxyToast' + idx + '" class="toast haproxy-toast' + disabledClass + '" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="6500">' +
        '<div class="toast-body d-flex gap-3">' +
          '<div class="haproxy-toast-icon"><i class="bx ' + icon + '"></i></div>' +
          '<div class="flex-grow-1">' +
            '<div class="haproxy-toast-title">' + escHtml(title) + '</div>' +
            '<div class="haproxy-toast-message">' + escHtml(message) + '</div>' +
            '<div class="haproxy-toast-detail">' + escHtml(detail || '') + '</div>' +
          '</div>' +
          '<button type="button" class="btn-close ms-1" data-bs-dismiss="toast" aria-label="Close"></button>' +
        '</div>' +
      '</div>';
      $('#toastContainer').append(html);
      var el = document.getElementById('haproxyToast' + idx);
      var toast = new bootstrap.Toast(el);
      toast.show();
      setTimeout(function () { $('#haproxyToast' + idx).remove(); }, 7200);
    }
    function generateHaproxy(kind) {
      var data;
      if (kind === 'web') {
        data = haproxyFormData('web');
        haproxyPost('/web', data, function (res) {
          $('#haproxyWebPreview').text((res.data && res.data.config) || '');
        });
      } else {
        data = haproxyFormData('sql');
        haproxyPost('/sql', data, function (res) {
          $('#haproxySqlPreview').text((res.data && res.data.config) || '');
        });
      }
    }
    function applyHaproxyConfig(kind, config) {
      var lang = i18n[currentLang];
      if (!config.trim()) { layer.msg(lang.haproxyGenerate || 'Generate Preview', { icon: 2 }); return; }
      layer.open({
        title: lang.haproxyApply || 'Validate & Apply',
        content: '<div class="mb-2 text-muted" style="font-size:.8125rem">' + escHtml(lang.haproxyConfirmApply || 'Write config and reload HAProxy?') + '</div><pre class="haproxy-preview">' + escHtml(config) + '</pre>',
        area: ['760px', '80vh'],
        btn: [lang.confirm, lang.cancel],
        btn1: function () {
          _hideModal();
          var data = haproxyFormData(kind);
          data.apply = '1';
          haproxyPost(kind === 'web' ? '/web' : '/sql', data, function (res) {
            layer.open({
              title: lang.haproxyApplied || 'HAProxy config applied',
              content: '<pre class="modal-pre">' + escHtml(JSON.stringify(res.data || {}, null, 2)) + '</pre>',
              btn: [lang.btnOk || 'OK']
            });
            loadHaproxyStatus();
            loadHaproxySaved();
          });
        },
        btn2: function () { _hideModal(); }
      });
    }
    function validateHaproxyConfig(config) {
      var lang = i18n[currentLang];
      if (!config.trim()) { layer.msg(lang.haproxyGenerate || 'Generate Preview', { icon: 2 }); return; }
      haproxyPost('/config/validate', { config: config }, function (res) {
        layer.open({
          title: lang.haproxyValidate || 'Validate Config',
          content: '<pre class="modal-pre">' + escHtml((res.data || '').toString()) + '</pre>',
          area: ['760px', '60vh'],
          btn: [lang.btnOk || 'OK']
        });
      });
    }
    function renderHaproxyWebTestResult(target, res) {
      var rows = ((res && res.data && res.data.results) || []).map(function (r) {
        return '<tr>' +
          '<td>' + escHtml(r.index) + '</td>' +
          '<td><span class="badge ' + (r.success ? 'bg-label-success' : 'bg-label-danger') + '">' + (r.success ? '成功' : '失敗') + '</span></td>' +
          '<td class="font-monospace">' + escHtml(r.status || '') + '</td>' +
          '<td class="font-monospace">' + escHtml(r.response_time_ms || 0) + ' ms</td>' +
          '<td class="font-monospace text-wrap">' + escHtml(r.body || '') + '</td>' +
          '<td class="text-danger text-wrap">' + escHtml(r.error || '') + '</td>' +
        '</tr>';
      }).join('');
      $(target).html('<table class="table table-sm mb-0"><thead><tr><th>#</th><th>狀態</th><th>HTTP</th><th>耗時</th><th>Response Body</th><th>Error</th></tr></thead><tbody>' + rows + '</tbody></table>');
    }
    function renderHaproxyTcpTestResult(target, res) {
      var rows = ((res && res.data && res.data.results) || []).map(function (r) {
        return '<tr>' +
          '<td>' + escHtml(r.index) + '</td>' +
          '<td><span class="badge ' + (r.connected ? 'bg-label-success' : 'bg-label-danger') + '">' + (r.connected ? 'Online' : 'Offline') + '</span></td>' +
          '<td class="font-monospace">' + escHtml(r.host || '') + '</td>' +
          '<td class="font-monospace">' + escHtml(r.port || '') + '</td>' +
          '<td class="font-monospace">' + escHtml(r.response_time_ms || 0) + ' ms</td>' +
          '<td class="text-danger text-wrap">' + escHtml(r.error || '') + '</td>' +
        '</tr>';
      }).join('');
      $(target).html('<table class="table table-sm mb-0"><thead><tr><th>#</th><th>狀態</th><th>Host</th><th>Port</th><th>耗時</th><th>Error</th></tr></thead><tbody>' + rows + '</tbody></table>');
    }
    function haproxyWebTestHtml(res) {
      var box = $('<div></div>');
      renderHaproxyWebTestResult(box, res);
      return box.html();
    }
    function haproxyTcpTestHtml(res) {
      var box = $('<div></div>');
      renderHaproxyTcpTestResult(box, res);
      return box.html();
    }
    function runHaproxyWebTest(data, target, button, opts) {
      opts = opts || {};
      var btn = button ? $(button) : $();
      var original = btn.html();
      if (btn.length) btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>測試中');
      if (target) $(target).html('<div class="text-muted p-2">Testing...</div>');
      detectHaproxyApi(function () {
        $.ajax({
          url: haproxyUrl('/test/web'),
          method: 'POST',
          contentType: 'application/json',
          dataType: 'json',
          data: JSON.stringify(data)
        }).done(function (res) {
          if (res.code !== 0) { showHaproxyError(res.msg); return; }
          if (opts.modal) {
            layer.open({
              title: opts.title || 'Web Backend 連線測試',
              content: '<div class="table-responsive">' + haproxyWebTestHtml(res) + '</div>',
              area: ['820px', '60vh'],
              btn: ['OK']
            });
          } else {
            renderHaproxyWebTestResult(target, res);
          }
        }).fail(function (xhr, textStatus, errorThrown) {
          showHaproxyError(juniperAjaxError(xhr, textStatus, errorThrown));
        }).always(function () {
          if (btn.length) btn.prop('disabled', false).html(original);
        });
      });
    }
    function runHaproxyTcpTest(data, target, button, opts) {
      opts = opts || {};
      var btn = button ? $(button) : $();
      var original = btn.html();
      if (btn.length) btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>測試中');
      if (target) $(target).html('<div class="text-muted p-2">Testing...</div>');
      detectHaproxyApi(function () {
        $.ajax({
          url: haproxyUrl('/test/sql'),
          method: 'POST',
          contentType: 'application/json',
          dataType: 'json',
          data: JSON.stringify(data)
        }).done(function (res) {
          if (res.code !== 0) { showHaproxyError(res.msg); return; }
          if (opts.modal) {
            layer.open({
              title: opts.title || 'SQL/TCP Backend 連線測試',
              content: '<div class="table-responsive">' + haproxyTcpTestHtml(res) + '</div>',
              area: ['820px', '60vh'],
              btn: ['OK']
            });
          } else {
            renderHaproxyTcpTestResult(target, res);
          }
        }).fail(function (xhr, textStatus, errorThrown) {
          showHaproxyError(juniperAjaxError(xhr, textStatus, errorThrown));
        }).always(function () {
          if (btn.length) btn.prop('disabled', false).html(original);
        });
      });
    }
    $(document).on('click', '#haproxyStatusRefresh', function () { refreshHaproxyPage(this); });
    $(document).on('click', '#haproxySavedRefresh', function () {
      var btn = $(this);
      var original = btn.html();
      btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>重新整理');
      logger.info('重新整理 HAProxy 已儲存設定');
      loadHaproxySaved();
      setTimeout(function () { btn.prop('disabled', false).html(original); }, 900);
    });
    $(document).on('click', '#haproxyReloadBtn', function () {
      haproxyPost('/reload', {}, function (res) {
        layer.alert('<pre class="modal-pre">' + escHtml((res.data && res.data.output) || '') + '</pre>', { title: 'HAProxy' });
        loadHaproxyStatus();
      });
    });
    $(document).on('click', '#haproxyRestartBtn', function () {
      haproxyPost('/restart', {}, function (res) {
        layer.alert('<pre class="modal-pre">' + escHtml((res.data && res.data.output) || '') + '</pre>', { title: 'HAProxy' });
        loadHaproxyStatus();
      });
    });
    $(document).on('click', '#haproxyRunWebTest', function () {
      runHaproxyWebTest({
        url: $('#haproxyTestWebUrl').val().trim(),
        count: Number($('#haproxyTestWebCount').val())
      }, '#haproxyWebTestResult', this);
    });
    $(document).on('click', '#haproxyRunSqlTest', function () {
      runHaproxyTcpTest({
        host: $('#haproxyTestSqlHost').val().trim(),
        port: Number($('#haproxyTestSqlPort').val()),
        count: Number($('#haproxyTestSqlCount').val()),
        timeout: Number($('#haproxyTestSqlTimeout').val())
      }, '#haproxySqlTestResult', this);
    });
    $(document).on('click', '#haproxyWebAddServer', function () {
      $('#haproxyWebServers tbody').append(haproxyServerRow('web', { name: 'web' + ($('#haproxyWebServers tbody tr').length + 1), port: 80 }));
    });
    $(document).on('click', '#haproxySqlAddServer', function () {
      $('#haproxySqlServers tbody').append(haproxyServerRow('sql', { name: 'sql_node' + ($('#haproxySqlServers tbody tr').length + 1), port: 1433 }));
    });
    $(document).on('click', '.haproxy-remove-server', function () { $(this).closest('tr').remove(); });
    $(document).on('click', '.haproxy-test-backend', function () {
      var btn = $(this);
      var row = btn.closest('tr');
      var kind = btn.data('kind');
      var ip = row.find('.haproxy-server-ip').val().trim();
      var port = Number(row.find('.haproxy-server-port').val());
      if (kind === 'web') {
        var path = $('#haproxyWebHealthPath').val().trim() || '/';
        runHaproxyWebTest({ url: 'http://' + ip + ':' + port + path, count: 1 }, null, this, { modal: true, title: 'Web Backend 連線測試 · ' + ip + ':' + port });
      } else {
        runHaproxyTcpTest({ host: ip, port: port, count: 1, timeout: 3 }, null, this, { modal: true, title: 'SQL/TCP Backend 連線測試 · ' + ip + ':' + port });
      }
    });
    $(document).on('click', '#haproxyWebGenerate', function () { generateHaproxy('web'); });
    $(document).on('click', '#haproxySqlGenerate', function () { generateHaproxy('sql'); });
    $(document).on('click', '.haproxy-validate-preview', function () {
      validateHaproxyConfig($($(this).data('target')).text());
    });
    $(document).on('click', '.haproxy-apply-preview', function () {
      applyHaproxyConfig($(this).data('kind'), $($(this).data('target')).text());
    });
    function setHaproxySwitchState(input, enabled) {
      input.attr('data-enabled', enabled ? '1' : '0').prop('checked', enabled);
      var wrapper = input.closest('.haproxy-status-switch');
      wrapper.toggleClass('is-off', !enabled);
      wrapper.find('.form-check-label').text(enabled ? '啟用' : '停用');
    }
    $(document).on('change', '.haproxy-server-health-toggle', function () {
      var input = $(this);
      setHaproxySwitchState(input, input.is(':checked'));
    });
    $(document).on('change', '.haproxy-toggle-lb', function () {
      var toggle = $(this);
      var id = toggle.data('id');
      var enabled = toggle.is(':checked');
      toggle.closest('.haproxy-status-switch').addClass('is-busy');
      logger.info('切換 HAProxy 負載平衡狀態', 'id=' + id + ', enabled=' + enabled);
      detectHaproxyApi(function () {
        $.post(haproxyUrl('/lbs/' + encodeURIComponent(id) + '/enabled'), { enabled: enabled ? '1' : '0' }, function (res) {
          logger.debug('HAProxy 狀態切換 API 回應', JSON.stringify(res));
          if (res.code !== 0) {
            setHaproxySwitchState(toggle, !enabled);
            toggle.closest('.haproxy-status-switch').removeClass('is-busy');
            showHaproxyError(res.msg);
            return;
          }
          loadHaproxySaved();
          loadHaproxyStatus();
          showHaproxyToast(enabled, 'id=' + id + ', reload=success');
        }, 'json').fail(function (xhr, textStatus, errorThrown) {
          setHaproxySwitchState(toggle, !enabled);
          toggle.closest('.haproxy-status-switch').removeClass('is-busy');
          showHaproxyError(juniperAjaxError(xhr, textStatus, errorThrown));
        });
      });
    });
    $(document).on('click', '.haproxy-delete-lb', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var id = $(this).data('id');
      var btn = $(this);
      logger.info('按下 HAProxy 刪除按鈕', 'id=' + id);
      if (!window.confirm('確認刪除這組 HAProxy 負載平衡設定並重新套用？')) return;
      btn.prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>刪除中');
      logger.info('刪除 HAProxy 負載平衡設定', 'id=' + id);
      detectHaproxyApi(function () {
        $.post(haproxyUrl('/lbs/' + encodeURIComponent(id) + '/delete'), {}, function (res) {
          logger.debug('HAProxy 刪除 API 回應', JSON.stringify(res));
          if (res.code !== 0) {
            btn.prop('disabled', false).html('<i class="bx bx-trash me-1"></i>刪除');
            showHaproxyError(res.msg);
            return;
          }
          loadHaproxySaved();
          loadHaproxyStatus();
          layer.msg('已刪除並重新套用 HAProxy 設定', { icon: 1 });
        }, 'json').fail(function (xhr, textStatus, errorThrown) {
          btn.prop('disabled', false).html('<i class="bx bx-trash me-1"></i>刪除');
          showHaproxyError(juniperAjaxError(xhr, textStatus, errorThrown));
        });
      });
    });
    $(document).on('shown.bs.tab', '#haproxyTabs .nav-link', function () {
      if ($(this).attr('data-bs-target') === '#haproxyStatusPane') {
        loadHaproxyStatus();
        loadHaproxySaved();
      }
    });
    // ─── Shell Terminal ───
    let term = null, wsShell = null, termFit = null;
    let lastShellInputAt = 0;
    function focusTerminal() {
      if (!term || !$('#shellView').is(':visible')) return;
      try { term.focus(); } catch (e) {}
      setTimeout(function () { try { term.focus(); } catch (e) {} }, 0);
    }
    function formatShellInputDebug(data) {
      return Array.from(data || '').map(function (ch) {
        const code = ch.charCodeAt(0);
        if (ch === '\r') return '<CR>';
        if (ch === '\n') return '<LF>';
        if (ch === '\t') return '<TAB>';
        if (code === 0x1b) return '<ESC>';
        if (code === 0x7f) return '<BACKSPACE>';
        if (code >= 0x00 && code <= 0x1f) return '<CTRL-0x' + code.toString(16).padStart(2, '0') + '>';
        if (code >= 0x20 && code <= 0x7e) return ch;
        return '<U+' + code.toString(16).toUpperCase().padStart(4, '0') + '>';
      }).join('');
    }
    function sendShellData(data, source) {
      if (data === null || data === undefined || data === '') {
        logger.warn('Shell 前端鍵盤資料為空', (source || 'unknown') + ' data=' + String(data));
        return;
      }
      if (!wsShell || wsShell.readyState !== WebSocket.OPEN) {
        logger.warn('Shell 前端鍵盤未送出：WebSocket 未連線', (source || 'unknown') + ' ' + formatShellInputDebug(data));
        return;
      }
      logger.debug('Shell 前端送出鍵盤', (source || 'unknown') + ' len=' + data.length + ' data=' + formatShellInputDebug(data));
      wsShell.send(new TextEncoder().encode(data));
    }
    function shellKeyToData(e) {
      if (e.defaultPrevented && !$('#shellView').is(':visible')) return '';
      if (e.key === 'Enter') return '\r';
      if (e.key === 'Backspace') return '\x7f';
      if (e.key === 'Tab') return '\t';
      if (e.key === 'Escape') return '\x1b';
      if (e.key === 'ArrowUp') return '\x1b[A';
      if (e.key === 'ArrowDown') return '\x1b[B';
      if (e.key === 'ArrowRight') return '\x1b[C';
      if (e.key === 'ArrowLeft') return '\x1b[D';
      if (e.key === 'Home') return '\x1b[H';
      if (e.key === 'End') return '\x1b[F';
      if (e.key === 'Delete') return '\x1b[3~';
      if (e.key === 'PageUp') return '\x1b[5~';
      if (e.key === 'PageDown') return '\x1b[6~';
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key && e.key.length === 1) {
        const ch = e.key.toUpperCase().charCodeAt(0);
        if (ch >= 64 && ch <= 95) return String.fromCharCode(ch - 64);
      }
      if (!e.ctrlKey && !e.metaKey && e.key && e.key.length === 1) return e.key;
      return '';
    }
    document.addEventListener('keydown', function (e) {
      if (!term || !$('#shellView').is(':visible')) return;
      const active = document.activeElement;
      const activeTag = active && active.tagName ? active.tagName.toLowerCase() : '';
      const inTerminalTextarea = active && active.classList && active.classList.contains('xterm-helper-textarea');
      if ((activeTag === 'input' || activeTag === 'textarea' || (active && active.isContentEditable)) && !inTerminalTextarea) return;
      const data = shellKeyToData(e);
      logger.debug('Shell keydown 捕捉', 'key=' + String(e.key) + ' code=' + String(e.code) + ' ctrl=' + !!e.ctrlKey + ' meta=' + !!e.metaKey + ' alt=' + !!e.altKey + ' active=' + activeTag + ' xtermTextarea=' + !!inTerminalTextarea + ' data=' + formatShellInputDebug(data));
      if (!data) return;
      const eventTime = Date.now();
      setTimeout(function () {
        if (lastShellInputAt < eventTime) sendShellData(data, 'keydown-fallback');
      }, 0);
      if (!inTerminalTextarea) e.preventDefault();
      focusTerminal();
    }, true);
    function connectShell() {
      if (wsShell) { try { wsShell.close(); } catch(e) {} wsShell = null; }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsShell = new WebSocket(proto + '//' + window.location.host + '/shell');
      wsShell.binaryType = 'arraybuffer';
      wsShell.onopen = function () { term.clear(); term.write('\x1b[32mShell connected\x1b[0m\r\n'); focusTerminal(); sendResize(); logger.info('Shell 已連線'); };
      wsShell.onmessage = function (evt) { term.write(new Uint8Array(evt.data)); };
      wsShell.onclose = function () { term.write('\r\n\x1b[31mShell disconnected\x1b[0m\r\n'); wsShell = null; logger.warn('Shell 已斷線'); };
      wsShell.onerror = function () { term.write('\r\n\x1b[31mWebSocket error\x1b[0m\r\n'); logger.error('Shell WebSocket 錯誤'); };
    }
    function initTerminal() {
      if (term) return;
      if (typeof Terminal === 'undefined') { setTimeout(initTerminal, 500); return; }
      term = new Terminal({ cursorBlink: true, cursorStyle: 'block', fontSize: 14, fontFamily: 'Menlo, Monaco, "Courier New", monospace', theme: { background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc' } });
      termFit = new FitAddon.FitAddon();
      term.loadAddon(termFit);
      term.open(document.getElementById('terminal'));
      termFit.fit();
      term.onData(function (data) {
        lastShellInputAt = Date.now();
        sendShellData(data, 'xterm-onData');
      });
      $('#terminal').off('mousedown.shellFocus click.shellFocus').on('mousedown.shellFocus click.shellFocus', focusTerminal);
      focusTerminal();
      connectShell();
    }
    function sendResize() {
      if (!wsShell || wsShell.readyState !== WebSocket.OPEN || !termFit) return;
      const dims = termFit.proposeDimensions();
      if (dims) wsShell.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
    }
    function destroyTerminal() {
      if (wsShell) { try { wsShell.close(); } catch(e) {} wsShell = null; }
      if (term) { term.dispose(); term = null; termFit = null; }
    }
    $(window).on('resize', function () {
      if (termFit && $('#shellView').is(':visible')) { termFit.fit(); sendResize(); }
    });
    // ─── AI Assistant ───
    let wsAI = null;
    let aiRunning = false;
    let aiCurrentText = '';
    let aiCurrentBubble = null;
    let aiAccumBuf = '';
    let prompt = '';
    function setAIStatus(status) {
      const badge = $('#aiStatusBadge');
      const lang = i18n[currentLang];
      badge.removeClass('bg-secondary bg-primary bg-success bg-danger');
      if (status === 'running') {
        badge.text(lang.aiStatusRunning || 'Running').addClass('bg-primary');
      } else if (status === 'done') {
        badge.text(lang.aiStatusDone || 'Done').addClass('bg-success');
      } else if (status === 'error') {
        badge.text(lang.aiStatusError || 'Error').addClass('bg-danger');
      } else {
        badge.text(lang.aiStatusIdle || 'Idle').addClass('bg-secondary');
      }
    }
    function mdToHtml(text) {
      if (typeof marked === 'undefined') {
        return $('<div>').text(text).html();
      }
      try {
        marked.setOptions({ breaks: true, gfm: true });
        const raw = marked.parse(text);
        if (typeof DOMPurify !== 'undefined') {
          return DOMPurify.sanitize(raw);
        }
        return raw;
      } catch (e) {
        return $('<div>').text(text).html();
      }
    }
    function enhanceCodeBlocks(scope) {
      const lang = i18n[currentLang];
      scope.find('pre > code').each(function () {
        const $pre = $(this).parent();
        if ($pre.find('.ai-code-actions').length) return;
        const $bar = $('<div class="ai-code-actions">');
        const $copy = $('<button type="button" class="btn">').html('<i class="bx bx-copy"></i> ' + (lang.aiCopy || 'Copy'));
        $copy.on('click', function () {
          const text = $(this).closest('pre').find('code').text();
          copyText($, text);
          layer.msg(lang.aiCopyOk || 'Copied', { icon: 1 });
        });
        const $exec = $('<button type="button" class="btn">').html('<i class="bx bx-play"></i> ' + (lang.aiExecute || 'Execute'));
        $exec.on('click', function () {
          const text = $(this).closest('pre').find('code').text().trim();
          if (!text) return;
          layer.confirm(lang.aiConfirmExec || 'Confirm to execute?', function () {
            $.post('/exec', { args: text, protocol: 'ipv4' }, function (r) {
              if (r.code === 0) {
                layer.msg(lang.aiExecuted || 'Executed', { icon: 1 });
              } else {
                layer.alert(r.msg);
              }
            }, 'json');
          });
        });
        $bar.append($copy).append($exec);
        $pre.append($bar);
      });
    }
    function appendAIMsg(role, htmlContent) {
      const lang = i18n[currentLang];
      const nameMap = { user: (currentLang === 'zh' ? '你' : currentLang === 'ja' ? 'あなた' : 'You'), ai: 'opencode', system: 'system' };
      const $msg = $('<div class="ai-msg ai-msg-' + role + '">');
      const icon = role === 'user' ? 'bx-user' : role === 'system' ? 'bx-info-circle' : 'bx-bot';
      $msg.append('<div class="ai-msg-avatar"><i class="bx ' + icon + '"></i></div>');
      const $bubble = $('<div class="ai-msg-bubble">');
      $bubble.append('<div class="ai-msg-name">' + (nameMap[role] || role) + '</div>');
      const $content = $('<div class="ai-msg-content">');
      if (typeof htmlContent === 'string') {
        $content.html(htmlContent);
      } else {
        $content.append(htmlContent);
      }
      $bubble.append($content);
      $msg.append($bubble);
      $('#aiChatScroll').append($msg);
      if (role === 'ai') enhanceCodeBlocks($content);
      $('#aiChatScroll').scrollTop($('#aiChatScroll')[0].scrollHeight);
      return $bubble;
    }
    function createStreamingAIMsg() {
      const $bubble = appendAIMsg('ai', '');
      const $content = $bubble.find('.ai-msg-content');
      $content.html('<span class="ai-msg-typing"><span></span><span></span><span></span></span>');
      return $bubble;
    }
    function connectAI() {
      if (wsAI) { try { wsAI.close(); } catch (e) {} wsAI = null; }
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = proto + '//' + window.location.host + '/ai';
      try {
        wsAI = new WebSocket(url);
      } catch (e) {
        appendAIMsg('system', '<span class="text-danger">WebSocket 建立失敗</span>');
        aiRunning = false;
        setAIStatus('error');
        $('#aiSendBtn').prop('disabled', false);
        return;
      }
      wsAI.onopen = function () {
        aiAccumBuf = '';
        aiCurrentText = '';
        aiCurrentBubble = createStreamingAIMsg();
        setAIStatus('running');
        wsAI.send(prompt);
      };
      wsAI.onmessage = function (evt) {
        if (typeof evt.data !== 'string') return;
        if (evt.data.startsWith('OUT:')) {
          aiAccumBuf += evt.data.slice(4) + '\n';
        } else if (evt.data.startsWith('ERR:')) {
          aiAccumBuf += evt.data.slice(4) + '\n';
        } else if (evt.data.startsWith('DONE:')) {
          aiRunning = false;
          setAIStatus('done');
          $('#aiSendBtn').prop('disabled', false);
          // Render accumulated content as markdown
          const $content = aiCurrentBubble.find('.ai-msg-content');
          if (aiAccumBuf.trim()) {
            $content.html(mdToHtml(aiAccumBuf));
            enhanceCodeBlocks($content);
          } else {
            $content.html('<span class="text-muted">（無輸出）</span>');
          }
          $('#aiChatScroll').scrollTop($('#aiChatScroll')[0].scrollHeight);
          wsAI.close();
          wsAI = null;
        } else if (evt.data.startsWith('ERROR:')) {
          aiRunning = false;
          setAIStatus('error');
          const $content = aiCurrentBubble.find('.ai-msg-content');
          $content.html('<span class="text-danger">' + $('<div>').text(evt.data.slice(6)).html() + '</span>');
          $('#aiSendBtn').prop('disabled', false);
          wsAI.close();
          wsAI = null;
        }
      };
      wsAI.onerror = function () {
        aiRunning = false;
        setAIStatus('error');
        if (aiCurrentBubble) {
          const $content = aiCurrentBubble.find('.ai-msg-content');
          $content.html('<span class="text-danger">WebSocket 連線錯誤</span>');
        }
        $('#aiSendBtn').prop('disabled', false);
      };
      wsAI.onclose = function () {
        if (aiRunning) {
          aiRunning = false;
          setAIStatus('idle');
          $('#aiSendBtn').prop('disabled', false);
        }
      };
    }
    function sendAIPrompt() {
      if (aiRunning) return;
      const text = $('#aiInput').val().trim();
      if (!text) return;
      prompt = text;
      $('#aiInput').val('');
      appendAIMsg('user', $('<div>').text(text).html());
      aiRunning = true;
      setAIStatus('running');
      $('#aiSendBtn').prop('disabled', true);
      logger.info('送出 AI prompt', text);
      connectAI();
    }
    function currentCommandBinary() {
      if (currentPlatform === "macos") return "pfctl";
      if (currentPlatform === "windows") return "powershell";
      return currentProtocol === "ipv6" ? "ip6tables" : "iptables";
    }
    function fwDisplayName() {
      if (currentPlatform === "macos") return "pfctl";
      if (currentPlatform === "windows") return "PowerShell";
      return currentCommandBinary();
    }
    function currentTableName() {
      return $(".iptables-table .nav-link.active").attr("id").replace("tab-", "") || "filter";
    }
    function chainCommandPrefix(tableName, chainName, flag) {
      if (currentPlatform !== "linux") return fwDisplayName();
      return fwDisplayName() + " -t " + tableName + " " + flag + " " + chainName;
    }
    function chainExecArgsStr(tableName, chainName, flag, val) {
      if (currentPlatform !== "linux") return val;
      return "-t " + tableName + " " + flag + " " + chainName + " " + val;
    }
    // ─── DbMan ───
    var dbmanCurrentConn = null;
    function rebuildDbManMenu() {
      $.get('/dbman/connections', function (res) {
        if (res.code !== 0) return;
        var conns = res.data || [];
        var html = '';
        conns.forEach(function (c) {
          var icon = c.db_type === 'sqlite' ? 'bx-file' : c.db_type === 'mysql' ? 'bx-data' : 'bx-server';
          html += '<li class="menu-item dbman-menu-conn" data-conn-id="' + c.id + '">' +
            '<a href="#" class="menu-link dbman-menu-conn-link" data-conn-id="' + c.id + '">' +
            '<i class="menu-icon tf-icons bx ' + icon + '"></i>' +
            '<div class="text-truncate">' + escHtml(c.name) + '</div></a></li>';
        });
        $('#menuDbManConnItems').html(html);
      });
    }
    function loadDbManConnections() {
      $.get('/dbman/connections', function (res) {
        if (res.code !== 0) return;
        var conns = res.data || [];
        var html = '';
        conns.forEach(function (c) {
          var icon = c.db_type === 'sqlite' ? 'bx-file' : c.db_type === 'mysql' ? 'bx-data' : 'bx-server';
          html += '<div class="dbman-conn-item p-1 mb-1" data-conn-id="' + c.id + '" data-conn=\'' + JSON.stringify(c).replace(/'/g, '&#39;') + '\' style="cursor:pointer;border-radius:4px;background:var(--bs-tertiary-bg)">' +
            '<div class="d-flex justify-content-between align-items-center px-2 py-1">' +
            '<span style="font-size:.8125rem"><i class="bx ' + icon + ' me-1"></i>' + escHtml(c.name) + '<br><small class="text-muted">' + c.db_type + '</small></span>' +
            '<button class="btn btn-sm btn-outline-danger dbman-del-conn" data-id="' + c.id + '"><i class="bx bx-trash"></i></button>' +
            '</div></div>';
        });
        var lang = i18n[currentLang] || i18n.en;
        var emptyHtml = '<div class="text-muted text-center p-3" style="font-size:.8125rem">' + escHtml(lang.dbmanNoConnections || 'No connections yet') + '<br><button class="btn btn-sm btn-outline-primary mt-2" id="dbmanShowAddForm"><i class="bx bx-plus me-1"></i>' + escHtml(lang.dbmanNewConnection || 'New Connection') + '</button></div>' +
          '<div class="mt-2"><button class="btn btn-sm btn-outline-info w-100" id="dbmanQuickConnectLocal"><i class="bx bx-plug me-1"></i>' + escHtml(lang.dbmanQuickConnectLocal || 'Quick connect to local database') + '</button></div>';
        $('#dbmanConnList').html(html || emptyHtml);
      });
    }
    function showDbManConnForm(conn) {
      $('#dbmanConnView').hide();
      $('#dbmanConnForm').show();
      var lang = i18n[currentLang] || i18n.en;
      if (conn) {
        $('#dbmanFormTitle').text(lang.dbmanEditConnection || 'Edit Connection');
        $('#dbmanEditConnId').val(conn.id);
        $('#dbmanFormName').val(conn.name);
        $('#dbmanFormType').val(conn.db_type).trigger('change');
        $('#dbmanFormFilePath').val(conn.file_path || '');
        $('#dbmanFormHost').val(conn.host || '');
        $('#dbmanFormPort').val(conn.port || '');
        $('#dbmanFormDb').val(conn.database_name || '');
        $('#dbmanFormUser').val(conn.username || '');
        $('#dbmanFormPass').val('');
        $('#dbmanFormTrustCert').prop('checked', conn.trust_server_cert);
      } else {
        $('#dbmanFormTitle').text(lang.dbmanNewConnection || 'New Connection');
        $('#dbmanEditConnId').val('');
        $('#dbmanFormName').val('');
        $('#dbmanFormType').val('sqlite').trigger('change');
        $('#dbmanFormFilePath').val('');
        $('#dbmanFormHost').val('');
        $('#dbmanFormPort').val('');
        $('#dbmanFormDb').val('');
        $('#dbmanFormUser').val('');
        $('#dbmanFormPass').val('');
        $('#dbmanFormTrustCert').prop('checked', false);
      }
      $('#dbmanFormResult').empty();
    }
    function dbmanConnPayload(conn) {
      var data = { db_type: conn.db_type, file_path: conn.file_path || '' };
      if (conn.db_type !== 'sqlite') {
        data.host = conn.host;
        data.port = conn.port;
        data.username = conn.username;
        data.password = conn.password;
        data.database_name = conn.database_name;
        data.trust_server_cert = conn.trust_server_cert ? '1' : '0';
      }
      return data;
    }
    function dbmanDatabaseLabel(conn) {
      var lang = i18n[currentLang] || i18n.en;
      if (!conn) return lang.dbmanDatabase || 'Database';
      if (conn.db_type === 'sqlite') return conn.file_path || conn.name || 'SQLite';
      return conn.database_name || conn.name || conn.host || (lang.dbmanDatabase || 'Database');
    }
    function renderDbManSchemaLoading(conn) {
      var lang = i18n[currentLang] || i18n.en;
      $('#dbmanSchemaTree').show().html(
        '<div class="text-muted mb-1" style="font-size:.75rem">' + escHtml(lang.dbmanSchema || 'Database Schema') + '</div>' +
        '<div class="dbman-schema-tree" style="font-size:.8125rem">' +
        '<div class="py-1"><i class="bx bx-data me-1"></i><strong>' + escHtml(dbmanDatabaseLabel(conn)) + '</strong></div>' +
        '<div class="ms-3 text-muted py-1">' + escHtml(lang.loading || 'Loading...') + '</div>' +
        '</div>'
      );
    }
    function renderDbManSchemaError(conn, msg) {
      var lang = i18n[currentLang] || i18n.en;
      $('#dbmanSchemaTree').show().html(
        '<div class="text-muted mb-1" style="font-size:.75rem">' + escHtml(lang.dbmanSchema || 'Database Schema') + '</div>' +
        '<div class="dbman-schema-tree" style="font-size:.8125rem">' +
        '<div class="py-1"><i class="bx bx-data me-1"></i><strong>' + escHtml(dbmanDatabaseLabel(conn)) + '</strong></div>' +
        '<div class="ms-3 text-danger py-1">' + escHtml(msg) + '</div>' +
        '</div>'
      );
    }
    function renderDbManSchemaTree(conn, tables) {
      var lang = i18n[currentLang] || i18n.en;
      tables = tables || [];
      var tableHtml = '';
      if (!tables.length) {
        tableHtml = '<div class="text-muted py-1 ms-4">' + escHtml(lang.dbmanNoTables || 'No tables') + '</div>';
      } else {
        tableHtml = '<div id="dbmanTableList" class="d-flex flex-column py-1">';
        tables.forEach(function (t, idx) {
          tableHtml += '<div class="dbman-table-chip py-1 ps-4" data-table-idx="' + idx + '" data-table="' + encodeURIComponent(t.name) + '" style="cursor:pointer;text-align:left">' +
            '<i class="bx bx-table me-1"></i>' + escHtml(t.name) + '</div>';
        });
        tableHtml += '</div>';
      }
      $('#dbmanSchemaTree').show().html(
        '<div class="text-muted mb-1" style="font-size:.75rem">' + escHtml(lang.dbmanSchema || 'Database Schema') + '</div>' +
        '<div class="dbman-schema-tree" style="font-size:.8125rem">' +
        '<div class="dbman-tree-node py-1" data-tree-target="#dbmanTreeDb" data-open="1" style="cursor:pointer">' +
        '<i class="bx bx-chevron-down me-1 dbman-tree-caret"></i><i class="bx bx-data me-1"></i><strong>' + escHtml(dbmanDatabaseLabel(conn)) + '</strong></div>' +
        '<div id="dbmanTreeDb" class="ms-3">' +
        '<div class="dbman-tree-node py-1" data-tree-target="#dbmanTreeTables" data-open="1" style="cursor:pointer">' +
        '<i class="bx bx-chevron-down me-1 dbman-tree-caret"></i><i class="bx bx-folder-open me-1 dbman-tree-folder"></i>' + escHtml(lang.dbmanTable || 'table') + '</div>' +
        '<div id="dbmanTreeTables" class="ms-3">' + tableHtml + '</div>' +
        '<div class="dbman-tree-node py-1 text-muted" data-tree-target="#dbmanTreeViews" data-open="0" style="cursor:pointer">' +
        '<i class="bx bx-chevron-right me-1 dbman-tree-caret"></i><i class="bx bx-folder me-1 dbman-tree-folder"></i>' + escHtml(lang.dbmanView || 'view') + '</div>' +
        '<div id="dbmanTreeViews" class="ms-3" style="display:none"><div class="text-muted py-1 ms-4">' + escHtml(lang.noData || 'No data') + '</div></div>' +
        '<div class="dbman-tree-node py-1 text-muted" data-tree-target="#dbmanTreeProcedures" data-open="0" style="cursor:pointer">' +
        '<i class="bx bx-chevron-right me-1 dbman-tree-caret"></i><i class="bx bx-folder me-1 dbman-tree-folder"></i>' + escHtml(lang.dbmanStoredProcedure || 'stored procedure') + '</div>' +
        '<div id="dbmanTreeProcedures" class="ms-3" style="display:none"><div class="text-muted py-1 ms-4">' + escHtml(lang.noData || 'No data') + '</div></div>' +
        '<div class="dbman-tree-node py-1 text-muted" data-tree-target="#dbmanTreeFunctions" data-open="0" style="cursor:pointer">' +
        '<i class="bx bx-chevron-right me-1 dbman-tree-caret"></i><i class="bx bx-folder me-1 dbman-tree-folder"></i>' + escHtml(lang.dbmanStoredFunction || 'stored function') + '</div>' +
        '<div id="dbmanTreeFunctions" class="ms-3" style="display:none"><div class="text-muted py-1 ms-4">' + escHtml(lang.noData || 'No data') + '</div></div>' +
        '</div></div>'
      );
    }
    function loadDbManSchema(conn) {
      var data = dbmanConnPayload(conn);
      renderDbManSchemaLoading(conn);
      $.post('/dbman/tables', data, function (res) {
        if (res.code !== 0) { renderDbManSchemaError(conn, res.msg); return; }
        var tables = res.data || [];
        renderDbManSchemaTree(conn, tables);
        tables.forEach(function (t, idx) {
          var cntData = Object.assign({}, data, { sql: 'SELECT COUNT(*) AS cnt FROM "' + t.name + '"' });
          $.post('/dbman/query', cntData, function (cr) {
            if (cr.code === 0 && cr.data && cr.data.rows && cr.data.rows[0]) {
              $('.dbman-table-chip[data-table-idx="' + idx + '"]').append(' <small class="text-muted">(' + cr.data.rows[0][0] + ')</small>');
            }
          });
        });
      });
    }
    // ─── Security ───
    function loadSecurityCvsSources() {
      $.get('/security/cvs/sources', function (res) {
        if (res.code !== 0) return;
        var sources = res.data || [];
        var html = '';
        sources.forEach(function (s) {
          html += '<div class="p-1 mb-1" style="background:var(--bs-tertiary-bg);border-radius:4px">' +
            '<div class="d-flex justify-content-between align-items-center px-2 py-1">' +
            '<div style="font-size:.8125rem"><strong>' + escHtml(s.name) + '</strong><br><small class="text-muted">' + escHtml(s.url) + '</small></div>' +
            '<button class="btn btn-sm btn-outline-danger security-del-cvs" data-id="' + s.id + '"><i class="bx bx-trash"></i></button></div></div>';
        });
        $('#secCvsSourceList').html(html || '<div class="text-muted p-2" style="font-size:.8125rem">尚無來源</div>');
      });
    }
    function loadSecurityScanTasks() {
      $.get('/security/scan/tasks', function (res) {
        if (res.code !== 0) return;
        var tasks = res.data || [];
        var html = '<div class="table-responsive"><table class="table table-sm mb-0" style="font-size:.75rem"><thead><tr><th>名稱</th><th>目標</th><th>狀態</th><th>操作</th></tr></thead><tbody>';
        tasks.forEach(function (t) {
          var statusCls = t.status === 'completed' ? 'bg-label-success' : t.status === 'running' ? 'bg-label-primary' : t.status === 'failed' ? 'bg-label-danger' : 'bg-label-secondary';
          html += '<tr><td>' + escHtml(t.name) + '</td><td><code>' + escHtml(t.target) + '</code></td><td><span class="badge ' + statusCls + '">' + t.status + '</span></td>' +
            '<td>' + (t.status === 'completed' ? '<button class="btn btn-sm btn-outline-info security-view-results" data-id="' + t.id + '"><i class="bx bx-show"></i></button> ' : '') +
            '<button class="btn btn-sm btn-outline-danger security-del-task" data-id="' + t.id + '"><i class="bx bx-trash"></i></button></td></tr>';
        });
        html += '</tbody></table></div>';
        $('#secScanTaskList').html(html || '<div class="text-muted p-2">尚無掃描任務</div>');
      });
    }
    // ─── ApiMan ───
    var apimanBase = '/apiman';
    var apimanCurrentNodeId = null;
    var apimanWorkspaces = [];
    var apimanExpanded = {};
    function apimanUrl(path) { return apimanBase + path; }
    (function () {
      if (document.getElementById('apiman-style')) return;
      var s = document.createElement('style');
      s.id = 'apiman-style';
      s.textContent = [
        '.apiman-ws-item{transition:all .12s ease;border:1px solid var(--bs-border-color);cursor:pointer}',
        '.apiman-ws-item:hover{border-color:var(--bs-primary);background:rgba(var(--bs-primary-rgb),.04)}',
        '.apiman-folder-header{transition:background .12s ease;border-radius:4px}',
        '.apiman-folder-header:hover{background:rgba(var(--bs-secondary-rgb),.06)}',
        '.apiman-req-item{transition:background .12s ease;border-radius:4px}',
        '.apiman-req-item:hover{background:rgba(var(--bs-secondary-rgb),.05)}',
        '.apiman-method-badge{font-size:.6rem;font-weight:700;padding:1px 5px;border-radius:3px;letter-spacing:.3px}',
        '.apiman-fold-toggle{width:18px;display:inline-block;text-align:center;cursor:pointer;user-select:none;font-size:.7rem;color:var(--bs-secondary-color);transition:color .12s}',
        '.apiman-fold-toggle:hover{color:var(--bs-primary)}',
        '.apiman-tree-line{border-left:1px solid var(--bs-border-color);margin-left:11px}',
        '.apiman-drop-hint{background:rgba(var(--bs-primary-rgb),.06);outline:2px dashed var(--bs-primary)}',
        '.apiman-ws-icon{font-size:.9rem}',
        '.apiman-folder-icon{font-size:.85rem;color:var(--bs-warning)}',
        '.apiman-request-icon{font-size:.75rem;color:var(--bs-info)}',
        '.apiman-empty-dot{width:6px;height:6px;border-radius:50%;background:var(--bs-border-color);display:inline-block;margin-left:11px}',
      ].join('');
      document.head.appendChild(s);
    })();
    function loadApiManWorkspaces(done) {
      $.get(apimanUrl('/workspaces'), function (res) {
        if (res.code === 0) {
          apimanWorkspaces = res.data || [];
          if (done) done(apimanWorkspaces);
        }
      });
    }
    function rebuildApiManMenu() {
      loadApiManWorkspaces(function (workspaces) {
        var html = '';
        workspaces.forEach(function (ws) {
          html += '<li class="menu-item apiman-menu-ws" data-ws-id="' + ws.id + '">' +
            '<a href="#" class="menu-link apiman-menu-ws-link" data-ws-id="' + ws.id + '">' +
            '<i class="menu-icon tf-icons bx bx-folder"></i>' +
            '<div class="text-truncate">' + escHtml(ws.name) + '</div></a></li>';
        });
        $('#menuApiManWsItems').html(html);
      });
    }
    function refreshApiManWorkspaceLists() {
      renderApiManTree();
      rebuildApiManMenu();
    }
    function openApiManWorkspaceDialog() {
      var lang = i18n[currentLang] || i18n.en;
      layer.open({
        title: lang.apimanCreateWorkspace || 'Create Workspace',
        area: ['460px', 'auto'],
        content:
          '<div class="p-2">' +
          '<div class="mb-2"><label class="form-label" for="apimanWsNameInput">' + escHtml(lang.apimanWorkspaceName || 'Workspace Name') + '</label>' +
          '<input type="text" class="form-control" id="apimanWsNameInput" placeholder="My Workspace"></div>' +
          '<div class="mb-2"><label class="form-label" for="apimanWsDescInput">' + escHtml(lang.apimanWorkspaceDescription || 'Description') + '</label>' +
          '<textarea class="form-control" id="apimanWsDescInput" rows="3" placeholder="' + escHtml(lang.apimanWorkspaceDescriptionPlaceholder || 'Purpose, environment, or API notes') + '"></textarea></div>' +
          '</div>',
        btn: [lang.apimanCreateWorkspace || 'Create', lang.cancel || 'Cancel'],
        btn1: function () {
          var name = $('#apimanWsNameInput').val().trim();
          var description = $('#apimanWsDescInput').val().trim();
          if (!name) { layer.msg(lang.apimanWorkspaceNameRequired || 'Enter a workspace name', { icon: 2 }); return; }
          $.post(apimanUrl('/workspaces'), { name: name, description: description }, function (res) {
            if (res.code === 0) {
              _hideModal();
              layer.msg(lang.apimanWorkspaceCreated || 'Workspace created', { icon: 1 });
              loadApiManWorkspaces(function () {
                renderApiManTree();
                rebuildApiManMenu();
                if (res.data && res.data.id) renderApiManTreeForWs(res.data.id);
              });
            } else {
              layer.alert(res.msg);
            }
          });
        },
        btn2: function () { _hideModal(); }
      });
      setTimeout(function () { $('#apimanWsNameInput').trigger('focus'); }, 50);
    }
    function renderApiManTree() {
      loadApiManWorkspaces(function (workspaces) {
        var $tree = $('#apimanTreeBody');
        var lang = i18n[currentLang] || i18n.en;
        if (!workspaces.length) {
          $tree.html('<div class="text-muted text-center p-4" style="font-size:.8125rem">' +
            '<i class="bx bx-folder-open" style="font-size:2.2rem;opacity:.25;display:block;margin-bottom:8px"></i>' +
            escHtml(lang.apimanNoWorkspace || 'No workspaces yet') +
            '<br><button class="btn btn-sm btn-outline-primary mt-2" id="apimanCreateFirstWs"><i class="bx bx-plus me-1"></i>' +
            escHtml(lang.apimanCreateFirstWorkspace || 'Create first workspace') + '</button></div>');
          return;
        }
        var html = '<div class="d-flex justify-content-end gap-1 px-1 mb-1">' +
          '<button class="btn btn-sm btn-outline-info" id="apimanImportBtn" title="匯入工作區"><i class="bx bx-import"></i></button></div>';
        workspaces.forEach(function (ws) {
          html += '<div class="apiman-ws-item p-1 mb-1 rounded" data-ws-id="' + ws.id + '">' +
            '<div class="d-flex justify-content-between align-items-center px-2 py-1">' +
            '<strong style="font-size:.8125rem"><i class="bx bx-folder apiman-ws-icon me-1"></i>' + escHtml(ws.name) + '</strong>' +
            '<div><button class="btn btn-sm btn-outline-danger apiman-del-ws border-0" data-id="' + ws.id + '" title="刪除工作區"><i class="bx bx-trash"></i></button></div>' +
            '</div></div>';
        });
        $tree.html(html);
      });
    }
    function renderApiManTreeForWs(wsId) {
      apimanCurrentWsId = wsId;
      loadApiManVars();
      var ws = (apimanWorkspaces || []).find(function (item) { return String(item.id) === String(wsId); });
      $.get(apimanUrl('/workspaces/' + wsId + '/nodes'), function (res) {
        if (res.code !== 0) return;
        var treeData = res.data || [];
        var html = buildApiManTreeHtml(treeData, 0);
        $('#apimanTreeBody').html(
          '<div class="d-flex justify-content-between align-items-center px-1 mb-2">' +
          '<strong style="font-size:.8125rem" id="apimanCurrentWsLabel"><i class="bx bx-folder apiman-ws-icon me-1"></i></strong>' +
          '<div class="d-flex gap-1">' +
          '<button class="btn btn-sm btn-outline-primary apiman-add-folder" data-ws="' + wsId + '" title="新增資料夾"><i class="bx bx-folder-plus"></i></button>' +
          '<button class="btn btn-sm btn-outline-success apiman-add-req" data-ws="' + wsId + '" title="新增 Request"><i class="bx bx-plus-circle"></i></button>' +
          '<button class="btn btn-sm btn-outline-info apiman-export-ws" data-ws="' + wsId + '" title="匯出"><i class="bx bx-export"></i></button>' +
          '<button class="btn btn-sm btn-outline-secondary apiman-back-ws" title="返回"><i class="bx bx-arrow-back"></i></button></div></div>' +
          (html || '<div class="text-muted p-3 text-center" style="font-size:.8125rem"><i class="bx bx-inbox" style="font-size:1.6rem;opacity:.25;display:block;margin-bottom:4px"></i>空的，點擊上方按鈕新增</div>')
        );
        $('#apimanCurrentWsLabel').html('<i class="bx bx-folder apiman-ws-icon me-1"></i>' + (ws ? escHtml(ws.name) : ''));
      });
    }
    var apimanDragNodeId = null;
    function buildApiManTreeHtml(nodes, depth) {
      var html = '';
      var sorted = (nodes || []).slice().sort(function (a, b) {
        var ta = a.node && a.node.node_type;
        var tb = b.node && b.node.node_type;
        if (ta === 'folder' && tb !== 'folder') return -1;
        if (ta !== 'folder' && tb === 'folder') return 1;
        return 0;
      });
      sorted.forEach(function (item) {
        var nodeId = item.node.id;
        var isExpanded = apimanExpanded[nodeId] !== false;
        var indent = depth * 16 + 4;
        if (item.node.node_type === 'folder') {
          var hasChildren = item.children && item.children.length > 0;
          html += '<div class="apiman-folder-item" style="padding-left:' + indent + 'px;padding-right:3px">' +
            '<div class="d-flex justify-content-between align-items-center px-1 py-1 apiman-folder-header" data-node-id="' + nodeId + '" draggable="true" style="cursor:grab">' +
            '<span style="font-size:.8125rem">' +
            '<span class="apiman-fold-toggle" data-fold="' + nodeId + '">' + (hasChildren ? (isExpanded ? '▾' : '▸') : '') + '</span>' +
            '<i class="bx ' + (isExpanded ? 'bx-folder-open' : 'bx-folder') + ' apiman-folder-icon me-1"></i>' +
            escHtml(item.node.name) + '</span>' +
            '<div class="d-flex gap-1">' +
            '<button class="btn btn-sm btn-outline-info apiman-copy-node border-0 px-1" data-id="' + nodeId + '" title="複製"><i class="bx bx-copy" style="font-size:.8rem"></i></button>' +
            '<button class="btn btn-sm btn-outline-danger apiman-del-node border-0 px-1" data-id="' + nodeId + '"><i class="bx bx-trash" style="font-size:.8rem"></i></button></div>' +
            '</div>' +
            '<div class="apiman-children apiman-drop-zone' + (isExpanded ? '' : ' d-none') + '" data-parent-id="' + nodeId + '" style="min-height:2px;padding-left:25px">' +
            (hasChildren ? buildApiManTreeHtml(item.children, depth + 1) : '<span class="apiman-empty-dot"></span>') +
            '</div></div>';
        } else {
          var method = item.request ? item.request.method : 'GET';
          var methodBg = method === 'GET' ? 'rgba(102,187,106,.15)' : method === 'POST' ? 'rgba(255,193,7,.2)' : method === 'DELETE' ? 'rgba(234,84,85,.15)' : 'rgba(3,169,244,.15)';
          var methodColor = method === 'GET' ? '#2e7d32' : method === 'POST' ? '#b8860b' : method === 'DELETE' ? '#c62828' : '#0277bd';
          html += '<div class="apiman-req-item px-1 py-1" style="padding-left:' + indent + 'px;padding-right:3px;cursor:grab" data-node-id="' + nodeId + '" draggable="true">' +
            '<div class="d-flex justify-content-between align-items-center">' +
            '<span style="font-size:.75rem;display:flex;align-items:center;gap:4px;min-width:0">' +
            '<span class="apiman-method-badge" style="background:' + methodBg + ';color:' + methodColor + '">' + method + '</span> ' +
            '<span class="text-truncate" style="max-width:140px;display:inline-block;color:var(--bs-body-color)">' + escHtml(item.request ? item.request.url : '') + '</span></span>' +
            '<div class="d-flex gap-1">' +
            '<button class="btn btn-sm btn-outline-info apiman-copy-node border-0 px-1" data-id="' + nodeId + '" title="複製"><i class="bx bx-copy" style="font-size:.8rem"></i></button>' +
            '<button class="btn btn-sm btn-outline-danger apiman-del-node border-0 px-1" data-id="' + nodeId + '"><i class="bx bx-trash" style="font-size:.8rem"></i></button></div>' +
            '</div></div>';
        }
      });
      return html;
    }
      var apimanCurrentWsId = null;
      function loadApiManVars() {
        if (!apimanCurrentWsId) return;
        $.get(apimanUrl('/variables/' + apimanCurrentWsId), function (res) {
          if (res.code !== 0) return;
          var vars = res.data || [];
          $('#apimanVarBadge').text(vars.length);
          // Variable hints
          var hints = '';
          vars.forEach(function (v) {
            if (v.enabled !== false) hints += '<code style="background:var(--bs-tertiary-bg);padding:0 4px;border-radius:3px;cursor:pointer" class="apiman-var-insert" data-key="' + escHtml(v.key) + '">{{' + escHtml(v.key) + '}}</code> ';
          });
          $('#apimanVarHints').html(hints || '');
          var $c = $('#apimanVarsList').empty();
          if (!vars.length) {
            $c.html('<div class="text-muted" style="font-size:.8125rem">尚無變數，請新增</div>');
            return;
          }
          vars.forEach(function (v) {
            $c.append(
              '<div class="row g-1 mb-1 apiman-var-row">' +
              '<div class="col-1"><input type="checkbox" class="form-check-input apiman-var-enabled" ' + (v.enabled !== false ? 'checked' : '') + '></div>' +
              '<div class="col-4"><input type="text" class="form-control form-control-sm font-monospace apiman-var-key" value="' + escHtml(v.key) + '" placeholder="Key"></div>' +
              '<div class="col-5"><input type="text" class="form-control form-control-sm font-monospace apiman-var-value" value="' + escHtml(v.value) + '" placeholder="Value"></div>' +
              '<div class="col-2"><button class="btn btn-sm btn-outline-danger apiman-var-del" data-key="' + escHtml(v.key) + '"><i class="bx bx-x"></i></button></div>' +
              '</div>'
            );
          });
        });
      }
      function loadApiManRequest(nodeId) {
        apimanCurrentNodeId = nodeId;
        $.get(apimanUrl('/requests/' + nodeId), function (res) {
          if (res.code !== 0) return;
          var r = res.data;
          $('#apimanMethod').val(r.method || 'GET');
          $('#apimanUrl').val(r.url || '');
          $('#apimanBodyType').val(r.body_type || 'none');
          $('#apimanBody').val(r.body_content || '');
          renderApiManKeyValue('#apimanParamsList', r.query_params, 'apimanParam');
          renderApiManKeyValue('#apimanHeadersList', r.headers, 'apimanHeader');
          // Load auth config
          var auth = {};
          try { auth = r.auth_config ? JSON.parse(r.auth_config) : {}; } catch(e) {}
          loadApiManAuth(auth);
          $('#apimanRequestCard').show();
          $('#apimanEmptyState').hide();
          // Show/hide history button
          $('#apimanHistoryBtn').show();
        });
      }
      function loadApiManAuth(auth) {
        var t = auth.type || 'none';
        $('#apimanAuthType').val(t);
        $('#apimanAuthBadge').text(t === 'none' ? 'none' : t).removeClass('bg-label-secondary bg-label-warning bg-label-info bg-label-primary')
          .addClass(t === 'none' ? 'bg-label-secondary' : 'bg-label-warning');
        $('#apimanAuthBasic,#apimanAuthBearer,#apimanAuthApiKey').hide();
        if (t === 'basic') { $('#apimanAuthBasic').show(); $('#apimanAuthBasicUser').val(auth.username || ''); $('#apimanAuthBasicPass').val(auth.password || ''); }
        if (t === 'bearer') { $('#apimanAuthBearer').show(); $('#apimanAuthBearerToken').val(auth.token || ''); }
        if (t === 'apikey') { $('#apimanAuthApiKey').show(); $('#apimanAuthApiKeyName').val(auth.key_name || 'X-API-Key'); $('#apimanAuthApiKeyValue').val(auth.key_value || ''); $('#apimanAuthApiKeyIn').val(auth.key_in || 'header'); }
      }
      function collectApiManAuth() {
        var t = $('#apimanAuthType').val();
        if (t === 'none') return null;
        var auth = { type: t };
        if (t === 'basic') { auth.username = $('#apimanAuthBasicUser').val(); auth.password = $('#apimanAuthBasicPass').val(); }
        if (t === 'bearer') { auth.token = $('#apimanAuthBearerToken').val(); }
        if (t === 'apikey') { auth.key_name = $('#apimanAuthApiKeyName').val(); auth.key_value = $('#apimanAuthApiKeyValue').val(); auth.key_in = $('#apimanAuthApiKeyIn').val(); }
        return JSON.stringify(auth);
      }
      function applyApiManAuth(authConfig, headers, params) {
        if (!authConfig) return;
        var auth = (typeof authConfig === 'string') ? JSON.parse(authConfig) : authConfig;
        if (auth.type === 'basic' && auth.username) {
          var encoded = btoa(unescape(encodeURIComponent(auth.username + ':' + (auth.password || ''))));
          headers.push({ key: 'Authorization', value: 'Basic ' + encoded, enabled: true });
        } else if (auth.type === 'bearer' && auth.token) {
          headers.push({ key: 'Authorization', value: 'Bearer ' + auth.token, enabled: true });
        } else if (auth.type === 'apikey' && auth.key_name && auth.key_value) {
          if (auth.key_in === 'query') {
            params.push({ key: auth.key_name, value: auth.key_value, enabled: true });
          } else {
            headers.push({ key: auth.key_name, value: auth.key_value, enabled: true });
          }
        }
      }
      function loadApiManHistory(nodeId) {
        $.get(apimanUrl('/requests/' + nodeId + '/history'), function (res) {
          if (res.code !== 0) return;
          var items = res.data || [];
          if (!items.length) { layer.msg('尚無歷史紀錄', { icon: 2 }); return; }
          var html = '<div class="table-responsive"><table class="table table-sm table-bordered mb-0" style="font-size:.75rem"><thead><tr><th>#</th><th>Status</th><th>Time</th><th>Elapsed</th><th></th></tr></thead><tbody>';
          items.forEach(function (item) {
            var statusCls = item.status >= 200 && item.status < 300 ? 'text-success' : item.status >= 400 ? 'text-danger' : 'text-warning';
            html += '<tr><td>' + item.id + '</td><td class="' + statusCls + ' fw-bold">' + (item.status || '?') + '</td><td>' + escHtml(item.created_at) + '</td><td>' + (item.elapsed_ms || '-') + 'ms</td>' +
              '<td><button class="btn btn-sm btn-outline-info apiman-view-history" data-id="' + item.id + '" data-body=\'' + escHtml(JSON.stringify(item).replace(/'/g,'&#39;')) + '\'><i class="bx bx-show"></i></button></td></tr>';
          });
          html += '</tbody></table></div>';
          layer.open({ title: 'Response History', content: html, area: ['700px', '60vh'], btn: ['OK'] });
        });
      }
    function renderApiManKeyValue(containerId, jsonData, prefix) {
      var $c = $(containerId).empty();
      var items = [];
      try { items = jsonData ? JSON.parse(jsonData) : []; } catch(e) {}
      if (!items.length) items = [{key:'', value:'', enabled:true}];
      items.forEach(function (item, i) {
        $c.append(
          '<div class="row g-1 mb-1 apiman-kv-row">' +
          '<div class="col-1"><input type="checkbox" class="form-check-input apiman-kv-enabled" ' + (item.enabled !== false ? 'checked' : '') + '></div>' +
          '<div class="col-4"><input type="text" class="form-control form-control-sm font-monospace apiman-kv-key" value="' + escHtml(item.key) + '" placeholder="Key"></div>' +
          '<div class="col-5"><input type="text" class="form-control form-control-sm font-monospace apiman-kv-value" value="' + escHtml(item.value || '') + '" placeholder="Value"></div>' +
          '<div class="col-2"><button class="btn btn-sm btn-outline-danger apiman-kv-del"><i class="bx bx-x"></i></button></div>' +
          '</div>'
        );
      });
    }
    function collectApiManKv(prefix) {
      var items = [];
      $('.' + prefix + '-kv-row').each(function () {
        var key = $(this).find('.apiman-kv-key').val().trim();
        if (!key) return;
        items.push({
          key: key,
          value: $(this).find('.apiman-kv-value').val(),
          enabled: $(this).find('.apiman-kv-enabled').is(':checked')
        });
      });
      return items.length ? JSON.stringify(items) : null;
    }
    // ─── Netplan ───
    var netplanBase = null;
    var netplanBaseCandidates = ['/netplan', '/api/netplan'];
    function netplanUrl(path) { return (netplanBase || '/netplan') + path; }
    function detectNetplanApi(done) {
      if (netplanBase) { if (done) done(); return; }
      var candidates = netplanBaseCandidates.slice();
      function tryNext() {
        if (!candidates.length) { netplanBase = '/netplan'; if (done) done(); return; }
        var base = candidates.shift();
        $.ajax({ url: base + '/configs', dataType: 'json', method: 'GET' })
          .done(function () { netplanBase = base; if (done) done(); })
          .fail(function () { tryNext(); });
      }
      tryNext();
    }
    function loadNetplanInterfaces() {
      $.get('/netplan/interfaces', function (res) {
        var select = $('#netplanInterface');
        var current = select.val();
        select.empty();
        if (Array.isArray(res)) {
          res.forEach(function (iface) {
            select.append('<option value="' + escHtml(iface) + '">' + escHtml(iface) + '</option>');
          });
          if (current && res.indexOf(current) !== -1) select.val(current);
        }
        loadNetplanIfaceInfo();
      }, 'json');
    }
    function loadNetplanIfaceInfo() {
      var iface = $('#netplanInterface').val();
      if (!iface) { $('#netplanIfaceInfo').html('<div class="text-muted" style="font-size:.8125rem">請選擇網路介面</div>'); return; }
      $.get('/netplan/interfaces/' + encodeURIComponent(iface) + '/current', function (res) {
        var html = '<div style="font-size:.8125rem"><strong>介面: </strong><code>' + escHtml(iface) + '</code></div>';
        if (res.ip_address) html += '<div style="font-size:.8125rem"><strong>IP: </strong><code>' + escHtml(res.ip_address) + '</code></div>';
        if (res.netmask_prefix) html += '<div style="font-size:.8125rem"><strong>Prefix: </strong><code>' + res.netmask_prefix + '</code></div>';
        if (!res.ip_address) html += '<div class="text-muted" style="font-size:.8125rem">無法取得目前 IP 設定</div>';
        $('#netplanIfaceInfo').html(html);
      }, 'json');
    }
    function loadNetplanHistory() {
      detectNetplanApi(function () {
        $.get(netplanUrl('/configs'), function (res) {
          if (res.code !== 0) { $('#netplanHistoryBody').html('<div class="text-danger p-2">' + res.msg + '</div>'); return; }
          var configs = res.data || [];
          if (!configs.length) { $('#netplanHistoryBody').html('<div class="text-muted p-2">尚無歷史設定</div>'); return; }
          var html = '<div class="table-responsive"><table class="table table-sm table-hover mb-0">' +
            '<thead><tr><th>#</th><th>介面</th><th>DHCP</th><th>IP</th><th>閘道</th><th>時間</th><th>操作</th></tr></thead><tbody>';
          configs.forEach(function (c) {
            var dhcpLabel = c.dhcp ? '<span class="badge bg-label-success">DHCP</span>' : '<span class="badge bg-label-info">Static</span>';
            var ip = c.dhcp ? '-' : (c.ip_address || '-') + '/' + (c.netmask_prefix || '');
            html += '<tr><td>' + c.id + '</td><td><code>' + escHtml(c.interface_name) + '</code></td><td>' + dhcpLabel + '</td><td><code>' + escHtml(ip) + '</code></td><td><code>' + escHtml(c.gateway || '-') + '</code></td><td style="font-size:.7rem">' + escHtml(c.created_at) + '</td>' +
              '<td><button class="btn btn-sm btn-outline-primary netplan-restore-config" data-id="' + c.id + '"><i class="bx bx-undo"></i></button></td></tr>';
          });
          html += '</tbody></table></div>';
          $('#netplanHistoryBody').html(html);
        });
      });
    }
    // ─── Nginx ───
    var nginxBase = null;
    var nginxBaseCandidates = ['/nginx', '/api/nginx'];
    function nginxUrl(path) { return (nginxBase || '/nginx') + path; }
    function detectNginxApi(done) {
      if (nginxBase) { if (done) done(); return; }
      var candidates = nginxBaseCandidates.slice();
      function tryNext() {
        if (!candidates.length) { nginxBase = '/nginx'; if (done) done(); return; }
        var base = candidates.shift();
        $.ajax({ url: base + '/env', dataType: 'json', method: 'GET' })
          .done(function () { nginxBase = base; if (done) done(); })
          .fail(function () { tryNext(); });
      }
      tryNext();
    }
    function loadNginxEnv() {
      detectNginxApi(function () {
        $.get(nginxUrl('/env'), function (res) {
          if (res.code !== 0) return;
          var d = res.data || {};
          $('#nginxBin').val(d.nginx_bin || 'nginx');
          $('#nginxConfigDir').val(d.config_dir || '/etc/nginx');
          $('#nginxSitesEnabledDir').val(d.sites_enabled_dir || '/etc/nginx/sites-enabled');
          $('#nginxModulesEnabledDir').val(d.modules_enabled_dir || '/etc/nginx/modules-enabled');
          $('#nginxConfDDir').val(d.conf_d_dir || '/etc/nginx/conf.d');
          logger.debug('Nginx 環境設定已載入');
        });
      });
    }
    function loadNginxSites() {
      $('#nginxSiteListBody').html('<div class="text-muted p-2">Loading...</div>');
      detectNginxApi(function () {
        $.get(nginxUrl('/sites'), function (res) {
          if (res.code !== 0) { $('#nginxSiteListBody').html('<div class="text-danger p-2">' + res.msg + '</div>'); return; }
          var sites = res.data || [];
          if (!sites.length) { $('#nginxSiteListBody').html('<div class="text-muted p-2">' + (i18n[currentLang].dashNoData || 'No data') + '</div>'); return; }
          var lang = i18n[currentLang];
          var html = '<div class="table-responsive"><table class="table table-sm table-hover mb-0">' +
            '<thead><tr><th>' + (lang.nginxSiteName || 'Site Name') + '</th><th>' + (lang.nginxServerName || 'Server Name') + '</th>' +
            '<th>' + (lang.nginxType || 'Type') + '</th><th>' + (lang.nginxStatus || 'Status') + '</th><th>' + (lang.nginxActions || 'Actions') + '</th></tr></thead><tbody>';
          sites.forEach(function (s) {
            var enabled = s.enabled ? '<span class="badge bg-label-success">' + (lang.nginxEnabled || 'Enabled') + '</span>' : '<span class="badge bg-label-secondary">Disabled</span>';
            var typeLabel = s.site_type === 'reverse_proxy' ? (lang.nginxReverseProxy || 'Reverse Proxy') : (lang.nginxStaticSite || 'Static Site');
            html += '<tr data-name="' + escHtml(s.site_name) + '">' +
              '<td><strong>' + escHtml(s.site_name) + '</strong></td>' +
              '<td><code>' + escHtml(s.server_name) + '</code></td>' +
              '<td>' + typeLabel + '</td>' +
              '<td>' + enabled + '</td>' +
              '<td><button class="btn btn-sm btn-outline-primary nginx-edit-site me-1"><i class="bx bx-edit"></i></button>' +
              '<button class="btn btn-sm btn-outline-danger nginx-delete-site"><i class="bx bx-trash"></i></button></td></tr>';
          });
          html += '</tbody></table></div>';
          $('#nginxSiteListBody').html(html);
          logger.debug('Nginx 網站列表已載入', sites.length + ' sites');
        });
      });
    }
    function fillNginxSiteForm(site) {
      $('#nginxEditSiteName').val(site.site_name || '');
      $('#nginxSiteName').val(site.site_name || '').prop('readonly', true);
      $('#nginxServerName').val(site.server_name || '_');
      $('#nginxSiteType').val(site.site_type || 'server');
      $('#nginxDocRoot').val(site.document_root || '/var/www/html');
      $('#nginxProxyPass').val(site.reverse_proxy_pass || '');
      $('#nginxSiteEnabled').prop('checked', site.enabled !== false);
      $('#nginxSiteConfig').val(site.config_content || '');
      $('#nginxDeleteSiteBtn').show();
      toggleNginxSiteType();
    }
    function resetNginxSiteForm() {
      $('#nginxEditSiteName').val('');
      $('#nginxSiteName').val('').prop('readonly', false);
      $('#nginxServerName').val('_');
      $('#nginxSiteType').val('server');
      $('#nginxDocRoot').val('/var/www/html');
      $('#nginxProxyPass').val('http://127.0.0.1:3000');
      $('#nginxSiteEnabled').prop('checked', true);
      $('#nginxSiteConfig').val('');
      $('#nginxDeleteSiteBtn').hide();
      $('#nginxSitePreviewResult').empty();
      toggleNginxSiteType();
    }
    function toggleNginxSiteType() {
      var t = $('#nginxSiteType').val();
      if (t === 'reverse_proxy') {
        $('#nginxDocRootGroup').hide();
        $('#nginxProxyPassGroup').show();
      } else {
        $('#nginxDocRootGroup').show();
        $('#nginxProxyPassGroup').hide();
      }
    }
    function loadNginxModules() {
      $('#nginxModuleListBody').html('<div class="text-muted p-2">Loading...</div>');
      detectNginxApi(function () {
        $.get(nginxUrl('/modules'), function (res) {
          if (res.code !== 0) { $('#nginxModuleListBody').html('<div class="text-danger p-2">' + res.msg + '</div>'); return; }
          var modules = res.data || [];
          if (!modules.length) { $('#nginxModuleListBody').html('<div class="text-muted p-2">' + (i18n[currentLang].dashNoData || 'No data') + '</div>'); return; }
          var lang = i18n[currentLang];
          var html = '<div class="table-responsive"><table class="table table-sm table-hover mb-0">' +
            '<thead><tr><th>' + (lang.nginxModuleName || 'Module Name') + '</th><th>' + (lang.nginxStatus || 'Status') + '</th><th>' + (lang.nginxActions || 'Actions') + '</th></tr></thead><tbody>';
          modules.forEach(function (m) {
            var enabled = m.enabled;
            html += '<tr><td><code>' + escHtml(m.module_name) + '</code></td>' +
              '<td><label class="form-check form-switch haproxy-status-switch' + (enabled ? '' : ' is-off') + '">' +
              '<input type="checkbox" class="form-check-input nginx-toggle-module" data-name="' + escHtml(m.module_name) + '"' + (enabled ? ' checked' : '') + '>' +
              '<span class="form-check-label">' + (enabled ? 'Enabled' : 'Disabled') + '</span></label></td>' +
              '<td></td></tr>';
          });
          html += '</tbody></table></div>';
          $('#nginxModuleListBody').html(html);
          logger.debug('Nginx 模組列表已載入', modules.length + ' modules');
        });
      });
    }
    console.log('[app.js] $ready callback executing');
    $(function () {
      // ─── Init ───
      logger.info('頁面初始化', 'Loading version info…');
      $.get("/version", function (res) {
        $(".ipc-version").text(res.data || "");
        logger.debug('版本資訊已取得', res.data);
      });
      $.get("/health", function (res) {
        if (res.code === 0 && res.data) {
          $("#footerVersion").text("v" + (res.data.version || "") + " | " + (res.data.platform || ""));
        }
      });
      $.get("/platform", function (res) {
        if (res.code === 0 && res.data) {
          currentPlatform = res.data;
          logger.info('平台偵測完成', currentPlatform);
          if (currentPlatform !== "linux") { $("#protocolSwitch").hide(); }
          setLanguage(currentLang, false);
          renderDocContent();
        }
      });
      $('input[name="protocol"]').on("change", function () {
        currentProtocol = this.value;
        logger.info('切換協定', currentProtocol);
        loadListRule(currentTableName());
      });
      setLanguage(currentLang, false);
      // Tab-aware view activation map (must be defined before tab restoration below)
      var viewActivators = {
        dashboard: function() { loadDash(); if (dashTimer) clearInterval(dashTimer); dashTimer = setInterval(loadDash, 5000); },
        shell: function() { initTerminal(); setTimeout(function(){if(termFit){termFit.fit();sendResize();}focusTerminal();},100); },
        ai: function() { setTimeout(function(){$('#aiInput').focus();},100); },
        juniper: function() { loadJuniperAll(); },
        haproxy: function() { ensureHaproxyDefaults(); loadHaproxyStatus(); loadHaproxySaved(); },
        nginx: function() { loadNginxEnv(); },
        netplan: function() { loadNetplanInterfaces(); },
        apiman: function() { renderApiManTree(); },
        dbman: function() { loadDbManConnections(); loadDbManSavedQueries(); },
        security: function() { loadSecurityCvsSources(); },
        tools: function() {
          // Force Bootstrap tabs to init after DOM wrapping
          try {
            var $firstTab = $('#toolsTabs').find('[data-bs-toggle="tab"]').first();
            if ($firstTab.length) {
              var tab = new bootstrap.Tab($firstTab[0]);
              tab.show();
            }
          } catch(e) {}
          setTimeout(loadLogFiles, 100);
        },
        system: function() { loadSystemInfo(); },
        tables: function() { $('.action-buttons').show(); loadListRule(currentTableName()); },
      };
      var viewMenuMap = {
        dashboard: 'menuDash', tables: 'menuTables', juniper: 'menuJuniper',
        haproxy: 'menuHaproxy', nginx: 'menuNginx', netplan: 'menuNetplan',
        apiman: 'menuApiManNew', dbman: 'menuDbManNew', security: 'menuSecurityCvs',
        tools: 'menuTools', system: 'menuSys', shell: 'menuShell', ai: 'menuAI',
      };
      // ─── Rebuild dynamic menus ───
      rebuildApiManMenu();
      rebuildDbManMenu();
      // ─── Logger toggle ───
      $('#logToggle').on('click', function () {
        $('#logContainer').toggleClass('open');
        const c = document.getElementById('logContainer');
        if (c.classList.contains('open')) c.scrollTop = c.scrollHeight;
      });
      $('#logClear').on('click', function () { logger.clear(); });
      function inactiveAllLeaf() {
        $('#menuDash,#menuTables,#menuJuniper,#menuHaproxy,#menuNginx,#menuNetplan,#menuSys,#menuTools,#menuShell,#menuApiManNew,#menuDbManNew,#menuSecurityCvs,#menuSecurityScan,#menuAI,#menuDoc').removeClass('active');
      }
      function hideAllViews() {
        $('#dashboardView,#firewallView,#systemView,#juniperView,#haproxyView,#nginxView,#netplanView,#apimanView,#dbmanView,#securityView,#toolsView,#aiView,#shellView').hide();
      }
      // ─── Dashboard view toggle & timer ───
      function switchView(mode) {
        hideAllViews();
        destroyTerminal();
        if (wsAI) { try { wsAI.close(); } catch(e) {} wsAI = null; aiRunning = false; }
        $('.action-buttons').hide();
        console.log('[app.js] switchView called:', mode, 'menuDash exists:', !!$('#menuDashLink').length, 'dashView exists:', !!$('#dashboardView').length);
        if (dashTimer) { clearInterval(dashTimer); dashTimer = null; }
        inactiveAllLeaf();
        ensureTab(mode);
        activateTabImpl(mode);
        var menuId = viewMenuMap[mode];
        if (menuId) $('#' + menuId).addClass('active');
        var activator = viewActivators[mode];
        if (activator) activator();
        logger.info('切換至 ' + tabLabel(mode), 'tab=' + mode);
      }
      window.fwmSwitchView = switchView;
      if (!window.__fwmMenuLeafFallbackInstalled) {
        window.__fwmMenuLeafFallbackInstalled = true;
        document.addEventListener('click', function (event) {
          var link = event.target && event.target.closest ? event.target.closest('#layout-menu .menu-link:not(.menu-toggle)') : null;
          if (!link) return;
          var viewMap = {
            menuDashLink: 'dashboard',
            menuTablesLink: 'tables',
            menuJuniperLink: 'juniper',
            menuHaproxyLink: 'haproxy',
            menuNginxLink: 'nginx',
            menuNetplanLink: 'netplan',
            menuSysLink: 'system',
            menuToolsLink: 'tools',
            menuShellLink: 'shell',
          menuAILink: 'ai',
            menuDbManNewLink: 'dbman',
            menuSecurityCvsLink: 'security',
            menuSecurityScanLink: 'security'
          };
          var mode = viewMap[link.id];
          if (!mode || typeof window.fwmSwitchView !== 'function') return;
          event.preventDefault();
          event.stopPropagation();
          window.fwmSwitchView(mode);
          if (link.id === 'menuSecurityScanLink') {
            setTimeout(function () { $('#security-scan-tab').click(); }, 100);
          }
          console.log('[fwm-menu] leaf switched', link.id, mode);
        }, true);
        console.log('[fwm-menu] leaf fallback installed');
      }
      console.log('[app.js] binding menu click handlers...');
      $('#menuDashLink').on('click', function (e) { console.log('[app.js] menuDashLink clicked'); e.preventDefault(); switchView('dashboard'); });
      $('#menuTablesLink').on('click', function (e) { console.log('[app.js] menuTablesLink clicked'); e.preventDefault(); switchView('tables'); });
      console.log('[app.js] menu click handlers bound, menuDashLink found:', !!$('#menuDashLink').length, 'tableTabs found:', !!$('#tableTabs').length);
      $('#menuJuniperLink').on('click', function (e) { e.preventDefault(); switchView('juniper'); });
      $('#menuHaproxyLink').on('click', function (e) { e.preventDefault(); switchView('haproxy'); });
      $('#menuNginxLink').on('click', function (e) { e.preventDefault(); switchView('nginx'); });
      $('#menuNetplanLink').on('click', function (e) { e.preventDefault(); switchView('netplan'); });
      $('#menuApiManNewLink').on('click', function (e) {
        e.preventDefault();
        switchView('apiman');
        openApiManWorkspaceDialog();
      });
      $('#menuDbManNewLink').on('click', function (e) { e.preventDefault(); switchView('dbman'); });
      $(document).on('click', '.dbman-menu-conn-link', function (e) {
        e.preventDefault();
        var connId = $(this).data('conn-id');
        switchView('dbman');
        // Find the connection and auto-select it
        setTimeout(function () {
          $('.dbman-conn-item[data-conn-id="' + connId + '"]').click();
        }, 300);
      });
      $('#menuSecurityCvsLink').on('click', function (e) { e.preventDefault(); switchView('security'); });
      $('#menuSecurityScanLink').on('click', function (e) { e.preventDefault(); switchView('security'); setTimeout(function () { $('#security-scan-tab').click(); }, 100); });
      $('#menuSysLink').on('click', function (e) { e.preventDefault(); switchView('system'); });
      $('#menuToolsLink').on('click', function (e) { e.preventDefault(); switchView('tools'); });
      $('#menuShellLink').on('click', function (e) { e.preventDefault(); switchView('shell'); });
      $('#menuAILink').on('click', function (e) { e.preventDefault(); switchView('ai'); });
      $('#menuDocLink').on('click', function (e) {
        e.preventDefault();
        var docMap = { linux: "iptables-command-reference", macos: "pfctl-command-reference", windows: "windows-firewall-command-reference" };
        var base = docMap[currentPlatform] || "iptables-command-reference";
        var f = base + '.' + currentLang + '.html';
        logger.debug('載入命令文件', f);
        $.get('/docs/' + f, function (html) {
          layer.open({
            title: i18n[currentLang].docLabel || 'Command Reference',
            content: '<div style="max-height:70vh;overflow-y:auto;padding:.5rem">' + html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link[\s\S]*?>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '') + '</div>',
            area: ['860px', '80vh'],
            btn: [i18n[currentLang].btnOk || 'OK']
          });
          logger.debug('命令文件已載入', f);
        }).fail(function () {
          // fallback to default language (zh)
          $.get('/docs/' + base + '.zh.html', function (html) {
            layer.open({
              title: i18n[currentLang].docLabel || 'Command Reference',
              content: '<div style="max-height:70vh;overflow-y:auto;padding:.5rem">' + html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link[\s\S]*?>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '') + '</div>',
              area: ['860px', '80vh'],
              btn: [i18n[currentLang].btnOk || 'OK']
            });
          });
        });
      });
      // ─── API object ───
      const ipt = {
        listRule(t, c, done) { $.post("/listRule", { table: t, chain: c, protocol: currentProtocol }, r => { logger.debug('規則列表已收到', (r.data ? (r.data.system ? r.data.system.length + ' 系統鏈' : '') + (r.data.custom ? ', ' + r.data.custom.length + ' 自定義鏈' : '') : '')); done(r); }, "json"); },
        flushRule(t, c, done) {
          const lang = i18n[currentLang];
          const msg = lang.clearConfirmPrefix + (t ? ' ' + t + ' ' + lang.tableWord : '') + (!c ? lang.allRulesSuffix : ' ' + c + lang.chainRulesSuffix);
          layer.confirm(msg, function () {
            $.post("/flushRule", { table: t, chain: c, protocol: currentProtocol }, function (r) {
              if (r.code === 0) { layer.msg(lang.flushRuleSuccess); if (done) done(); return false; }
              layer.alert(r.msg);
            }, "json");
          });
        },
        flushMetrics(t, c, id, done) {
          const lang = i18n[currentLang];
          const msg = lang.clearConfirmPrefix + (t ? ' ' + t + ' ' + lang.tableWord : '') + (c ? ' ' + c + ' ' + lang.chainWord : '') + (!id ? lang.allMetricsSuffix : lang.ruleMetricsPrefix + id + lang.ruleMetricsSuffix);
          layer.confirm(msg, function () {
            $.post("/flushMetrics", { table: t, chain: c, id: id, protocol: currentProtocol }, function (r) {
              if (r.code === 0) { layer.msg(lang.flushMetricsSuccess); if (done) done(); return false; }
              layer.alert(r.msg);
            }, "json");
          });
        },
        deleteRule(t, c, id, done) {
          const lang = i18n[currentLang];
          const msg = currentLang === "zh" ? `確認清除 ${t} 表 ${c} 鏈的第 ${id} 條規則？` : currentLang === "ja" ? `${t} テーブル ${c} チェインのルール #${id} を削除しますか？` : `Confirm to clear ${t} table ${c} chain rule #${id}?`;
          layer.confirm(msg, function () {
            $.post("/deleteRule", { table: t, chain: c, id: id, protocol: currentProtocol }, function (r) {
              if (r.code === 0) { layer.msg(lang.flushRuleSuccess); if (done) done(); return false; }
              layer.alert(r.msg);
            }, "json");
          });
        },
        getRuleInfo(t, c, id, done) {
          $.post("/getRuleInfo", { table: t, chain: c, id: id, protocol: currentProtocol }, function (r) {
            if (r.code !== 0) { layer.alert(r.msg); return false; }
            done(r.data);
          }, "json");
        },
        exec(args, done) {
          $.post("/exec", { args: args, protocol: currentProtocol }, function (r) {
            if (r.code !== 0) { layer.alert(r.msg); return false; }
            if (done) done(r);
          }, "json");
        },
        listExec(t, c, done) { $.post("/listExec", { table: t, chain: c, protocol: currentProtocol }, r => done(r), "json"); },
        exportRules(t, c, done) {
          $.post("/export", { table: t, chain: c, protocol: currentProtocol }, function (r) {
            if (r.code !== 0) { layer.alert(r.msg); return; }
            done(r.data);
          }, "json");
        },
        importRules(rl, done) {
          $.post("/import", { rule: rl, protocol: currentProtocol }, function (r) {
            if (r.code === 0) { layer.msg(i18n[currentLang].importSuccess); if (done) done(); return false; }
            layer.alert(r.msg);
          }, "json");
        },
        flushEmptyCustomChain(done) {
          layer.confirm(i18n[currentLang].clearEmptyPrompt, function () {
            $.post("/flushEmptyCustomChain", { protocol: currentProtocol }, function (r) {
              if (r.code === 0) { layer.msg(i18n[currentLang].clearEmptySuccess); if (done) done(); return false; }
              layer.alert(r.msg);
            }, "json");
          });
        },
      };
      // ─── Restore tabs from localStorage (after ipt is defined) ───
      loadTabs();
      if (tabState.tabs.length > 0) {
        renderTabs();
        if (tabState.activeId && findTab(tabState.activeId) >= 0) {
          switchView(tabState.activeId);
        } else {
          switchView(tabState.tabs[0].id);
        }
      }
      // ─── Load rules ───
      function loadListRule(tableName, chainName) {
        const lang = i18n[currentLang];
        logger.debug('載入規則列表', (chainName || '全部鏈') + '@' + tableName);
        ipt.listRule(tableName, chainName || "", function (res) {
          if (res.code !== 0) { layer.alert(res.msg); return false; }
          if (!chainName) {
            const body = $("#table-body").empty();
            if (res.data.system && res.data.system.length > 0) {
              body.append(`<h5 class="text-primary mt-0 mb-3"><i class="bx bx-server me-1"></i>${lang.nativeChain}</h5>`);
              res.data.system.forEach(function (s) { body.append(tableHTML("system", tableName, s)); });
            }
            if (res.data.custom && res.data.custom.length > 0) {
              body.append(`<hr><h5 class="text-primary mb-3"><i class="bx bx-git-branch me-1"></i>${lang.customChain}</h5>`);
              res.data.custom.forEach(function (c) { body.append(tableHTML("custom", tableName, c)); });
            }
            renderDocContent();
          } else {
            const el = $("#" + chainName.replace(/\s/g, '_'));
            if (res.data[el.data("type")] && res.data[el.data("type")].length > 0) {
              el.html($(buildTableHTML(chainName, tableName, res.data[el.data("type")][0], el.data("type"))).html());
            }
          }
        });
      }
      // ─── Load initial (only if no tabs restored) ───
      if (!tabState.tabs || tabState.tabs.length === 0) {
        tabState.tabs.push({ id: 'tables' });
        tabState.activeId = 'tables';
        saveTabs();
        renderTabs();
        activateTabImpl('tables');
        const initialTable = currentTableName();
        loadListRule(initialTable);
      }
      renderDocContent();
      // ─── Tab switch ───
      $(document).on("click", ".iptables-table .nav-link", function () {
        const t = $(this).attr("id").replace("tab-", "");
        $(".iptables-table .nav-link").removeClass("active");
        $(this).addClass("active");
        logger.debug('切換表格', t);
        loadListRule(t);
      });
      // ─── Chain action handlers ───
      $(document).on("click", ".chain-reload", function () {
        const t = $(this).data("table"), c = $(this).data("chain");
        logger.debug('重新載入鏈', c + '@' + t);
        loadListRule(t, c);
      });
      $(document).on("click", ".chain-insert", function () {
        const table = $(this).data("table"), c = $(this).data("chain");
        const prefix = chainCommandPrefix(table, c, "-I");
        if (currentPlatform === "linux") {
          ruleEditor({ title: i18n[currentLang].insertRuleTitle, prefix: prefix, val: "", confirmCb: function(val) {
            const cmd = chainExecArgsStr(table, c, "-I", val);
            logger.info('插入規則', c + '@' + table, prefix + ' ' + val);
            ipt.exec(cmd, function () { loadListRule(table, c, false); layer.msg(i18n[currentLang].insertSuccess); logger.debug('插入規則完成'); });
          }});
        } else {
          execView(i18n[currentLang].insertRuleTitle, prefix, i18n[currentLang].rulePlaceholder, "", function (val) {
            const cmd = chainExecArgsStr(table, c, "-I", val);
            logger.info('插入規則', c + '@' + table, prefix + ' ' + val);
            ipt.exec(cmd, function () { loadListRule(table, c, false); layer.msg(i18n[currentLang].insertSuccess); logger.debug('插入規則完成'); });
          });
        }
      });
      $(document).on("click", ".chain-append", function () {
        const table = $(this).data("table"), c = $(this).data("chain");
        const prefix = chainCommandPrefix(table, c, "-A");
        if (currentPlatform === "linux") {
          ruleEditor({ title: i18n[currentLang].appendRuleTitle, prefix: prefix, val: "", confirmCb: function(val) {
            const cmd = chainExecArgsStr(table, c, "-A", val);
            logger.info('追加規則', c + '@' + table, prefix + ' ' + val);
            ipt.exec(cmd, function () { loadListRule(table, c, false); layer.msg(i18n[currentLang].appendSuccess); logger.debug('追加規則完成'); });
          }});
        } else {
          execView(i18n[currentLang].appendRuleTitle, prefix, i18n[currentLang].rulePlaceholder, "", function (val) {
            const cmd = chainExecArgsStr(table, c, "-A", val);
            logger.info('追加規則', c + '@' + table, prefix + ' ' + val);
            ipt.exec(cmd, function () { loadListRule(table, c, false); layer.msg(i18n[currentLang].appendSuccess); logger.debug('追加規則完成'); });
          });
        }
      });
      $(document).on("click", ".chain-flush", function () {
        const t = $(this).data("table"), c = $(this).data("chain");
        logger.info('清空鏈規則', c + '@' + t);
        ipt.flushRule(t, c, function () { loadListRule(t, c); logger.debug('清空鏈規則完成', c + '@' + t); });
      });
      $(document).on("click", ".chain-flush-metrics", function () {
        const t = $(this).data("table"), c = $(this).data("chain");
        logger.info('清空鏈計數', c + '@' + t);
        ipt.flushMetrics(t, c, "", function () { loadListRule(t, c); logger.debug('清空鏈計數完成', c + '@' + t); });
      });
      $(document).on("click", ".flush-metrics", function () {
        const t = $(this).data("table"), c = $(this).data("chain"), id = $(this).data("id");
        logger.info('清零規則計數', c + '@' + t + '#' + id);
        ipt.flushMetrics(t, c, id, function () { loadListRule(t, c); logger.debug('清零規則計數完成', '#' + id); });
      });
      $(document).on("click", ".chain-exec", function () {
        const t = $(this).data("table"), c = $(this).data("chain");
        logger.debug('檢視鏈命令', c + '@' + t);
        ipt.listExec(t, c, function (res) {
          layer.open({ title: t + " · " + c, content: `<pre class="modal-pre">${res.data || ''}</pre>`, btn: [i18n[currentLang].btnOk], area: ["auto", "400px"] });
        });
      });
      $(document).on("click", ".rule-table tbody>tr>td:first-child", function () {
        const btn = $(this).parent().find(".delete-rule");
        const t = btn.data("table"), c = btn.data("chain"), id = btn.data("id");
        logger.debug('編輯規則請求', c + '@' + t + '#' + id);
        ipt.getRuleInfo(t, c, id, function (info) {
          info = info.replace("-A ", "-R ").replace(c, c + " " + id + " ");
          const editTitle = currentLang === "zh" ? `修改 ${t}表, ${c}鏈, 第${id}條規則` : currentLang === "ja" ? `${t} テーブル, ${c} チェイン, ルール #${id} を編集` : `Edit ${t} table, ${c} chain, rule #${id}`;
        if (currentPlatform === "linux") {
          ruleEditor({ title: editTitle, prefix: currentCommandBinary() + " -t " + t, val: info, confirmCb: function(val) {
            const cmd = "-t " + t + " " + val;
            logger.info('修改規則', c + '@' + t + '#' + id, currentCommandBinary() + ' ' + cmd);
            ipt.exec(cmd, function () { loadListRule(t, c); layer.msg(i18n[currentLang].updateSuccess); logger.debug('修改規則完成'); });
          }});
        } else {
          execView(editTitle, currentCommandBinary() + " -t " + t, "", info, function (val) {
            const cmd = currentPlatform !== "linux" ? val : "-t " + t + " " + val;
            logger.info('修改規則', c + '@' + t + '#' + id, currentCommandBinary() + ' ' + cmd);
            ipt.exec(cmd, function () { loadListRule(t, c); layer.msg(i18n[currentLang].updateSuccess); logger.debug('修改規則完成'); });
          });
        }
        });
      });
      $(document).on("click", ".delete-rule", function () {
        const t = $(this).data("table"), c = $(this).data("chain"), id = $(this).data("id");
        logger.info('刪除規則', c + '@' + t + '#' + id);
        ipt.deleteRule(t, c, id, function () { loadListRule(t, c); logger.debug('刪除規則完成', '#' + id); });
      });
      // ─── Global action buttons ───
      $("#clear-all-rule").click(function () {
        logger.info('清空所有表規則');
        ipt.flushRule("", "", function () { loadListRule(currentTableName()); logger.debug('清空所有表規則完成'); });
      });
      $("#clear-current-table-rule").click(function () {
        const tn = currentTableName();
        logger.info('清空當前表規則', tn);
        ipt.flushRule(tn, "", function () { loadListRule(tn); logger.debug('清空當前表規則完成', tn); });
      });
      $("#export-all-rule").click(function () {
        const lang = i18n[currentLang];
        logger.info('導出規則');
        ipt.exportRules("", "", function (data) {
          layer.open({
            title: lang.exportDialogTitle, content: `<pre class="modal-pre">${data || ''}</pre>`,
            btn: [lang.btnCopy, lang.btnDownload, lang.btnOk], area: ["auto", "500px"],
            btn1() { copyText($, data); layer.msg(lang.copySuccess, { icon: 1 }); logger.debug('規則已複製'); },
            btn2() {
              $("#createInvote").attr("href", "data:text/plain;charset=utf-8," + encodeURIComponent(data)).attr("download", "fw-rules.txt").get(0).click();
              logger.debug('規則已下載');
            },
            btn3(i) { _hideModal(); }
          });
          logger.debug('導出規則完成');
        });
      });
      $("#import-all-rule").click(function () {
        logger.info('導入規則');
        layer.prompt({ title: t("importPromptTpl"), value: "" }, function (value) {
          logger.debug('正在導入規則…');
          ipt.importRules(value, function () { loadListRule(currentTableName()); logger.debug('導入規則完成'); });
        });
      });
      $("#clear-all-metrics").click(function () {
        logger.info('清零所有表計數');
        ipt.flushMetrics("", "", "", function () { loadListRule(currentTableName()); logger.debug('清零所有表計數完成'); });
      });
      $("#clear-current-table-metrics").click(function () {
        const tn = currentTableName();
        logger.info('清零當前表計數', tn);
        ipt.flushMetrics(tn, "", "", function () { loadListRule(tn); logger.debug('清零當前表計數完成', tn); });
      });
      $("#clear-all-empty-chain").click(function () {
        logger.info('清空自定義空鏈');
        ipt.flushEmptyCustomChain(function () { loadListRule(currentTableName()); logger.debug('清空自定義空鏈完成'); });
      });
      $("#exec-iptables").click(function () {
        execView(t("execCommandTitleTpl"), fwDisplayName(), i18n[currentLang].inputCommand, "", function (val) {
          logger.info('執行命令', val);
          ipt.exec(val, function (res) {
            if (res.data) {
              layer.open({ title: i18n[currentLang].commandSuccess, content: `<pre class="modal-pre">${res.data}</pre>`, btn: [i18n[currentLang].btnOk] });
            } else { layer.msg(i18n[currentLang].commandSuccess); }
            logger.debug('命令執行完成');
          });
        });
      });
      $("#self-iptables").click(function () {
        const t = currentTableName();
        logger.debug('檢視當前表命令', t);
        ipt.listExec(t, "", function (res) {
          layer.open({ title: fwDisplayName() + " " + i18n[currentLang].tableLabel + ": " + t, content: `<pre class="modal-pre">${res.data || ''}</pre>`, btn: [i18n[currentLang].btnOk] });
        });
      });
      $("#open-iptables-doc").click(function () {
        var docMap = { linux: "iptables-command-reference", macos: "pfctl-command-reference", windows: "windows-firewall-command-reference" };
        var base = docMap[currentPlatform] || "iptables-command-reference";
        var f = base + '.' + currentLang + '.html';
        $.get('/docs/' + f, function (html) {
          layer.open({
            title: i18n[currentLang].doc || 'Command Reference',
            content: '<div style="max-height:70vh;overflow-y:auto;padding:.5rem">' + html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link[\s\S]*?>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '') + '</div>',
            area: ['860px', '80vh'],
            btn: [i18n[currentLang].btnOk || 'OK']
          });
        }).fail(function () {
          $.get('/docs/' + base + '.zh.html', function (html) {
            layer.open({
              title: i18n[currentLang].doc || 'Command Reference',
              content: '<div style="max-height:70vh;overflow-y:auto;padding:.5rem">' + html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<link[\s\S]*?>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '') + '</div>',
              area: ['860px', '80vh'],
              btn: [i18n[currentLang].btnOk || 'OK']
            });
          });
        });
      });
      // ─── Tab event handlers ───
      $(document).on('click', '.tab-item', function () {
        var mode = $(this).data('mode');
        if (mode) switchView(mode);
      });
      $(document).on('click', '.tab-close', function (e) {
        e.stopPropagation();
        closeTab($(this).data('mode'));
      });
      // Right-click context menu
      var ctxMenu = $('<div class="tab-context-menu" style="display:none"></div>').appendTo('body');
      ctxMenu.on('click', '.ctx-item', function () {
        var action = $(this).data('action');
        var mode = ctxMenu.data('mode');
        ctxMenu.hide();
        if (action === 'close') { closeTab(mode); return; }
        loadTabs();
        if (action === 'closeAll') {
          tabState.tabs = []; tabState.activeId = null; saveTabs(); renderTabs();
          // Unwrap all views and remove panes
          $('.tab-content-pane').each(function () {
            var $view = $(this).find('[id$=View]');
            if ($view.length) { $view.unwrap(); $view.css('display', 'none'); }
          });
          $('.tab-content-pane').remove();
          return;
        }
        var idx = findTab(mode);
        if (idx < 0) return;
        if (action === 'closeLeft') { tabState.tabs.splice(0, idx); saveTabs(); if (tabState.activeId && findTab(tabState.activeId) < 0) { tabState.activeId = tabState.tabs[0] ? tabState.tabs[0].id : null; } saveTabs(); renderTabs(); if (tabState.activeId) activateTabImpl(tabState.activeId); }
        if (action === 'closeRight') { tabState.tabs.splice(idx + 1); saveTabs(); if (tabState.activeId && findTab(tabState.activeId) < 0) { tabState.activeId = tabState.tabs[tabState.tabs.length - 1] ? tabState.tabs[tabState.tabs.length - 1].id : null; } saveTabs(); renderTabs(); if (tabState.activeId) activateTabImpl(tabState.activeId); }
      });
      $(document).on('contextmenu', '.tab-item', function (e) {
        e.preventDefault();
        var mode = $(this).data('mode');
        var lang = i18n[currentLang] || {};
        ctxMenu.html(
          '<div class="ctx-item" data-action="close"><i class="bx bx-x"></i> ' + (lang.closeTab || '關閉') + '</div>' +
          '<div class="ctx-divider"></div>' +
          '<div class="ctx-item" data-action="closeAll"><i class="bx bx-x-circle"></i> ' + (lang.closeAll || '關閉全部') + '</div>' +
          '<div class="ctx-item" data-action="closeLeft"><i class="bx bx-chevron-left"></i> ' + (lang.closeLeft || '關閉左方') + '</div>' +
          '<div class="ctx-item" data-action="closeRight"><i class="bx bx-chevron-right"></i> ' + (lang.closeRight || '關閉右方') + '</div>'
        ).data('mode', mode).css({ left: e.clientX + 'px', top: e.clientY + 'px' }).show();
        return false;
      });
      $(document).on('click', function (e) { if (!$(e.target).closest('.tab-context-menu').length) ctxMenu.hide(); });
      $("#languageDropdownMenu").on("click", ".dropdown-item", function (e) {
        e.preventDefault();
        var lang = $(this).data("lang");
        if (lang) {
          logger.info('切換語言', lang);
          setLanguage(lang, true);
        }
      });
      $("#aiSendBtn").on("click", function (e) { e.preventDefault(); sendAIPrompt(); });
      $("#aiInput").on("keydown", function (e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          sendAIPrompt();
        }
      });
      // ─── Netplan event handlers ───
      $('#netplanDhcp').on('change', function () {
        if ($(this).is(':checked')) {
          $('#netplanStaticFields input').prop('disabled', true);
          $('#netplanStaticFields').css('opacity', 0.5);
        } else {
          $('#netplanStaticFields input').prop('disabled', false);
          $('#netplanStaticFields').css('opacity', 1);
        }
      });
      $('#netplanRefreshIfaces').on('click', loadNetplanInterfaces);
      $('#netplanInterface').on('change', loadNetplanIfaceInfo);
      $('#netplanPreviewBtn').on('click', function () {
        var data = {
          interface_name: $('#netplanInterface').val(),
          dhcp: $('#netplanDhcp').is(':checked') ? '1' : '0',
          ip_address: $('#netplanIpAddress').val().trim(),
          netmask_prefix: $('#netplanPrefix').val(),
          gateway: $('#netplanGateway').val().trim(),
          dns_servers: $('#netplanDns').val().trim()
        };
        if (!data.interface_name) { layer.msg('請選擇網路介面', { icon: 2 }); return; }
        $.post('/netplan/preview', data, function (res) {
          if (res.code !== 0) { layer.alert(res.msg); return; }
          $('#netplanYaml').val(res.data.config || '');
          logger.debug('Netplan YAML 已產生');
        });
      });
      $('#netplanApplyBtn').on('click', function () {
        var data = {
          interface_name: $('#netplanInterface').val(),
          dhcp: $('#netplanDhcp').is(':checked') ? '1' : '0',
          ip_address: $('#netplanIpAddress').val().trim(),
          netmask_prefix: $('#netplanPrefix').val(),
          gateway: $('#netplanGateway').val().trim(),
          dns_servers: $('#netplanDns').val().trim(),
          config_yaml: $('#netplanYaml').val().trim()
        };
        if (!data.interface_name) { layer.msg('請選擇網路介面', { icon: 2 }); return; }
        if (!data.config_yaml) { layer.msg('請先產生 YAML 設定', { icon: 2 }); return; }
        logger.info('套用 Netplan 設定', data.interface_name);
        $('#netplanResult').html('<div class="text-muted">套用中...</div>');
        $.post('/netplan/apply', data, function (res) {
          if (res.code !== 0) { $('#netplanResult').html('<div class="text-danger p-2" style="font-size:.8125rem">' + escHtml(res.msg) + '</div>'); return; }
          $('#netplanResult').html('<pre class="text-success" style="font-size:.75rem;background:var(--bs-tertiary-bg);padding:.5rem;border-radius:4px">' + escHtml(res.data.output || '套用成功') + '</pre>');
          logger.debug('Netplan 已套用');
          loadNetplanHistory();
        }, 'json');
      });
      $('#netplanRefreshHistory').on('click', loadNetplanHistory);
      $(document).on('click', '.netplan-restore-config', function () {
        var id = $(this).data('id');
        if (!id) return;
        detectNetplanApi(function () {
          $.get(netplanUrl('/configs'), function (res) {
            if (res.code !== 0) return;
            var configs = res.data || [];
            var cfg = configs.find(function (c) { return c.id === id; });
            if (!cfg) { layer.msg('找不到該設定', { icon: 2 }); return; }
            $('#netplanInterface').val(cfg.interface_name);
            $('#netplanDhcp').prop('checked', !!cfg.dhcp).trigger('change');
            $('#netplanIpAddress').val(cfg.ip_address || '');
            $('#netplanPrefix').val(cfg.netmask_prefix || 24);
            $('#netplanGateway').val(cfg.gateway || '');
            $('#netplanDns').val(cfg.dns_servers || '');
            $('#netplanYaml').val(cfg.config_yaml || '');
            $('#netplanConfigTabLabel').click();
            layer.msg('已載入歷史設定', { icon: 1 });
          });
        });
      });
      $(document).on('shown.bs.tab', '#netplanTabs .nav-link', function () {
        if ($(this).attr('data-bs-target') === '#netplanHistoryPane') loadNetplanHistory();
      });
      // ─── Nginx event handlers ───
      $('#nginxSiteType').on('change', toggleNginxSiteType);
      $('#nginxSaveEnvBtn').on('click', function () {
        var data = {
          nginx_bin: $('#nginxBin').val().trim(),
          config_dir: $('#nginxConfigDir').val().trim(),
          sites_enabled_dir: $('#nginxSitesEnabledDir').val().trim(),
          modules_enabled_dir: $('#nginxModulesEnabledDir').val().trim(),
          conf_d_dir: $('#nginxConfDDir').val().trim()
        };
        logger.info('儲存 Nginx 環境設定');
        detectNginxApi(function () {
          $.post(nginxUrl('/env'), data, function (res) {
            if (res.code !== 0) { layer.alert(res.msg); return; }
            layer.msg(i18n[currentLang].nginxEnvSaved || 'Environment saved', { icon: 1 });
            logger.debug('Nginx 環境設定已儲存');
          });
        });
      });
      $('#nginxTestBtn').on('click', function () {
        logger.info('測試 Nginx 設定');
        $('#nginxEnvResult').html('<div class="text-muted">Testing...</div>');
        detectNginxApi(function () {
          $.post(nginxUrl('/test'), {}, function (res) {
            var output = res.data || res.msg || 'No output';
            var cls = res.code === 0 ? 'text-success' : 'text-danger';
            $('#nginxEnvResult').html('<pre class="' + cls + '" style="font-size:.75rem;background:var(--bs-tertiary-bg);padding:.5rem;border-radius:4px">' + escHtml(output) + '</pre>');
            logger.debug('Nginx 設定測試結果', output);
          });
        });
      });
      $('#nginxReloadBtn').on('click', function () {
        logger.info('重新載入 Nginx');
        $('#nginxEnvResult').html('<div class="text-muted">Reloading...</div>');
        detectNginxApi(function () {
          $.post(nginxUrl('/reload'), {}, function (res) {
            var output = res.data || res.msg || 'No output';
            var cls = res.code === 0 ? 'text-success' : 'text-danger';
            $('#nginxEnvResult').html('<pre class="' + cls + '" style="font-size:.75rem;background:var(--bs-tertiary-bg);padding:.5rem;border-radius:4px">' + escHtml(output) + '</pre>');
            logger.debug('Nginx 重新載入結果', output);
          });
        });
      });
      $('#nginxSaveSiteBtn').on('click', function () {
        var editName = $('#nginxEditSiteName').val();
        var isEdit = !!editName;
        var data = {
          site_name: $('#nginxSiteName').val().trim(),
          server_name: $('#nginxServerName').val().trim(),
          site_type: $('#nginxSiteType').val(),
          document_root: $('#nginxDocRoot').val().trim(),
          reverse_proxy_pass: $('#nginxProxyPass').val().trim(),
          enabled: $('#nginxSiteEnabled').is(':checked') ? '1' : '0',
          config_content: $('#nginxSiteConfig').val().trim() || null
        };
        if (!data.site_name) { layer.msg('Site name required', { icon: 2 }); return; }
        logger.info((isEdit ? '更新' : '新增') + ' Nginx 網站', data.site_name);
        detectNginxApi(function () {
          if (isEdit) {
            $.post(nginxUrl('/sites/' + encodeURIComponent(editName)), data, function (res) {
              if (res.code !== 0) { layer.alert(res.msg); return; }
              layer.msg(i18n[currentLang].nginxSiteUpdated || 'Site updated', { icon: 1 });
              loadNginxSites();
            });
          } else {
            $.post(nginxUrl('/sites'), data, function (res) {
              if (res.code !== 0) { layer.alert(res.msg); return; }
              layer.msg(i18n[currentLang].nginxSiteAdded || 'Site added', { icon: 1 });
              loadNginxSites();
              fillNginxSiteForm(res.data);
            });
          }
        });
      });
      $('#nginxPreviewSiteBtn').on('click', function () {
        var name = $('#nginxSiteName').val().trim();
        if (!name) { layer.msg('Site name required', { icon: 2 }); return; }
        detectNginxApi(function () {
          $.get(nginxUrl('/sites/' + encodeURIComponent(name) + '/preview'), function (res) {
            if (res.code !== 0) { layer.alert(res.msg); return; }
            $('#nginxSitePreviewResult').html('<pre class="haproxy-preview" style="max-height:200px">' + escHtml(res.data.config) + '</pre>');
          });
        });
      });
      $('#nginxDeleteSiteBtn').on('click', function () {
        var name = $('#nginxEditSiteName').val();
        if (!name) return;
        if (!confirm(i18n[currentLang].nginxConfirmDelete || 'Confirm delete this site?')) return;
        logger.info('刪除 Nginx 網站', name);
        detectNginxApi(function () {
          $.ajax({ url: nginxUrl('/sites/' + encodeURIComponent(name)), type: 'DELETE', dataType: 'json' })
            .done(function (res) {
              if (res.code !== 0) { layer.alert(res.msg); return; }
              layer.msg(i18n[currentLang].nginxSiteDeleted || 'Site deleted', { icon: 1 });
              resetNginxSiteForm();
              loadNginxSites();
            });
        });
      });
      $('#nginxRefreshSites').on('click', function () { loadNginxSites(); });
      $(document).on('click', '.nginx-edit-site', function () {
        var name = $(this).closest('tr').data('name');
        if (!name) return;
        detectNginxApi(function () {
          $.get(nginxUrl('/sites/' + encodeURIComponent(name)), function (res) {
            if (res.code !== 0) { layer.alert(res.msg); return; }
            fillNginxSiteForm(res.data);
          });
        });
      });
      $(document).on('click', '.nginx-delete-site', function () {
        var name = $(this).closest('tr').data('name');
        if (!name) return;
        if (!confirm(i18n[currentLang].nginxConfirmDelete || 'Confirm delete this site?')) return;
        logger.info('刪除 Nginx 網站', name);
        detectNginxApi(function () {
          $.ajax({ url: nginxUrl('/sites/' + encodeURIComponent(name)), type: 'DELETE', dataType: 'json' })
            .done(function (res) {
              if (res.code !== 0) { layer.alert(res.msg); return; }
              layer.msg(i18n[currentLang].nginxSiteDeleted || 'Site deleted', { icon: 1 });
              loadNginxSites();
            });
        });
      });
      $('#nginxAddModuleBtn').on('click', function () {
        var name = $('#nginxModuleName').val().trim();
        if (!name) { layer.msg('Module name required', { icon: 2 }); return; }
        logger.info('新增 Nginx 模組', name);
        detectNginxApi(function () {
          $.post(nginxUrl('/modules'), { module_name: name }, function (res) {
            if (res.code !== 0) { layer.alert(res.msg); return; }
            layer.msg(i18n[currentLang].nginxModuleAdded || 'Module added', { icon: 1 });
            $('#nginxModuleName').val('');
            loadNginxModules();
          });
        });
      });
      $(document).on('change', '.nginx-toggle-module', function () {
        var input = $(this);
        var name = input.data('name');
        var enabled = input.is(':checked');
        logger.info('切換 Nginx 模組狀態', name + '=' + enabled);
        detectNginxApi(function () {
          $.post(nginxUrl('/modules/' + encodeURIComponent(name) + '/enabled'), { enabled: enabled ? '1' : '0' }, function (res) {
            if (res.code !== 0) { input.prop('checked', !enabled); layer.alert(res.msg); return; }
            layer.msg(i18n[currentLang].nginxModuleToggled || 'Module toggled', { icon: 1 });
            loadNginxModules();
          });
        });
      });
      $('#nginxRefreshModules').on('click', function () { loadNginxModules(); });
      $('#nginxScanModulesBtn').on('click', function () {
        logger.info('掃描系統 Nginx 模組');
        $('#nginxScanModulesResult').html('<div class="text-muted">Scanning...</div>');
        detectNginxApi(function () {
          $.get(nginxUrl('/modules/scan'), function (res) {
            if (res.code !== 0) { $('#nginxScanModulesResult').html('<div class="text-danger">' + escHtml(res.msg) + '</div>'); return; }
            var modules = res.data || [];
            if (!modules.length) { $('#nginxScanModulesResult').html('<div class="text-muted">' + (i18n[currentLang].dashNoData || 'No modules found') + '</div>'); return; }
            var html = '<div style="display:flex;flex-wrap:wrap;gap:.25rem">';
            modules.forEach(function (m) {
              html += '<span class="juniper-chip" style="cursor:pointer" data-name="' + escHtml(m) + '">' + escHtml(m) + '</span>';
            });
            html += '</div>';
            $('#nginxScanModulesResult').html(html);
            logger.debug('掃描到 ' + modules.length + ' 個系統模組');
          });
        });
      });
      $(document).on('click', '#nginxScanModulesResult .juniper-chip', function () {
        var name = $(this).data('name');
        if (name) $('#nginxModuleName').val(name);
      });
      // ─── DbMan saved queries ───
      function loadDbManSavedQueries() {
        $.get('/dbman/saved-queries', function (res) {
          if (res.code !== 0) return;
          var queries = res.data || [];
          var html = '';
          queries.forEach(function (q) {
            html += '<div class="p-1 mb-1" style="font-size:.75rem;background:var(--bs-tertiary-bg);border-radius:4px;cursor:pointer" data-sql="' + escHtml(q.sql_text) + '">' +
              '<div class="d-flex justify-content-between align-items-center">' +
              '<strong>' + escHtml(q.name) + '</strong>' +
              '<button class="btn btn-sm btn-outline-danger dbman-del-saved-query" data-id="' + q.id + '"><i class="bx bx-x"></i></button></div>' +
              '<small class="text-muted" style="font-size:.65rem">' + escHtml(q.db_type) + '</small></div>';
          });
          var lang = i18n[currentLang] || i18n.en;
          $('#dbmanSavedQueries').html(html || '<div class="text-muted p-2" style="font-size:.75rem">' + escHtml(lang.dbmanNoSavedQueries || 'No saved queries') + '</div>');
        });
      }
      $(document).on('click', '#dbmanSaveQueryBtn', function () {
        var sql = $('#dbmanSql').val().trim();
        if (!sql) { layer.msg('請輸入 SQL', { icon: 2 }); return; }
        var name = window.prompt('查詢名稱:');
        if (!name || !name.trim()) return;
        var dbType = dbmanCurrentConn ? dbmanCurrentConn.db_type || 'sqlite' : 'sqlite';
        $.post('/dbman/saved-queries', { name: name.trim(), sql_text: sql, db_type: dbType }, function (res) {
          if (res.code === 0) { layer.msg('已儲存', { icon: 1 }); loadDbManSavedQueries(); }
          else { layer.alert(res.msg); }
        });
      });
      $(document).on('click', '#dbmanSavedQueries [data-sql]', function () {
        $('#dbmanSql').val($(this).data('sql'));
      });
      $(document).on('click', '.dbman-del-saved-query', function (e) {
        e.stopPropagation();
        var id = $(this).data('id');
        $.ajax({ url: '/dbman/saved-queries/' + id, type: 'DELETE', dataType: 'json' })
          .done(function (r) { if (r.code === 0) loadDbManSavedQueries(); });
      });
      // ─── DbMan event handlers ───
      $(document).on('click', '#dbmanShowAddForm, #dbmanAddConnBtn', function () { showDbManConnForm(null); });
      $(document).on('click', '#dbmanQuickConnectLocal', function () {
        var conn = {
          id: 0, name: '本機資料庫 (firewall-man)', db_type: 'sqlite',
          file_path: 'firewall-man.sqlite3', host: null, port: null,
          username: null, password: null, database_name: null,
          trust_server_cert: false, created_at: '', updated_at: ''
        };
        dbmanCurrentConn = conn;
        $('#dbmanCurrentConnLabel').text('本機資料庫');
        $('#dbmanConnForm').hide();
        $('#dbmanConnView').show();
        loadDbManSchema(conn);
      });
      $('#dbmanFormCancelBtn').on('click', function () { $('#dbmanConnForm').hide(); });
      $('#dbmanFormType').on('change', function () {
        var t = $(this).val();
        if (t === 'sqlite') { $('#dbmanFormSqliteGroup').show(); $('#dbmanFormServerGroup').hide(); }
        else { $('#dbmanFormSqliteGroup').hide(); $('#dbmanFormServerGroup').show(); if (t === 'mysql' && !$('#dbmanFormPort').val()) $('#dbmanFormPort').val('3306'); if (t === 'sqlserver' && !$('#dbmanFormPort').val()) $('#dbmanFormPort').val('1433'); }
      });
      $('#dbmanFormTestBtn').on('click', function () {
        var data = {
          db_type: $('#dbmanFormType').val(),
          file_path: $('#dbmanFormFilePath').val().trim(),
          host: $('#dbmanFormHost').val().trim(),
          port: $('#dbmanFormPort').val(),
          username: $('#dbmanFormUser').val().trim(),
          password: $('#dbmanFormPass').val(),
          database_name: $('#dbmanFormDb').val().trim(),
          trust_server_cert: $('#dbmanFormTrustCert').is(':checked') ? '1' : '0'
        };
        logger.info('測試資料庫連線', data.db_type);
        $('#dbmanFormResult').html('<div class="text-muted">測試中...</div>');
        $.post('/dbman/test', data, function (res) {
          if (res.code === 0) {
            $('#dbmanFormResult').html('<div class="text-success">連線成功! 版本: ' + escHtml(res.data.version || '') + '</div>');
          } else {
            $('#dbmanFormResult').html('<div class="text-danger">' + escHtml(res.msg) + '</div>');
          }
        });
      });
      $('#dbmanFormSaveBtn').on('click', function () {
        var editId = $('#dbmanEditConnId').val();
        var data = {
          name: $('#dbmanFormName').val().trim(),
          db_type: $('#dbmanFormType').val(),
          file_path: $('#dbmanFormFilePath').val().trim(),
          host: $('#dbmanFormHost').val().trim(),
          port: $('#dbmanFormPort').val(),
          username: $('#dbmanFormUser').val().trim(),
          password: $('#dbmanFormPass').val(),
          database_name: $('#dbmanFormDb').val().trim(),
          trust_server_cert: $('#dbmanFormTrustCert').is(':checked') ? '1' : '0'
        };
        if (!data.name) { layer.msg('請輸入名稱', { icon: 2 }); return; }
        logger.info('儲存 DbMan 連線', data.name);
        $.post('/dbman/connections', data, function (res) {
          if (res.code === 0) { layer.msg('已儲存', { icon: 1 }); $('#dbmanConnForm').hide(); loadDbManConnections(); rebuildDbManMenu(); }
          else { layer.alert(res.msg); }
        });
      });
      $(document).on('click', '.dbman-del-conn', function (e) {
        e.stopPropagation();
        var id = $(this).data('id');
        if (!confirm('確認刪除此連線？')) return;
        $.ajax({ url: '/dbman/connections/' + id, type: 'DELETE', dataType: 'json' })
          .done(function (res) { if (res.code === 0) { loadDbManConnections(); rebuildDbManMenu(); } });
      });
      $(document).on('click', '.dbman-conn-item', function () {
        var conn = $(this).data('conn');
        if (!conn) return;
        dbmanCurrentConn = conn;
        $('#dbmanCurrentConnLabel').text(conn.name + ' (' + conn.db_type + ')');
        $('#dbmanConnForm').hide();
        $('#dbmanConnView').show();
        loadDbManSchema(conn);
       });
       $('#dbmanDisconnectBtn').on('click', function () { $('#dbmanConnView').hide(); $('#dbmanSchemaTree').hide().empty(); });
      $(document).on('click', '.dbman-tree-node', function (e) {
        e.preventDefault();
        var $node = $(this);
        var target = $node.attr('data-tree-target');
        if (!target) return;
        var open = $node.attr('data-open') === '1';
        var nextOpen = !open;
        $node.attr('data-open', nextOpen ? '1' : '0');
        $(target).toggle(nextOpen);
        $node.find('.dbman-tree-caret').first()
          .toggleClass('bx-chevron-down', nextOpen)
          .toggleClass('bx-chevron-right', !nextOpen);
        $node.find('.dbman-tree-folder').first()
          .toggleClass('bx-folder-open', nextOpen)
          .toggleClass('bx-folder', !nextOpen);
      });
      $(document).on('click', '.dbman-table-chip', function () {
        var table = decodeURIComponent($(this).attr('data-table') || '');
        if (!table || !dbmanCurrentConn) return;
        dbmanCurrentTable = table;
        var conn = dbmanCurrentConn;
        var sql = 'SELECT * FROM "' + table + '" LIMIT 100';
        $('#dbmanSql').val(sql);
        var data = { db_type: conn.db_type, file_path: conn.file_path || '', sql: sql };
        if (conn.db_type !== 'sqlite') {
          data.host = conn.host; data.port = conn.port;
          data.username = conn.username; data.password = conn.password;
          data.database_name = conn.database_name;
          data.trust_server_cert = conn.trust_server_cert ? '1' : '0';
        }
        $('#dbmanSqlResult').html('<div class="text-muted">查詢中...</div>');
        $.post('/dbman/query', data, function (res) {
          if (res.code !== 0) { $('#dbmanSqlResult').html('<div class="text-danger">' + escHtml(res.msg) + '</div>'); return; }
          renderDbManResult(res.data);
        });
      });
      var dbmanCurrentTable = null;
      $('#dbmanRunSql').on('click', function () {
        if (!dbmanCurrentConn) { layer.msg('請先連線資料庫', { icon: 2 }); return; }
        var conn = dbmanCurrentConn;
        var sqlRaw = $('#dbmanSql').val().trim();
        if (!sqlRaw) { layer.msg('請輸入 SQL', { icon: 2 }); return; }
        var data = { db_type: conn.db_type, file_path: conn.file_path || '', sql: sqlRaw };
        if (conn.db_type !== 'sqlite') {
          data.host = conn.host; data.port = conn.port;
          data.username = conn.username; data.password = conn.password;
          data.database_name = conn.database_name;
          data.trust_server_cert = conn.trust_server_cert ? '1' : '0';
        }
        logger.info('DbMan 執行 SQL', sqlRaw.substring(0, 100));
        $('#dbmanSqlResult').html('<div class="text-muted">執行中...</div>');
        // Support multiple statements separated by semicolons
        var statements = sqlRaw.split(';').map(function(s) { return s.trim(); }).filter(function(s) { return s.length > 0; });
        if (statements.length > 1) {
          // Execute each statement sequentially
          var resultHtml = '';
          function execNext(idx) {
            if (idx >= statements.length) {
              $('#dbmanSqlResult').html(resultHtml || '<div class="text-muted">全部執行完成</div>');
              return;
            }
            data.sql = statements[idx];
            resultHtml += '<div class="text-muted mt-1" style="font-size:.75rem">[' + (idx+1) + '] ' + escHtml(statements[idx].substring(0, 80)) + '...</div>';
            $.post('/dbman/query', data, function (res2) {
              if (res2.code === 0 && res2.data) {
                resultHtml += '<div class="text-success" style="font-size:.75rem">✓ ' + (res2.data.row_count || 0) + ' 筆</div>';
              } else {
                resultHtml += '<div class="text-danger" style="font-size:.75rem">✗ ' + escHtml(res2.msg || 'error') + '</div>';
              }
              execNext(idx + 1);
            });
          }
          execNext(0);
        } else {
          $.post('/dbman/query', data, function (res) {
            if (res.code !== 0) { $('#dbmanSqlResult').html('<div class="text-danger">' + escHtml(res.msg) + '</div>'); return; }
            renderDbManResult(res.data);
          });
        }
      });
      var dbManResultData = null;
      function dbManCsvExport() {
        if (!dbManResultData) return;
        var csv = dbManResultData.columns.join(',') + '\n';
        dbManResultData.rows.forEach(function (row) {
          csv += row.map(function (v) {
            if (v === null) return '';
            var s = String(v).replace(/"/g, '""');
            return '"' + s + '"';
          }).join(',') + '\n';
        });
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'query-result.csv'; a.click();
      }
      function dbmanSaveCell(table, colName, keyCol, keyVal, newVal, rowEl) {
        if (!dbmanCurrentConn) return;
        var conn = dbmanCurrentConn;
        var quotedTable = '"' + table + '"';
        var quotedKey = '"' + keyCol + '"';
        var quotedCol = '"' + colName + '"';
        var escapedVal = (typeof newVal === 'string') ? "'" + newVal.replace(/'/g, "''") + "'" : 'NULL';
        var escapedKey = (typeof keyVal === 'string') ? "'" + keyVal.replace(/'/g, "''") + "'" : (keyVal === null ? 'NULL' : keyVal);
        var sql = 'UPDATE ' + quotedTable + ' SET ' + quotedCol + ' = ' + escapedVal + ' WHERE ' + quotedKey + ' = ' + escapedKey;
        var data = { db_type: conn.db_type, file_path: conn.file_path || '', sql: sql };
        if (conn.db_type !== 'sqlite') {
          data.host = conn.host; data.port = conn.port; data.username = conn.username;
          data.password = conn.password; data.database_name = conn.database_name;
          data.trust_server_cert = conn.trust_server_cert ? '1' : '0';
        }
        $.post('/dbman/query', data, function (res) {
          if (res.code === 0) { $(rowEl).addClass('table-success').removeClass('table-warning'); }
          else { $(rowEl).addClass('table-danger'); layer.msg(res.msg, { icon: 2 }); }
        });
      }
      function renderDbManResult(data) {
        dbManResultData = data;
        if (!data || !data.columns || !data.columns.length) {
          $('#dbmanSqlResult').html('<div class="text-muted">查詢完成，0 筆資料</div>');
          return;
        }
        var table = dbmanCurrentTable || '';
        var html = '<div class="d-flex justify-content-between align-items-center mb-1" style="font-size:.75rem">' +
          '<span class="text-muted">回傳 ' + data.row_count + ' 筆 (' + data.elapsed_ms + 'ms)' + (table ? ' | 表: <code>' + escHtml(table) + '</code>' : '') + '</span>' +
          '<span><button class="btn btn-sm btn-outline-info dbman-edit-toggle me-1" title="啟用/停用行內編輯"><i class="bx bx-edit-alt"></i></button>' +
          '<button class="btn btn-sm btn-outline-success" onclick="dbManCsvExport()"><i class="bx bx-download me-1"></i>CSV</button></span></div>' +
          '<div class="table-responsive" style="max-height:350px;overflow:auto"><table class="table table-sm table-bordered mb-0 dbman-result-table" style="font-size:.75rem"><thead><tr>';
        data.columns.forEach(function (col, i) {
          html += '<th class="dbman-sort-col" data-col="' + i + '" style="cursor:pointer;user-select:none">' + escHtml(col) + ' <span class="sort-icon" style="font-size:.6rem;opacity:.4">&#9650;&#9660;</span></th>';
        });
        html += '</tr></thead><tbody>';
        data.rows.forEach(function (row, ri) {
          html += '<tr class="dbman-row" data-row="' + ri + '">';
          row.forEach(function (val, ci) {
            var display = (val === null ? '<span class="text-muted">NULL</span>' : escHtml(String(val)));
            html += '<td class="dbman-cell" data-row="' + ri + '" data-col="' + ci + '" data-val="' + (val === null ? '' : escHtml(String(val)).replace(/"/g, '&quot;')) + '">' + display + '</td>';
          });
          html += '</tr>';
        });
        html += '</tbody></table></div>';
        $('#dbmanSqlResult').html(html);
      }
      // Inline cell editing
      $(document).on('dblclick', '.dbman-cell', function () {
        if (!$('.dbman-edit-toggle').hasClass('active')) return;
        var $td = $(this);
        var currentVal = $td.data('val') || '';
        var $input = $('<input type="text" class="form-control form-control-sm font-monospace" style="height:24px;min-width:80px" value="' + escHtml(String(currentVal)).replace(/"/g, '&quot;') + '">');
        $td.html('').append($input);
        $input.focus().select();
        $input.on('blur', function () {
          var newVal = $(this).val();
          var $row = $td.closest('.dbman-row');
          var rowIdx = $row.data('row');
          var colIdx = $td.data('col');
          if (newVal !== currentVal && dbmanCurrentTable && dbManResultData && dbManResultData.columns) {
            var colName = dbManResultData.columns[colIdx];
            var keyVal = dbManResultData.rows[rowIdx][0]; // First col as key
            var keyCol = dbManResultData.columns[0];
            $row.addClass('table-warning');
            dbmanSaveCell(dbmanCurrentTable, colName, keyCol, keyVal, newVal, $row);
            dbManResultData.rows[rowIdx][colIdx] = newVal;
            $td.data('val', newVal);
          }
          $td.html(newVal === '' || newVal === null ? '<span class="text-muted">NULL</span>' : escHtml(String(newVal)));
        });
        $input.on('keydown', function (e) {
          if (e.key === 'Enter') { $(this).blur(); }
          if (e.key === 'Escape') { $td.html(currentVal === '' ? '<span class="text-muted">NULL</span>' : escHtml(currentVal)); }
        });
      });
      // Toggle edit mode
      $(document).on('click', '.dbman-edit-toggle', function () {
        $(this).toggleClass('active').toggleClass('btn-outline-info btn-info');
        layer.msg($(this).hasClass('active') ? '行內編輯已啟用 (雙擊儲存格)' : '行內編輯已停用', { icon: 1, time: 1200 });
      });
      // SQL editor expand/fullscreen
      $(document).on('click', '.dbman-sql-expand', function () {
        var $textarea = $('#dbmanSql');
        var $modal = $('<div class="dbman-sql-modal"><div class="modal-header"><strong>SQL 編輯器</strong><button class="btn btn-sm btn-outline-secondary dbman-sql-close">&times;</button></div><textarea class="font-monospace">' + escHtml($textarea.val()) + '</textarea><div class="modal-footer"><button class="btn btn-sm btn-primary dbman-sql-modal-run">執行 (Ctrl+Enter)</button></div></div>');
        $('body').append($modal);
        var $modalTextarea = $modal.find('textarea');
        $modalTextarea.focus();
        $modal.find('.dbman-sql-close').on('click', function () {
          $textarea.val($modalTextarea.val());
          $modal.remove();
        });
        $modal.find('.dbman-sql-modal-run').on('click', function () {
          $textarea.val($modalTextarea.val());
          $modal.remove();
          $('#dbmanRunSql').click();
        });
        $modalTextarea.on('keydown', function (e) {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            $modal.find('.dbman-sql-modal-run').click();
          }
          if (e.key === 'Escape') {
            $textarea.val($modalTextarea.val());
            $modal.remove();
          }
        });
      });
      // Sort by column click
      $(document).on('click', '.dbman-sort-col', function () {
        if (!dbManResultData) return;
        var col = parseInt($(this).data('col'));
        var ascending = $(this).hasClass('sorted-asc');
        // Remove existing sort indicators
        $('.dbman-sort-col').removeClass('sorted-asc sorted-desc').find('.sort-icon').html('&#9650;&#9660;');
        $(this).addClass(ascending ? 'sorted-desc' : 'sorted-asc');
        $(this).find('.sort-icon').html(ascending ? '&#9660;' : '&#9650;');
        // Sort data
        dbManResultData.rows.sort(function (a, b) {
          var va = a[col], vb = b[col];
          if (va === null && vb === null) return 0;
          if (va === null) return 1; if (vb === null) return -1;
          var sa = String(va), sb = String(vb);
          var na = parseFloat(sa), nb = parseFloat(sb);
          var cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : sa.localeCompare(sb);
          return ascending ? -cmp : cmp;
        });
        renderDbManResult(dbManResultData);
      });
      // ─── Security event handlers ───
      $('#secCvsPreviewBtn').on('click', function () {
        var url = $('#secCvsUrl').val().trim();
        if (!url) { layer.msg('請輸入 URL', { icon: 2 }); return; }
        var data = { url: url, table_name: $('#secCvsTable').val().trim(), delimiter: $('#secCvsDelimiter').val(), has_header: $('#secCvsHeader').is(':checked') ? '1' : '0' };
        logger.info('CVS 預覽', url);
        $('#secCvsResult').html('<div class="text-muted">下載中...</div>');
        $.post('/security/cvs/import', data, function (res) {
          if (res.code !== 0) { $('#secCvsResult').html('<div class="text-danger">' + escHtml(res.msg) + '</div>'); return; }
          var d = res.data;
          var html = '<div class="text-success mb-1">共 ' + d.row_count + ' 筆, ' + d.columns.length + ' 欄</div><div class="table-responsive" style="max-height:300px;overflow:auto"><table class="table table-sm table-bordered mb-0" style="font-size:.7rem"><thead><tr>';
          d.columns.forEach(function (c) { html += '<th>' + escHtml(c) + '</th>'; });
          html += '</tr></thead><tbody>';
          (d.preview || []).forEach(function (row) {
            html += '<tr>';
            row.forEach(function (v) { html += '<td>' + (v === null ? '<span class="text-muted">NULL</span>' : escHtml(String(v))) + '</td>'; });
            html += '</tr>';
          });
          html += '</tbody></table></div>';
          $('#secCvsResult').html(html);
        });
      });
      $('#secCvsImportBtn').on('click', function () {
        var url = $('#secCvsUrl').val().trim();
        if (!url) { layer.msg('請輸入 URL', { icon: 2 }); return; }
        var data = { url: url, table_name: $('#secCvsTable').val().trim(), delimiter: $('#secCvsDelimiter').val(), has_header: $('#secCvsHeader').is(':checked') ? '1' : '0' };
        logger.info('CVS 匯入', url);
        $('#secCvsResult').html('<div class="text-muted">下載並匯入中...</div>');
        $.post('/security/cvs/save', data, function (res) {
          if (res.code !== 0) { $('#secCvsResult').html('<div class="text-danger">' + escHtml(res.msg) + '</div>'); return; }
          var d = res.data;
          $('#secCvsResult').html('<div class="text-success">已匯入 ' + d.imported + ' 筆至資料表 ' + escHtml(d.table) + '</div>');
        });
      });
      $('#secCvsSaveSourceBtn').on('click', function () {
        var data = { name: $('#secCvsName').val().trim(), url: $('#secCvsUrl').val().trim(), table_name: $('#secCvsTable').val().trim(), delimiter: $('#secCvsDelimiter').val(), has_header: $('#secCvsHeader').is(':checked') ? '1' : '0' };
        if (!data.name || !data.url) { layer.msg('請輸入名稱和 URL', { icon: 2 }); return; }
        $.post('/security/cvs/sources', data, function (res) {
          if (res.code === 0) { layer.msg('已儲存', { icon: 1 }); loadSecurityCvsSources(); }
          else { layer.alert(res.msg); }
        });
      });
      $(document).on('click', '.security-del-cvs', function () {
        var id = $(this).data('id');
        if (!confirm('確認刪除？')) return;
        $.ajax({ url: '/security/cvs/sources/' + id, type: 'DELETE', dataType: 'json' }).done(function (r) { if (r.code === 0) { loadSecurityCvsSources(); } });
      });
      $('#secCvsRefreshSources').on('click', loadSecurityCvsSources);
      // Scan
      $('#secScanCreateBtn').on('click', function () {
        var name = $('#secScanName').val().trim();
        var target = $('#secScanTarget').val().trim();
        var ports = $('#secScanPorts').val().trim();
        var scanType = $('#secScanType').val();
        if (!name || !target) { layer.msg('請輸入名稱和目標', { icon: 2 }); return; }
        logger.info('建立掃描任務', name + ' -> ' + target);
        $('#secScanResult').html('<div class="text-muted">建立中...</div>');
        $.post('/security/scan/tasks', { name: name, target: target, ports: ports, scan_type: scanType }, function (res) {
          if (res.code !== 0) { $('#secScanResult').html('<div class="text-danger">' + escHtml(res.msg) + '</div>'); return; }
          var taskId = res.data.id;
          $('#secScanResult').html('<div class="text-muted">掃描中...</div>');
          $.post('/security/scan/tasks/' + taskId + '/run', {}, function (res2) {
            if (res2.code !== 0) { $('#secScanResult').html('<div class="text-danger">' + escHtml(res2.msg) + '</div>'); return; }
            var summary = res2.data.summary || '';
            var results = res2.data.results || [];
            var openResults = results.filter(function (r) { return r.state === 'open'; });
            var html = '<div class="text-success mb-1">掃描完成！摘要: ' + escHtml(summary) + '</div>';
            if (openResults.length) {
              html += '<div class="table-responsive" style="max-height:300px;overflow:auto"><table class="table table-sm table-bordered mb-0" style="font-size:.7rem"><thead><tr><th>IP</th><th>Port</th><th>Service</th><th>Banner</th></tr></thead><tbody>';
              openResults.forEach(function (r) {
                html += '<tr><td><code>' + escHtml(r.ip) + '</code></td><td>' + r.port + '</td><td>' + escHtml(r.service || '-') + '</td><td>' + escHtml((r.banner || '').substring(0, 80)) + '</td></tr>';
              });
              html += '</tbody></table></div>';
            }
            $('#secScanResult').html(html);
            loadSecurityScanTasks();
          });
        });
      });
      $(document).on('dblclick', '.dbman-conn-item', function () {
        var conn = $(this).data('conn');
        if (conn) showDbManConnForm(conn);
      });
      $(document).on('click', '.security-view-results', function () {
        var id = $(this).data('id');
        $.get('/security/scan/tasks/' + id + '/results', function (res) {
          if (res.code !== 0) return;
          var results = res.data || [];
          var html = '<div class="table-responsive"><table class="table table-sm table-bordered mb-0" style="font-size:.7rem"><thead><tr><th>IP</th><th>Port</th><th>Protocol</th><th>Service</th><th>State</th><th>Banner</th></tr></thead><tbody>';
          results.forEach(function (r) {
            var stateCls = r.state === 'open' ? 'text-success' : r.state === 'filtered' ? 'text-warning' : 'text-muted';
            html += '<tr><td><code>' + escHtml(r.ip) + '</code></td><td>' + r.port + '</td><td>' + r.protocol + '</td><td>' + escHtml(r.service || '-') + '</td><td class="' + stateCls + ' fw-bold">' + r.state + '</td><td>' + escHtml((r.banner || '').substring(0, 100)) + '</td></tr>';
          });
          html += '</tbody></table></div>';
          var exportBtn = '<a href="/security/scan/tasks/' + id + '/export" class="btn btn-sm btn-outline-success mt-2 me-2" target="_blank"><i class="bx bx-download me-1"></i>匯出 CSV</a>';
          var correlateBtn = '<button class="btn btn-sm btn-outline-warning mt-2 security-correlate-threats" data-task-id="' + id + '"><i class="bx bx-shield me-1"></i>比對威脅情資</button>';
          layer.open({ title: '掃描結果', content: exportBtn + correlateBtn + html, area: ['860px', '70vh'], btn: ['OK'] });
        });
      });
      $(document).on('click', '.security-correlate-threats', function () {
        var taskId = $(this).data('task-id');
        var btn = $(this).prop('disabled', true).html('<span class="spinner-border spinner-border-sm me-1"></span>比對中...');
        $.get('/security/scan/tasks/' + taskId + '/correlate', function (res) {
          btn.remove();
          if (res.code !== 0) { layer.msg(res.msg, { icon: 2 }); return; }
          var matches = res.data || [];
          if (!matches.length) { layer.msg('無相符威脅情資', { icon: 1 }); return; }
          var html = '<div class="table-responsive"><table class="table table-sm table-bordered mb-0" style="font-size:.75rem"><thead><tr><th>IP</th><th>Port</th><th>Service</th><th>比對來源</th></tr></thead><tbody>';
          matches.forEach(function (m) {
            html += '<tr><td><code>' + escHtml(m.ip) + '</code></td><td>' + m.port + '</td><td>' + escHtml(m.service || '-') + '</td><td><span class="badge bg-label-danger">' + escHtml((m.matched_sources || []).join(', ')) + '</span></td></tr>';
          });
          html += '</tbody></table></div>';
          layer.open({ title: '威脅情資比對結果 (' + matches.length + ' 項)', content: html, area: ['700px', '60vh'], btn: ['OK'] });
        });
      });
      $(document).on('click', '.security-del-task', function () {
        var id = $(this).data('id'); if (!confirm('確認刪除？')) return;
        $.ajax({ url: '/security/scan/tasks/' + id, type: 'DELETE', dataType: 'json' }).done(function (r) { if (r.code === 0) loadSecurityScanTasks(); });
      });
      $('#secScanRefreshTasks').on('click', loadSecurityScanTasks);
      $(document).on('shown.bs.tab', '#securityTabs .nav-link', function () {
        if ($(this).attr('data-bs-target') === '#securityCvsPane') loadSecurityCvsSources();
        if ($(this).attr('data-bs-target') === '#securityScanPane') loadSecurityScanTasks();
      });
      // ─── ApiMan event handlers ───
      $(document).on('click', '#apimanCreateFirstWs', function () {
        openApiManWorkspaceDialog();
      });
      $(document).on('click', '.apiman-del-ws', function () {
        var id = $(this).data('id');
        if (!confirm('確認刪除此工作區及所有內容？')) return;
        $.ajax({ url: apimanUrl('/workspaces/' + id), type: 'DELETE', dataType: 'json' })
          .done(function (res) { if (res.code === 0) { refreshApiManWorkspaceLists(); layer.msg('已刪除', { icon: 1 }); } });
      });
      $(document).on('click', '.apiman-ws-item', function () {
        var wsId = $(this).data('ws-id');
        var name = $(this).find('strong').text();
        $('#apimanCurrentWsLabel').text(name);
        renderApiManTreeForWs(wsId);
      });
      $(document).on('click', '.apiman-back-ws', function () { apimanCurrentWsId = null; renderApiManTree(); });
      $(document).on('click', '.apiman-menu-ws-link', function (e) {
        e.preventDefault();
        var wsId = $(this).data('ws-id');
        switchView('apiman');
        renderApiManTreeForWs(wsId);
      });
      // ─── ApiMan export/import ───
      $(document).on('click', '.apiman-export-ws', function () {
        var wsId = $(this).data('ws');
        $.get('/apiman/workspaces/export/' + wsId, function (res) {
          if (res.code !== 0) { layer.alert(res.msg); return; }
          var json = JSON.stringify(res.data, null, 2);
          copyText($, json);
          layer.open({
            title: '匯出工作區',
            content: '<pre class="modal-pre">' + escHtml(json.substring(0, 2000)) + (json.length > 2000 ? '\n... (已複製至剪貼簿)' : '') + '</pre>',
            btn: ['下載 JSON', '確定'],
            btn1: function () {
              var blob = new Blob([json], { type: 'application/json' });
              var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'workspace.json'; a.click();
              _hideModal();
            },
            btn2: function () { _hideModal(); }
          });
          logger.debug('ApiMan workspace exported', wsId);
        });
      });
      $(document).on('click', '#apimanImportBtn', function () {
        var input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
        input.onchange = function (e) {
          var file = e.target.files[0]; if (!file) return;
          var reader = new FileReader();
          reader.onload = function (ev) {
            var data = ev.target.result;
            $.post('/apiman/workspaces/import', { data: data }, function (res) {
              if (res.code === 0) { layer.msg('工作區已匯入', { icon: 1 }); refreshApiManWorkspaceLists(); }
              else { layer.alert(res.msg); }
            });
          };
          reader.readAsText(file);
        };
        input.click();
      });
      // ─── ApiMan Auth toggle ───
      $('#apimanAuthType').on('change', function () {
        var t = $(this).val();
        $('#apimanAuthBadge').text(t === 'none' ? 'none' : t).removeClass('bg-label-secondary bg-label-warning bg-label-info bg-label-primary')
          .addClass(t === 'none' ? 'bg-label-secondary' : 'bg-label-warning');
        $('#apimanAuthBasic,#apimanAuthBearer,#apimanAuthApiKey').hide();
        if (t === 'basic') $('#apimanAuthBasic').show();
        if (t === 'bearer') $('#apimanAuthBearer').show();
        if (t === 'apikey') $('#apimanAuthApiKey').show();
      });
      // ─── ApiMan variable event handlers ───
      $(document).on('click', '#apimanAddVar', function () {
        $('#apimanVarsList').append(
          '<div class="row g-1 mb-1 apiman-var-row">' +
          '<div class="col-1"><input type="checkbox" class="form-check-input apiman-var-enabled" checked></div>' +
          '<div class="col-4"><input type="text" class="form-control form-control-sm font-monospace apiman-var-key" placeholder="Key"></div>' +
          '<div class="col-5"><input type="text" class="form-control form-control-sm font-monospace apiman-var-value" placeholder="Value"></div>' +
          '<div class="col-2"><button class="btn btn-sm btn-outline-danger apiman-var-del"><i class="bx bx-x"></i></button></div></div>'
        );
      });
      $(document).on('click', '.apiman-var-del', function () {
        var key = $(this).data('key');
        if (key && apimanCurrentWsId) {
          $.ajax({ url: apimanUrl('/variables/' + apimanCurrentWsId + '/' + encodeURIComponent(key)), type: 'DELETE', dataType: 'json' })
            .done(function () { loadApiManVars(); });
        } else {
          $(this).closest('.apiman-var-row').remove();
        }
      });
      $('#apimanSaveVars').on('click', function () {
        if (!apimanCurrentWsId) { layer.msg('請先選擇工作區', { icon: 2 }); return; }
        var rows = $('.apiman-var-row');
        var count = 0;
        rows.each(function () {
          var key = $(this).find('.apiman-var-key').val().trim();
          if (!key) return;
          var value = $(this).find('.apiman-var-value').val();
          var enabled = $(this).find('.apiman-var-enabled').is(':checked') ? '1' : '0';
          $.ajax({
            url: apimanUrl('/variables/' + apimanCurrentWsId),
            type: 'POST',
            data: { key: key, value: value, enabled: enabled },
            dataType: 'json',
            async: false
          });
          count++;
        });
        loadApiManVars();
        layer.msg('已儲存 ' + count + ' 個變數', { icon: 1 });
        logger.debug('ApiMan 變數已儲存', count + ' vars');
      });
      // ─── ApiMan click variable hint to insert into URL ───
      $(document).on('click', '.apiman-var-insert', function () {
        var key = $(this).data('key');
        var input = document.getElementById('apimanUrl');
        var start = input.selectionStart || 0;
        var val = input.value;
        input.value = val.substring(0, start) + '{{' + key + '}}' + val.substring(input.selectionEnd || start);
        input.focus();
        var pos = start + key.length + 4;
        input.setSelectionRange(pos, pos);
      });
      // ─── ApiMan inline rename (double-click to rename folders) ───
      $(document).on('dblclick', '.apiman-folder-header > span', function () {
        var $item = $(this).closest('[data-node-id]');
        var nodeId = $item.data('node-id');
        var currentText = $(this).text().trim();
        var $input = $('<input type="text" class="form-control form-control-sm font-monospace" style="height:24px;font-size:.8125rem;width:140px;display:inline-block" value="' + escHtml(currentText) + '">');
        var $span = $(this);
        $input.on('blur', function () {
          var newName = $(this).val().trim();
          if (newName && newName !== currentText) {
            $.ajax({ url: '/apiman/nodes/' + nodeId, type: 'PUT', data: { name: newName }, dataType: 'json' })
              .done(function (res) { if (res.code === 0) { var wsId = $('.apiman-add-req').data('ws'); if (wsId) renderApiManTreeForWs(wsId); } });
          } else {
            $span.text(currentText);
          }
        });
        $input.on('keydown', function (e) {
          if (e.key === 'Enter') { $(this).blur(); }
          if (e.key === 'Escape') { $span.text(currentText); $(this).remove(); }
        });
        $span.empty().append($input);
        $input.focus().select();
      });
      // ─── ApiMan drag & drop ───
      $(document).on('dragstart', '.apiman-folder-header, .apiman-req-item', function (e) {
        apimanDragNodeId = $(this).closest('[data-node-id]').data('node-id');
        e.originalEvent.dataTransfer.effectAllowed = 'move';
        e.originalEvent.dataTransfer.setData('text/plain', String(apimanDragNodeId));
        $(this).closest('[data-node-id]').css('opacity', '0.4');
      });
      $(document).on('dragend', '.apiman-folder-header, .apiman-req-item', function () {
        $('[data-node-id]').css('opacity', '');
        $('.apiman-drop-zone').css({'background':'','outline':''});
        apimanDragNodeId = null;
      });
      $(document).on('dragover', '.apiman-drop-zone, .apiman-folder-header, .apiman-req-item', function (e) {
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'move';
        var $target = $(this).closest('.apiman-drop-zone').length ? $(this).closest('.apiman-drop-zone') : $(this);
        $target.css({'background':'rgba(13,110,253,0.08)','outline':'2px dashed #0d6efd'});
      });
      $(document).on('dragleave', '.apiman-drop-zone, .apiman-folder-header, .apiman-req-item', function () {
        $(this).closest('.apiman-drop-zone').css({'background':'','outline':''});
      });
      $(document).on('drop', '.apiman-drop-zone, .apiman-folder-header, .apiman-req-item', function (e) {
        e.preventDefault();
        $('.apiman-drop-zone').css({'background':'','outline':''});
        var draggedId = apimanDragNodeId;
        if (!draggedId) return;
        // Determine target parent
        var $zone = $(this).closest('.apiman-drop-zone');
        var newParentId = $zone.data('parent-id') || null;
        if (newParentId && newParentId == draggedId) return; // Can't drop on self
        // Get workspace id from the add-req button
        var wsId = $('.apiman-add-req').data('ws');
        if (!wsId) return;
        logger.info('ApiMan 移動節點', 'node=' + draggedId + ' -> parent=' + newParentId);
        $.post('/apiman/nodes/' + draggedId + '/move', { parent_id: newParentId || '', sort_order: 0 }, function (res) {
          if (res.code === 0) { renderApiManTreeForWs(wsId); }
          else { layer.alert(res.msg); }
        });
        apimanDragNodeId = null;
      });
      $(document).on('click', '.apiman-folder-header', function (e) {
        if ($(e.target).closest('button,input,textarea,.apiman-del-node,.apiman-copy-node').length) return;
        var nodeId = $(this).data('node-id');
        if (!nodeId) return;
        apimanExpanded[nodeId] = !(apimanExpanded[nodeId] !== false);
        var $parent = $(this).closest('.apiman-folder-item');
        $parent.find('.apiman-children').toggleClass('d-none');
        var isOpen = !$parent.find('.apiman-children').hasClass('d-none');
        $parent.find('.apiman-fold-toggle').text(isOpen ? '▾' : '▸');
        $parent.find('.apiman-folder-icon').toggleClass('bx-folder bx-folder-open');
      });
      $(document).on('click', '.apiman-add-folder', function () {
        var wsId = $(this).data('ws');
        var name = window.prompt('資料夾名稱:');
        if (name && name.trim()) {
          $.post(apimanUrl('/nodes'), { workspace_id: wsId, name: name.trim(), node_type: 'folder' }, function (res) {
            if (res.code === 0) { renderApiManTreeForWs(wsId); }
            else { layer.alert(res.msg); }
          });
        }
      });
      $(document).on('click', '.apiman-add-req', function () {
        var wsId = $(this).data('ws');
        var name = window.prompt('Request 名稱:');
        if (name && name.trim()) {
          $.post(apimanUrl('/nodes'), { workspace_id: wsId, name: name.trim(), node_type: 'request' }, function (res) {
            if (res.code === 0) { renderApiManTreeForWs(wsId); }
            else { layer.alert(res.msg); }
          });
        }
      });
      $(document).on('click', '.apiman-req-item', function () {
        var nodeId = $(this).data('node-id');
        loadApiManRequest(nodeId);
      });
      $(document).on('click', '.apiman-copy-node', function (e) {
        e.stopPropagation();
        var id = $(this).data('id');
        $.post(apimanUrl('/nodes/' + id + '/copy'), {}, function (res) {
          if (res.code === 0) {
            var wsId = $('.apiman-add-req').data('ws');
            if (wsId) renderApiManTreeForWs(wsId);
            layer.msg('已複製', { icon: 1 });
          } else { layer.alert(res.msg); }
        });
      });
      $(document).on('click', '.apiman-del-node', function (e) {
        e.stopPropagation();
        var id = $(this).data('id');
        if (!confirm('確認刪除？')) return;
        $.ajax({ url: apimanUrl('/nodes/' + id), type: 'DELETE', dataType: 'json' })
          .done(function (res) { if (res.code === 0) { if (apimanCurrentNodeId === id) { $('#apimanRequestCard').hide(); $('#apimanEmptyState').show(); } renderApiManTreeForWs($('.apiman-add-req').data('ws')); } });
      });
      $(document).on('click', '#apimanAddParam', function () { addApiManKvRow('#apimanParamsList', 'apimanParam'); });
      $(document).on('click', '#apimanAddHeader', function () { addApiManKvRow('#apimanHeadersList', 'apimanHeader'); });
      function addApiManKvRow(containerId, prefix) {
        $(containerId).append(
          '<div class="row g-1 mb-1 apiman-kv-row">' +
          '<div class="col-1"><input type="checkbox" class="form-check-input apiman-kv-enabled" checked></div>' +
          '<div class="col-4"><input type="text" class="form-control form-control-sm font-monospace apiman-kv-key" placeholder="Key"></div>' +
          '<div class="col-5"><input type="text" class="form-control form-control-sm font-monospace apiman-kv-value" placeholder="Value"></div>' +
          '<div class="col-2"><button class="btn btn-sm btn-outline-danger apiman-kv-del"><i class="bx bx-x"></i></button></div></div>'
        );
      }
      $(document).on('click', '.apiman-kv-del', function () { $(this).closest('.apiman-kv-row').remove(); });
      $('#apimanHistoryBtn').on('click', function () { if (apimanCurrentNodeId) loadApiManHistory(apimanCurrentNodeId); });
      $(document).on('click', '.apiman-view-history', function () {
        try {
          var data = JSON.parse($(this).data('body'));
          var html = '<div class="mb-1"><strong>Status:</strong> ' + data.status + '</div>' +
            (data.headers ? '<div class="mb-1"><strong>Headers:</strong><pre style="font-size:.7rem;max-height:150px;overflow:auto">' + escHtml(data.headers) + '</pre></div>' : '') +
            (data.body ? '<div><strong>Body:</strong><pre style="font-size:.7rem;max-height:300px;overflow:auto">' + escHtml(data.body) + '</pre></div>' : '');
          layer.open({ title: 'Response #' + data.id, content: html, area: ['700px', '70vh'], btn: ['OK'] });
        } catch(e) { layer.msg('Error loading response'); }
      });
      $('#apimanSaveReqBtn').on('click', function () {
        var nodeId = apimanCurrentNodeId;
        if (!nodeId) return;
        var data = {
          method: $('#apimanMethod').val(),
          url: $('#apimanUrl').val().trim(),
          query_params: collectApiManKv('apimanParam'),
          headers: collectApiManKv('apimanHeader'),
          body_type: $('#apimanBodyType').val(),
          body_content: $('#apimanBody').val(),
          auth_config: collectApiManAuth()
        };
        logger.info('儲存 ApiMan Request', data.method + ' ' + data.url);
        $.ajax({ url: apimanUrl('/requests/' + nodeId), type: 'PUT', data: data, dataType: 'json' })
          .done(function (res) { if (res.code === 0) { layer.msg('已儲存', { icon: 1 }); } else { layer.alert(res.msg); } });
      });
      $('#apimanSendBtn').on('click', function () {
        var nodeId = apimanCurrentNodeId;
        if (!nodeId) return;
        var data = {
          method: $('#apimanMethod').val(),
          url: $('#apimanUrl').val().trim(),
          query_params: collectApiManKv('apimanParam'),
          headers: collectApiManKv('apimanHeader'),
          body_type: $('#apimanBodyType').val(),
          body_content: $('#apimanBody').val(),
          auth_config: collectApiManAuth()
        };
        // Save first, then send
        $.ajax({ url: apimanUrl('/requests/' + nodeId), type: 'PUT', data: data, dataType: 'json' })
          .done(function () {
            logger.info('送出 ApiMan Request', data.method + ' ' + data.url);
            $('#apimanResponse').html('<div class="text-muted">發送中...</div>');
            $.post(apimanUrl('/requests/' + nodeId + '/send'), {}, function (res) {
              if (res.code !== 0) { $('#apimanResponse').html('<pre class="text-danger p-2" style="font-size:.75rem">' + escHtml(res.msg) + '</pre>'); return; }
              var r = res.data;
              var statusCls = r.status >= 200 && r.status < 300 ? 'text-success' : r.status >= 400 ? 'text-danger' : 'text-warning';
              var html = '<div class="border rounded p-2 mt-2" style="font-size:.75rem;background:var(--bs-tertiary-bg)">' +
                '<div class="mb-1"><strong>Status: </strong><span class="' + statusCls + ' fw-bold">' + (r.status || '?') + '</span></div>' +
                (r.headers ? '<div class="mb-1"><strong>Headers:</strong><pre style="font-size:.6875rem;max-height:150px;overflow:auto">' + escHtml(r.headers) + '</pre></div>' : '') +
                (r.body ? '<div><strong>Body:</strong><pre style="font-size:.6875rem;max-height:300px;overflow:auto">' + escHtml(r.body) + '</pre></div>' : '') +
                '</div>';
              $('#apimanResponse').html(html);
              logger.debug('ApiMan Response', 'Status=' + r.status);
            });
          });
      });
      // ─── Log Viewer ───
      var logRefreshTimer = null;
      var logCurrentPath = null;
      function loadLogFiles() {
        $.get('/tools/log/list', function (res) {
          if (res.code !== 0) {
            logger.warn('日誌列表載入失敗', res.msg);
            return;
          }
          var files = res.data || [];
          var select = $('#toolsLogSelect').empty().append('<option value="">-- 自訂路徑 --</option>');
          files.forEach(function (f) {
            select.append('<option value="' + escHtml(f) + '">' + escHtml(f) + '</option>');
          });
          logger.debug('日誌列表已載入', files.length + ' 個檔案');
        }).fail(function (xhr) {
          logger.error('日誌列表 API 請求失敗', xhr.status + ' ' + xhr.statusText);
        });
      }
      function doLogTail() {
        var path = $('#toolsLogSelect').val() || $('#toolsLogPath').val().trim();
        if (!path) { layer.msg('請選擇或輸入日誌檔案路徑', { icon: 2 }); return; }
        var lines = $('#toolsLogLines').val() || 50;
        logCurrentPath = path;
        $('#toolsLogStatus').text('載入中...');
        logger.info('Log Tail 請求', path + ' (' + lines + ' 行)');
        $.post('/tools/log/tail', { path: path, lines: lines }, function (res) {
          if (res.code !== 0) {
            $('#toolsLogOutput').text('錯誤: ' + (res.msg || '?'));
            $('#toolsLogStatus').text('失敗');
            logger.error('Log Tail 錯誤', res.msg);
            return;
          }
          $('#toolsLogOutput').text(res.data.content || '（空）');
          $('#toolsLogStatus').text('行數: ' + (res.data.lines || 0) + ' | ' + res.data.path);
          logger.debug('Log Tail 完成', res.data.lines + ' 行');
          // Auto-scroll to bottom
          var out = document.getElementById('toolsLogOutput');
          if (out) out.scrollTop = out.scrollHeight;
        }).fail(function (xhr) {
          $('#toolsLogOutput').text('HTTP 錯誤: ' + xhr.status);
          $('#toolsLogStatus').text('請求失敗');
          logger.error('Log Tail HTTP 失敗', xhr.status + ' ' + xhr.statusText);
        });
      }
      function startLogRefresh() {
        stopLogRefresh();
        if (!logCurrentPath) return;
        logRefreshTimer = setInterval(function () {
          $.post('/tools/log/tail', { path: logCurrentPath, lines: $('#toolsLogLines').val() || 50 }, function (res) {
            if (res.code === 0) {
              var autoScroll = false;
              var out = document.getElementById('toolsLogOutput');
              if (out && out.scrollTop + out.clientHeight >= out.scrollHeight - 20) autoScroll = true;
              $('#toolsLogOutput').text(res.data.content || '（空）');
              if (autoScroll) out.scrollTop = out.scrollHeight;
              $('#toolsLogStatus').text('行數: ' + (res.data.lines || 0) + ' | ' + res.data.path + ' (自動更新中)');
            }
          });
        }, 3000);
        $('#toolsLogStatus').text($('#toolsLogStatus').text() + ' (自動更新中)');
      }
      function stopLogRefresh() {
        if (logRefreshTimer) { clearInterval(logRefreshTimer); logRefreshTimer = null; }
      }
      $('#toolsLogTailBtn').on('click', function () {
        doLogTail();
        if ($('#toolsLogAutoRefresh').is(':checked')) startLogRefresh();
      });
      $('#toolsLogAutoRefresh').on('change', function () {
        if ($(this).is(':checked')) { if (logCurrentPath) startLogRefresh(); }
        else { stopLogRefresh(); }
      });
      $('#toolsLogSelect').on('change', function () {
        var val = $(this).val();
        if (val) $('#toolsLogPath').val(val);
      });
      $('#toolsLogClearBtn').on('click', function () {
        $('#toolsLogOutput').text('');
        $('#toolsLogStatus').text('');
        stopLogRefresh();
        logCurrentPath = null;
      });
      // Load log files when Log tab is shown
      $(document).on('shown.bs.tab', '#tools-log-tab', function () {
        loadLogFiles();
        stopLogRefresh();
      });
      // ─── Tools event handlers ───
      function toolsRun(endpoint, data, outputId) {
        var $out = $(outputId);
        $out.text('執行中...');
        var base = '/tools';
        $.post(base + '/' + endpoint, data, function (res) {
          var text = res.output || res.error || JSON.stringify(res, null, 2);
          $out.text(text);
          logger.debug('工具執行結果: ' + endpoint, text.substring(0, 200));
        }, 'json').fail(function (xhr) {
          $out.text('請求失敗: ' + (xhr.responseText || xhr.statusText));
        });
      }
      $('#toolsPingBtn').on('click', function () {
        var host = $('#toolsPingHost').val().trim();
        if (!host) { layer.msg('請輸入目標主機', { icon: 2 }); return; }
        toolsRun('ping', { host: host, count: $('#toolsPingCount').val(), timeout: $('#toolsPingTimeout').val() }, '#toolsPingOutput');
      });
      $('#toolsPingCBtn').on('click', function () {
        var network = $('#toolsPingCNetwork').val().trim();
        if (!network) { layer.msg('請輸入 Class C 網路 (如 192.168.1)', { icon: 2 }); return; }
        // Strip trailing .0
        network = network.replace(/\.0$/, '');
        var $tbody = $('#toolsPingCTbody').empty();
        var $status = $('#toolsPingCStatus').text('掃描中... 254 個 IP');
        $('#toolsPingCBtn').prop('disabled', true);
        logger.info('Ping Class C 開始', network);
        $.post('/tools/ping-classc', { network: network }, function (res) {
          if (res.code !== 0) { $status.text('錯誤: ' + (res.msg || '')); $('#toolsPingCBtn').prop('disabled', false); return; }
          var data = res.data;
          var results = data.results || [];
          results.forEach(function (r, i) {
            var reachable = r.reachable;
            var cls = reachable ? 'text-success' : 'text-muted';
            var label = reachable ? '<span class="badge bg-label-success">通</span>' : '<span class="badge bg-label-secondary">沒通</span>';
            var elapsed = r.elapsed_ms || '-';
            $tbody.append('<tr class="' + cls + '"><td>' + (i+1) + '</td><td><code>' + escHtml(r.ip) + '</code></td><td>' + label + '</td><td>' + elapsed + '</td></tr>');
          });
          $status.text('完成: ' + data.reachable + '/' + data.total + ' 通');
          logger.info('Ping Class C 完成', network + ' → ' + data.reachable + '/' + data.total);
          $('#toolsPingCBtn').prop('disabled', false);
        }).fail(function (xhr) {
          $status.text('請求失敗');
          $('#toolsPingCBtn').prop('disabled', false);
        });
      });
      $('#toolsLsofBtn').on('click', function () {
        toolsRun('lsof', { port: $('#toolsLsofPort').val() || '', protocol: $('#toolsLsofProtocol').val() }, '#toolsLsofOutput');
      });
      $('#toolsTracerouteBtn').on('click', function () {
        var host = $('#toolsTraceHost').val().trim();
        if (!host) { layer.msg('請輸入目標主機', { icon: 2 }); return; }
        toolsRun('traceroute', { host: host, max_hops: $('#toolsTraceHops').val() }, '#toolsTracerouteOutput');
      });
      $('#toolsNslookupBtn').on('click', function () {
        var domain = $('#toolsNslookupDomain').val().trim();
        if (!domain) { layer.msg('請輸入網域名稱', { icon: 2 }); return; }
        toolsRun('nslookup', { domain: domain, dns_server: $('#toolsNslookupDns').val().trim() || '' }, '#toolsNslookupOutput');
      });
      $('#toolsIpLocBtn').on('click', function () {
        var ip = $('#toolsIpLocIp').val().trim();
        var base = '/tools';
        $.post(base + '/ip-location', { ip: ip || '' }, function (res) {
          if (res.data) {
            var d = res.data;
            var status = d.status === 'success' ? '<span class="badge bg-label-success">成功</span>' : '<span class="badge bg-label-danger">失敗</span>';
            $('#toolsIpLocResult').html(
              '<div class="card"><div class="card-body p-3">' +
                '<div class="row g-2">' +
                  '<div class="col-12">狀態: ' + status + '</div>' +
                  (d.country ? '<div class="col-md-4"><strong>國家</strong><br>' + d.country + '</div>' : '') +
                  (d.regionName ? '<div class="col-md-4"><strong>區域</strong><br>' + d.regionName + '</div>' : '') +
                  (d.city ? '<div class="col-md-4"><strong>城市</strong><br>' + d.city + '</div>' : '') +
                  (d.isp ? '<div class="col-md-4"><strong>ISP</strong><br>' + d.isp + '</div>' : '') +
                  (d.org ? '<div class="col-md-4"><strong>組織</strong><br>' + d.org + '</div>' : '') +
                  (d.as ? '<div class="col-md-4"><strong>AS</strong><br>' + d.as + '</div>' : '') +
                  (d.query ? '<div class="col-md-4"><strong>查詢 IP</strong><br><code>' + d.query + '</code></div>' : '') +
                '</div>' +
              '</div></div>'
            );
          } else {
            $('#toolsIpLocResult').html('<pre class="tools-output" style="font-size:.75rem;background:var(--bs-tertiary-bg);padding:.5rem;border-radius:4px">' + escHtml(res.error || JSON.stringify(res, null, 2)) + '</pre>');
          }
          logger.debug('IP 位置查詢結果', JSON.stringify(res.data || res));
        }, 'json');
      });
      $('#toolsNetstatBtn').on('click', function () {
        var $out = $('#toolsNetstatOutput');
        $out.text('執行中...');
        $.post('/tools/netstat', {}, function (res) {
          var text = res.output || res.error || JSON.stringify(res, null, 2);
          $out.text(text);
          if (res.command) $('.tools-netstat-cmd-badge').text('命令: ' + res.command);
          logger.debug('Netstat 執行結果', (res.command || '') + ' ' + text.substring(0, 200));
        }, 'json');
      });
      // ─── PCAP ───
      function pcapLoadInterfaces() {
        $.get('/tools/pcap/interfaces', function (res) {
          if (res.code !== 0) return;
          var $sel = $('#toolsPcapInterface').empty().append('<option value="">-- 選擇介面 --</option>');
          (res.data || []).forEach(function (iface) {
            $sel.append('<option value="' + iface.name + '">' + iface.name + (iface.description ? ' (' + iface.description + ')' : '') + '</option>');
          });
        });
      }
      var pcapPackets = [];
      $('#toolsPcapStartBtn').on('click', function () {
        var iface = $('#toolsPcapInterface').val();
        if (!iface) { layer.msg('請選擇網路介面', { icon: 2 }); return; }
        var filter = $('#toolsPcapFilter').val().trim();
        var count = parseInt($('#toolsPcapCount').val()) || 50;
        var timeout = parseInt($('#toolsPcapTimeout').val()) || 10;
        $('#toolsPcapStatus').text('擷取中...').removeClass('text-muted').addClass('text-primary');
        $('#toolsPcapStartBtn').prop('disabled', true);
        $('#toolsPcapTbody').empty();
        $('#toolsPcapHex').hide().text('');
        pcapPackets = [];
        $.post('/tools/pcap/capture', { interface: iface, filter: filter, count: count, timeout: timeout }, function (res) {
          $('#toolsPcapStartBtn').prop('disabled', false);
          if (res.code !== 0) { $('#toolsPcapStatus').text('錯誤: ' + res.msg).removeClass('text-primary').addClass('text-danger'); return; }
          pcapPackets = res.data || [];
          var $tbody = $('#toolsPcapTbody');
          (pcapPackets).forEach(function (pkt) {
            $tbody.append('<tr class="pcap-row" data-idx="' + pkt.index + '" style="cursor:pointer">' +
              '<td>' + pkt.index + '</td>' +
              '<td>' + pkt.time + '</td>' +
              '<td>' + escHtml(pkt.src) + '</td>' +
              '<td>' + escHtml(pkt.dst) + '</td>' +
              '<td><span class="badge" style="background:' + protoColor(pkt.proto) + ';font-size:.6rem">' + pkt.proto + '</span></td>' +
              '<td>' + pkt.len + '</td>' +
              '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(pkt.info) + '</td></tr>');
          });
          $('#toolsPcapStatus').text('完成: ' + pcapPackets.length + ' 個封包').removeClass('text-primary').addClass('text-success');
          logger.info('PCAP 擷取完成', iface + ' ' + pcapPackets.length + ' packets');
        }, 'json').fail(function () {
          $('#toolsPcapStartBtn').prop('disabled', false);
          $('#toolsPcapStatus').text('請求失敗').removeClass('text-primary').addClass('text-danger');
        });
      });
      $(document).on('click', '.pcap-row', function () {
        var idx = $(this).data('idx');
        var pkt = pcapPackets.find(function (p) { return p.index === idx; });
        if (!pkt || !pkt.hex) { $('#toolsPcapHex').hide(); return; }
        $('.pcap-row').removeClass('table-active');
        $(this).addClass('table-active');
        $('#toolsPcapHex').text('Packet #' + pkt.index + ' (' + pkt.proto + ', ' + pkt.len + ' bytes)\n' +
          pkt.src + ' → ' + pkt.dst + '\n' + pkt.info + '\n\n' + pkt.hex).show();
      });
      $('#toolsPcapClearBtn').on('click', function () {
        $('#toolsPcapTbody').empty();
        $('#toolsPcapHex').hide().text('');
        pcapPackets = [];
        $('#toolsPcapStatus').text('').removeClass('text-success text-danger text-primary');
      });
      function protoColor(proto) {
        var p = (proto || '').toUpperCase();
        if (p === 'TCP') return '#0d6efd';
        if (p === 'UDP') return '#198754';
        if (p === 'ICMP' || p === 'ICMPV6') return '#dc3545';
        if (p === 'ARP') return '#6f42c1';
        return '#6c757d';
      }
      // Re-bind shown.bs.tab for tools to load PCAP interfaces
      var _origToolsActivator = viewActivators.tools;
      viewActivators.tools = function() {
        if (_origToolsActivator) _origToolsActivator();
        setTimeout(pcapLoadInterfaces, 200);
      };
      $(document).on('shown.bs.tab', '#toolsTabs .nav-link', function () {
        var target = $(this).attr('data-bs-target');
        if (target === '#toolsPcapPane') pcapLoadInterfaces();
      });
      $(document).on('shown.bs.tab', '#nginxTabs .nav-link', function () {
        var target = $(this).attr('data-bs-target');
        if (target === '#nginxEnvPane') loadNginxEnv();
        if (target === '#nginxSitesPane') { resetNginxSiteForm(); loadNginxSites(); }
        if (target === '#nginxModulesPane') loadNginxModules();
      });
    });
    // ─── Helpers ───
    function tableHTML(type, tableName, data) {
      const lang = i18n[currentLang];
      const chainId = (data.title && data.title.chain || '').replace(/\s/g, '_');
      const title = type === "system"
        ? `${lang.chainLabel}: ${data.title.chain} &nbsp; ${lang.defaultPolicy}: ${data.title.policy} &nbsp; ${lang.packets}: ${data.title.packets} &nbsp; ${lang.bytes}: ${data.title.bytes}`
        : `${lang.chainLabel}: ${data.title.chain} &nbsp; ${lang.references}: ${data.title.references}`;
      let rows = '';
      (data.list || []).forEach(function (r) {
        rows += `<tr>
          <td class="num-cell" data-table="${tableName}" data-chain="${data.title.chain}" data-id="${r.num}">${r.num}</td>
          <td>${r.pkts}</td><td>${r.bytes}</td><td>${r.target}</td><td>${r.prot}</td><td>${r.opt}</td>
          <td>${r.in || ''}</td><td>${r.out || ''}</td><td>${r.source}</td><td>${r.destination}</td><td class="text-truncate" style="max-width:200px">${r.action}</td>
          <td><div class="btn-group btn-group-xs chain-actions">
            <button class="btn btn-outline-info flush-metrics" data-table="${tableName}" data-chain="${data.title.chain}" data-id="${r.num}">${lang.zero}</button>
            <button class="btn btn-outline-danger delete-rule" data-table="${tableName}" data-chain="${data.title.chain}" data-id="${r.num}">${lang.delete}</button>
          </div></td></tr>`;
      });
      return `<div class="card mb-4 chain-block" id="${chainId}" data-type="${type}">
        <div class="card-header py-2"><strong>${title}</strong></div>
        <div class="card-body p-2">
          <div class="mb-2 chain-actions" data-table="${tableName}" data-chain="${data.title.chain}">
            <button class="btn btn-primary btn-sm chain-insert">${lang.insert}</button>
            <button class="btn btn-outline-primary btn-sm chain-append">${lang.append}</button>
            <button class="btn btn-outline-warning btn-sm chain-flush-metrics">${lang.zeroCounters}</button>
            <button class="btn btn-outline-danger btn-sm chain-flush">${lang.clearChain}</button>
            <button class="btn btn-outline-secondary btn-sm chain-reload">${lang.refresh}</button>
            <button class="btn btn-outline-info btn-sm chain-exec">${lang.viewCmd}</button>
          </div>
          <div class="table-responsive"><table class="table table-sm table-bordered table-hover rule-table mb-0">
            <thead class="table-light"><tr>
              <th>num</th><th>pkts</th><th>bytes</th><th>target</th><th>prot</th><th>opt</th>
              <th>in</th><th>out</th><th>source</th><th>destination</th><th>action</th><th></th>
            </tr></thead><tbody>${rows}</tbody></table></div>
        </div></div>`;
    }
    function renderDocContent() {
      const isLinux = currentPlatform === 'linux';
      const isMac = currentPlatform === 'macos';
      const isWin = currentPlatform === 'windows';
      const cmd = fwDisplayName();
      let html = '';
      if (isLinux) {
        html += `<div class="doc-section">
          <div class="doc-section-title">語法</div>
          <div class="doc-inline"><code>${cmd} -t TABLE -[A|I|D|F|L] CHAIN [match] -j TARGET</code></div>
        </div>
        <hr class="doc-divider">
        <div class="doc-section">
          <div class="doc-section-title">常用命令</div>
          <span class="doc-code">${cmd} -L -n -v --line-numbers</span>
          <span class="doc-code">${cmd} -A INPUT -p tcp --dport 22 -j ACCEPT</span>
          <span class="doc-code">${cmd} -I INPUT 5 -s 10.0.0.0/8 -j DROP</span>
          <span class="doc-code">${cmd} -D INPUT 3</span>
          <span class="doc-code">${cmd} -F INPUT</span>
          <span class="doc-code">${cmd} -t nat -L -n -v</span>
        </div>
        <hr class="doc-divider">
        <div class="doc-section">
          <div class="doc-section-title">參數速查</div>
          <div class="doc-inline">
            <code>-t</code> 表名(raw|mangle|nat|filter)<br>
            <code>-A</code> 追加 <code>-I</code> 插入 <code>-D</code> 刪除<br>
            <code>-F</code> 清空 <code>-Z</code> 歸零 <code>-P</code> 默認策略<br>
            <code>-p</code> 協議 <code>--dport</code> 目標埠<br>
            <code>-s</code> 來源IP <code>-d</code> 目標IP<br>
            <code>-j</code> 動作(ACCEPT|DROP|REJECT|LOG)
          </div>
        </div>`;
      } else if (isMac) {
        html += `<div class="doc-section">
          <div class="doc-section-title">語法</div>
          <div class="doc-inline"><code>pfctl -[s|a|f] [options]</code></div>
        </div>
        <hr class="doc-divider">
        <div class="doc-section">
          <div class="doc-section-title">常用命令</div>
          <span class="doc-code">pfctl -s rules -v</span>
          <span class="doc-code">pfctl -s all</span>
          <span class="doc-code">pfctl -f /etc/pf.conf</span>
          <span class="doc-code">pfctl -e</span>
          <span class="doc-code">pfctl -d</span>
        </div>
        <hr class="doc-divider">
        <div class="doc-section">
          <div class="doc-section-title">注意</div>
          <div class="doc-inline">macOS pfctl 不支援按行號刪除規則，僅能透過編輯設定檔重新載入。</div>
        </div>`;
      } else if (isWin) {
        html += `<div class="doc-section">
          <div class="doc-section-title">語法</div>
          <div class="doc-inline"><code>PowerShell NetSecurity Cmdlet</code></div>
        </div>
        <hr class="doc-divider">
        <div class="doc-section">
          <div class="doc-section-title">常用命令</div>
          <span class="doc-code">Get-NetFirewallRule</span>
          <span class="doc-code">New-NetFirewallRule -DisplayName "Name" -Direction Inbound -Action Allow</span>
          <span class="doc-code">Remove-NetFirewallRule -DisplayName "Name"</span>
        </div>`;
      }
      $('#docDropdownMenu').html(html);
    }
    function execView(title, prefix, placeholder, val, confirmCb) {
      const lang = i18n[currentLang];
      layer.open({
        title: title, area: ["auto", "auto"],
        content: `<div class="row"><div class="mb-3"><label class="form-label fw-semibold">${prefix}</label><input type="text" class="form-control font-monospace" placeholder="${placeholder}" value="${val.replace(/"/g,'&quot;')}"></div></div>`,
        btn: [lang.confirm, lang.cancel],
        btn1(idx, layero) { confirmCb($(layero).find("input").val()); _hideModal(); },
        btn2() { _hideModal(); }
      });
    }
    // ─── Rule Editor (iptables GUI form) ───
    function ruleEditor(opts) {
      const lang = i18n[currentLang];
      const { title, prefix, val, confirmCb } = opts;
      function parseRuleTxt(txt) {
        const f = { target: '', protocol: '', source: '', destination: '', inIf: '', outIf: '', match: '', dport: '', sport: '', ctstate: [], icmpType: '', rChain: '', rNum: '', aChain: '' };
        if (!txt) return f;
        const toks = txt.split(/\s+/);
        for (let i = 0; i < toks.length; i++) {
          const t = toks[i];
          if (t === '-R') { f.rChain = toks[i + 1] || ''; f.rNum = toks[i + 2] || '1'; i += 2; continue; }
          if (t === '-A') { f.aChain = toks[i + 1] || ''; i++; continue; }
          if (t === '-I') { while (i + 1 < toks.length && !toks[i + 1].startsWith('-')) i++; continue; }
          if (t === '-p' || t === '--protocol') { f.protocol = toks[++i] || ''; continue; }
          if (t === '-s' || t === '--source') { f.source = toks[++i] || ''; continue; }
          if (t === '-d' || t === '--destination') { f.destination = toks[++i] || ''; continue; }
          if (t === '-j' || t === '--jump') { f.target = toks[++i] || ''; continue; }
          if (t === '-i' || t === '--in-interface') { f.inIf = toks[++i] || ''; continue; }
          if (t === '-o' || t === '--out-interface') { f.outIf = toks[++i] || ''; continue; }
          if (t === '-m' || t === '--match') { f.match = toks[++i] || ''; continue; }
          if (t === '--dport') { f.dport = toks[++i] || ''; continue; }
          if (t === '--sport') { f.sport = toks[++i] || ''; continue; }
          if (t === '--ctstate' || t === '--state') { while (i + 1 < toks.length && !toks[i + 1].startsWith('-')) f.ctstate.push(toks[++i]); continue; }
          if (t === '--icmp-type') { f.icmpType = toks[++i] || ''; continue; }
        }
        return f;
      }
      function buildCmd(f) {
        const p = [];
        if (f.protocol) p.push('-p', f.protocol);
        if (f.source) p.push('-s', f.source);
        if (f.destination) p.push('-d', f.destination);
        if (f.match) p.push('-m', f.match);
        if (f.dport) p.push('--dport', f.dport);
        if (f.sport) p.push('--sport', f.sport);
        if (f.inIf) p.push('-i', f.inIf);
        if (f.outIf) p.push('-o', f.outIf);
        if (f.ctstate && f.ctstate.length) p.push('--ctstate', f.ctstate.join(','));
        if (f.icmpType) p.push('--icmp-type', f.icmpType);
        if (f.target) p.push('-j', f.target);
        return p.join(' ');
      }
      const fields = parseRuleTxt(val || '');
      const ctStates = ['NEW','ESTABLISHED','RELATED','INVALID','SNAT','DNAT'];
      const rChainOpts = ['INPUT','FORWARD','OUTPUT','DOCKER','DOCKER-BRIDGE','DOCKER-CT','DOCKER-FORWARD','DOCKER-INTERNAL','DOCKER-USER',
        'ufw-after-forward','ufw-after-input','ufw-after-logging-forward','ufw-after-logging-input','ufw-after-logging-output','ufw-after-output',
        'ufw-before-forward','ufw-before-input','ufw-before-logging-forward','ufw-before-logging-input','ufw-before-logging-output','ufw-before-output',
        'ufw-logging-allow','ufw-logging-deny','ufw-not-local','ufw-reject-forward','ufw-reject-input','ufw-reject-output',
        'ufw-skip-to-policy-forward','ufw-skip-to-policy-input','ufw-skip-to-policy-output',
        'ufw-track-forward','ufw-track-input','ufw-track-output',
        'ufw-user-forward','ufw-user-input','ufw-user-limit','ufw-user-limit-accept',
        'ufw-user-logging-forward','ufw-user-logging-input','ufw-user-logging-output','ufw-user-output'];
      const origVal = val || '';
      // Fetch interfaces first, then open dialog with pre-populated data
      var ifOpts = '<option value="">-</option>';
      $.get('/interfaces', function(r) {
        if (r.code === 0 && r.data) {
          if (r.data.length === 0) {
            ifOpts += '<option value="" disabled>（無可用介面）</option>';
          } else {
            r.data.forEach(function(v) { ifOpts += '<option value="' + $('<span>').text(v).html() + '">' + $('<span>').text(v).html() + '</option>'; });
          }
        }
        openDialog(ifOpts);
      }, 'json');
      function openDialog(ifaceOpts) {
        const html =
          '<div style="min-width:560px">' +
            '<div class="rule-editor-section">' +
              '<label class="form-label fw-semibold">' + prefix + '</label>' +
              '<textarea class="form-control rule-editor-preview rule-preview-input" rows="2" style="font-family:monospace">' + (val||'').replace(/"/g,'&quot;') + '</textarea>' +
              '<div class="d-flex justify-content-end mt-1"><button class="btn btn-outline-primary btn-sm rule-gen-btn">產出</button> <button class="btn btn-outline-info btn-sm rule-parse-btn">🔍 Parsing</button></div>' +
            '</div>' +
            '<div class="rule-editor-section">' +
              '<div class="row g-2">' +
                '<div class="col-md-3 rule-editor-field"><label>鏈 <code>-R</code></label><select class="form-select field-r-chain"><option value="">-</option>' + rChainOpts.map(function(s){return '<option value="'+s+'">'+s+'</option>';}).join('') + '</select></div>' +
                '<div class="col-md-3 rule-editor-field"><label>序號 <code>-R</code></label><input type="number" class="form-control field-r-num" value="1" min="1"></div>' +
                '<div class="col-md-3 rule-editor-field"><label>鏈 <code>-A</code></label><select class="form-select field-a-chain"><option value="">-</option><option value="PREROUTING">PREROUTING</option><option value="POSTROUTING">POSTROUTING</option><option value="INPUT">INPUT</option><option value="FORWARD">FORWARD</option><option value="OUTPUT">OUTPUT</option></select></div>' +
              '</div>' +
              '<div class="row g-2">' +
                '<div class="col-md-3 rule-editor-field"><label>協定 <code>-p</code></label><select class="form-select field-protocol"><option value="">-</option><option value="tcp">tcp</option><option value="udp">udp</option><option value="icmp">icmp</option><option value="all">all</option></select></div>' +
                '<div class="col-md-3 rule-editor-field"><label>來源 <code>-s</code></label><input type="text" class="form-control field-source" placeholder="0.0.0.0/0" value="' + fields.source.replace(/"/g,'&quot;') + '"></div>' +
                '<div class="col-md-3 rule-editor-field"><label>目的 <code>-d</code></label><input type="text" class="form-control field-dest" placeholder="172.18.0.2/32" value="' + fields.destination.replace(/"/g,'&quot;') + '"></div>' +
                '<div class="col-md-3 rule-editor-field"><label>目標 <code>-j</code></label><select class="form-select field-target"><option value="">-</option><option value="ACCEPT">ACCEPT</option><option value="DROP">DROP</option><option value="REJECT">REJECT</option><option value="RETURN">RETURN</option><option value="LOG">LOG</option><option value="MASQUERADE">MASQUERADE</option><option value="DNAT">DNAT</option><option value="SNAT">SNAT</option><option value="REDIRECT">REDIRECT</option></select></div>' +
              '</div>' +
              '<div class="row g-2">' +
                '<div class="col-md-3 rule-editor-field"><label>入介面 <code>-i</code></label><select class="form-select field-in-if">' + ifaceOpts + '</select></div>' +
                '<div class="col-md-3 rule-editor-field"><label>出介面 <code>-o</code></label><select class="form-select field-out-if">' + ifaceOpts + '</select></div>' +
                '<div class="col-md-3 rule-editor-field"><label>比對模組 <code>-m</code></label><select class="form-select field-match"><option value="">-</option><option value="tcp">tcp</option><option value="udp">udp</option><option value="icmp">icmp</option><option value="state">state</option><option value="conntrack">conntrack</option><option value="multiport">multiport</option><option value="mac">mac</option><option value="limit">limit</option><option value="comment">comment</option><option value="addrtype">addrtype</option></select></div>' +
                '<div class="col-md-3 rule-editor-field"><label>目的埠 <code>--dport</code></label><input type="text" class="form-control field-dport" placeholder="22,80,443" value="' + fields.dport.replace(/"/g,'&quot;') + '"></div>' +
              '</div>' +
              '<div class="row g-2">' +
                '<div class="col-md-6 rule-editor-field"><label>連線狀態 <code>--ctstate</code></label><div class="rule-editor-ctstate">' +
                  ctStates.map(function(s){ return '<label><input type="checkbox" class="field-ctstate" value="' + s + '"' + (fields.ctstate.indexOf(s)>=0?' checked':'') + '> ' + s + '</label>'; }).join('') +
                '</div></div>' +
                '<div class="col-md-3 rule-editor-field"><label>ICMP 類型 <code>--icmp-type</code></label><input type="text" class="form-control field-icmp-type" placeholder="echo-request" value="' + fields.icmpType.replace(/"/g,'&quot;') + '"></div>' +
                '<div class="col-md-3 rule-editor-field"><label>來源埠 <code>--sport</code></label><input type="text" class="form-control field-sport" placeholder="1024:65535" value="' + fields.sport.replace(/"/g,'&quot;') + '"></div>' +
              '</div>' +
            '</div>' +
            '<div class="rule-editor-section">' +
              '<div class="d-flex align-items-center gap-2 mb-1">' +
                '<label class="form-label fw-semibold mb-0" style="font-size:.75rem">產出命令</label>' +
                '<button class="btn btn-outline-secondary btn-sm rule-copy-btn" tabindex="-1" title="複製命令">📋 複製</button>' +
              '</div>' +
              '<textarea class="form-control rule-full-cmd" rows="2" readonly tabindex="-1" style="font-family:monospace;font-size:.8125rem;resize:none;cursor:text;user-select:text;background:var(--bs-tertiary-bg);color:var(--bs-body-color)" onclick="this.select()"></textarea>' +
            '</div>' +
          '</div>';
        console.log('產出按鈕被按下');
        layer.open({
          title: title, area: ['700px', 'auto'],
          content: html,
          btn: [lang.confirm, lang.cancel],
          success: function(layero) {
            var $l = $(layero);
            if (fields.protocol) $l.find('.field-protocol').val(fields.protocol);
            if (fields.target) $l.find('.field-target').val(fields.target);
            if (fields.match) $l.find('.field-match').val(fields.match);
            if (fields.inIf) $l.find('.field-in-if').val(fields.inIf);
            if (fields.outIf) $l.find('.field-out-if').val(fields.outIf);
            // Initialize R chain/num fields from val prefix (e.g. "-R INPUT 3")
            (function() {
              var initChain = '', initNum = '1';
              if (val) {
                var toks = val.split(/\s+/);
                if (toks[0] === '-R' && toks[1]) { initChain = toks[1]; initNum = toks[2] || '1'; }
              }
              if (initChain) $l.find('.field-r-chain').val(initChain);
              $l.find('.field-r-num').val(initNum);
            })();
            function rebuildPrefixToks() {
              var parts = [];
              var aChain = $l.find('.field-a-chain').val();
              var rChain = $l.find('.field-r-chain').val();
              var rNum = $l.find('.field-r-num').val() || '1';
              if (aChain) parts.push('-A', aChain);
              if (rChain) parts.push('-R', rChain, rNum);
              return parts;
            }
            function syncFld() {
              var p = {
                protocol: $l.find('.field-protocol').val(),
                source: $l.find('.field-source').val(),
                destination: $l.find('.field-dest').val(),
                target: $l.find('.field-target').val(),
                match: $l.find('.field-match').val(),
                inIf: $l.find('.field-in-if').val(),
                outIf: $l.find('.field-out-if').val(),
                dport: $l.find('.field-dport').val(),
                sport: $l.find('.field-sport').val(),
                ctstate: [],
                icmpType: $l.find('.field-icmp-type').val()
              };
              $l.find('.field-ctstate:checked').each(function(){ p.ctstate.push($(this).val()); });
              var prefixToks = rebuildPrefixToks();
              var cmd = buildCmd(p);
              if (prefixToks.length) cmd = prefixToks.join(' ') + ' ' + cmd;
              cmd = cmd.trim();
              console.log('syncFld 欄位值:', JSON.stringify(p));
              console.log('prefixToks:', prefixToks);
              console.log('buildCmd:', buildCmd(p));
              console.log('最終 cmd:', cmd);
              $l.find('.rule-preview-input').val(cmd);
              $l.find('.rule-full-cmd').val((prefix ? prefix + ' ' : '') + cmd);
            }
            var timer;
            $l.find('.field-a-chain,.field-r-chain,.field-r-num').on('change', syncFld);
            $l.find('.field-protocol,.field-target,.field-match,.field-in-if,.field-out-if').on('change', syncFld);
            $l.find('.field-source,.field-dest,.field-dport,.field-sport,.field-icmp-type').on('input', syncFld);
            $l.find('.field-ctstate').on('change', syncFld);
            function doParse() {
              var txt = $l.find('.rule-preview-input').val() || '';
              var p = parseRuleTxt(txt);
              $l.find('.field-protocol').val(p.protocol);
              $l.find('.field-source').val(p.source);
              $l.find('.field-dest').val(p.destination);
              $l.find('.field-target').val(p.target);
              $l.find('.field-match').val(p.match);
              $l.find('.field-in-if').val(p.inIf);
              $l.find('.field-out-if').val(p.outIf);
              $l.find('.field-dport').val(p.dport);
              $l.find('.field-sport').val(p.sport);
              $l.find('.field-icmp-type').val(p.icmpType);
              $l.find('.field-ctstate').prop('checked', false);
              (p.ctstate||[]).forEach(function(s){ $l.find('.field-ctstate[value="'+s+'"]').prop('checked',true); });
              if (p.rChain) { $l.find('.field-r-chain').val(p.rChain); $l.find('.field-r-num').val(p.rNum || '1'); }
              if (p.aChain) { $l.find('.field-a-chain').val(p.aChain); }
            }
            console.log('設定產出按鈕事件');
            $l.find('.rule-gen-btn').on('click', function() {
              console.log('產出按鈕被按下');
              syncFld();
              var previewVal = $l.find('.rule-preview-input').val();
              var fullCmdVal = $l.find('.rule-full-cmd').val();
              console.log('預覽框:', previewVal);
              console.log('產出命令:', fullCmdVal);
              if (!previewVal && !fullCmdVal) {
                console.warn('產出結果為空，請確認下方欄位有填入值');
              } else {
                console.info('產出成功，已填入 rule-preview-input');
              }
            });
            $l.find('.rule-parse-btn').on('click', doParse);
            $l.find('.rule-copy-btn').on('click', function() {
              var txt = $l.find('.rule-full-cmd').val();
              if (!txt) return;
              copyText($, txt);
              layer.msg('已複製', { icon: 1, time: 1200 });
            });
            $l.find('.rule-preview-input').on('input', function(){
              clearTimeout(timer);
              timer = setTimeout(doParse, 300);
            });
            syncFld();
          },
          btn1: function(idx, layero) {
            confirmCb($(layero).find('.rule-preview-input').val() || '');
            _hideModal();
          },
          btn2: function(idx, layero) {
            $(layero).find('.rule-preview-input').val(origVal);
            _hideModal();
          }
        });
      }
    }
    function copyText($, str) {
      $("#copy").text(str).show();
      document.getElementById("copy").select();
      document.execCommand("copy", false, null);
      $("#copy").hide();
    }
    function bindMenuToggleFallback(menu) {
      var root = document.querySelector('#layout-menu');
      if (!root || !menu) return;
      root.querySelectorAll('.menu-toggle').forEach(function (toggle) {
        if (toggle.dataset.fwmToggleBound === '1') return;
        toggle.dataset.fwmToggleBound = '1';
        toggle.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          menu.toggle(toggle);
          console.log('[menu] toggle', toggle.textContent.trim());
        });
      });
      console.log('[menu] fallback bound', root.querySelectorAll('.menu-toggle').length);
    }

    // Re-init menu after DOM ready, or immediately when app.js is loaded late by React.
    function initMenuFallback() {
      if (typeof Menu !== 'undefined') {
        const el = document.querySelector('#layout-menu');
        if (el) bindMenuToggleFallback(new Menu(el, { orientation: 'vertical', closeChildren: false }));
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initMenuFallback);
    } else {
      initMenuFallback();
    }
  
