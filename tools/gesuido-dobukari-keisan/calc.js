(function (root) {
  function calc(i) {
    var d = i.pipeMm / 1000, out = { warn: [] };
    out.depthUp = i.gUp - i.invUp; out.depthDown = i.gDown - i.invDown;
    out.coverUp = out.depthUp - d; out.coverDown = out.depthDown - d;
    out.drop = i.invUp - i.invDown;
    out.slope = i.length > 0 ? out.drop / i.length * 1000 : null;
    if (out.depthUp <= 0 || out.depthDown <= 0) out.warn.push("人孔深が0以下です。地盤高と管底高の入力（上下）を確認してください。");
    if (out.coverUp < 0 || out.coverDown < 0) out.warn.push("土被りがマイナスです。管径（mm）の単位や、管底高の入力を確認してください。");
    if (out.slope !== null && out.slope <= 0) out.warn.push("勾配が0以下（逆勾配または水平）です。上流・下流の取り違えがないか確認してください。");
    if (!(i.length > 0)) out.warn.push("延長を入力すると、勾配が計算できます。");
    if (i.pipeMm > 0 && i.pipeMm < 50) out.warn.push("管径が50mm未満です。単位がmmか確認してください。");
    return out;
  }
  root.GesuidoCalc = { calc: calc };
  if (typeof module !== "undefined") module.exports = root.GesuidoCalc;
})(typeof window !== "undefined" ? window : globalThis);
