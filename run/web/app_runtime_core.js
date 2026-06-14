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
        pcap: function() { pcapLoadInterfaces(); },
        snmp: function() {},
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
        },
        logViewer: function() { setTimeout(loadLogFiles, 100); },
        system: function() { loadSystemInfo(); },
        firewallMan: function() { $('.action-buttons').show(); loadListRule(currentTableName()); },
      };
      var viewMenuMap = {
        dashboard: 'menuDash', firewallMan: 'menuFirewallMan', juniper: 'menuJuniper',
        haproxy: 'menuHaproxy', nginx: 'menuNginx', netplan: 'menuNetplan',
        pcap: 'menuPcap', snmp: 'menuSnmp', apiman: 'menuApiManNew', dbman: 'menuDbManNew', security: 'menuSecurityCvs',
        tools: 'menuTools', system: 'menuSys', shell: 'menuShell', widgets: 'menuWidgets', logViewer: 'menuLogViewer', crontab: 'menuCrontab', ai: 'menuAI',
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
        $('#menuDash,#menuFirewallMan,#menuJuniper,#menuHaproxy,#menuNginx,#menuNetplan,#menuPcap,#menuSnmp,#menuSys,#menuTools,#menuShell,#menuWidgets,#menuLogViewer,#menuCrontab,#menuApiManNew,#menuDbManNew,#menuSecurityCvs,#menuSecurityScan,#menuAI,#menuDoc').removeClass('active');
      }
      function hideAllViews() {
        hideAllWorkViews();
      }
      // ─── Dashboard view toggle & timer ───
      function switchView(mode) {
        destroyTerminal();
        if (wsAI) { try { wsAI.close(); } catch(e) {} wsAI = null; aiRunning = false; }
        if (mode !== 'logViewer') { try { stopLogRefresh(); } catch(e) {} }
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
            menuFirewallManLink: 'firewallMan',
            menuJuniperLink: 'juniper',
            menuHaproxyLink: 'haproxy',
            menuNginxLink: 'nginx',
            menuNetplanLink: 'netplan',
            menuSysLink: 'system',
            menuToolsLink: 'tools',
            menuShellLink: 'shell',
            menuWidgetsLink: 'widgets',
            menuLogViewerLink: 'logViewer',
            menuCrontabLink: 'crontab',
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
      $('#menuFirewallManLink').on('click', function (e) { console.log('[app.js] menuFirewallManLink clicked'); e.preventDefault(); switchView('firewallMan'); });
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
      // ─── Restore tabs from localStorage ───
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
        tabState.tabs.push({ id: 'firewallMan' });
        tabState.activeId = 'firewallMan';
        saveTabs();
        renderTabs();
        activateTabImpl('firewallMan');
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
        if (action === 'closeButMe') { tabState.tabs = [tabState.tabs[idx]]; tabState.activeId = mode; saveTabs(); renderTabs(); if (tabState.activeId) activateTabImpl(tabState.activeId); }
      });
      $(document).on('contextmenu', '.tab-item', function (e) {
        e.preventDefault();
        var mode = $(this).data('mode');
        var lang = i18n[currentLang] || {};
        ctxMenu.html(
          '<div class="ctx-item" data-action="close"><i class="bx bx-x"></i> ' + (lang.closeTab || '關閉') + '</div>' +
          '<div class="ctx-divider"></div>' +
          '<div class="ctx-item" data-action="closeAll"><i class="bx bx-x-circle"></i> ' + (lang.closeAll || '關閉全部') + '</div>' +
          '<div class="ctx-item" data-action="closeButMe"><i class="bx bx-minus-circle"></i> ' + (lang.closeButMe || '關閉除我之外') + '</div>' +
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
    });
