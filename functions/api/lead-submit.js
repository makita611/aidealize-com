const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbweIGAPeJwD-U8D4Cks6fjGmp5hR2kpuwCx_9janRnGq3qdUFR4DDpYGgl33-bkFr3v/exec';
const SITECHECK_GAS_URL = 'https://script.google.com/macros/s/AKfycbznmcKuNRRfPrwP1Ev_alYlLIb5Z-b2fPBmNlnk-r923HibXl3OTc-tGJVP7750RgvQ/exec';

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export async function onRequestPost(context) {
  const request = context.request;
  const contentType = request.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  let body;

  try {
    body = isJson ? await request.json() : await request.formData();
  } catch (_) {
    return json({ ok: false, error: 'invalid_payload' }, 400);
  }

  const target = isJson && body && body.type === 'sitecheck_lead' ? SITECHECK_GAS_URL : DEFAULT_GAS_URL;
  const submissionId = isJson ? body.submission_id : body.get('submission_id');
  if (!submissionId) return json({ ok: false, error: 'missing_submission_id' }, 400);

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: isJson ? { 'content-type': 'application/json' } : undefined,
      body: isJson ? JSON.stringify(body) : body,
      redirect: 'follow'
    });
    if (!upstream.ok) return json({ ok: false, error: 'upstream_error' }, 502);
    return json({ ok: true, submission_id: submissionId });
  } catch (_) {
    return json({ ok: false, error: 'upstream_unreachable' }, 502);
  }
}
