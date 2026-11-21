(function (root) {
  var RHO = { steel: 7.85, sus304: 7.93, alu: 2.7 };
  function calc(i) {
    var rho = RHO[i.mat] || 7.85, A = 0, warn = [];
    if (i.type === "plate") A = i.t * i.w;               // 板：厚×幅（長さ方向に1m）
    else if (i.type === "round") A = Math.PI / 4 * i.d * i.d;
    else if (i.type === "pipe") { if (i.t >= i.d / 2) warn.push("肉厚が外径の半分以上です。入力を確認してください。"); A = Math.PI / 4 * (i.d * i.d - (i.d - 2 * i.t) * (i.d - 2 * i.t)); }
    else if (i.type === "flat") A = i.t * i.w;
    var perM = A * rho / 1000;                          // kg/m
    var lenM = i.lenUnit === "m" ? i.len : i.len / 1000;
    var total = perM * lenM * i.qty;
    if (!(A > 0)) warn.push("寸法を入力してください。");
    return { perM: perM, lenM: lenM, total: total, rho: rho, warn: warn };
  }
  root.KoubutsuCalc = { calc: calc };
  if (typeof module !== "undefined") module.exports = root.KoubutsuCalc;
})(typeof window !== "undefined" ? window : globalThis);
