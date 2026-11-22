/*
 * Демо-режим PrintBench: открыть index.html?demo
 *
 *  ?demo        — приложение работает на демо-данных (mock/demo-data.js) и фейковом Bambu Cloud
 *                 (mock/bambu-mock.js). Изменения сохраняются между перезагрузками — в отдельной
 *                 «песочнице» браузера, ваши настоящие данные не затрагиваются.
 *  ?demo=reset  — сбросить песочницу и заново создать демо-данные (даты — от сегодняшнего дня).
 *
 * Изоляция:
 *  - localStorage: все ключи получают префикс «pbdemo:» (кроме темы и языка — они общие);
 *  - IndexedDB: база p2s_cost подменяется на p2s_cost_demo;
 *  - подключение папки на компьютере и Google Drive в демо-режиме отключено —
 *    чтобы демо-данные случайно не записались в настоящее хранилище.
 */
(() => {
  'use strict';
  const PREFIX = 'pbdemo:', SHARED = new Set(['p2s_theme', 'p2s_lang']);
  const DB_REAL = 'p2s_cost', DB_DEMO = 'p2s_cost_demo', SEED_VER = '1';
  const params = new URLSearchParams(location.search);
  const reset = params.get('demo') === 'reset';

  /* ---------- localStorage с префиксом ---------- */
  let raw = null;
  try { raw = window.localStorage; } catch { /* приватный режим */ }
  const mem = new Map();
  const k = key => (SHARED.has(String(key)) ? String(key) : PREFIX + key);
  const own = () => { const out = []; try { for (let i = 0; i < raw.length; i++) { const x = raw.key(i); if (x.startsWith(PREFIX)) out.push(x.slice(PREFIX.length)); } } catch { out.push(...mem.keys()); } return out; };
  const shim = {
    getItem(key) { try { return raw.getItem(k(key)); } catch { return mem.has(key) ? mem.get(key) : null; } },
    setItem(key, v) { try { raw.setItem(k(key), String(v)); } catch { mem.set(key, String(v)); } },
    removeItem(key) { try { raw.removeItem(k(key)); } catch { mem.delete(key); } },
    clear() { for (const x of own()) shim.removeItem(x); },
    key(i) { return own()[i] ?? null; },
    get length() { return own().length; },
  };
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => shim }); }
  catch (e) { console.error('[demo] не удалось изолировать localStorage — демо-режим остановлен', e); alert('Demo mode: localStorage isolation failed'); throw e; }

  /* ---------- отдельная база IndexedDB ---------- */
  const idbOpen = indexedDB.open.bind(indexedDB);
  indexedDB.open = (name, ...rest) => idbOpen(name === DB_REAL ? DB_DEMO : name, ...rest);

  /* ---------- без настоящих хранилищ ---------- */
  try { delete window.showDirectoryPicker; } catch { /* */ }
  window.showDirectoryPicker = undefined;           // app.js: fsOK = false → выбор папки недоступен
  if (window.APP_CONFIG) window.APP_CONFIG.googleClientId = '';
  if (window.GDrive) {
    const no = () => Promise.reject(Object.assign(new Error(window.I18N?.lang === 'en' ? 'Google Drive is disabled in demo mode' : 'Google Drive отключён в демо-режиме'), { name: 'NotAllowedError' }));
    window.GDrive = { ...window.GDrive, configured: () => false, preload: no, setClientId() {}, store: () => ({ kind: 'gdrive', name: 'Google Drive', label: 'Google Drive', ensure: no, read: no, write: no, remoteChanged: no, backup: no, getPhoto: no, putPhoto: no, delPhoto: no, forget: async () => {} }) };
  }

  /* ---------- заполнение песочницы ---------- */
  if (reset || shim.getItem('demo_seeded') !== SEED_VER) {
    shim.clear();
    indexedDB.deleteDatabase(DB_DEMO);              // открытие базы приложением дождётся удаления
    const lang = window.I18N?.lang || 'ru';
    shim.setItem('p2s_cost_catalog_v2', JSON.stringify(window.PB_DEMO_DATA.build(lang)));
    shim.setItem('p2s_bambu', JSON.stringify({ token: 'demo-token', account: 'demo@printbench.local', expires: new Date(Date.now() + 80 * 864e5).toISOString(), region: 'global' }));
    shim.setItem('demo_seeded', SEED_VER);
    if (reset) { params.set('demo', ''); history.replaceState(null, '', location.pathname + '?' + params.toString().replace(/=(&|$)/, '$1') + location.hash); }
  }
  window.PB_DEMO = true;

  /* ---------- плашка «Демо» ---------- */
  const en = () => window.I18N?.lang === 'en';
  function banner() {
    if (document.getElementById('demoBar')) return;
    const bar = document.createElement('div');
    bar.id = 'demoBar';
    bar.setAttribute('role', 'note');
    bar.style.cssText = 'position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:9999;display:flex;gap:8px;align-items:center;padding:6px 8px 6px 12px;border-radius:999px;background:#f59e0b;color:#1b1300;font:600 12.5px/1.2 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.25)';
    const btn = 'border:0;border-radius:999px;padding:5px 10px;font:inherit;cursor:pointer;background:rgba(0,0,0,.14);color:inherit';
    bar.innerHTML = `<span>${en() ? 'DEMO data' : 'ДЕМО-данные'}</span>`
      + `<button type="button" data-a="reset" style="${btn}" title="${en() ? 'Recreate demo data from scratch' : 'Создать демо-данные заново'}">${en() ? 'Reset' : 'Сбросить'}</button>`
      + `<button type="button" data-a="exit" style="${btn}" title="${en() ? 'Back to your real data' : 'Вернуться к своим данным'}">${en() ? 'Exit' : 'Выйти'}</button>`;
    bar.onclick = e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'reset' && confirm(en() ? 'Discard demo changes and recreate the demo data?' : 'Отменить изменения в демо и создать демо-данные заново?')) location.search = '?demo=reset';
      if (a === 'exit') location.href = location.pathname + location.hash;
    };
    document.body.appendChild(bar);
  }
  document.addEventListener('DOMContentLoaded', banner);
  console.info('[demo] PrintBench в демо-режиме: данные из mock/demo-data.js, Bambu Cloud — mock/bambu-mock.js. Сброс: ?demo=reset');
})();
