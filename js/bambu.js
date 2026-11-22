/*
 * Bambu Lab Cloud для PrintBench: вход и загрузка истории печати.
 *
 * Браузер не может обращаться к api.bambulab.com напрямую (нет CORS), поэтому все
 * запросы идут через ваш Cloudflare Worker (worker/bambu-proxy.js) — его адрес
 * задаётся в js/config.js (bambuProxy) или в «Настройки → Bambu Lab Cloud».
 *
 * API неофициальное (описано сообществом: github.com/Doridian/OpenBambuAPI) и может измениться.
 * Токен (~3 месяца) хранится только в этом браузере (localStorage) и не попадает
 * в файл данных и Google Drive. Пароль нигде не сохраняется.
 */
window.Bambu = (() => {
  'use strict';
  const KEY = 'p2s_bambu';
  const ls = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } },
    set(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* приватный режим */ } },
  };
  const state = () => ls.get();
  const patch = o => { const s = { ...state(), ...o }; for (const k in s) if (s[k] == null || s[k] === '') delete s[k]; ls.set(s); return s; };

  const proxy = () => String(state().proxy || window.APP_CONFIG?.bambuProxy || '').trim().replace(/\/+$/, '');
  const region = () => (state().region === 'cn' ? 'cn' : 'global');
  const connected = () => !!state().token;
  const expired = () => { const e = state().expires; return !!e && Date.parse(e) < Date.now(); };

  const err = (msg, extra) => Object.assign(new Error(msg), extra);

  async function call(path, { method = 'GET', body, auth = true } = {}) {
    const base = proxy();
    if (!base) throw err(_t('Не задан адрес прокси (Cloudflare Worker) — см. инструкцию.'), { code: 'noproxy' });
    const headers = { 'X-Bambu-Region': region() };
    if (body) headers['Content-Type'] = 'application/json';
    if (auth) {
      const t = state().token;
      if (!t) throw err(_t('Нужно войти в Bambu Lab Cloud'), { code: 'auth' });
      headers.Authorization = 'Bearer ' + t;
    }
    let res;
    try { res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw err(_t('Прокси недоступен. Проверьте адрес Worker и ALLOWED_ORIGINS.'), { code: 'network' }); }
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (res.status === 401) {
      if (auth) patch({ token: null });
      throw err(auth ? _t('Токен Bambu Cloud истёк или отозван — войдите заново.') : (data?.message || _t('Неверный логин или пароль')), { code: 'auth' });
    }
    if (res.status === 403 && data?.error === 'origin not allowed')
      throw err(`${_t("Worker не разрешает этот сайт")} (${location.origin}). ${_t("Добавьте его в ALLOWED_ORIGINS")}.`, { code: 'origin' });
    if (!res.ok) throw err(data?.message || data?.error || `${_t("Ошибка Bambu Cloud: HTTP")} ${res.status}`, { code: 'http', status: res.status });
    return data || {};
  }

  function saveToken(d, account) {
    const token = d.accessToken || d.token;
    if (!token) throw err(d.message || _t('Bambu Cloud не вернул токен'));
    const sec = Number(d.expiresIn) || 7776000; // ~90 дней
    patch({ token, account, expires: new Date(Date.now() + sec * 1000).toISOString() });
    return { ok: true };
  }

  /* Шаг 1: email + пароль. Ответ: {ok} или {needCode:true} (код отправлен на почту) или {tfa:true}. */
  async function login(account, password) {
    const d = await call('/v1/user-service/user/login', { method: 'POST', body: { account, password }, auth: false });
    if (d.loginType === 'verifyCode') { await sendCode(account); return { needCode: true }; }
    if (d.loginType === 'tfa') return { tfa: true };
    return saveToken(d, account);
  }
  /* Отправить код на почту (вход без пароля или повторная отправка). */
  async function sendCode(account) {
    await call('/v1/user-service/user/sendemail/code', { method: 'POST', body: { email: account, type: 'codeLogin' }, auth: false });
    return true;
  }
  /* Шаг 2: код из письма. */
  async function loginCode(account, code) {
    const d = await call('/v1/user-service/user/login', { method: 'POST', body: { account, code: String(code).trim() }, auth: false });
    return saveToken(d, account);
  }
  /* Ручной ввод токена (если включена двухфакторная аутентификация). */
  function setToken(token, days = 90) {
    token = String(token || '').trim().replace(/^Bearer\s+/i, '');
    if (!token) throw err(_t('Пустой токен'));
    patch({ token, expires: new Date(Date.now() + days * 864e5).toISOString() });
  }
  function logout() { patch({ token: null, expires: null }); }

  async function devices() {
    const d = await call('/v1/iot-service/api/user/bind');
    return (d.devices || []).map(x => ({
      id: String(x.dev_id || ''), name: String(x.name || ''), model: String(x.dev_product_name || x.dev_model_name || ''), online: !!x.online,
      printStatus: String(x.print_status || ''), nozzle: x.nozzle_diameter != null ? String(x.nozzle_diameter) : '', structure: String(x.dev_structure || ''),
    }));
  }

  /* История печати. status: 2 — завершено, 3 — прервано/ошибка, остальное — идёт сейчас. */
  async function tasks({ deviceId = '', limit = 100 } = {}) {
    const q = new URLSearchParams({ limit: String(limit) });
    if (deviceId) q.set('deviceId', deviceId);
    const d = await call('/v1/user-service/my/tasks?' + q);
    return (d.hits || []).map(normTask);
  }
  function normTask(t) {
    const start = Date.parse(t.startTime), end = Date.parse(t.endTime);
    const status = Number(t.status);
    const result = status === 2 ? 'ok' : status === 3 ? 'fail' : 'running';
    // costTime — оценка из слайсера; фактическая длительность — endTime − startTime (если печать завершена).
    const real = result !== 'running' && end > start + 60e3 ? (end - start) / 1000 : 0;
    const fil = (Array.isArray(t.amsDetailMapping) ? t.amsDetailMapping : []).map(a => ({
      type: String(a.filamentType || a.targetFilamentType || ''),
      color: /^[0-9a-f]{6}/i.test(a.targetColor || a.sourceColor || '') ? '#' + String(a.targetColor || a.sourceColor).slice(0, 6).toLowerCase() : '',
      grams: Number(a.weight) || 0,
      slot: a.amsId != null && a.slotId != null ? `AMS ${Number(a.amsId) + 1}-${Number(a.slotId) + 1}` : '',
    })).filter(f => f.grams > 0 || f.type);
    return {
      id: String(t.id),
      title: String(t.designTitle || t.title || _t('Без названия')),
      file: String(t.title || ''),
      plate: String(t.plateName || (t.plateIndex ? 'Plate ' + t.plateIndex : '')),
      cover: /^https:\/\//.test(t.cover || '') ? t.cover : '',
      deviceId: String(t.deviceId || ''),
      deviceName: String(t.deviceName || ''),
      start: isNaN(start) ? null : new Date(start).toISOString(),
      result,
      seconds: real || Number(t.costTime) || 0,
      estimated: !real,
      est: Number(t.costTime) || 0,
      designId: Number(t.designId) || 0, modelId: String(t.modelId || ''), plateIdx: Number(t.plateIndex) || 0,
      grams: Number(t.weight) || fil.reduce((a, f) => a + f.grams, 0),
      filaments: fil,
    };
  }

  /* Картинка Bambu Cloud (обложка задания) через Worker — чтобы сохранить её как фото изделия. */
  async function image(url) {
    const base = proxy();
    if (!base) throw err(_t('Не задан адрес прокси'));
    const res = await fetch(base + '/img?' + new URLSearchParams({ u: url }));
    if (!res.ok) throw err(_t('Не удалось загрузить картинку: HTTP ') + res.status);
    const blob = await res.blob();
    if (!/^image\//.test(blob.type)) throw err(_t('Не картинка'));
    return blob;
  }

  /* Прошивка: текущая версия и доступные обновления. */
  async function deviceVersion(devId) {
    const d = await call('/v1/iot-service/api/user/device/version?' + new URLSearchParams({ dev_id: devId }));
    const dev = (d.devices || []).find(x => String(x.dev_id) === String(devId)) || (d.devices || [])[0] || {};
    const cur = String(dev.version || '');
    const fw = (Array.isArray(dev.firmware) ? dev.firmware : []).map(f => ({ version: String(f.version || ''), force: !!f.force_update, description: String(f.description || '') })).filter(f => f.version);
    const upd = fw.find(f => f.version !== cur && cmpVer(f.version, cur) > 0) || null;
    return { version: cur, update: upd };
  }
  const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

  /* Текущая печать на принтерах аккаунта. */
  async function currentPrint() {
    const d = await call('/v1/iot-service/api/user/print?force=true');
    return (d.devices || []).map(x => {
      const prog = parseFloat(String(x.progress ?? '').replace('%', ''));
      const pred = Number(x.prediction);
      return {
        id: String(x.dev_id || ''), online: x.dev_online !== false,
        task: String(x.task_name || ''), status: String(x.task_status || ''),
        progress: Number.isFinite(prog) ? prog : null,
        remaining: Number.isFinite(pred) && pred > 0 ? pred : null, // секунды
        start: x.start_time ? String(x.start_time) : '',
        thumb: /^https:\/\//.test(x.thumbnail || '') ? x.thumbnail : '',
      };
    });
  }

  /* Катушки Bambu Lab, которые AMS считал по RFID. Остаток — оценка AMS.
   * Уникального номера катушки API не отдаёт: ключ строится из серии, цвета и веса,
   * одинаковые катушки различаются порядковым номером. */
  async function filaments() {
    const d = await call('/v1/design-user-service/my/filament/v2');
    const list = Array.isArray(d.hits) ? d.hits : Array.isArray(d.filaments) ? d.filaments : Array.isArray(d) ? d : [];
    const seen = new Map();
    return list.map(f => {
      const hex = String(f.color || f.colorCode || '').replace(/^#/, '');
      const color = /^[0-9a-f]{6}/i.test(hex) ? '#' + hex.slice(0, 6).toLowerCase() : '';
      const name = String(f.filamentName || f.name || '').trim(), type = String(f.filamentType || f.type || '').trim();
      const total = Number(f.totalNetWeight) || 0, remaining = Math.max(0, Number(f.netWeight) || 0);
      const slotRaw = f.slotId, inSlot = slotRaw !== '' && slotRaw != null && f.amsId != null;
      const base = [type, name, color, total].join('|').toLowerCase();
      const n = (seen.get(base) || 0) + 1; seen.set(base, n);
      const rawId = f.id ?? f.spoolId ?? f.trayUuid ?? f.tray_uuid ?? '';
      return {
        key: rawId !== '' ? 'id:' + rawId : base + '#' + n,
        name, type, color, total, remaining,
        inPrinter: !!f.inPrinter, depleted: !!f.depleted || (total > 0 && remaining <= 0),
        slot: inSlot ? `AMS ${Number(f.amsId) + 1}-${Number(slotRaw) + 1}` : '',
      };
    });
  }

  return {
    state, patch, proxy, region, connected, expired,
    login, sendCode, loginCode, setToken, logout, devices, tasks, filaments, deviceVersion, currentPrint, image,
  };
})();
