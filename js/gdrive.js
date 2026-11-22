/*
 * Хранилище Google Drive для PrintBench.
 * Папка в Drive по-прежнему называется «3D Print Calculator» — так сохраняется доступ к уже записанным данным.
 * Вход — Google Identity Services (token model), данные — Drive REST API v3.
 * Область доступа drive.file: приложение видит только файлы, которые создало само,
 * остальной Google Drive ему недоступен.
 *
 * Структура в Google Drive:
 *   3D Print Calculator/
 *     3d-print-data.json   — все данные
 *     photos/              — фото изделий
 *     backups/             — копии данных перед перезаписью
 */
window.GDrive = (() => {
  'use strict';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const FOLDER = 'application/vnd.google-apps.folder';
  const TOKEN_KEY = 'p2s_gdrive_token', IDS_KEY = 'p2s_gdrive_ids', CLIENT_KEY = 'p2s_gdrive_client';
  const ROOT_NAME = '3D Print Calculator', DATA_NAME = '3d-print-data.json', PHOTO_DIR = 'photos', BACKUP_DIR = 'backups';

  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* приватный режим */ } },
  };
  const getClientId = () => ls.get(CLIENT_KEY) || window.APP_CONFIG?.googleClientId || '';
  const setClientId = v => ls.set(CLIENT_KEY, v || null);
  const authError = (msg = _t('Нужно войти в Google')) => Object.assign(new Error(msg), { name: 'NotAllowedError' });

  /* ---------- Вход ---------- */
  let gisPromise = null, token = null;
  function preload() {
    return gisPromise || (gisPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { gisPromise = null; reject(new Error(_t('Не удалось загрузить вход Google — проверьте интернет'))); };
      document.head.append(s);
    }));
  }
  function cachedToken() {
    if (token && token.exp > Date.now() + 30000) return token;
    try { const t = JSON.parse(ls.get(TOKEN_KEY)); if (t && t.exp > Date.now() + 30000) return (token = t); } catch { /* нет токена */ }
    return null;
  }
  // interactive=true вызывать только из обработчика клика: Google открывает всплывающее окно
  async function signIn(interactive) {
    if (cachedToken()) return true;
    if (!interactive) return false;
    const clientId = getClientId();
    if (!clientId) throw new Error(_t('Не задан Google Client ID — см. раздел «Google Drive» в настройках'));
    await preload();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: r => {
          if (r.error) { reject(authError(r.error_description || r.error)); return; }
          token = { v: r.access_token, exp: Date.now() + Number(r.expires_in || 3600) * 1000 };
          ls.set(TOKEN_KEY, JSON.stringify(token));
          resolve(true);
        },
        error_callback: e => reject(Object.assign(
          new Error(e?.type === 'popup_closed' ? _t('Окно входа закрыто') : e?.type === 'popup_failed_to_open' ? _t('Браузер заблокировал окно входа Google') : (e?.message || _t('Вход не выполнен'))),
          { name: e?.type === 'popup_closed' ? 'AbortError' : 'Error' })),
      });
      client.requestAccessToken({ prompt: '' });
    });
  }
  function signOut() {
    if (token && window.google?.accounts?.oauth2) { try { google.accounts.oauth2.revoke(token.v, () => {}); } catch { /* не важно */ } }
    token = null;
    ls.set(TOKEN_KEY, null);
    ls.set(IDS_KEY, null);
  }

  /* ---------- REST ---------- */
  async function api(url, opt = {}) {
    if (!cachedToken()) throw authError();
    const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + token.v, ...(opt.headers || {}) } });
    if (r.status === 401) { token = null; ls.set(TOKEN_KEY, null); throw authError(); }
    if (!r.ok) {
      let m = ''; try { m = (await r.json()).error?.message || ''; } catch { /* тело не JSON */ }
      throw Object.assign(new Error(`Google Drive ${r.status}${m ? ': ' + m : ''}`), { status: r.status });
    }
    return r;
  }
  const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  async function list(parent, extra = '', fields = 'files(id,name,modifiedTime,version,md5Checksum)') {
    const query = `'${parent}' in parents and trashed=false${extra}`;
    let out = [], page = '';
    do {
      const r = await (await api(`${API}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,${encodeURIComponent(fields)}&pageSize=1000&spaces=drive${page ? '&pageToken=' + page : ''}`)).json();
      out = out.concat(r.files || []);
      page = r.nextPageToken || '';
    } while (page);
    return out;
  }
  const findOne = async (parent, name, folder) => (await list(parent, ` and name='${q(name)}'` + (folder ? ` and mimeType='${FOLDER}'` : '')))[0] || null;
  const meta = async id => (await api(`${API}/files/${id}?fields=id,name,modifiedTime,version,md5Checksum,trashed`)).json();
  const mkdir = async (parent, name) => (await api(`${API}/files?fields=id`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
  })).json();
  async function create(parent, name, blob) {
    const fd = new FormData();
    fd.append('metadata', new Blob([JSON.stringify({ name, parents: [parent] })], { type: 'application/json' }));
    fd.append('file', blob);
    return (await api(`${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime,version,md5Checksum`, { method: 'POST', body: fd })).json();
  }
  const update = async (id, blob) => (await api(`${UPLOAD}/files/${id}?uploadType=media&fields=id,name,modifiedTime,version,md5Checksum`, {
    method: 'PATCH', headers: { 'Content-Type': blob.type || 'application/octet-stream' }, body: blob,
  })).json();
  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  /* ---------- Хранилище (тот же интерфейс, что у папки на компьютере) ---------- */
  function store() {
    let ids = null, knownMd5 = null, photoIdsPromise = null;
    const saveIds = () => ls.set(IDS_KEY, JSON.stringify(ids));
    async function alive(id) {
      if (!id) return false;
      try { return !(await meta(id)).trashed; } catch (e) { if (e.name === 'NotAllowedError') throw e; return false; }
    }
    async function folder(key, name, parent) {
      if (await alive(ids[key])) return ids[key];
      const f = await findOne(parent, name, true);
      ids[key] = f ? f.id : (await mkdir(parent, name)).id;
      saveIds();
      return ids[key];
    }
    async function init() {
      if (!ids) { try { ids = JSON.parse(ls.get(IDS_KEY)) || {}; } catch { ids = {}; } }
      if (!ids.rootOk) { await folder('root', ROOT_NAME, 'root'); ids.rootOk = true; }
      return ids.root;
    }
    const sub = async (key, name) => folder(key, name, await init());
    async function dataMeta() {
      await init();
      if (ids.data) { try { const m = await meta(ids.data); if (!m.trashed) return m; } catch (e) { if (e.name === 'NotAllowedError') throw e; } }
      const f = await findOne(ids.root, DATA_NAME);
      ids.data = f?.id || '';
      saveIds();
      return f;
    }
    function photoIds() {
      return photoIdsPromise || (photoIdsPromise = (async () => {
        const dir = await sub('photos', PHOTO_DIR);
        return new Map((await list(dir, '', 'files(id,name)')).map(f => [f.name, f.id]));
      })().catch(e => { photoIdsPromise = null; throw e; }));
    }
    return {
      kind: 'gdrive', name: 'Google Drive', label: 'Google Drive',
      ensure: ask => signIn(ask),
      async read() {
        const m = await dataMeta();
        if (!m) return null;
        const text = (await (await api(`${API}/files/${m.id}?alt=media`)).text()).trim();
        knownMd5 = m.md5Checksum || null;
        return text ? { name: DATA_NAME, text, modified: new Date(m.modifiedTime) } : null;
      },
      async write(text) {
        await init();
        const blob = new Blob([text], { type: 'application/json' });
        let m = null;
        if (ids.data) m = await update(ids.data, blob).catch(e => { if (e.status === 404) return null; throw e; });
        if (!m) { m = await create(ids.root, DATA_NAME, blob); ids.data = m.id; saveIds(); }
        knownMd5 = m.md5Checksum || null;
      },
      // true, если СОДЕРЖИМОЕ файла данных изменили с другого устройства после нашего последнего чтения/записи.
      // Сравниваем md5 содержимого, а не version: version в Google Drive растёт и без изменения данных.
      async remoteChanged() {
        if (!knownMd5 || !ids?.data) return false;
        const m = await meta(ids.data);
        return !!m.md5Checksum && m.md5Checksum !== knownMd5;
      },
      async backup(text) {
        await create(await sub('backups', BACKUP_DIR), `3d-print-data_${stamp()}.json`, new Blob([text], { type: 'application/json' }));
      },
      async getPhoto(name) {
        const id = (await photoIds()).get(name);
        if (!id) throw new Error(_t('Фото не найдено'));
        return (await api(`${API}/files/${id}?alt=media`)).blob();
      },
      async putPhoto(name, blob) {
        const map = await photoIds(), id = map.get(name);
        if (id) { await update(id, blob); return; }
        const m = await create(await sub('photos', PHOTO_DIR), name, blob);
        map.set(name, m.id);
      },
      async delPhoto(name) {
        const map = await photoIds(), id = map.get(name);
        if (!id) return;
        await api(`${API}/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
        map.delete(name);
      },
      async remember() { /* вход запоминается токеном, выбор хранилища — в app.js */ },
      async forget() { signOut(); },
    };
  }

  return { store, preload, signOut, getClientId, setClientId, configured: () => !!getClientId() };
})();
