/* 無料 図面（DXF）点検：ブラウザ内だけで処理（ファイルは送信しない）。ASCII DXFのみ対応。 */
(function (root) {
  function parsePairs(text) {
    var L = text.replace(/\r/g, "").split("\n"), p = [];
    for (var i = 0; i + 1 < L.length; i += 2) p.push([parseInt(L[i].trim(), 10), L[i + 1].trim()]);
    return p;
  }
  function area(p) { var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
  function perim(p) { var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += Math.hypot(a[0] - b[0], a[1] - b[1]); } return s; }
  function inside(pt, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function chain(lines, tol) {
    var segs = lines.slice(), loops = [], used = {};
    function near(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol; }
    for (var s = 0; s < segs.length; s++) {
      if (used[s]) continue;
      var path = [segs[s][0], segs[s][1]]; used[s] = true;
      var grew = true;
      while (grew) {
        grew = false;
        for (var k = 0; k < segs.length; k++) {
          if (used[k]) continue;
          var e = path[path.length - 1], a = segs[k][0], b = segs[k][1];
          if (near(e, a)) { path.push(b); used[k] = true; grew = true; }
          else if (near(e, b)) { path.push(a); used[k] = true; grew = true; }
        }
      }
      if (path.length > 3 && near(path[0], path[path.length - 1])) { path.pop(); loops.push(path); }
      else loops.push({ open: path });
    }
    return loops;
  }
  function analyze(text, t, rho) {
    rho = rho || 7.85e-6;
    var r = { ok: false, findings: [], counts: {}, layers: {}, units: null };
    if (/^\s*AutoCAD Binary DXF/.test(text.slice(0, 40))) { r.findings.push({ lv: "ng", msg: "バイナリ形式のDXFです。ASCII形式で保存し直してください。" }); return r; }
    var P = parsePairs(text);
    if (!P.length || !P.some(function (x) { return x[0] === 0 && x[1] === "SECTION"; })) { r.findings.push({ lv: "ng", msg: "DXFとして読めませんでした（ASCII DXFのみ対応）。DWGやPDFは対応していません。" }); return r; }
    // HEADER: $INSUNITS
    for (var i = 0; i < P.length; i++) if (P[i][0] === 9 && P[i][1] === "$INSUNITS" && P[i + 1]) r.units = parseInt(P[i + 1][1], 10);
    // ENTITIES
    var start = -1;
    for (i = 0; i < P.length; i++) if (P[i][0] === 2 && P[i][1] === "ENTITIES" && P[i - 1] && P[i - 1][1] === "SECTION") { start = i + 1; break; }
    var ents = [], cur = null;
    for (i = start; i >= 0 && i < P.length; i++) {
      var g = P[i][0], v = P[i][1];
      if (g === 0) { if (v === "ENDSEC") break; cur = { type: v, pts: [], bulge: false }; ents.push(cur); continue; }
      if (!cur) continue;
      if (g === 8) cur.layer = v;
      else if (g === 70) cur.flag = parseInt(v, 10);
      else if (g === 10) { if (cur.type === "CIRCLE" || cur.type === "ARC") cur.cx = parseFloat(v); else cur.pts.push([parseFloat(v), 0]); }
      else if (g === 20) { if (cur.type === "CIRCLE" || cur.type === "ARC") cur.cy = parseFloat(v); else if (cur.pts.length) cur.pts[cur.pts.length - 1][1] = parseFloat(v); }
      else if (g === 11) { cur.x2 = parseFloat(v); }
      else if (g === 21) { cur.y2 = parseFloat(v); }
      else if (g === 40) { if (cur.type === "CIRCLE" || cur.type === "ARC") cur.r = parseFloat(v); }
      else if (g === 42 && parseFloat(v) !== 0) cur.bulge = true;
    }
    // 旧形式 POLYLINE/VERTEX を LWPOLYLINE 相当にまとめる
    var norm = [], pl = null;
    ents.forEach(function (e) {
      if (e.type === "POLYLINE") { pl = { type: "LWPOLYLINE", pts: [], flag: e.flag || 0, layer: e.layer, bulge: false }; norm.push(pl); }
      else if (e.type === "VERTEX" && pl) { if (e.pts[0]) pl.pts.push(e.pts[0]); if (e.bulge) pl.bulge = true; }
      else if (e.type === "SEQEND") pl = null;
      else norm.push(e);
    });
    var polys = [], circles = [], lines = [], open = 0, bulged = 0;
    norm.forEach(function (e) {
      r.counts[e.type] = (r.counts[e.type] || 0) + 1;
      if (e.layer) r.layers[e.layer] = (r.layers[e.layer] || 0) + 1;
      if (e.type === "LWPOLYLINE") {
        if (e.bulge) bulged++;
        if ((e.flag & 1) && e.pts.length >= 3) polys.push(e.pts);
        else if (e.pts.length >= 3 && Math.hypot(e.pts[0][0] - e.pts[e.pts.length - 1][0], e.pts[0][1] - e.pts[e.pts.length - 1][1]) < 0.01) polys.push(e.pts.slice(0, -1));
        else open++;
      } else if (e.type === "CIRCLE" && e.r > 0) circles.push([e.cx, e.cy, e.r]);
      else if (e.type === "LINE" && e.pts[0] && e.x2 !== undefined) lines.push([e.pts[0], [e.x2, e.y2]]);
    });
    var fromLines = 0, openLoops = 0;
    if (lines.length) {
      chain(lines, 0.5).forEach(function (l) { if (l.open) openLoops++; else { polys.push(l); fromLines++; } });
    }
    r.counts.closed = polys.length; r.counts.circles = circles.length; r.counts.openLines = open + openLoops;
    // 単位
    var uname = { 0: "未設定", 1: "インチ", 2: "フィート", 4: "mm", 5: "cm", 6: "m" }[r.units];
    if (r.units === null || r.units === 0) r.findings.push({ lv: "warn", msg: "単位が未設定です。mmとして計算します。違う単位なら結果がずれます。" });
    else if (r.units !== 4) r.findings.push({ lv: "warn", msg: "単位が「" + (uname || r.units) + "」です。この点検はmm前提のため、数値をmmに直して使ってください。" });
    else r.findings.push({ lv: "ok", msg: "単位はmmです。" });
    if (!polys.length) { r.findings.push({ lv: "ng", msg: "閉じた輪郭が見つかりません。線が少しでも離れていると面積が出せません。" }); return r; }
    // 外形＝最大の閉じた図形
    polys.sort(function (a, b) { return area(b) - area(a); });
    var outer = polys[0], rest = polys.slice(1), holes = [], extraParts = 0;
    var xs = outer.map(function (p) { return p[0]; }), ys = outer.map(function (p) { return p[1]; });
    var w = Math.max.apply(null, xs) - Math.min.apply(null, xs), h = Math.max.apply(null, ys) - Math.min.apply(null, ys);
    var holeA = 0, holePer = 0;
    circles.forEach(function (c) { if (inside([c[0], c[1]], outer)) { holes.push(c); holeA += Math.PI * c[2] * c[2]; holePer += 2 * Math.PI * c[2]; } else extraParts++; });
    rest.forEach(function (p) { if (inside(p[0], outer)) { holeA += area(p); holePer += perim(p); holes.push(p); } else extraParts++; });
    var gross = w * h, net = area(outer) - holeA;
    r.ok = true;
    r.result = { w: w, h: h, holes: holes.length, grossArea: gross, netArea: net, outerArea: area(outer),
      outerPerim: perim(outer), holePerim: holePer, outer: outer, holeShapes: holes };
    if (t > 0) {
      r.result.t = t; r.result.grossKg = gross * t * rho; r.result.netKg = net * t * rho;
      r.result.paint = (2 * net + (perim(outer) + holePer) * t) / 1e6;
    }
    r.findings.push({ lv: "ok", msg: "外形1つと、内側の穴 " + holes.length + " 個を見つけました（外形 " + Math.round(w) + "×" + Math.round(h) + "）。" });
    if (fromLines) r.findings.push({ lv: "warn", msg: "LINE（線分）をつないで輪郭を作りました（" + fromLines + " 個）。端がずれていないか、図面で確認してください。" });
    if (extraParts) r.findings.push({ lv: "warn", msg: "外形の外側にも図形（" + extraParts + " 個）があります。部品が複数入っていないか確認してください。面積は最大の図形だけで計算しています。" });
    if (open + openLoops) r.findings.push({ lv: "warn", msg: "閉じていない線が " + (open + openLoops) + " 本あります。寸法線や補助線なら問題ありませんが、輪郭の一部なら面積が欠けます。" });
    if (bulged) r.findings.push({ lv: "warn", msg: "円弧（膨らみ）を含む折れ線が " + bulged + " 本あります。円弧は直線として計算するため、面積に誤差が出ます。" });
    ["ARC", "SPLINE", "ELLIPSE"].forEach(function (k) { if (r.counts[k]) r.findings.push({ lv: "warn", msg: k + " が " + r.counts[k] + " 個あります。この点検では面積に含めていません。" }); });
    if (w > 20000 || h > 20000) r.findings.push({ lv: "warn", msg: "外形が20mを超えています。単位や縮尺の指定ミスがないか確認してください。" });
    if (w < 5 || h < 5) r.findings.push({ lv: "warn", msg: "外形が5mm未満です。単位（m・cm）の取り違えの可能性があります。" });
    if (!t) r.findings.push({ lv: "ok", msg: "板厚を入れると、重量と塗装面積も出せます（板厚は図面データに含まれないため、材料表から入力）。" });
    return r;
  }
  root.ZumenTenken = { analyze: analyze };
  if (typeof module !== "undefined") module.exports = root.ZumenTenken;
})(typeof window !== "undefined" ? window : globalThis);
