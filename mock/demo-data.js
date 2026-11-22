/*
 * Демо-данные PrintBench — фейковая мастерская, которая показывает все экраны приложения.
 *
 * Даты считаются от сегодняшнего дня, поэтому главная («этот месяц»), загрузка принтера
 * и сроки обслуживания всегда выглядят «живыми». Тексты — на языке интерфейса (RU/EN).
 *
 * Что покрыто:
 *  - 3 принтера: P2S и A1 mini связаны с (фейковым) Bambu Cloud, Ender — без облака;
 *    журнал обслуживания с просроченными, «скоро» и выполненными работами, отключённая работа,
 *    своя периодичность, привязка слота AMS к сторонней катушке;
 *  - 7 материалов, включая абразивный PLA-CF (влияет на интервал проверки ножа);
 *  - катушки во всех статусах: запечатанные, открытые, закончившиеся, с RFID и без,
 *    многоцветные, с отзывами и оценками, с ручными операциями (взвешивание, списание), «заканчиваются»;
 *  - изделия во всех статусах, сборка с вложенными изделиями в два уровня, несколько материалов,
 *    доп. затраты, ссылки, описание, профиль печати, теги;
 *  - журнал печати за ~5 месяцев: столы из нескольких изделий с долями, прототипы с версиями,
 *    неудачные печати и неудачные детали на столе, печати без изделия, импортированные из Bambu Cloud.
 *
 * Схема — как у файла 3d-print-data.json (version 5); приложение прогоняет её через свою нормализацию.
 */
