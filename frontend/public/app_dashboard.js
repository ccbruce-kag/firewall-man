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
