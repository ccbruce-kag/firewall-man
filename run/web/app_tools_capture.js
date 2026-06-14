    $(function () {
      // ─── Log Viewer ───
      var logRefreshTimer = null;
      var logCurrentPath = null;
      var logBase = '/miitai-fwm/0.52/backend/api/system/log';
      function loadLogFiles() {
        $.get(logBase + '/list', function (res) {
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
        $.post(logBase + '/tail', { path: path, lines: lines }, function (res) {
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
          $.post(logBase + '/tail', { path: logCurrentPath, lines: $('#toolsLogLines').val() || 50 }, function (res) {
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
      // ─── Tools event handlers ───
      var toolsBase = '/miitai-fwm/0.52/backend/api/tools';
      function toolsRun(endpoint, data, outputId) {
        var $out = $(outputId);
        $out.text('執行中...');
        $.post(toolsBase + '/' + endpoint, data, function (res) {
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
        $.post(toolsBase + '/ping-classc', { network: network }, function (res) {
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
        $.post(toolsBase + '/ip-location', { ip: ip || '' }, function (res) {
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
        $.post(toolsBase + '/netstat', {}, function (res) {
          var text = res.output || res.error || JSON.stringify(res, null, 2);
          $out.text(text);
          if (res.command) $('.tools-netstat-cmd-badge').text('命令: ' + res.command);
          logger.debug('Netstat 執行結果', (res.command || '') + ' ' + text.substring(0, 200));
        }, 'json');
      });
      // ─── PCAP ───
      function pcapLoadInterfaces() {
        $.get(toolsBase + '/pcap/interfaces', function (res) {
          if (res.code !== 0) return;
          var $sel = $('#pcapInterface').empty().append('<option value="">-- 選擇介面 --</option>');
          (res.data || []).forEach(function (iface) {
            $sel.append('<option value="' + iface.name + '">' + iface.name + (iface.description ? ' (' + iface.description + ')' : '') + '</option>');
          });
        });
      }
      var pcapPackets = [];
      $('#pcapStartBtn').on('click', function () {
        var iface = $('#pcapInterface').val();
        if (!iface) { layer.msg('請選擇網路介面', { icon: 2 }); return; }
        var filter = $('#pcapFilter').val().trim();
        var count = parseInt($('#pcapCount').val()) || 50;
        var timeout = parseInt($('#pcapTimeout').val()) || 10;
        $('#pcapStatus').text('擷取中...').removeClass('text-muted').addClass('text-primary');
        $('#pcapStartBtn').prop('disabled', true);
        $('#pcapTbody').empty();
        $('#pcapHex').hide().text('');
        pcapPackets = [];
        $.post(toolsBase + '/pcap/capture', { interface: iface, filter: filter, count: count, timeout: timeout }, function (res) {
          $('#pcapStartBtn').prop('disabled', false);
          if (res.code !== 0) { $('#pcapStatus').text('錯誤: ' + res.msg).removeClass('text-primary').addClass('text-danger'); return; }
          pcapPackets = res.data || [];
          var $tbody = $('#pcapTbody');
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
          $('#pcapStatus').text('完成: ' + pcapPackets.length + ' 個封包').removeClass('text-primary').addClass('text-success');
          logger.info('PCAP 擷取完成', iface + ' ' + pcapPackets.length + ' packets');
        }, 'json').fail(function () {
          $('#pcapStartBtn').prop('disabled', false);
          $('#pcapStatus').text('請求失敗').removeClass('text-primary').addClass('text-danger');
        });
      });
      $(document).on('click', '.pcap-row', function () {
        var idx = $(this).data('idx');
        var pkt = pcapPackets.find(function (p) { return p.index === idx; });
        if (!pkt || !pkt.hex) { $('#pcapHex').hide(); return; }
        $('.pcap-row').removeClass('table-active');
        $(this).addClass('table-active');
        $('#pcapHex').text('Packet #' + pkt.index + ' (' + pkt.proto + ', ' + pkt.len + ' bytes)\n' +
          pkt.src + ' → ' + pkt.dst + '\n' + pkt.info + '\n\n' + pkt.hex).show();
      });
      $('#pcapClearBtn').on('click', function () {
        $('#pcapTbody').empty();
        $('#pcapHex').hide().text('');
        pcapPackets = [];
        $('#pcapStatus').text('').removeClass('text-success text-danger text-primary');
      });
      function protoColor(proto) {
        var p = (proto || '').toUpperCase();
        if (p === 'TCP') return '#0d6efd';
        if (p === 'UDP') return '#198754';
        if (p === 'ICMP' || p === 'ICMPV6') return '#dc3545';
        if (p === 'ARP') return '#6f42c1';
        return '#6c757d';
      }
      $(document).on('shown.bs.tab', '#nginxTabs .nav-link', function () {
        var target = $(this).attr('data-bs-target');
        if (target === '#nginxEnvPane') loadNginxEnv();
        if (target === '#nginxSitesPane') { resetNginxSiteForm(); loadNginxSites(); }
        if (target === '#nginxModulesPane') loadNginxModules();
      });
    });
