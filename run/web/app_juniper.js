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