window.PB_DEMO_DATA = (() => {
  'use strict';

  function build(lang = 'ru') {
    const L = (ru, en) => (lang === 'en' ? en : ru);
    const pad = n => String(n).padStart(2, '0');
    const ymd = x => x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
    const day = n => { const x = new Date(); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - n); return x; };
    const d = n => ymd(day(n));                                   // дата n дней назад
    const at = (n, h = 12, m = 0) => { const x = day(n); x.setHours(h, m, 0, 0); return x.toISOString(); };

    /* ---------- Принтеры ---------- */
    const printers = [
      {
        id: 'p2s', name: 'Bambu Lab P2S', price: 76990, years: 5, annualHours: 500, watts: 120, maintenance: 3,
        bambuDev: 'DEMO-P2S-0001', baseHours: 42, since: d(170),
        maint: {
          xy: [{ date: d(150), hours: 60, grams: 900 }, { date: d(75), hours: 210, grams: 4200 }],   // по загрузке — пора
          z: [{ date: d(75), hours: 210, grams: 4200 }],
          idler: [{ date: d(80), hours: 200, grams: 4000 }],                                           // скоро
          camera: [{ date: d(169), hours: 42, grams: 0 }],                                             // скоро/пора
          cutter: [{ date: d(40), hours: 280, grams: 6100 }],
          nozzle: [{ date: d(12), hours: 330, grams: 7400 }],
        },
        maintCfg: { pad: { off: true }, filter: { every: 1200 } },
        amsSlots: { 1: { spool: 's-petg-orange', type: 'PETG', color: '#f57c00' } },
      },
      {
        id: 'a1m', name: 'Bambu Lab A1 mini', price: 22990, years: 4, annualHours: 400, watts: 80, maintenance: 2,
        bambuDev: 'DEMO-A1M-0002', since: d(400), baseHours: 310,
        maint: { xy: [{ date: d(20), hours: 340, grams: 0 }], z: [{ date: d(100), hours: 320, grams: 0 }], idler: [{ date: d(60), hours: 330, grams: 0 }], camera: [{ date: d(150), hours: 315, grams: 0 }] },
      },
      { id: 'ender', name: 'Creality Ender-3 V3', price: 24990, years: 4, annualHours: 300, watts: 150, maintenance: 4, since: d(600), baseHours: 520 },
    ];

    /* ---------- Материалы, ₽/кг ---------- */
    const materials = [
      { id: 'pla', name: 'PLA', price: 1190 },
      { id: 'petg', name: 'PETG', price: 1090 },
      { id: 'abs', name: 'ABS', price: 1200 },
      { id: 'asa', name: 'ASA', price: 1490 },
      { id: 'tpu', name: 'TPU', price: 1890 },
      { id: 'placf', name: 'PLA-CF', price: 2490 },
      { id: 'silk', name: L('PLA Silk', 'PLA Silk'), price: 1390, density: 1.24 },
    ];

    /* ---------- Катушки ---------- */
    const sp = (id, o) => ({ id, diameter: 1.75, net: 1000, createdAt: at(o.purchasedDays ?? 60), purchased: d(o.purchasedDays ?? 60), ...o });
    const spools = [
      sp('s-pla-white', { materialId: 'pla', brand: 'Bambu Lab', series: 'PLA Basic', color: L('Белый', 'White'), colorHex: '#f5f5f5', price: 1290, store: 'Ozon', status: 'open', purchasedDays: 120, opened: d(110),
        rfid: 'A1B2C3D4E5F60718293A4B5C6D7E8F90', bambu: 'id:demo-f1', rating: 5, rtags: ['easy', 'surface', 'dia'], review: L('Эталон: печатается на дефолтном профиле без единой сопли.', 'The reference spool: prints on the default profile without a single string.') }),
      sp('s-pla-white2', { materialId: 'pla', brand: 'Bambu Lab', series: 'PLA Basic', color: L('Белый', 'White'), colorHex: '#f5f5f5', price: 1190, store: 'Ozon', status: 'sealed', purchasedDays: 9 }),
      sp('s-pla-black', { materialId: 'pla', brand: 'Bambu Lab', series: 'PLA Basic', color: L('Чёрный', 'Black'), colorHex: '#1b1b1b', price: 1190, store: L('Официальный сайт', 'Official store'), status: 'open', purchasedDays: 95, opened: d(70),
        rfid: '0F1E2D3C4B5A69788796A5B4C3D2E1F0', bambu: 'id:demo-f2', rating: 4, rtags: ['easy'] }),
      sp('s-pla-red', { materialId: 'pla', brand: 'Bambu Lab', series: 'PLA Matte', color: L('Красный', 'Red'), colorHex: '#d32f2f', price: 1390, store: 'Wildberries', status: 'open', purchasedDays: 140, opened: d(130), net: 500 }),
      sp('s-petg-orange', { materialId: 'petg', brand: 'SUNLU', series: 'PETG', color: L('Оранжевый', 'Orange'), colorHex: '#f57c00', price: 990, store: 'Wildberries', status: 'open', purchasedDays: 100, opened: d(90), dried: d(14),
        rating: 4, rtags: ['strong', 'string'], review: L('Прочный, но тянет нити — помогает сушка 65 °C × 6 ч.', 'Strong, but strings — drying at 65 °C for 6 h helps.') }),
      sp('s-petg-clear', { materialId: 'petg', brand: 'Bambu Lab', series: 'PETG HF', color: L('Прозрачный', 'Clear'), colorHex: '#e6f2f5', price: 1290, store: 'Ozon', status: 'sealed', purchasedDays: 5 }),
      sp('s-silk', { materialId: 'silk', brand: 'Bambu Lab', series: 'PLA Silk+', color: L('Золото-серебро', 'Gold-silver'), colorHex: '#d4af37', colorStops: ['#d4af37', '#c0c0c0'], price: 1590, store: 'Ozon', status: 'open', purchasedDays: 80, opened: d(60),
        rating: 5, rtags: ['surface', 'colorok'] }),
      sp('s-placf', { materialId: 'placf', brand: 'Bambu Lab', series: 'PLA-CF', color: L('Чёрный', 'Black'), colorHex: '#2a2a2a', price: 2490, store: L('Официальный сайт', 'Official store'), status: 'open', purchasedDays: 50, opened: d(45),
        rfid: '5A5A5A5A0000111122223333444455AA', bambu: 'id:demo-f6', rating: 4, rtags: ['strong', 'surface'] }),
      sp('s-abs', { materialId: 'abs', brand: 'eSUN', series: 'ABS+', color: L('Серый', 'Grey'), colorHex: '#8a8f98', price: 1200, store: 'AliExpress', status: 'open', purchasedDays: 160, opened: d(150), dried: d(30),
        rating: 3, rtags: ['warp', 'layers'], review: L('Без кожуха коробится на крупных деталях. Только с закрытой камерой и клеем.', 'Warps on large parts without an enclosure. Enclosed chamber and glue only.'),
        ops: [{ id: 'op-abs-1', at: at(35, 19), date: d(35), type: 'set', grams: 640, note: L('Взвесил на весах', 'Weighed on a scale') }] }),
      sp('s-tpu', { materialId: 'tpu', brand: 'Bambu Lab', series: 'TPU 95A HF', color: L('Чёрный', 'Black'), colorHex: '#1b1b1b', price: 1890, store: 'Ozon', status: 'open', purchasedDays: 70, opened: d(65), net: 500 }),
      sp('s-asa', { materialId: 'asa', brand: 'Polymaker', series: 'ASA', color: L('Белый', 'White'), colorHex: '#f0f0ec', price: 1490, store: L('Яндекс Маркет', 'Yandex Market'), status: 'open', purchasedDays: 110, opened: d(100), net: 750 }),
      sp('s-pla-green', { materialId: 'pla', brand: 'eSUN', series: 'PLA+', color: L('Зелёный', 'Green'), colorHex: '#2e9e4f', price: 890, store: 'AliExpress', status: 'empty', purchasedDays: 200, opened: d(190),
        rating: 2, rtags: ['string', 'wet', 'diambad'], review: L('Пришёл сырым, после сушки терпимо. Больше не беру.', 'Arrived wet, tolerable after drying. Not buying again.'),
        ops: [{ id: 'op-gr-1', at: at(158, 20), date: d(158), type: 'sub', grams: 150, note: L('Отрезал отсыревший участок', 'Cut off a wet section') },
          { id: 'op-gr-2', at: at(145, 21), date: d(145), type: 'set', grams: 0, note: L('Закончилась', 'Ran out') }] }),
      sp('s-pla-blue', { materialId: 'pla', brand: 'Bambu Lab', series: 'PLA Translucent', color: L('Голубой', 'Light blue'), colorHex: '#4fc3f7', price: 1490, store: 'Ozon', status: 'open', purchasedDays: 40, opened: d(30) }),
    ];

    /* ---------- Изделия ---------- */
    const mw = id => ({ title: 'MakerWorld', url: 'https://makerworld.com/models/' + id });
    const part = (hours, fils, qty = 1) => [{ id: 'pt-' + Math.random().toString(36).slice(2, 8), name: '', qty, hours, filaments: fils.map(([materialId, grams]) => ({ materialId, grams })) }];
    const asm = () => part(0, []);
    const it = (id, o) => ({ id, status: 'done', tags: [], extra: 0, notes: '', links: [], photos: [], cover: '', createdAt: at(o.days ?? 30), updatedAt: at(Math.max(0, (o.days ?? 30) - 3)), ...o });
    const items = [
      it('i-hook', { name: L('Крючок для наушников', 'Headphone hook'), status: 'published', days: 150, tags: [L('дом', 'home'), L('подарок', 'gift')], printerId: 'p2s',
        parts: part(1.4, [['pla', 38]]), links: [mw(102938)], print: { nozzle: '0.4', layer: '0.2', infill: '15% gyroid', walls: '3', supports: L('нет', 'none'), plate: 'Textured PEI', other: '' },
        desc: { lang, intro: L('Крючок под столешницу до 40 мм, держит полноразмерные наушники.', 'Under-desk hook for tabletops up to 40 mm; holds full-size headphones.'), hardware: L('2 самореза 3×16', '2 wood screws 3×16'), assembly: '', tips: L('Печатать на боку — так слои идут вдоль нагрузки.', 'Print on its side so layers follow the load.') } }),
      it('i-planter', { name: L('Кашпо «Волна»', 'Wave planter'), status: 'published', days: 120, tags: [L('дом', 'home'), L('растения', 'plants')], printerId: 'p2s', extra: 120,
        parts: part(6.2, [['petg', 165]]), links: [mw(118842), { title: 'YouTube', url: 'https://youtube.com/watch?v=demo' }],
        notes: L('Доп. затраты — дренажная сетка и поддон.', 'Extra cost: drainage mesh and saucer.'),
        print: { nozzle: '0.6', layer: '0.28', infill: '0%', walls: '2', supports: L('нет', 'none'), plate: 'Smooth PEI', other: L('Режим вазы выключен', 'Vase mode off') },
        desc: { lang, intro: L('Кашпо с волнистой стенкой для горшков до 12 см.', 'Planter with a wavy wall for pots up to 12 cm.'), hardware: L('Дренажная сетка, поддон Ø14 см', 'Drainage mesh, Ø14 cm saucer'), assembly: L('Вложить сетку, поставить на поддон.', 'Insert the mesh, place on the saucer.'), tips: L('PETG — чтобы не боялся воды и солнца.', 'PETG so it handles water and sun.') } }),
      // Сборка: органайзер → основание, стаканы, лоток, ящичек (сам сборка: корпус + ручки)
      it('i-org', { name: L('Органайзер для стола', 'Desk organizer'), status: 'done', days: 100, tags: [L('офис', 'office')], printerId: 'p2s', parts: asm(), extra: 90,
        notes: L('Сборка из пяти деталей. Доп. затраты — магниты.', 'Five-part assembly. Extra cost: magnets.'), links: [mw(125501)],
        desc: { lang, intro: L('Модульный органайзер: детали держатся на магнитах.', 'Modular organizer: parts hold together with magnets.'), hardware: L('8 неодимовых магнитов 6×3 мм', '8 neodymium magnets 6×3 mm'), assembly: L('Вклеить магниты на суперклей, соблюдая полярность.', 'Glue the magnets in with CA glue, mind the polarity.'), tips: '' } }),
      it('i-org-base', { name: L('Основание органайзера', 'Organizer base'), parentId: 'i-org', days: 100, printerId: 'p2s', parts: part(7.5, [['pla', 210]]) }),
      it('i-org-cup', { name: L('Стакан для ручек', 'Pen cup'), parentId: 'i-org', days: 100, printerId: 'p2s', parts: part(2.3, [['pla', 64]], 2) }),
      it('i-org-tray', { name: L('Лоток для мелочей', 'Small parts tray'), parentId: 'i-org', days: 99, printerId: 'p2s', parts: part(1.9, [['pla', 55]]) }),
      it('i-org-drawer', { name: L('Ящичек', 'Drawer'), parentId: 'i-org', days: 98, printerId: 'p2s', parts: asm() }),
      it('i-org-drawer-box', { name: L('Корпус ящичка', 'Drawer body'), parentId: 'i-org-drawer', days: 98, printerId: 'p2s', parts: part(3.0, [['pla', 90]]) }),
      it('i-org-drawer-knob', { name: L('Ручка ящичка', 'Drawer knob'), parentId: 'i-org-drawer', days: 98, printerId: 'p2s', parts: part(0.4, [['tpu', 6]], 2) }),
      it('i-cam', { name: L('Кронштейн камеры', 'Camera bracket'), status: 'wip', days: 45, tags: [L('мастерская', 'workshop'), L('прототип', 'prototype')], printerId: 'p2s',
        parts: part(3.1, [['placf', 72]]), notes: L('Версия v3 — усилил ребро, v2 треснула у основания.', 'v3 — beefed up the rib; v2 cracked at the base.'),
        print: { nozzle: '0.4', layer: '0.16', infill: L('40% кубы', '40% cubic'), walls: '5', supports: L('древовидные', 'tree'), plate: 'Textured PEI', other: L('Закалённое сопло!', 'Hardened nozzle!') } }),
      it('i-gopro', { name: L('Крепление GoPro на руль', 'GoPro handlebar mount'), days: 85, tags: [L('вело', 'bike')], printerId: 'p2s', parts: part(1.8, [['petg', 44], ['tpu', 8]]),
        notes: L('Прокладка из TPU печатается вторым материалом.', 'TPU pad printed as the second material.') }),
      it('i-vase', { name: L('Спиральная ваза', 'Spiral vase'), days: 70, tags: [L('декор', 'decor'), L('подарок', 'gift')], printerId: 'p2s', parts: part(5.0, [['silk', 120]]),
        print: { nozzle: '0.4', layer: '0.2', infill: '', walls: '1', supports: '', plate: 'Smooth PEI', other: L('Режим вазы', 'Vase mode') } }),
      it('i-batt', { name: L('Коробка для батареек', 'Battery box'), days: 60, tags: [L('дом', 'home')], printerId: 'a1m', parts: part(3.6, [['pla', 95]]) }),
      it('i-gears', { name: L('Головоломка-шестерёнки', 'Gear puzzle'), status: 'idea', days: 8, tags: [L('подарок', 'gift'), L('игрушки', 'toys')], parts: part(5.5, [['pla', 140]]),
        notes: L('Плановая оценка по слайсеру, ещё не печатал.', 'Slicer estimate, not printed yet.'), links: [{ title: 'Printables', url: 'https://www.printables.com/model/demo' }] }),
      it('i-rpi', { name: L('Корпус для Raspberry Pi 5', 'Raspberry Pi 5 case'), status: 'wip', days: 25, tags: [L('электроника', 'electronics')], printerId: 'p2s', extra: 350, parts: part(4.8, [['abs', 110]]),
        desc: { lang, intro: L('Корпус с активным охлаждением.', 'Case with active cooling.'), hardware: L('Вентилятор 30×30, 4 винта M2.5×6, вставки M2.5', '30×30 fan, 4 M2.5×6 screws, M2.5 heat-set inserts'), assembly: L('Вплавить вставки паяльником при 220 °C.', 'Press in the inserts with a soldering iron at 220 °C.'), tips: '' } }),
      it('i-key', { name: L('Брелок с логотипом', 'Logo keychain'), days: 140, tags: [L('мелочь', 'small'), L('на продажу', 'for sale')], printerId: 'a1m', parts: part(0.3, [['pla', 6]]) }),
      it('i-clip', { name: L('Клипса для пакетов', 'Bag clip'), days: 130, tags: [L('кухня', 'kitchen')], printerId: 'p2s', parts: part(0.5, [['petg', 9]], 4) }),
      it('i-lamp', { name: L('Абажур «Соты»', 'Honeycomb lampshade'), status: 'wip', days: 20, tags: [L('декор', 'decor')], printerId: 'p2s', parts: part(11.0, [['pla', 260]]), extra: 450,
        notes: L('Первая попытка отлипла на 6-м часу. Второй раз — с клеем.', 'First attempt detached at hour 6. Second try with glue.') }),
      it('i-vent', { name: L('Переходник вытяжки', 'Exhaust adapter'), days: 55, tags: [L('мастерская', 'workshop')], printerId: 'p2s', parts: part(6.5, [['asa', 180]]) }),
      it('i-dragon', { name: L('Фигурка дракона', 'Dragon figurine'), days: 35, tags: [L('игрушки', 'toys'), L('подарок', 'gift')], printerId: 'a1m', parts: part(2.8, [['silk', 35]]) }),
    ];

    /* ---------- Журнал печати ---------- */
    const prints = [];
    let n = 0;
    // P(дней назад, принтер, часы, строки, расход [[spoolId, г, materialId?]], доп.)
    function P(days, printerId, hours, lines, usage, extra = {}) {
      n++;
      const s = id => spools.find(x => x.id === id);
      prints.push({
        id: 'pr-' + String(n).padStart(3, '0'), at: at(days, 9 + (n % 12), (n * 7) % 60), date: d(days), printerId, hours, result: 'ok', note: '',
        lines: lines.map(l => (typeof l === 'string' ? { itemId: l, sets: 1 } : l)),
        usage: usage.map(([spoolId, grams, materialId]) => ({ label: '', spoolId, materialId: materialId || s(spoolId)?.materialId || '', grams })),
        ...extra,
      });
    }
    // ~5 месяцев назад: старт P2S
    P(168, 'p2s', 0.6, [{ itemId: '', name: L('Калибровочный куб', 'Calibration cube'), sets: 1 }], [['s-pla-white', 12]], { note: L('Первая печать после распаковки', 'First print after unboxing') });
    P(160, 'p2s', 1.4, ['i-hook'], [['s-pla-white', 38]]);
    P(155, 'ender', 4.2, [{ itemId: 'i-clip', sets: 2 }, { itemId: 'i-key', sets: 6 }], [['s-pla-green', 110]], { note: L('Старый принтер, разгрузка очереди', 'Old printer, clearing the queue') });
    P(150, 'a1m', 1.8, [{ itemId: 'i-key', sets: 6 }], [['s-pla-green', 36]]);
    P(146, 'p2s', 2.0, [{ itemId: 'i-clip', sets: 1 }], [['s-petg-orange', 36]]);
    P(142, 'p2s', 1.4, ['i-hook'], [['s-pla-black', 38]]);
    P(138, 'a1m', 3.0, [{ itemId: 'i-key', sets: 10 }], [['s-pla-red', 60]], { note: L('Партия на ярмарку', 'Batch for the fair') });
    P(130, 'p2s', 6.4, ['i-planter'], [['s-petg-orange', 170]]);
    P(126, 'p2s', 5.1, ['i-planter'], [['s-petg-orange', 120]], { result: 'fail', note: L('Отлипла от стола на 4-м часу', 'Came off the plate at hour 4') });
    P(122, 'p2s', 6.2, ['i-planter'], [['s-petg-orange', 165]]);
    P(118, 'ender', 6.8, ['i-vent'], [['s-asa', 190]], { result: 'fail', note: L('Расслоение — сквозняк', 'Layer split — draft') });
    // Органайзер: прототип основания, потом полный набор и столы
    P(104, 'p2s', 2.2, [{ itemId: 'i-org-base', sets: 1, proto: true, ver: L('v1 — проверка магнитов', 'v1 — magnet fit test') }], [['s-pla-white', 58]]);
    P(101, 'p2s', 7.5, ['i-org-base'], [['s-pla-white', 210]]);
    P(100, 'p2s', 6.1, [{ itemId: 'i-org-cup', sets: 1 }, { itemId: 'i-org-tray', sets: 1 }], [['s-pla-white', 183]], { note: L('Два стакана и лоток на одном столе', 'Two cups and a tray on one plate') });
    P(98, 'p2s', 3.9, [{ itemId: 'i-org-drawer', sets: 1, whole: true }], [['s-pla-white', 90], ['s-tpu', 12]], { note: L('Ящичек целиком: корпус + ручки', 'Whole drawer: body + knobs') });
    P(92, 'p2s', 1.8, ['i-gopro'], [['s-petg-orange', 44], ['s-tpu', 8]], { src: 'bambu:demo-t01', plate: 'Plate 1' });
    P(88, 'a1m', 0.9, [{ itemId: '', name: L('Тест температуры PLA', 'PLA temperature tower'), sets: 1 }], [['s-pla-red', 18]]);
    P(84, 'p2s', 7.4, ['i-org-base'], [['s-pla-black', 210]]);
    P(80, 'p2s', 5.0, ['i-vase'], [['s-silk', 120]], { src: 'bambu:demo-t02' });
    P(76, 'p2s', 6.5, ['i-vent'], [['s-asa', 180]]);
    P(72, 'p2s', 4.0, [{ itemId: 'i-hook', sets: 1, share: 40 }, { itemId: 'i-gopro', sets: 1, share: 60 }], [['s-pla-black', 38], ['s-petg-orange', 44], ['s-tpu', 8]],
      { note: L('Смешанный стол, доли заданы вручную', 'Mixed plate with manual shares') });
    P(66, 'a1m', 3.6, ['i-batt'], [['s-pla-white', 80], ['s-pla-red', 15]], { note: L('Крышка красным — смена филамента на слое', 'Red lid — filament swap at layer') });
    P(62, 'p2s', 5.0, ['i-vase'], [['s-silk', 120]]);
    P(58, 'a1m', 2.6, [{ itemId: 'i-key', sets: 8 }, { itemId: 'i-clip', sets: 1, fail: true }], [['s-pla-red', 48], ['s-petg-orange', 9]],
      { note: L('Одна клипса сорвалась со стола', 'One clip got knocked off') });
    P(55, 'p2s', 6.6, ['i-vent'], [['s-asa', 182]], { src: 'bambu:demo-t03' });
    // Кронштейн камеры: серия прототипов
    P(44, 'p2s', 2.4, [{ itemId: 'i-cam', sets: 1, proto: true, ver: 'v1' }], [['s-pla-black', 58]], { note: L('Черновик в обычном PLA', 'Draft in plain PLA') });
    P(40, 'p2s', 3.0, [{ itemId: 'i-cam', sets: 1, proto: true, ver: 'v2' }], [['s-placf', 70]], { note: L('Треснула у основания при затяжке', 'Cracked at the base when tightened') });
    P(36, 'a1m', 2.8, ['i-dragon'], [['s-silk', 35]]);
    P(33, 'p2s', 3.2, [{ itemId: 'i-cam', sets: 1, proto: true, ver: 'v3' }], [['s-placf', 74]]);
    P(31, 'p2s', 1.1, [{ itemId: 'i-cam', sets: 1, proto: true, ver: 'v3.1' }], [['s-placf', 25]], { result: 'fail', note: L('Засор сопла, остановил', 'Nozzle clog, stopped') });
    P(28, 'ender', 5.2, ['i-rpi'], [['s-abs', 118]], { result: 'fail', note: L('Коробление углов', 'Corners warped') });
    P(26, 'p2s', 4.8, ['i-rpi'], [['s-abs', 110]], { src: 'bambu:demo-t04' });
    P(22, 'a1m', 2.8, ['i-dragon'], [['s-silk', 35]]);
    P(19, 'p2s', 6.0, ['i-lamp'], [['s-pla-blue', 150]], { result: 'fail', note: L('Отлипла на 6-м часу', 'Detached at hour 6') });
    P(16, 'p2s', 1.4, ['i-hook'], [['s-pla-white', 38]]);
    // текущий месяц — плотнее, чтобы главная была насыщенной
    P(12, 'p2s', 11.2, ['i-lamp'], [['s-pla-blue', 262]], { note: L('С клеем-карандашом — держится', 'With a glue stick — it holds') });
    P(10, 'a1m', 1.5, [{ itemId: 'i-key', sets: 5 }], [['s-pla-black', 30]]);
    P(9, 'p2s', 2.0, [{ itemId: 'i-clip', sets: 1 }], [['s-petg-orange', 36]]);
    P(7, 'p2s', 6.2, ['i-planter'], [['s-petg-orange', 165]]);
    P(6, 'p2s', 5.5, [{ itemId: 'i-org-cup', sets: 2 }], [['s-pla-black', 256]]);
    P(4, 'a1m', 3.6, ['i-batt'], [['s-pla-white', 95]]);
    P(3, 'p2s', 3.2, [{ itemId: 'i-cam', sets: 1, proto: true, ver: 'v4' }, { itemId: 'i-hook', sets: 1 }], [['s-placf', 72], ['s-pla-black', 38]],
      { note: L('Прототип и крючок на одном столе', 'Prototype and a hook on one plate') });
    P(2, 'p2s', 5.0, ['i-vase'], [['s-silk', 118]]);
    P(1, 'a1m', 0.8, [{ itemId: '', name: L('Подставка под телефон', 'Phone stand'), sets: 1 }], [['s-pla-red', 22]]);
    P(0, 'p2s', 1.8, ['i-gopro'], [['s-petg-orange', 44], ['s-tpu', 8]]);

    return {
      version: 5, updatedAt: at(0, 8),
      settings: { tariff: 7.24, lowStock: 200, defaultPrinter: 'p2s' },
      printers, materials, spools, items, prints,
    };
  }

  return { build };
})();
