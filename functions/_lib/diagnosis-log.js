// 診断ツール（site-check / security-check）の利用ログを、既存の
// お問い合わせ記録用GAS Web App（GAS form.md参照）に非同期で送る。
// レスポンスは待たない（context.waitUntilでリクエスト完了後にバックグラウンド送信）。
// GAS側は log_type==='site_diagnosis' で分岐し、別シート「サイト診断ログ」に追記する。

const GAS_URL = 'https://script.google.com/macros/s/AKfycbweIGAPeJwD-U8D4Cks6fjGmp5hR2kpuwCx_9janRnGq3qdUFR4DDpYGgl33-bkFr3v/exec';

export function logDiagnosis(context, checkType, url, score) {
  try {
    const { request } = context;
    const cf = request.cf || {};
    const body = new URLSearchParams({
      log_type: 'site_diagnosis',
      check_type: checkType, // 'site'（集客診断）| 'security'（Prevention）
      url: url || '',
      score: score == null ? '' : String(score),
      ip: request.headers.get('CF-Connecting-IP') || '',
      country: cf.country || '',
      org: cf.asOrganization || '',
      city: cf.city || '',
      ua: request.headers.get('User-Agent') || '',
      referer: request.headers.get('Referer') || '',
    });
    context.waitUntil(
      fetch(GAS_URL, { method: 'POST', body }).catch(() => {})
    );
  } catch (_) {
    // ログ送信の失敗で診断自体を失敗させない
  }
}
