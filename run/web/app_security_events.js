    $(function () {
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
    });
