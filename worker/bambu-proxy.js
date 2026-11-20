/*
 * Cloudflare Worker: CORS-прокси к Bambu Lab Cloud API для 3D Print Calculator.
 *
 * Зачем: api.bambulab.com не отдаёт CORS-заголовки, поэтому сайт на GitHub Pages
 * не может обращаться к нему из браузера напрямую. Worker пересылает запросы
 * и добавляет CORS только для разрешённых сайтов (ALLOWED_ORIGINS).
 *
 * Что пропускает (всё остальное — 403):
 *   POST /v1/user-service/user/login           — вход (пароль или код из письма)
 *   POST /v1/user-service/user/sendemail/code  — отправить код на почту
 *   GET  /v1/user-service/my/tasks             — история печати
 *   GET  /v1/iot-service/api/user/bind         — список принтеров
 *   GET  /v1/design-user-service/my/filament/v2 — катушки Bambu Lab из AMS (RFID)
 *   GET  /v1/iot-service/api/user/device/version — прошивка принтера и обновления
 *   GET  /v1/iot-service/api/user/print          — текущая печать
 *   GET  /img?u=<https-url>                       — картинка из хранилищ Bambu (обложки заданий)
 *
 * Регион: заголовок X-Bambu-Region: cn — запрос уйдёт на api.bambulab.cn, иначе api.bambulab.com.
 *
 * Worker ничего не хранит и не логирует: токен и пароль только проходят через него.
 *
 * Переменная окружения (Settings → Variables):
 *   ALLOWED_ORIGINS — сайты через запятую, например
 *     https://fomins.github.io,http://localhost:8000
 *   Если не задана — разрешён только https://fomins.github.io.
 */
const ROUTES = {
  '/v1/user-service/user/login': 'POST',
  '/v1/user-service/user/sendemail/code': 'POST',
  '/v1/user-service/my/tasks': 'GET',
  '/v1/iot-service/api/user/bind': 'GET',
  '/v1/design-user-service/my/filament/v2': 'GET',
  '/v1/iot-service/api/user/device/version': 'GET',
  '/v1/iot-service/api/user/print': 'GET',
};
const HOSTS = { global: 'https://api.bambulab.com', cn: 'https://api.bambulab.cn' };
const DEFAULT_ORIGINS = 'https://fomins.github.io';
// Картинки — только с хостов Bambu Lab / MakerWorld и их бакетов (bbl-*.aliyuncs.com)
const IMG_HOST = /(^|\.)(bambulab\.com|bambulab\.cn|bblmw\.com|makerworld\.com|makerworld\.com\.cn)$|^bbl[a-z0-9-]*\.oss-[a-z0-9-]+\.aliyuncs\.com$/i;

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Bambu-Region',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (status, body, headers) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function image(u, h) {
  let t;
  try { t = new URL(u); } catch { return json(400, { error: 'bad url' }, h); }
  if (t.protocol !== 'https:' || !IMG_HOST.test(t.hostname)) return json(403, { error: 'host not allowed' }, h);
  let res;
  try { res = await fetch(t.toString(), { headers: { 'User-Agent': '3d-print-calculator-proxy/1.0' }, redirect: 'follow' }); }
  catch { return json(502, { error: 'upstream unreachable' }, h); }
  const ct = res.headers.get('Content-Type') || '';
  if (!res.ok || !/^image\//.test(ct)) return json(502, { error: 'not an image', status: res.status }, h);
  if (Number(res.headers.get('Content-Length')) > 8e6) return json(413, { error: 'image too large' }, h);
  return new Response(res.body, { status: 200, headers: { ...h, 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
    if (!allowed.includes(origin)) return json(403, { error: 'origin not allowed', origin }, {});
    const h = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    const url = new URL(request.url);
    if (url.pathname === '/img' && request.method === 'GET') return image(url.searchParams.get('u'), h);
    const method = ROUTES[url.pathname];
    if (!method || method !== request.method) return json(403, { error: 'route not allowed' }, h);

    const region = request.headers.get('X-Bambu-Region') === 'cn' ? 'cn' : 'global';
    const target = HOSTS[region] + url.pathname + url.search;
    const headers = new Headers({ 'Accept': 'application/json', 'User-Agent': '3d-print-calculator-proxy/1.0' });
    const auth = request.headers.get('Authorization');
    if (auth) headers.set('Authorization', auth);
    const init = { method, headers, redirect: 'manual' };
    if (method === 'POST') {
      headers.set('Content-Type', 'application/json');
      const body = await request.text();
      if (body.length > 4096) return json(413, { error: 'body too large' }, h);
      init.body = body;
    }

    let res;
    try { res = await fetch(target, init); }
    catch (e) { return json(502, { error: 'upstream unreachable' }, h); }
    const out = new Headers(h);
    out.set('Content-Type', res.headers.get('Content-Type') || 'application/json');
    out.set('Cache-Control', 'no-store');
    return new Response(res.body, { status: res.status, headers: out });
  },
};
