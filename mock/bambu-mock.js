/*
 * Фейковый Bambu Lab Cloud для демо-режима: ни одного сетевого запроса.
 * Подменяет сетевые методы window.Bambu (js/bambu.js), сохраняя его хранение состояния
 * (токен, регион, выбранный принтер — в localStorage, который в демо-режиме изолирован).
 *
 * Сценарии, которые видны в интерфейсе:
 *  - P2S в сети и печатает, доступно обновление прошивки; AMS: катушка с RFID (узнаётся),
 *    сторонняя катушка, привязанная к слоту, сторонняя без привязки (подсказка), подаётся PLA-CF, внешняя TPU;
 *  - A1 mini не в сети — чтение AMS возвращает ошибку;
 *  - X1 Carbon в аккаунте не связан ни с одним принтером — кнопка «Связать» у Ender-3;
 *  - история заданий: часть уже импортирована в журнал, часть новые (ОК, ошибка, идёт сейчас),
 *    модель из двух столов — импортируется как сборка;
 *  - катушки Bambu Lab по RFID: уже на складе и новая.
 */
(() => {
  'use strict';
  const real = window.Bambu;
  if (!real) return;
  const en = () => window.I18N?.lang === 'en';
  const L = (ru, e) => (en() ? e : ru);
  const wait = (ms = 250 + Math.random() * 350) => new Promise(r => setTimeout(r, ms));
  const ago = (days, h = 12) => { const x = new Date(); x.setHours(h, 0, 0, 0); x.setDate(x.getDate() - days); return x.toISOString(); };

  const DEV = { p2s: 'DEMO-P2S-0001', a1m: 'DEMO-A1M-0002', x1c: 'DEMO-X1C-0003' };

  async function devices() {
    await wait();
    return [
      { id: DEV.p2s, name: L('P2S в мастерской', 'Workshop P2S'), model: 'P2S', online: true, printStatus: 'RUNNING', nozzle: '0.4', structure: 'corexy' },
      { id: DEV.a1m, name: 'A1 mini', model: 'A1 mini', online: false, printStatus: 'OFFLINE', nozzle: '0.4', structure: 'i3' },
      { id: DEV.x1c, name: L('X1C на даче', 'Cottage X1C'), model: 'X1 Carbon', online: true, printStatus: 'IDLE', nozzle: '0.4', structure: 'corexy' },
    ];
  }

  async function currentPrint() {
    await wait();
    return [
      { id: DEV.p2s, online: true, task: L('Кронштейн камеры v5', 'Camera bracket v5'), status: 'RUNNING', progress: 63, remaining: 5520, start: ago(0, 9), thumb: '' },
      { id: DEV.a1m, online: false, task: '', status: 'IDLE', progress: null, remaining: null, start: '', thumb: '' },
      { id: DEV.x1c, online: true, task: '', status: 'FINISH', progress: 100, remaining: null, start: '', thumb: '' },
    ];
  }

  async function deviceVersion(devId) {
    await wait(150);
    if (devId === DEV.p2s) return {
      version: '01.01.02.00',
      update: { version: '01.02.00.00', force: false, description: L(
        'Демо-описание прошивки:\n— улучшена калибровка потока;\n— исправлены ложные ошибки буфера филамента;\n— AMS: быстрее определяет остаток.',
        'Demo firmware notes:\n— improved flow calibration;\n— fixed false filament buffer errors;\n— AMS: faster remaining-weight detection.') },
    };
    return { version: '01.04.00.00', update: null };
  }

  /* История печати — в нормализованном виде, как его отдаёт js/bambu.js (normTask). */
  function task(id, o) {
    return { id, title: '', file: '', plate: '', cover: '', deviceId: DEV.p2s, deviceName: 'P2S', start: null, result: 'ok', seconds: 0, estimated: false, est: 0,
      designId: 0, modelId: '', plateIdx: 0, grams: 0, filaments: [], ...o, grams: o.grams ?? (o.filaments || []).reduce((a, f) => a + f.grams, 0) };
  }
  const fil = (type, color, grams, slot = 'AMS 1-1') => ({ type, color, grams, slot });
  async function tasks({ deviceId = '' } = {}) {
    await wait();
    const list = [
      // уже импортированы (в журнале src = bambu:<id>)
      task('demo-t01', { title: L('Крепление GoPro на руль', 'GoPro handlebar mount'), file: 'gopro_mount.3mf', plate: 'Plate 1', start: ago(92, 10), seconds: 6480, filaments: [fil('PETG', '#f57c00', 44, 'AMS 1-2'), fil('TPU', '#1b1b1b', 8, L('Внешняя', 'External'))] }),
      task('demo-t02', { title: L('Спиральная ваза', 'Spiral vase'), file: 'vase.3mf', plate: 'Plate 1', start: ago(80, 11), seconds: 18000, filaments: [fil('PLA', '#d4af37', 120)] }),
      task('demo-t03', { title: L('Переходник вытяжки', 'Exhaust adapter'), file: 'vent_adapter.3mf', start: ago(55, 9), seconds: 23760, filaments: [fil('ASA', '#f0f0ec', 182)] }),
      task('demo-t04', { title: L('Корпус для Raspberry Pi 5', 'Raspberry Pi 5 case'), file: 'rpi5_case.3mf', start: ago(26, 13), seconds: 17280, filaments: [fil('ABS', '#8a8f98', 110, 'AMS 1-3')] }),
      // новые — можно импортировать
      task('demo-t05', { title: L('Набор кашпо «Соты»', 'Honeycomb planter set'), file: 'hex_planters.3mf', plate: L('Большое', 'Large'), plateIdx: 1, designId: 777001, start: ago(5, 8), seconds: 15300, filaments: [fil('PETG', '#f57c00', 140, 'AMS 1-2')] }),
      task('demo-t06', { title: L('Набор кашпо «Соты»', 'Honeycomb planter set'), file: 'hex_planters.3mf', plate: L('Малое', 'Small'), plateIdx: 2, designId: 777001, start: ago(4, 15), seconds: 7200, filaments: [fil('PETG', '#f57c00', 62, 'AMS 1-2')] }),
      task('demo-t07', { title: L('Держатель для отвёрток', 'Screwdriver rack'), file: 'rack.3mf', start: ago(2, 19), seconds: 9900, filaments: [fil('PLA', '#f5f5f5', 88), fil('PLA', '#1b1b1b', 12, 'AMS 1-4')] }),
      task('demo-t08', { title: L('Кронштейн камеры', 'Camera bracket'), file: 'cam_bracket_v5.3mf', start: ago(1, 21), result: 'fail', seconds: 2100, estimated: false, est: 11160, filaments: [fil('PLA-CF', '#2a2a2a', 21, 'AMS 1-4')] }),
      task('demo-t09', { title: L('Кронштейн камеры v5', 'Camera bracket v5'), file: 'cam_bracket_v5.3mf', start: ago(0, 9), result: 'running', seconds: 11160, estimated: true, est: 11160, filaments: [fil('PLA-CF', '#2a2a2a', 74, 'AMS 1-4')] }),
      task('demo-t10', { title: L('Фигурка лисы', 'Fox figurine'), file: 'fox.3mf', deviceId: DEV.a1m, deviceName: 'A1 mini', start: ago(6, 17), seconds: 8400, designId: 777002, filaments: [fil('PLA', '#f57c00', 41)] }),
    ];
    return deviceId ? list.filter(t => t.deviceId === deviceId) : list;
  }

  /* Катушки Bambu Lab, считанные AMS по RFID (ключи id:demo-f1/f2/f6 уже на складе). */
  async function filaments() {
    await wait();
    return [
      { key: 'id:demo-f1', name: 'PLA Basic', type: 'PLA', color: '#f5f5f5', total: 1000, remaining: 620, inPrinter: true, depleted: false, slot: 'AMS 1-1' },
      { key: 'id:demo-f6', name: 'PLA-CF', type: 'PLA-CF', color: '#2a2a2a', total: 1000, remaining: 350, inPrinter: true, depleted: false, slot: 'AMS 1-4' },
      { key: 'id:demo-f2', name: 'PLA Basic', type: 'PLA', color: '#1b1b1b', total: 1000, remaining: 310, inPrinter: false, depleted: false, slot: '' },
      { key: 'id:demo-f9', name: 'PETG HF', type: 'PETG', color: '#2e9e4f', total: 1000, remaining: 1000, inPrinter: false, depleted: false, slot: '' },
      { key: 'id:demo-f10', name: 'PLA Matte', type: 'PLA', color: '#7a5230', total: 1000, remaining: 0, inPrinter: false, depleted: true, slot: '' },
    ];
  }

  /* «Сейчас в AMS» — в нормализованном виде, как его отдаёт js/bambu.js (ams). */
  function tray(gid, o) {
    const unit = gid >= 254 ? 255 : Math.floor(gid / 4);
    return { gid, label: gid >= 254 ? L('Внешняя катушка', 'External spool') : `AMS ${unit + 1}-${(gid % 4) + 1}`, unit, empty: false, active: false,
      uuid: null, tag: null, type: '', name: '', idx: '', color: '', cols: [], remain: null, weight: 0, diameter: 1.75, ...o };
  }
  async function ams(devId) {
    await wait(900);
    if (devId === DEV.a1m) throw Object.assign(new Error(L('Принтер не в сети — отчёт AMS недоступен (демо).', 'Printer is offline — AMS report unavailable (demo).')), { code: 'http' });
    if (devId !== DEV.p2s) return { at: Date.now(), full: true, units: [], ext: null, trays: [] };
    const trays = [
      tray(0, { uuid: 'A1B2C3D4E5F60718293A4B5C6D7E8F90', tag: '1A2B3C4D', type: 'PLA', name: 'PLA Basic', idx: 'GFA00', color: '#f5f5f5', remain: 20, weight: 1000 }),  // RFID → «PLA Basic Белый»
      tray(1, { type: 'PETG', color: '#f57c00', weight: 1000 }),                                                                                                     // сторонняя, привязана к слоту
      tray(2, { type: 'ABS', color: '#8c9099', weight: 1000 }),                                                                                                      // сторонняя, подсказка
      tray(3, { uuid: '5A5A5A5A0000111122223333444455AA', tag: '5A5A5A5A', type: 'PLA-CF', name: 'PLA-CF', idx: 'GFA50', color: '#2a2a2a', remain: 76, weight: 1000, active: true }),
    ];
    const ext = tray(254, { type: 'TPU', color: '#1b1b1b' });
    return { at: Date.now(), full: true, units: [{ id: 0, humidity: '2', temp: 26.5, trays }], ext, trays: [...trays, ext] };
  }

  /* Вход — всегда успешен, без сети. */
  const okToken = account => { real.patch({ token: 'demo-token', account: account || 'demo@printbench.local', expires: new Date(Date.now() + 80 * 864e5).toISOString() }); return { ok: true }; };
  async function login(account) { await wait(); return okToken(account); }
  async function sendCode() { await wait(); return true; }
  async function loginCode(account) { await wait(); return okToken(account); }
  async function image() { throw new Error(L('Картинки Bambu Cloud в демо-режиме не загружаются', 'Bambu Cloud images are not loaded in demo mode')); }

  window.Bambu = { ...real, proxy: () => 'https://demo.invalid', login, sendCode, loginCode, devices, tasks, filaments, deviceVersion, currentPrint, image, ams };
})();
