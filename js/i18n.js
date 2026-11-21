/*
 * Локализация (ru / en).
 * Исходный язык интерфейса — русский: строки в коде остаются русскими и
 * оборачиваются в _t('…'). В режиме EN _t() ищет перевод в словаре
 * window.I18N_EN (js/i18n-en.js). Строка с HTML разбивается на текстовые
 * фрагменты, и каждый переводится отдельно; пунктуация по краям фрагмента
 * (·, —, :, скобки, «» …) сохраняется как есть.
 * Статичный текст index.html переводится один раз при загрузке.
 * Переключение языка перезагружает страницу.
 */
(() => {
  'use strict';
  const KEY = 'p2s_lang';
  const LANGS = ['ru', 'en'];
  let lang = '';
  try { lang = localStorage.getItem(KEY) || ''; } catch { /* приватный режим */ }
  if (!LANGS.includes(lang)) lang = /^ru|^uk|^be|^kk/i.test(navigator.language || '') ? 'ru' : 'en';

  const dict = lang === 'en' ? (window.I18N_EN || {}) : null;
  const RUN = /[^<>"'`\\\n]*[А-Яа-яЁё][^<>"'`\\\n]*/g;
  const EDGE = /^([\s·•—–:;,.()«»+＋…/№|?!-]*)([\s\S]*?)([\s·•—–:;,.()«»+＋…/№|?!-]*)$/;
  const QUOTES = { '«': '“', '»': '”' };
  const cache = new Map();

  const piece = run => {
    const m = run.match(EDGE);
    if (!m || !m[2]) return run;
    const tr = dict[m[2]];
    if (tr == null) return run;
    // перевод вставляется и в HTML-атрибуты — без прямых кавычек
    const safe = tr.replace(/'/g, '’').replace(/"/g, '”');
    return (m[1] || '').replace(/[«»]/g, c => QUOTES[c]) + safe + (m[3] || '').replace(/[«»]/g, c => QUOTES[c]);
  };

  const t = s => {
    if (!dict || typeof s !== 'string' || !s) return s;
    let r = cache.get(s);
    if (r === undefined) { r = s.replace(RUN, piece); cache.set(s, r); }
    return r;
  };

  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const CY = /[А-Яа-яЁё]/;
  const translateDom = root => {
    if (!dict) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walker.currentNode; n; n = walker.nextNode()) {
      if (n.nodeType === 3) {
        const p = n.parentNode && n.parentNode.nodeName;
        if (p !== 'SCRIPT' && p !== 'STYLE' && CY.test(n.nodeValue)) n.nodeValue = t(n.nodeValue);
      } else {
        for (const a of ATTRS) { const v = n.getAttribute(a); if (v && CY.test(v)) n.setAttribute(a, t(v)); }
        if (n.content && n.content.nodeType === 11) translateDom(n.content);
      }
    }
  };

  const setLang = l => {
    if (!LANGS.includes(l) || l === lang) return;
    try { localStorage.setItem(KEY, l); } catch { /* приватный режим */ }
    location.reload();
  };

  document.documentElement.lang = lang;
  window._t = t;
  window.I18N = { lang, loc: lang === 'en' ? 'en-US' : 'ru-RU', t, setLang, translateDom };

  const init = () => {
    if (dict) {
      translateDom(document.body);
      document.title = t(document.title);
      const md = document.querySelector('meta[name=description]');
      if (md) md.content = t(md.content);
    }
    const b = document.getElementById('langBtn');
    if (b) {
      b.textContent = lang === 'en' ? 'RU' : 'EN';
      b.title = lang === 'en' ? 'Русский язык' : 'Switch to English';
      b.onclick = () => setLang(lang === 'en' ? 'ru' : 'en');
    }
    const sel = document.getElementById('langSel');
    if (sel) { sel.value = lang; sel.onchange = () => setLang(sel.value); }
  };
  // Скрипт подключён в конце <body> до app.js: статичная разметка уже есть,
  // а пользовательские данные ещё не отрисованы — их переводить нельзя.
  init();
})();
