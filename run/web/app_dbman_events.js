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
    $(function () {
      // ─── DbMan event handlers ───
      $(document).on('click', '#dbmanShowAddForm, #dbmanAddConnBtn', function () { showDbManConnForm(null); });
      $(document).on('click', '#dbmanQuickConnectLocal', function () {
        var conn = {
          id: 0, name: '本機資料庫 (kyklos)', db_type: 'sqlite',
          file_path: 'kyklos.sqlite3', host: null, port: null,
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
    });
