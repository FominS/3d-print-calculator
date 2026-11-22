/*
 * Cloudflare Worker: CORS-прокси к Bambu Lab Cloud API для PrintBench.
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
 *   GET  /ams?dev=<серийный номер>                — что сейчас стоит в AMS (облачный MQTT, см. ниже)
 *
 * /ams: облако не отдаёт состояние AMS по HTTP, его присылает сам принтер по MQTT.
 * Worker на несколько секунд подключается к us.mqtt.bambulab.com:8883 (логин u_<uid>,
 * пароль — ваш токен), подписывается на device/<dev>/report, просит полный отчёт
 * (pushall) и возвращает блоки ams и vt_tray. Параметры: wait — сколько ждать, мс
 * (по умолчанию 9000, максимум 20000); raw=1 — вернуть отчёт целиком (для отладки).
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
import { connect } from 'cloudflare:sockets';

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
  try { res = await fetch(t.toString(), { headers: { 'User-Agent': 'printbench-proxy/1.0' }, redirect: 'follow' }); }
  catch { return json(502, { error: 'upstream unreachable' }, h); }
  const ct = res.headers.get('Content-Type') || '';
  if (!res.ok || !/^image\//.test(ct)) return json(502, { error: 'not an image', status: res.status }, h);
  if (Number(res.headers.get('Content-Length')) > 8e6) return json(413, { error: 'image too large' }, h);
  return new Response(res.body, { status: 200, headers: { ...h, 'Content-Type': ct, 'Cache-Control': 'public, max-age=86400' } });
}

/* ---------- Минимальный клиент MQTT 3.1.1 (QoS 0) для /ams ---------- */
const MQTT_HOSTS = { global: 'us.mqtt.bambulab.com', cn: 'cn.mqtt.bambulab.com' };
const enc = new TextEncoder(), dec = new TextDecoder();
const cat = (...parts) => { const o = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
const u16 = n => Uint8Array.of((n >> 8) & 255, n & 255);
const mstr = s => { const b = enc.encode(s); return cat(u16(b.length), b); };
function mpacket(head, body) {
  const len = []; let n = body.length;
  do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
  return cat(Uint8Array.of(head, ...len), body);
}
const mqConnect = (id, user, pass) => mpacket(0x10, cat(mstr('MQTT'), Uint8Array.of(4, 0xC2), u16(60), mstr(id), mstr(user), mstr(pass)));
const mqSubscribe = topic => mpacket(0x82, cat(u16(1), mstr(topic), Uint8Array.of(0)));
const mqPublish = (topic, payload) => mpacket(0x30, cat(mstr(topic), enc.encode(payload)));
const MQ_DISCONNECT = Uint8Array.of(0xE0, 0);
/* Вынуть из буфера один целый пакет: { packet, rest } или null, если данных пока мало. */
function mqTake(buf) {
  if (buf.length < 2) return null;
  let len = 0, mul = 1, i = 1;
  for (;; i++) {
    if (i >= buf.length) return null;
    if (i > 4) throw new Error('bad mqtt length');
    len += (buf[i] & 127) * mul; mul *= 128;
    if (!(buf[i] & 128)) break;
  }
  const end = i + 1 + len;
  if (buf.length < end) return null;
  return { packet: { type: buf[0] >> 4, flags: buf[0] & 15, body: buf.subarray(i + 1, end) }, rest: buf.slice(end) };
}
/* Отчёты P1/P2/A1 приходят дельтами: склеиваем, массивы объектов — по полю id. */
function merge(a, b) {
  if (Array.isArray(b)) {
    if (!Array.isArray(a) || !b.every(x => x && typeof x === 'object' && 'id' in x)) return b;
    const out = a.slice();
    for (const x of b) { const k = out.findIndex(y => y && y.id === x.id); if (k < 0) out.push(x); else out[k] = merge(out[k], x); }
    return out;
  }
  if (b && typeof b === 'object') { const o = a && typeof a === 'object' && !Array.isArray(a) ? { ...a } : {}; for (const k in b) o[k] = merge(o[k], b[k]); return o; }
  return b;
}
// Полный отчёт (ответ на pushall или обычный отчёт X1) — десятки полей; дельта — несколько.
const isFull = p => !!p?.ams && Object.keys(p).length >= 30;

async function bambuUid(region, token) {
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': 'printbench-proxy/1.0' };
  for (const path of ['/v1/design-user-service/my/preference', '/v1/user-service/my/profile']) {
    const res = await fetch(HOSTS[region] + path, { headers });
    if (res.status === 401) return { status: 401 };
    const d = await res.json().catch(() => null);
    const uid = d?.uid ?? d?.uidStr ?? d?.user?.uid;
    if (uid) return { uid: String(uid) };
  }
  return {};
}

async function ams(request, url, h) {
  const token = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json(401, { error: 'no token' }, h);
  const dev = url.searchParams.get('dev') || '';
  if (!/^[A-Za-z0-9]{6,32}$/.test(dev)) return json(400, { error: 'bad device id' }, h);
  const region = request.headers.get('X-Bambu-Region') === 'cn' ? 'cn' : 'global';
  const wait = Math.min(20000, Math.max(2000, Number(url.searchParams.get('wait')) || 9000));
  const raw = url.searchParams.get('raw') === '1';

  let who;
  try { who = await bambuUid(region, token); } catch { return json(502, { error: 'upstream unreachable', stage: 'uid' }, h); }
  if (who.status === 401) return json(401, { error: 'token rejected' }, h);
  if (!who.uid) return json(502, { error: 'uid not found', stage: 'uid' }, h);

  const deadline = Date.now() + wait;
  let sock, stage = 'connect', state = null, messages = 0, full = false, pushSent = false;
  try {
    sock = connect({ hostname: MQTT_HOSTS[region], port: 8883 }, { secureTransport: 'on' });
    const w = sock.writable.getWriter(), r = sock.readable.getReader();
    await w.write(mqConnect('pb_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16), 'u_' + who.uid, token));
    let buf = new Uint8Array(0);
    while (!full) {
      const left = deadline - Date.now();
      if (left <= 0) break;
      let timer;
      const chunk = await Promise.race([r.read(), new Promise(res => { timer = setTimeout(() => res({ timeout: true }), left); })]);
      clearTimeout(timer);
      if (chunk.timeout) break;
      if (chunk.done) { if (stage === 'connect') throw new Error('broker closed connection'); break; }
      buf = cat(buf, chunk.value);
      for (let t; !full && (t = mqTake(buf));) {
        buf = t.rest;
        const { type, flags, body } = t.packet;
        if (type === 2) { // CONNACK
          if (body[1] !== 0) return json(body[1] === 5 || body[1] === 4 ? 401 : 502, { error: 'mqtt connect refused', code: body[1], stage }, h);
          stage = 'subscribe';
          await w.write(mqSubscribe(`device/${dev}/report`));
        } else if (type === 9) { // SUBACK
          if (body[2] === 0x80) return json(403, { error: 'mqtt subscribe refused (device not in this account?)', stage }, h);
          stage = 'report';
          await w.write(mqPublish(`device/${dev}/request`, JSON.stringify({ pushing: { sequence_id: '0', command: 'pushall', version: 1, push_target: 1 } })));
          pushSent = true;
        } else if (type === 3) { // PUBLISH
          const tl = (body[0] << 8) | body[1], qos = (flags >> 1) & 3, off = 2 + tl + (qos ? 2 : 0);
          if (qos === 1) await w.write(Uint8Array.of(0x40, 2, body[2 + tl], body[3 + tl]));
          let msg; try { msg = JSON.parse(dec.decode(body.subarray(off))); } catch { continue; }
          const p = msg?.print;
          if (!p || p.command !== 'push_status') continue;
          messages++;
          state = merge(state, p);
          full = isFull(p);
        }
      }
    }
    try { await w.write(MQ_DISCONNECT); } catch { /* уже закрыто */ }
  } catch (e) {
    return json(502, { error: 'mqtt: ' + String(e?.message || e), stage }, h);
  } finally {
    try { sock?.close(); } catch { /* ignore */ }
  }
  if (!state) return json(504, { error: 'no report from printer (offline?)', stage, pushSent }, h);
  const body = { dev, at: new Date().toISOString(), full, messages, ams: state.ams || null, vt_tray: state.vt_tray || null };
  if (raw) body.raw = state;
  return new Response(JSON.stringify(body), { status: 200, headers: { ...h, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
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
    if (url.pathname === '/ams' && request.method === 'GET') return ams(request, url, h);
    const method = ROUTES[url.pathname];
    if (!method || method !== request.method) return json(403, { error: 'route not allowed' }, h);

    const region = request.headers.get('X-Bambu-Region') === 'cn' ? 'cn' : 'global';
    const target = HOSTS[region] + url.pathname + url.search;
    const headers = new Headers({ 'Accept': 'application/json', 'User-Agent': 'printbench-proxy/1.0' });
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
