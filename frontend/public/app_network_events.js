    $(function () {
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
    });
