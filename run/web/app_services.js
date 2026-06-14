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
