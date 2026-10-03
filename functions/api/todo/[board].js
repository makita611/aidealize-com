// 先方向けチェックリストの保存先（/api/todo/{board}）
//   GET  → そのボードの保存内容 { items: { "0": {c, m, at}, ... }, updatedAt }
//   POST → { i, c, m } を1項目ぶん保存して、最新の内容を返す
// 保存先：Cloudflare KV（Pagesのバインディング名 TODO_KV）。未設定なら 503 を返し、ページ側はLINE送信に切り替える。
const BOARDS = new Set(['ibuki-8e462efc', 'uchihebo-9362eb67']);

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

async function load(env, board) {
  const raw = await env.TODO_KV.get('todo:' + board);
  return raw ? JSON.parse(raw) : { items: {}, updatedAt: null };
}

export async function onRequestGet({ params, env }) {
  if (!BOARDS.has(params.board)) return json({ ok: false, error: 'not_found' }, 404);
  if (!env.TODO_KV) return json({ ok: false, error: 'storage_unavailable' }, 503);
  return json({ ok: true, ...(await load(env, params.board)) });
}

export async function onRequestPost({ params, env, request }) {
  if (!BOARDS.has(params.board)) return json({ ok: false, error: 'not_found' }, 404);
  if (!env.TODO_KV) return json({ ok: false, error: 'storage_unavailable' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'invalid_payload' }, 400); }
  const i = Number(body.i);
  if (!Number.isInteger(i) || i < 0 || i > 99) return json({ ok: false, error: 'invalid_item' }, 400);
  const state = await load(env, params.board);
  const now = new Date().toISOString();
  state.items[String(i)] = { c: !!body.c, m: String(body.m || '').slice(0, 2000), at: now };
  state.updatedAt = now;
  await env.TODO_KV.put('todo:' + params.board, JSON.stringify(state));
  return json({ ok: true, ...state });
}
