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
