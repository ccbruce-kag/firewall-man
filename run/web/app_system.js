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
