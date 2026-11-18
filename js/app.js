(()=>{'use strict';
/* ================= Константы и утилиты ================= */
const LS_KEY='p2s_cost_catalog_v1',AUTO_KEY='p2s_cost_autosave_v1',DATA_NAME='3d-print-data.json',PHOTO_DIR='photos',BACKUP_DIR='backups';
const $=id=>document.getElementById(id);
const fsOK=typeof window.showDirectoryPicker==='function';
const STATUSES={idea:'Идея',wip:'В работе',done:'Готово',published:'Опубликовано'};
const PARTS=[['plastic','Пластик','#579bff'],['power','Электричество','#f3ad4e'],['depreciation','Амортизация','#49c5aa'],['maintenance','Обслуживание','#b58aff'],['extra','Доп. затраты','#ed7c99']];
const baseSettings={tariff:7,lowStock:200};
const P0={id:'p2s',name:'Bambu Lab P2S',price:76990,years:5,annualHours:500,watts:120,maintenance:3};
const normPrinter=p=>({id:String(p.id||shortId()),name:String(p.name||'Принтер').trim()||'Принтер',price:number(p.price),years:number(p.years)||5,annualHours:number(p.annualHours)||500,watts:number(p.watts),maintenance:number(p.maintenance)});
const baseMaterials=[{id:'petg',name:'PETG',price:1000},{id:'pla',name:'PLA',price:1000},{id:'abs',name:'ABS',price:1200}];

const money=n=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(n);
const fmt=(n,d=1,loc='ru-RU')=>new Intl.NumberFormat(loc,{maximumFractionDigits:d}).format(n);
const number=v=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?Math.max(0,n):0};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||(Date.now().toString(36)+Math.random().toString(36).slice(2));
const shortId=()=>uid().replace(/-/g,'').slice(0,10);
const now=()=>new Date().toISOString();
const getPath=(o,p)=>p.split('.').reduce((a,k)=>a?.[k],o);
const setPath=(o,p,v)=>{const ks=p.split('.'),last=ks.pop();ks.reduce((a,k)=>(a[k]??={}),o)[last]=v};
const SITES=[['makerworld.','MakerWorld'],['thingiverse.','Thingiverse'],['printables.','Printables'],['thangs.','Thangs'],['cults3d.','Cults3D'],['myminifactory.','MyMiniFactory'],['github.','GitHub'],['youtube.','YouTube'],['youtu.be','YouTube']];
const siteName=u=>{const s=String(u).toLowerCase();return(SITES.find(([d])=>s.includes(d))||[])[1]||''};
const safeUrl=u=>/^https?:\/\//i.test(String(u).trim())?String(u).trim():'';
function fmtH(h,lang='ru'){const m=Math.round(number(h)*60),H=Math.floor(m/60),M=m%60;if(lang==='en')return(H?H+'h':'')+(M?(H?' ':'')+M+'m':'')||'0h';return(H?H+' ч':'')+(M?(H?' ':'')+M+' мин':'')||'0 ч'}

let db,store=null,stReady=false,stDirty=false,stBusy=false,stError='',lastSaved=null,saveTimer=null,persistTimer=null,chain=Promise.resolve(),localChain=Promise.resolve(),legacyFileName='',currentItemId=null;
const getPrinter=id=>db.printers.find(p=>p.id===id)||db.printers.find(p=>p.id===db.settings.defaultPrinter)||db.printers[0];
const printerOptions=(sel,withDefault=true)=>(withDefault?`<option value="">По умолчанию — ${escape(getPrinter('').name)}</option>`:'')+db.printers.map(p=>`<option value="${escape(p.id)}"${p.id===sel?' selected':''}>${escape(p.name)}</option>`).join('');
const amortH=P=>{const life=number(P.years)*number(P.annualHours);return life>0?number(P.price)/life:0};
const getMat=i=>db.materials.find(m=>m.id===i)||{name:'Удалённый материал',price:0};

/* ================= Схема данных v2 ================= */
function normItem(x){
  const it={id:String(x.id||uid()),name:String(x.name||'Без названия'),printerId:String(x.printerId||''),status:STATUSES[x.status]?x.status:'done',
    tags:Array.isArray(x.tags)?x.tags.map(String).filter(Boolean):[],createdAt:x.createdAt||now(),updatedAt:x.updatedAt||x.createdAt||'',
    extra:number(x.extra),notes:String(x.notes||''),
    links:Array.isArray(x.links)?x.links.map(l=>({title:String(l?.title||''),url:String(l?.url||'')})):[],
    print:{nozzle:'0.4',layer:'0.2',infill:'',walls:'',supports:'',plate:'',other:'',...(x.print||{})},
    desc:{lang:'ru',intro:'',hardware:'',assembly:'',tips:'',...(x.desc||{})},
    photos:Array.isArray(x.photos)?x.photos.filter(p=>p&&p.file).map(p=>({id:String(p.id||shortId()),file:String(p.file)})):[],
    cover:String(x.cover||'')};
  if(Array.isArray(x.parts)&&x.parts.length){
    it.parts=x.parts.map(p=>({id:String(p.id||shortId()),name:String(p.name||''),qty:Math.max(1,Math.round(number(p.qty))||1),hours:number(p.hours),
      filaments:(Array.isArray(p.filaments)?p.filaments:[]).map(f=>({materialId:String(f.materialId||''),grams:number(f.grams)}))}));
  }else{ // миграция изделия v1: одно изделие = один элемент
    it.parts=[{id:shortId(),name:'Изделие целиком',qty:1,hours:number(x.hours),filaments:[{materialId:String(x.materialId||''),grams:number(x.grams)}]}];
  }
  it.prototypes=(Array.isArray(x.prototypes)?x.prototypes:[]).map((p,i)=>({id:String(p.id||shortId()),name:String(p.name??('v'+(i+1))),date:String(p.date||''),materialId:String(p.materialId||''),grams:number(p.grams),hours:number(p.hours),note:String(p.note||''),spoolId:String(p.spoolId||''),at:p.at||it.createdAt||now()}));
  if(it.cover&&!it.photos.some(p=>p.file===it.cover))it.cover=it.photos[0]?.file||'';
  return it}
function valid(d){
  if(!d||typeof d!=='object'||!Array.isArray(d.materials)||!Array.isArray(d.items))throw Error('Неверная структура файла');
  if(d.materials.length>1000||d.items.length>100000)throw Error('Слишком большой файл');
  const s0=d.settings||{};
  const printers=Array.isArray(d.printers)&&d.printers.length?d.printers.map(normPrinter):[normPrinter({id:P0.id,name:s0.printerName||P0.name,price:s0.printerPrice??P0.price,years:s0.years??P0.years,annualHours:s0.annualHours??P0.annualHours,watts:s0.watts??P0.watts,maintenance:s0.maintenance??P0.maintenance})];
  const settings={tariff:s0.tariff??baseSettings.tariff,lowStock:s0.lowStock??baseSettings.lowStock,defaultPrinter:printers.some(p=>p.id===s0.defaultPrinter)?s0.defaultPrinter:printers[0].id,theme:['auto','dark','light'].includes(s0.theme)?s0.theme:undefined};
  const o={version:3,updatedAt:d.updatedAt||'',settings,printers,
    lib:normLib(d.lib,d),
    materials:d.materials.map(m=>({id:String(m.id||uid()),name:String(m.name||'?'),price:number(m.price),density:number(m.density)||guessDensity(m.name)})),
    items:d.items.map(normItem),spools:(Array.isArray(d.spools)?d.spools:[]).map(normSpool),prints:(Array.isArray(d.prints)?d.prints:[]).map(normPrint)};
  for(const s of o.spools)libAbsorb(s,o.lib);
  return o}

/* ================= Расчёт ================= */
function calcItem(it){
  const P=getPrinter(it.printerId),tariff=number(db.settings.tariff),depH=amortH(P);
  const r={printer:P,plastic:0,power:0,depreciation:0,maintenance:0,extra:number(it.extra),grams:0,hours:0,pieces:0,parts:{},byMat:{}};
  for(const p of it.parts){
    const q=Math.max(1,number(p.qty)||1),h=number(p.hours)*q;let pl=0,g=0;
    for(const f of p.filaments){const gg=number(f.grams)*q,c=gg*number(getMat(f.materialId).price)/1000;g+=gg;pl+=c;const bm=r.byMat[f.materialId]??={grams:0,cost:0};bm.grams+=gg;bm.cost+=c}
    const pw=h*number(P.watts)/1000*tariff,dp=h*depH,mt=h*number(P.maintenance);
    r.plastic+=pl;r.power+=pw;r.depreciation+=dp;r.maintenance+=mt;r.grams+=g;r.hours+=h;r.pieces+=q;
    r.parts[p.id]={grams:g,hours:h,total:pl+pw+dp+mt,unit:(pl+pw+dp+mt)/q}}
  r.total=r.plastic+r.power+r.depreciation+r.maintenance+r.extra;
  // прототипы: считаются отдельно от себестоимости изделия
  const pr=r.proto={count:0,grams:0,hours:0,plastic:0,total:0,items:{},byMat:{}};
  for(const p of it.prototypes||[]){const g=number(p.grams),h=number(p.hours),pl=g*number(getMat(p.materialId).price)/1000,t=pl+h*number(P.watts)/1000*tariff+h*depH+h*number(P.maintenance);
    pr.count++;pr.grams+=g;pr.hours+=h;pr.plastic+=pl;pr.total+=t;pr.items[p.id]=t;const bm=pr.byMat[p.materialId]??={grams:0,cost:0};bm.grams+=g;bm.cost+=pl}
  r.dev=r.total+pr.total;return r}
const itemMaterials=it=>[...new Set(it.parts.flatMap(p=>p.filaments.map(f=>f.materialId)))];
function barsHtml(c,withMoney){return PARTS.map(([k,name,color])=>{const p=c.total?c[k]/c.total*100:0;return`<div style="margin-bottom:8px"><small>${name} · ${Math.round(p)}%${withMoney?' · '+money(c[k]):''}</small><div style="height:7px;background:var(--line);border-radius:8px"><div style="height:100%;width:${p}%;background:${color};border-radius:8px"></div></div></div>`}).join('')}
const breakdownHtml=c=>PARTS.map(([k,name])=>`<div class="line"><span>${name}</span><b>${money(c[k])}</b></div>`).join('');

/* ================= IndexedDB ================= */
let idbP=null;
const idb=()=>idbP||(idbP=new Promise((res,rej)=>{setTimeout(()=>rej(Error('IndexedDB не отвечает')),2000);const r=indexedDB.open('p2s_cost',2);r.onupgradeneeded=()=>{for(const s of ['handles','kv'])if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
async function idbSet(store,k,v){const d=await idb();return new Promise((res,rej)=>{const t=d.transaction(store,'readwrite'),s=t.objectStore(store);v===undefined?s.delete(k):s.put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}
async function idbGet(store,k){const d=await idb();return new Promise((res,rej)=>{const r=d.transaction(store).objectStore(store).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}

/* ================= Сохранение и хранилища ================= */
let statusTimer;const setStatus=t=>{const el=$('status');el.textContent=t;el.classList.add('show');clearTimeout(statusTimer);statusTimer=setTimeout(()=>el.classList.remove('show'),3500)};
const autosave=()=>$('autosave').checked;
const data=()=>JSON.stringify(db,null,2);
const LS2_KEY='p2s_cost_catalog_v2',STORE_KEY='p2s_store_kind';
const stamp=()=>now().slice(0,19).replace(/[:T]/g,'-');
function saveLocal(){const snap=structuredClone(db);localChain=localChain.then(()=>idbSet('kv','db',snap)).catch(()=>{try{localStorage.setItem(LS2_KEY,JSON.stringify(snap))}catch(e){setStatus('Не удалось сохранить в браузере — подключите хранилище или скачайте JSON')}})}
function persist(){clearTimeout(persistTimer);persistTimer=null;db.updatedAt=now();saveLocal();if(store&&stReady){stDirty=true;if(autosave()){clearTimeout(saveTimer);saveTimer=setTimeout(writeData,store.kind==='gdrive'?1500:500)}}updateStoreUi()}
function schedulePersist(){clearTimeout(persistTimer);persistTimer=setTimeout(()=>{persist();renderList()},400)}
async function writeText(dh,name,content){const fh=await dh.getFileHandle(name,{create:true});const w=await fh.createWritable();await w.write(content);await w.close()}
async function hasPermission(h,ask){const o={mode:'readwrite'};try{if(await h.queryPermission(o)==='granted')return true;return ask?await h.requestPermission(o)==='granted':false}catch{return false}}

/* --- Папка на компьютере (Chrome/Edge, File System Access API) --- */
function folderStore(d){return{kind:'folder',name:d.name,label:`папка «${d.name}»`,
  ensure:ask=>hasPermission(d,ask),
  async read(){for(const n of [...new Set([DATA_NAME,legacyFileName].filter(Boolean))]){try{const f=await(await d.getFileHandle(n)).getFile(),t=(await f.text()).trim();if(t)return{name:n,text:t,modified:new Date(f.lastModified)}}catch(e){if(e?.name!=='NotFoundError'&&e?.name!=='TypeMismatchError')throw Error(`Файл «${n}»: ${e.message}`)}}return null},
  async write(text){await writeText(d,DATA_NAME,text)},
  async remoteChanged(){return false},
  async backup(text){await writeText(await d.getDirectoryHandle(BACKUP_DIR,{create:true}),`3d-print-data_${stamp()}.json`,text)},
  async getPhoto(n){return(await(await d.getDirectoryHandle(PHOTO_DIR)).getFileHandle(n)).getFile()},
  async putPhoto(n,blob){await writeText(await d.getDirectoryHandle(PHOTO_DIR,{create:true}),n,blob)},
  async delPhoto(n){try{await(await d.getDirectoryHandle(PHOTO_DIR)).removeEntry(n)}catch{}},
  async remember(){await idbSet('handles','dir',d)},
  async forget(){await idbSet('handles','dir',undefined)}}}
const gdStore=()=>window.GDrive.store();

function applyData(incoming){db=incoming;fillSettings();saveLocal();photoUrls.clear();renderAll()}
function writeData(){clearTimeout(saveTimer);chain=chain.then(async()=>{if(!store||!stReady)return;stDirty=false;stBusy=true;updateStoreUi();
  try{
    if(await store.remoteChanged()){const r=await store.read();if(r){
      const remote=valid(JSON.parse(r.text));
      if(!confirm(`${store.label}: пока вы работали, данные изменили на другом устройстве или в другой вкладке (${r.modified.toLocaleString('ru-RU')}).\n\nОК — оставить данные ЭТОГО экрана (рекомендуется, если вы сейчас что-то вводили). Версия с другого устройства сохранится в backups/.\n\nОтмена — загрузить версию с другого устройства. Данные этого экрана сохранятся в backups/.`)){await store.backup(data());applyData(remote);lastSaved=r.modified;return}
      await store.backup(r.text)}}
    await store.write(data());lastSaved=new Date();stError=''}
  catch(e){stDirty=true;if(e?.name==='NotAllowedError'){stReady=false;stError=''}else stError=e?.message||String(e)}
  finally{stBusy=false;updateStoreUi()}});return chain}
// mode: pick — пользователь выбрал хранилище; restore — переподключение запомненного
async function connect(st,mode){
  const r=await st.read();if(r)r.data=valid(JSON.parse(r.text));let write=!r,msg=`Подключено: ${st.label}`;
  if(r){
    if(mode==='pick'){
      if(!db.items.length&&!db.spools.length){applyData(r.data);msg=`Данные загружены: ${st.label}`}
      else if(confirm(`${st.label}: найдены данные — изделий ${r.data.items.length}, катушек ${r.data.spools.length}, изменены ${r.modified.toLocaleString('ru-RU')}.\n\nОК — загрузить эти данные.\nОтмена — записать туда данные этого браузера (изделий ${db.items.length}, катушек ${db.spools.length}); прежний файл сохранится в backups/.`)){applyData(r.data);msg=`Данные загружены: ${st.label}`}
      else{await st.backup(r.text);write=true;msg=`Данные браузера записаны: ${st.label}, прежний файл — в backups/`}
    }else{const f=Date.parse(r.data.updatedAt||0)||0,l=Date.parse(db.updatedAt||0)||0;if(f>=l)applyData(r.data);else{write=true;msg='В браузере данные новее — записаны в хранилище'}}
    if(r.name!==DATA_NAME)write=true;
    if(!write)lastSaved=r.modified;
  }
  const prev=store;
  store=st;stReady=true;stError='';stDirty=false;photoUrls.clear();
  try{await st.remember()}catch{}
  try{localStorage.setItem(STORE_KEY,st.kind)}catch{}
  if(write){stDirty=true;await writeData()}
  updateStoreUi();renderAll();if(mode==='pick')setStatus(msg);
  if(mode==='pick'&&prev&&prev!==st){if(prev.kind!==st.kind)try{await prev.forget()}catch{}await migratePhotos(prev,st)}
  return true}
async function migratePhotos(from,to){const files=[...new Set(db.items.flatMap(i=>i.photos.map(p=>p.file)))];if(!files.length)return;
  if(!(await from.ensure(false).catch(()=>false)))return;
  if(!confirm(`Перенести фото изделий (${files.length}) из «${from.label}» в «${to.label}»?`))return;
  let ok=0;for(const n of files){setStatus(`Перенос фото ${ok+1} из ${files.length}…`);try{await to.putPhoto(n,await from.getPhoto(n));ok++}catch{}}
  photoUrls.clear();renderAll();setStatus(`Перенесено фото: ${ok} из ${files.length}`)}
let lastInputAt=0,syncRetry=null;
document.addEventListener('input',()=>{lastInputAt=Date.now()},true);
const editing=()=>{const a=document.activeElement;return Date.now()-lastInputAt<5000||(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.type!=='button'&&a.type!=='checkbox')||!$('printForm').hidden};
async function syncFromRemote(){if(!store||!stReady||stDirty||stBusy||persistTimer)return;
  if(editing()){clearTimeout(syncRetry);syncRetry=setTimeout(syncFromRemote,5000);return}
  try{if(await store.remoteChanged()){const r=await store.read();if(r){applyData(valid(JSON.parse(r.text)));lastSaved=r.modified;updateStoreUi();setStatus('Загружены изменения с другого устройства')}}}
  catch(e){if(e?.name==='NotAllowedError'){stReady=false;updateStoreUi()}}}
function storeErr(e){if(e?.name==='AbortError')return;alert('Ошибка хранилища: '+(e?.message||e))}

function updateStoreUi(){
  const lbl=store?escape(store.label):'';let dot='',text,short;
  if(!store){text='Хранилище не подключено — данные есть только в этом браузере, фото добавлять нельзя.';short='Только браузер'}
  else if(!stReady){dot='warn';text=store.kind==='gdrive'?'Google Drive — нужно войти в аккаунт Google (вход действует около часа).':`${lbl[0].toUpperCase()+lbl.slice(1)} — браузер просит подтвердить доступ.`;short=store.kind==='gdrive'?'Нужен вход в Google':'Нужен доступ к папке'}
  else if(stError){dot='err';text=`${lbl} — ошибка: ${escape(stError)}`;short='Ошибка сохранения'}
  else if(stDirty||stBusy){dot='warn';text=`${lbl} — ${autosave()||stBusy?'сохранение…':'есть несохранённые изменения'}`;short=autosave()||stBusy?'Сохранение…':'Не сохранено'}
  else{dot='ok';text=`${lbl} — сохранено${lastSaved?' '+lastSaved.toLocaleString('ru-RU'):''}`;short=store.kind==='gdrive'?'Сохранено в Google Drive':'Сохранено в папку'}
  $('stState').innerHTML=`<span class="dot ${dot}"></span>${text.charAt(0).toUpperCase()+text.slice(1)}`;
  $('navFile').innerHTML=`<span class="dot ${dot}"></span>${short}`;$('navFile').title=store?store.label:'';
  $('stReconnect').hidden=!(store&&!stReady);$('stReconnect').textContent=store?.kind==='gdrive'?'Войти в Google':'Разрешить доступ к папке';
  $('stSaveNow').hidden=!(store&&stReady);$('stDetach').hidden=!store;$('autosaveWrap').hidden=!store;
  $('dirPick').disabled=!fsOK;$('dirPick').textContent=store?.kind==='folder'?'Сменить папку':'Выбрать папку';$('dirNote').hidden=fsOK;
  $('gdPick').textContent=store?.kind==='gdrive'?'Переподключить':'Подключить Google Drive';
  $('optFolder').classList.toggle('on',store?.kind==='folder');$('optDrive').classList.toggle('on',store?.kind==='gdrive');
  $('legacyNote').hidden=!(fsOK&&!store&&legacyFileName);
  $('legacyNote').innerHTML=`Раньше данные сохранялись в файл <b>${escape(legacyFileName)}</b>. Нажмите «Выбрать папку» и укажите папку, где он лежит — данные подхватятся.`;
  if(currentPage==='item')renderPhotos()}

/* ================= Фото ================= */
const photoUrls=new Map();
function photoUrl(file){if(!photoUrls.has(file)){if(!store||!stReady)return Promise.resolve(null);photoUrls.set(file,store.getPhoto(file).then(b=>URL.createObjectURL(b)).catch(()=>{photoUrls.delete(file);return null}))}return photoUrls.get(file)}
async function hydrate(root){await Promise.all([...root.querySelectorAll('img[data-photo]')].map(async img=>{const u=await photoUrl(img.dataset.photo);if(!img.isConnected)return;if(u)img.src=u;else img.replaceWith(Object.assign(document.createElement('span'),{textContent:'◈'}))}))}
// Уменьшаем фото до 1600 px по длинной стороне — быстрее грузится, особенно из Google Drive и на телефоне
async function shrinkImage(f){if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size<400*1024)return f;try{const bmp=await createImageBitmap(f);const k=Math.min(1,1600/Math.max(bmp.width,bmp.height));if(k===1&&f.size<1.5*1024*1024)return f;const c=Object.assign(document.createElement('canvas'),{width:Math.round(bmp.width*k),height:Math.round(bmp.height*k)});c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));return b&&b.size<f.size?b:f}catch{return f}}
async function addPhotos(it,files){
  if(!store||!stReady){alert('Сначала подключите хранилище в настройках — папку или Google Drive');return}
  const imgs=files.filter(f=>f.type.startsWith('image/'));let n=0;
  for(const f of imgs){setStatus(`Загрузка фото ${n+1} из ${imgs.length}…`);const blob=await shrinkImage(f);const ext=blob.type==='image/jpeg'?'jpg':(((f.name.split('.').pop()||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5))||'jpg');const pid=shortId(),file=`${it.id.slice(0,8)}-${pid}.${ext}`;
    await store.putPhoto(file,blob);it.photos.push({id:pid,file});photoUrls.set(file,Promise.resolve(URL.createObjectURL(blob)));n++}
  if(!it.cover&&it.photos[0])it.cover=it.photos[0].file;
  if(n){touch(it);persist();renderPhotos();renderList();setStatus(`Добавлено фото: ${n}`)}}
async function removePhotoFiles(files){if(!store||!stReady)return;for(const f of files){try{await store.delPhoto(f)}catch{}}}


/* ================= Тема ================= */
const THEME_KEY='p2s_theme',mq=matchMedia('(prefers-color-scheme: light)');
function themeMode(){try{return localStorage.getItem(THEME_KEY)||'auto'}catch{return'auto'}}
function applyTheme(){const m=themeMode(),t=m==='auto'?(mq.matches?'light':'dark'):m;document.documentElement.dataset.theme=t;document.querySelector('meta[name=theme-color]')?.setAttribute('content',t==='light'?'#ffffff':'#121b30');$('themeBtn').textContent=t==='light'?'☾':'☀';$('themeBtn').title=t==='light'?'Тёмная тема':'Светлая тема';$('themeSel').value=m}
function setTheme(m,save=true){try{localStorage.setItem(THEME_KEY,m)}catch{}applyTheme();if(save&&db&&db.settings.theme!==m){db.settings.theme=m;persist()}}
mq.addEventListener?.('change',applyTheme);
$('themeBtn').onclick=()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
$('themeSel').onchange=()=>setTheme($('themeSel').value);
applyTheme();

/* ================= Навигация ================= */
const PAGES=['calc','catalog','item','spools','spool','log','stats','settings'];let currentPage='';
function route(){
  let h=decodeURIComponent(location.hash.slice(1));
  if(h.startsWith('item/')){const id=h.slice(5);if(db.items.some(i=>i.id===id)){currentItemId=id;show('item');renderItem();return}h='catalog'}
  if(h.startsWith('spool/')){const id=h.slice(6);if(getSpool(id)){currentSpoolId=id;currentItemId=null;show('spool');renderSpool();return}h='spools'}
  currentItemId=null;currentSpoolId=null;show(PAGES.includes(h)&&!['item','spool'].includes(h)?h:'calc')}
function show(p){const changed=p!==currentPage||p==='item'||p==='spool';currentPage=p;for(const x of PAGES)$('page-'+x).hidden=x!==p;document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===({item:'catalog',spool:'spools'}[p]||p)));if(changed)window.scrollTo({top:0})}
const go=h=>{if(location.hash==='#'+h)route();else location.hash=h};
window.addEventListener('hashchange',route);

/* ================= Отрисовка: общие ================= */
const matOptions=sel=>db.materials.map(m=>`<option value="${escape(m.id)}"${m.id===sel?' selected':''}>${escape(m.name)}</option>`).join('')+(sel&&!db.materials.some(m=>m.id===sel)?`<option value="${escape(sel)}" selected>Удалённый материал</option>`:'');
function fillSettings(){for(const k in baseSettings)$(k).value=db.settings[k]??baseSettings[k];if(db.settings.theme&&db.settings.theme!==themeMode()){setTheme(db.settings.theme,false)}}
function renderMaterials(){
  const sm=$('statMat').value;$('statMat').innerHTML='<option value="">Все материалы</option>'+db.materials.map(m=>`<option value="${escape(m.id)}">${escape(m.name)}</option>`).join('');if(db.materials.some(m=>m.id===sm))$('statMat').value=sm;
  const selected=$('material').value;$('material').innerHTML=db.materials.map(m=>`<option value="${escape(m.id)}">${escape(m.name)} — ${money(number(m.price))}/кг</option>`).join('');if(db.materials.some(m=>m.id===selected))$('material').value=selected;
  $('materialsList').innerHTML=db.materials.map(m=>{const sp=db.spools.filter(s=>s.materialId===m.id&&s.price&&number(s.net));const avg=sp.length?sp.reduce((a,s)=>a+s.price/number(s.net)*1000,0)/sp.length:0;return`<div class="line matline"><span>${escape(m.name)}${avg&&Math.abs(avg-m.price)>=1?`<div><button class="linkbtn" data-applyprice="${escape(m.id)}" data-v="${Math.round(avg*100)/100}" title="Средняя цена купленных катушек">по катушкам: ${money(avg)}/кг ←</button></div>`:''}</span><span><input aria-label="Цена ${escape(m.name)}" data-mat="${escape(m.id)}" type="number" min="0" step="0.01" value="${number(m.price)}" style="width:100px;margin:0;padding:6px"> ₽/кг <input aria-label="Плотность ${escape(m.name)}" data-matdens="${escape(m.id)}" type="number" min="0.5" max="3" step="0.01" value="${m.density}" style="width:70px;margin:0 0 0 6px;padding:6px" title="Плотность, г/см³ — для пересчёта граммов в метры"> г/см³ <button class="danger" data-delmat="${escape(m.id)}" title="Удалить материал">×</button></span></div>`}).join('')}
function renderPrinters(){const def=getPrinter('').id,used=id=>db.items.filter(i=>i.printerId===id).length+db.prints.filter(p=>p.printerId===id).length;
  $('printersList').innerHTML=db.printers.map(P=>`<div class="part prcard" data-ptr="${escape(P.id)}"><div class="fields"><label class="wide">Название<input data-ptk="name" value="${escape(P.name)}"></label><label>Стоимость, ₽<input data-ptk="price" type="number" min="0" value="${P.price}"></label><label>Срок амортизации, лет<input data-ptk="years" type="number" min="0.5" step="0.5" value="${P.years}"></label><label>Часов печати в год<input data-ptk="annualHours" type="number" min="1" value="${P.annualHours}"></label><label>Средняя мощность, Вт<input data-ptk="watts" type="number" min="0" value="${P.watts}"></label><label>Обслуживание, ₽/ч<input data-ptk="maintenance" type="number" min="0" step="0.01" value="${P.maintenance}"></label></div><div class="prfoot"><label class="check" style="margin:0"><input type="radio" name="defPrinter" data-ptdef${P.id===def?' checked':''}> По умолчанию</label><span class="muted">Амортизация ${money(amortH(P))}/ч · с обслуживанием ${money(amortH(P)+number(P.maintenance))}/ч</span>${db.printers.length>1?`<button class="iconbtn danger" data-ptdel title="${used(P.id)?'Используется: '+used(P.id):'Удалить принтер'}">Удалить</button>`:''}</div></div>`).join('');
  const cp=$('calcPrinter').value;$('calcPrinter').innerHTML=printerOptions(cp);$('calcPrinter').value=db.printers.some(p=>p.id===cp)?cp:''}
function renderAll(){renderMaterials();renderPrinters();renderLibs();renderCalcProtos();renderCalc();renderList();if(currentPage)route()}


/* ================= Ввод времени: часы + минуты + слайдер ================= */
const TMAX=48;
const fmtDec=m=>m%60?'= '+fmt(m/60,2)+' ч':'';
// часы: целые, дробные (2,5 / 2.5) или «2:30»
function parseHours(v){const s=String(v).trim().replace(',','.');const hm=s.match(/^(\d+)\s*[:чh]\s*(\d{1,2})?/i);if(hm&&/[:чh]/i.test(s))return number(hm[1])*60+number(hm[2]||0);return Math.round(number(s)*60)}
function tin(attrs,hours,{slider=true,compact=false}={}){const m=Math.round(number(hours)*60);
  return`<div class="tin${compact?' compact':''}"><input type="hidden" class="tin-v" ${attrs} value="${number(hours)}"><span class="tin-f"><input type="text" class="tin-h" inputmode="decimal" value="${Math.floor(m/60)}" aria-label="часы (можно дробные: 2,5 или 2:30)" title="Часы. Можно ввести дробные: 2,5 — или 2:30"><small>ч</small><input type="number" class="tin-m" min="0" max="59" step="1" inputmode="numeric" value="${m%60}" aria-label="минуты"><small>мин</small><small class="tin-d">${fmtDec(m)}</small></span>${slider?`<input type="range" class="tin-r" min="0" max="${TMAX*60}" step="5" value="${Math.min(m,TMAX*60)}" aria-label="Время печати, до ${TMAX} ч">`:''}</div>`}
function syncTin(box){if(!box)return;const m=Math.round(number(box.querySelector('.tin-v').value)*60);box.querySelector('.tin-h').value=Math.floor(m/60);box.querySelector('.tin-m').value=m%60;const r=box.querySelector('.tin-r');if(r)r.value=Math.min(m,TMAX*60);const d=box.querySelector('.tin-d');if(d)d.textContent=fmtDec(m)}
function tinUpdate(el,normalize){const box=el.closest('.tin');if(!box||el.classList.contains('tin-v'))return;const h=box.querySelector('.tin-h'),mi=box.querySelector('.tin-m'),r=box.querySelector('.tin-r'),v=box.querySelector('.tin-v');
  const hv=String(h.value),whole=/[.,:чh]/i.test(hv);// дробные часы или «2:30» — это всё время, минуты не прибавляем
  let m=el===r?Math.round(number(r.value)):whole&&el===h?parseHours(hv):parseHours(hv)+Math.round(number(mi.value));
  if(whole&&el===h&&!normalize)mi.value=m%60;
  if(el===r||normalize){h.value=Math.floor(m/60);mi.value=m%60}if(r&&el!==r)r.value=Math.min(m,TMAX*60);const d=box.querySelector('.tin-d');if(d)d.textContent=fmtDec(m);
  const nv=String(Math.round(m/60*10000)/10000);if(v.value!==nv){v.value=nv;v.dispatchEvent(new Event('input',{bubbles:true}))}}
document.addEventListener('input',e=>{if(e.target.closest?.('.tin'))tinUpdate(e.target,false)});
document.addEventListener('change',e=>{if(e.target.closest?.('.tin'))tinUpdate(e.target,true)});

/* ================= Калькулятор ================= */
let calcProtos=[];
const draft=()=>({printerId:$('calcPrinter').value,extra:number($('extra').value),prototypes:calcProtos,parts:[{id:'d',qty:1,hours:number($('hours').value),filaments:[{materialId:$('material').value,grams:number($('grams').value)}]}]});
function renderCalcProtos(){$('cProtos').innerHTML=calcProtos.map((p,i)=>`<div class="protorow"><span class="muted">v${i+1}</span><select data-cp="${i}" data-cpf="materialId">${matOptions(p.materialId)}</select><input data-cp="${i}" data-cpf="grams" type="number" min="0" step="0.1" value="${p.grams}" placeholder="г" title="Граммы">${tin(`data-cp="${i}" data-cpf="hours"`,p.hours,{slider:false,compact:true})}<button class="iconbtn danger" data-cpdel="${i}" title="Убрать">×</button></div>`).join('')||'<p class="muted" style="margin:0">Не было — или добавьте пробные печати.</p>'}
function renderCalc(){const c=calcItem(draft());$('total').textContent=money(c.total);$('breakdown').innerHTML=breakdownHtml(c)+(c.proto.count?`<div class="line"><span>Прототипы · ${c.proto.count} шт · ${fmt(c.proto.grams)} г · ${fmtH(c.proto.hours)}</span><b>${money(c.proto.total)}</b></div><div class="line"><span><b>Итого с прототипами</b></span><b>${money(c.dev)}</b></div>`:'');$('bars').innerHTML=barsHtml(c);$('pergram').textContent=c.grams>0?`Себестоимость на грамм изделия: ${money(c.total/c.grams)}`:'';}
function resetCalc(){calcProtos=[];renderCalcProtos();for(const k of ['name','notes'])$(k).value='';$('grams').value=100;$('hours').value=4;syncTin($('hours').closest('.tin'));$('extra').value=0;renderCalc()}
function saveCalc(open){const name=$('name').value.trim();if(!name){alert('Введите название изделия');$('name').focus();return}
  const it=normItem({name,printerId:$('calcPrinter').value,materialId:$('material').value,grams:number($('grams').value),hours:number($('hours').value),extra:number($('extra').value),notes:$('notes').value.trim(),status:'done',prototypes:calcProtos.map((p,i)=>({...p,name:'v'+(i+1),date:today(),at:now()}))});it.updatedAt=it.createdAt;
  db.items.unshift(it);persist();renderList();resetCalc();setStatus('Изделие добавлено в каталог');if(open)go('item/'+it.id)}

/* ================= Каталог ================= */
function filtered(){const q=$('search').value.trim().toLowerCase(),st=$('statusFilter').value;return db.items.filter(x=>(!st||x.status===st)&&(x.name+' '+x.tags.join(' ')+' '+itemMaterials(x).map(m=>getMat(m).name).join(' ')+' '+x.notes).toLowerCase().includes(q))}
function renderRows(list){
  $('empty').hidden=list.length>0;$('empty').textContent=db.items.length?'Ничего не найдено.':'Пока нет сохранённых изделий.';
  $('rows').innerHTML=list.map(x=>{const c=calcItem(x),n=x.parts.length;return`<tr class="click" data-open="${escape(x.id)}"><td><div class="thumb">${x.cover?`<img data-photo="${escape(x.cover)}" alt="">`:'◈'}</div></td><td><b>${escape(x.name)}</b><div><small>${n>1?n+' элемент'+(n<5?'а':'ов'):''}${n>1&&x.tags.length?' · ':''}${escape(x.tags.join(', '))}</small></div></td><td><span class="pill ${x.status}">${STATUSES[x.status]}</span></td><td>${escape(itemMaterials(x).map(m=>getMat(m).name).join(' + '))}</td><td class="num">${fmt(c.grams)} г</td><td class="num">${fmtH(c.hours)}</td><td class="num"><b>${money(c.total)}</b>${c.proto.count?`<div><small>+ ${money(c.proto.total)} прототипы</small></div>`:''}</td><td>${escape((x.createdAt||'').slice(0,10))}</td></tr>`}).join('');
  hydrate($('rows'))}
function renderList(){renderRows(filtered());renderStats();renderSpools();renderLog();$('navCount').textContent=db.items.length||''}

/* ================= Статистика ================= */
function renderStats(){
  const f=$('statMat').value,list=f?db.items.filter(x=>itemMaterials(x).includes(f)):db.items;
  $('statsScope').textContent=f?`Изделия с материалом ${getMat(f).name}: ${list.length} из ${db.items.length}`:`Все изделия каталога: ${db.items.length}`;
  $('statsEmpty').hidden=list.length>0;$('statsBody').hidden=!list.length;if(!list.length)return;
  const sum={plastic:0,power:0,depreciation:0,maintenance:0,extra:0,total:0};let grams=0,hours=0,top=null,cheap=null,pc=0,pg=0,ph=0,pt=0;const mats=new Map(),months=new Map(),st={};
  for(const x of list){const c=calcItem(x);for(const k in sum)sum[k]+=c[k];grams+=c.grams;hours+=c.hours;st[x.status]=(st[x.status]||0)+1;
    if(!top||c.total>top.total)top={name:x.name,total:c.total};if(!cheap||c.total<cheap.total)cheap={name:x.name,total:c.total};
    pc+=c.proto.count;pg+=c.proto.grams;ph+=c.proto.hours;pt+=c.proto.total;for(const [mid,v] of Object.entries(c.proto.byMat)){const mm=mats.get(mid)||{name:getMat(mid).name,items:0,grams:0,cost:0};mm.grams+=v.grams;mm.cost+=v.cost;mats.set(mid,mm)}
    for(const [mid,v] of Object.entries(c.byMat)){const mm=mats.get(mid)||{name:getMat(mid).name,items:0,grams:0,cost:0};mm.items++;mm.grams+=v.grams;mm.cost+=v.cost;mats.set(mid,mm)}
    const d=new Date(x.createdAt||'');if(!isNaN(d)){const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');const mo=months.get(key)||{date:new Date(d.getFullYear(),d.getMonth(),1),count:0,grams:0,hours:0,total:0};mo.count++;mo.grams+=c.grams;mo.hours+=c.hours;mo.total+=c.total;months.set(key,mo)}}
  const byP=new Map();let kwh=0;for(const x of list){const c=calcItem(x),P=c.printer;byP.set(P.id,(byP.get(P.id)||0)+c.hours+c.proto.hours);kwh+=(c.hours+c.proto.hours)*number(P.watts)/1000}
  const res=db.printers.filter(P=>byP.has(P.id)).map(P=>{const life=number(P.years)*number(P.annualHours),h=byP.get(P.id);return life>0?`${escape(P.name)}: ${fmt(h/life*100,2)}% (${fmt(h,1)} из ${fmt(life,0)} ч)`:''}).filter(Boolean);
  const tiles=[['Изделий',fmt(list.length,0)],['Общая себестоимость',money(sum.total)],['Средняя себестоимость',money(sum.total/list.length)],['Пластик',grams>=1000?fmt(grams/1000,2)+' кг':fmt(grams)+' г'],['Время печати',fmt(hours,1)+' ч'],['Электроэнергия',fmt(kwh,1)+' кВт·ч'],['Средняя цена грамма',grams?money(sum.total/grams):'—'],['Средняя цена часа',hours?money(sum.total/hours):'—'],['Прототипов',fmt(pc,0)+(pc?` · ${fmt(pg)} г`:'')],['Затраты на прототипы',money(pt)],['Всего с прототипами',money(sum.total+pt)],['Филамент на складе',fmt(db.spools.filter(s=>s.status!=='empty').reduce((a,s)=>a+Math.max(0,spoolState(s).remaining),0)/1000,2)+' кг'],['Печатей в журнале',fmt(db.prints.length,0)]];
  $('statTiles').innerHTML=tiles.map(([l,v])=>`<div class="stat"><span class="muted">${l}</span><strong>${v}</strong></div>`).join('');
  $('statExtra').innerHTML=Object.keys(STATUSES).filter(k=>st[k]).map(k=>`<span class="pill ${k}">${STATUSES[k]}: ${st[k]}</span>`).join(' ')+`<br><br>Самое дорогое: <b>${escape(top.name)}</b> — ${money(top.total)} · самое дешёвое: <b>${escape(cheap.name)}</b> — ${money(cheap.total)}`+(res.length?`<br>Ресурс по амортизации, включая прототипы — ${res.join(' · ')}`:'');
  $('statBars').innerHTML=barsHtml(sum,true);
  const mg=[...mats.values()].reduce((a,m)=>a+m.grams,0);
  $('statMats').innerHTML=[...mats.values()].sort((a,b)=>b.grams-a.grams).map(m=>{const p=mg?m.grams/mg*100:0;return`<tr><td>${escape(m.name)}</td><td class="num">${m.items}</td><td class="num">${fmt(m.grams)} г</td><td class="num">${money(m.cost)}</td><td>${Math.round(p)}%<div class="minibar"><div style="width:${p}%"></div></div></td></tr>`}).join('');
  const ms=[...months.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,12).map(e=>e[1]),max=Math.max(...ms.map(m=>m.total),0);
  $('statMonths').innerHTML=ms.length?ms.map(m=>`<tr><td>${m.date.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}</td><td class="num">${m.count}</td><td class="num">${fmt(m.grams)} г</td><td class="num">${fmt(m.hours,1)} ч</td><td class="num">${money(m.total)}</td><td style="width:30%"><div class="minibar"><div style="width:${max?m.total/max*100:0}%"></div></div></td></tr>`).join(''):'<tr><td colspan="6" class="muted">Нет дат у изделий</td></tr>'}

/* ================= Страница изделия ================= */
const item=()=>db.items.find(i=>i.id===currentItemId);
const touch=it=>{it.updatedAt=now()};
function renderItem(){const it=item();if(!it)return;
  $('itTitle').textContent=it.name||'Без названия';
  $('itMeta').innerHTML=`<span class="pill ${it.status}">${STATUSES[it.status]}</span> · создано ${escape((it.createdAt||'').slice(0,10))}${it.updatedAt?' · изменено '+escape(new Date(it.updatedAt).toLocaleString('ru-RU')):''}`;
  $('itPrinter').innerHTML=printerOptions(it.printerId);
  $('page-item').querySelectorAll('[data-f]').forEach(el=>{const v=getPath(it,el.dataset.f);el.value=el.dataset.f==='tags'?it.tags.join(', '):(v??'')});
  renderLinks();renderParts();renderItemPrints();$('printForm').hidden=true;$('printStartBtn').hidden=false;renderProtos();renderItemCalc();renderPhotos();renderDesc()}
function renderLinks(){const it=item();$('itLinks').innerHTML=it.links.length?it.links.map((l,i)=>{const u=safeUrl(l.url);return`<div class="linkrow"><input class="ltitle" data-li="${i}" data-lf="title" value="${escape(l.title)}" placeholder="Название (MakerWorld, Printables...)"><input data-li="${i}" data-lf="url" value="${escape(l.url)}" placeholder="https://makerworld.com/... или thingiverse.com/..."><a ${u?`href="${escape(u)}"`:''} target="_blank" rel="noopener" title="Открыть" data-lopen="${i}" style="${u?'':'opacity:.3'}">↗</a><button class="iconbtn danger" data-act="delLink" data-li="${i}" title="Удалить">×</button></div>`}).join(''):'<p class="muted" style="margin-top:0">Ссылок пока нет.</p>'}
function renderParts(){const it=item();
  $('itParts').innerHTML=it.parts.map(p=>`<div class="part" data-pid="${escape(p.id)}"><div class="partrow"><label class="pname">Элемент<input data-pid="${escape(p.id)}" data-pf="name" value="${escape(p.name)}" placeholder="Основание, крышка..."></label><label>Кол-во<input data-pid="${escape(p.id)}" data-pf="qty" type="number" min="1" step="1" value="${p.qty}"></label><div class="lbl ptime">Время на 1 шт${tin(`data-pid="${escape(p.id)}" data-pf="hours"`,p.hours)}</div><div class="pcost" data-pcost="${escape(p.id)}"></div><div style="display:flex;gap:6px;padding-bottom:2px"><button class="iconbtn" data-act="dupPart" data-pid="${escape(p.id)}" title="Дублировать элемент">⧉</button><button class="iconbtn danger" data-act="delPart" data-pid="${escape(p.id)}" title="Удалить элемент">×</button></div></div>
    ${p.filaments.map((f,i)=>`<div class="filrow"><span class="lead">└</span><select data-pid="${escape(p.id)}" data-fi="${i}" data-ff="materialId">${matOptions(f.materialId)}</select><input data-pid="${escape(p.id)}" data-fi="${i}" data-ff="grams" type="number" min="0" step="0.1" value="${f.grams}" title="Граммы на 1 шт"><button class="iconbtn danger" data-act="delFil" data-pid="${escape(p.id)}" data-fi="${i}" title="Убрать материал" ${p.filaments.length<2?'disabled':''}>×</button></div>`).join('')}
    <div class="filrow"><span class="lead"></span><button class="secondary" style="justify-self:start;padding:6px 10px;font-size:12.5px" data-act="addFil" data-pid="${escape(p.id)}">+ материал (AMS)</button></div></div>`).join('')||'<p class="muted">Добавьте хотя бы один элемент.</p>'}
function renderProtos(){const it=item();$('itProtos').innerHTML=it.prototypes.length?`<div class="tablewrap"><table class="mini proto"><thead><tr><th>Версия</th><th>Дата</th><th>Материал</th><th class="num">Граммы</th><th>Время</th><th class="num">Стоимость</th><th>Катушка</th><th>Что проверяли / что изменили</th><th></th></tr></thead><tbody>${it.prototypes.map(p=>{const a=`data-pr="${escape(p.id)}"`;return`<tr><td><input ${a} data-prf="name" value="${escape(p.name)}" style="width:70px"></td><td><input ${a} data-prf="date" type="date" value="${escape(p.date)}" style="width:140px"></td><td><select ${a} data-prf="materialId" style="min-width:90px">${matOptions(p.materialId)}</select></td><td><input ${a} data-prf="grams" type="number" min="0" step="0.1" value="${p.grams}" style="width:80px"></td><td>${tin(`${a} data-prf="hours"`,p.hours,{slider:false,compact:true})}</td><td class="num" data-prcost="${escape(p.id)}"></td><td><select ${a} data-prf="spoolId" style="min-width:150px">${spoolOptions(p.materialId,p.spoolId)}</select></td><td><input ${a} data-prf="note" value="${escape(p.note)}" placeholder="допуск 0.2 мало, увеличил"></td><td><button class="iconbtn danger" data-act="delProto" data-pr="${escape(p.id)}" title="Удалить">×</button></td></tr>`}).join('')}</tbody></table></div>`:'<p class="muted" style="margin:0">Пробных печатей пока нет.</p>'}
function renderItemCalc(){const it=item();if(!it)return;const c=calcItem(it);
  $('itTotal').textContent=money(c.total);
  $('itSummary').textContent=`${fmt(c.grams)} г · ${fmtH(c.hours)} · элементов: ${it.parts.length}${c.pieces!==it.parts.length?` (${c.pieces} шт)`:''}${c.grams?` · ${money(c.total/c.grams)}/г`:''}`;
  $('itBreakdown').innerHTML=breakdownHtml(c);$('itBars').innerHTML=barsHtml(c);
  $('itMats').innerHTML=Object.entries(c.byMat).map(([m,v])=>`<div class="line"><span>${escape(getMat(m).name)} · ${fmt(v.grams)} г</span><b>${money(v.cost)}</b></div>`).join('')||'<p class="muted">—</p>';
  $('itProtoCost').innerHTML=c.proto.count?`<div class="line"><span>Прототипы · ${c.proto.count} шт</span><b>${money(c.proto.total)}</b></div><div class="line"><span><b>Итого с прототипами</b></span><b>${money(c.dev)}</b></div>`:'';
  $('itProtoSum').innerHTML=c.proto.count?`Всего: <b>${c.proto.count}</b> шт · ${fmt(c.proto.grams)} г · ${fmtH(c.proto.hours)} · <b>${money(c.proto.total)}</b> · с учётом изделия: <b>${money(c.dev)}</b>`:'';
  for(const p of it.prototypes){const el=document.querySelector(`[data-prcost="${CSS.escape(p.id)}"]`);if(el)el.textContent=money(c.proto.items[p.id]||0)}
  for(const p of it.parts){const el=document.querySelector(`[data-pcost="${CSS.escape(p.id)}"]`),pc=c.parts[p.id];if(el&&pc)el.innerHTML=`${money(pc.total)}${p.qty>1?`<div><small>${money(pc.unit)}/шт</small></div>`:''}`}}
function renderPhotos(){const it=item();if(!it)return;const can=!!(store&&stReady);
  $('photoAdd').disabled=!can;$('photoHint').textContent=can?`Перетащите фото сюда или нажмите «Добавить». Фото сохраняются в ${store.label}, папка photos/. ★ — сделать обложкой.`:'Подключите хранилище в настройках (папку или Google Drive), чтобы добавлять и видеть фото.';
  $('itPhotos').innerHTML=it.photos.map(p=>`<div class="ph${it.cover===p.file?' cover':''}">${it.cover===p.file?'<span class="badge">обложка</span>':''}<img data-photo="${escape(p.file)}" alt=""><div class="acts"><button class="iconbtn" data-act="cover" data-ph="${escape(p.id)}" title="Сделать обложкой">★</button><button class="iconbtn danger" data-act="delPhoto" data-ph="${escape(p.id)}" title="Удалить фото">×</button></div></div>`).join('')||'<p class="muted" style="margin:6px">Фото пока нет.</p>';
  hydrate($('itPhotos'))}

/* --- Описание для MakerWorld --- */
const TPL={ru:{parts:'Детали для печати',settings:'Настройки печати',printer:'Принтер',nozzle:'Сопло',layer:'Высота слоя',infill:'Заполнение',walls:'Стенки',supports:'Поддержки',plate:'Пластина',total:'Итого',fil:'филамента',time:'печати',hardware:'Что ещё понадобится',assembly:'Сборка',tips:'Советы',mm:'мм',g:'г',loc:'ru-RU'},
  en:{parts:'Printed parts',settings:'Print settings',printer:'Printer',nozzle:'Nozzle',layer:'Layer height',infill:'Infill',walls:'Walls',supports:'Supports',plate:'Build plate',total:'Total',fil:'of filament',time:'print time',hardware:'Hardware',assembly:'Assembly',tips:'Printing tips',mm:'mm',g:'g',loc:'en-US'}};
function buildDesc(it){const lang=it.desc.lang==='en'?'en':'ru',t=TPL[lang],c=calcItem(it),L=[],n=(v,d=1)=>fmt(v,d,t.loc),block=(title,text)=>{if(String(text||'').trim())L.push('',title,String(text).trim())};
  if(it.desc.intro.trim())L.push(it.desc.intro.trim(),'');
  L.push(t.parts);for(const p of it.parts){const mats=[...new Set(p.filaments.map(f=>getMat(f.materialId).name))].join(' + '),g=p.filaments.reduce((a,f)=>a+number(f.grams),0);L.push(`• ${p.name||'—'} × ${p.qty} — ${mats}, ${n(g)} ${t.g}, ${fmtH(p.hours,lang)}`)}
  L.push('',t.settings,`• ${t.printer}: ${getPrinter(it.printerId).name}`);const P=it.print;
  if(P.nozzle)L.push(`• ${t.nozzle}: ${P.nozzle} ${t.mm}`);if(P.layer)L.push(`• ${t.layer}: ${P.layer} ${t.mm}`);for(const k of ['infill','walls','supports','plate'])if(String(P[k]).trim())L.push(`• ${t[k]}: ${String(P[k]).trim()}`);
  if(String(P.other).trim())L.push(...String(P.other).trim().split('\n').map(s=>'• '+s.replace(/^[•\-*]\s*/,'')));
  L.push(`• ${t.total}: ~${n(c.grams,0)} ${t.g} ${t.fil}, ~${fmtH(c.hours,lang)} ${t.time}`);
  block(t.hardware,it.desc.hardware);block(t.assembly,it.desc.assembly);block(t.tips,it.desc.tips);
  return L.join('\n')}
function renderDesc(){const it=item();if(it)$('descOut').textContent=buildDesc(it)}

/* --- События страницы изделия --- */
$('itStatus').innerHTML=Object.entries(STATUSES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
$('statusFilter').innerHTML='<option value="">Все статусы</option>'+Object.entries(STATUSES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
$('page-item').addEventListener('input',e=>{const it=item(),el=e.target;if(!it)return;const pid=el.dataset.pid,p=pid&&it.parts.find(x=>x.id===pid);
  if(el.dataset.f){const f=el.dataset.f;let v=el.value;if(f==='tags')v=v.split(',').map(s=>s.trim()).filter(Boolean);else if(f==='extra')v=number(v);setPath(it,f,v);if(f==='name')$('itTitle').textContent=it.name||'Без названия';if(f==='status')$('itMeta').querySelector('.pill').outerHTML=`<span class="pill ${it.status}">${STATUSES[it.status]}</span>`}
  else if(el.dataset.pf&&p){const k=el.dataset.pf;p[k]=k==='name'?el.value:k==='qty'?Math.max(1,Math.round(number(el.value))||1):number(el.value)}
  else if(el.dataset.ff&&p){const fl=p.filaments[+el.dataset.fi];if(!fl)return;fl[el.dataset.ff]=el.dataset.ff==='grams'?number(el.value):el.value}
  else if(el.dataset.prf){const p=it.prototypes.find(x=>x.id===el.dataset.pr);if(!p)return;const k=el.dataset.prf;p[k]=['grams','hours'].includes(k)?number(el.value):el.value;if(k==='materialId'){p.spoolId='';renderProtos()}if(k==='spoolId'||k==='grams'||k==='date'){const s=getSpool(p.spoolId);if(s&&s.status==='sealed')s.status='open';renderSpools()}}
  else if(el.dataset.lf){const l=it.links[+el.dataset.li];if(!l)return;l[el.dataset.lf]=el.value;if(el.dataset.lf==='url'){const t=el.parentElement.querySelector('[data-lf="title"]'),sn=siteName(el.value);if(sn&&(!l.title||SITES.some(([,n])=>n===l.title))){l.title=sn;t.value=sn}const a=el.parentElement.querySelector('[data-lopen]'),u=safeUrl(el.value);if(u)a.href=u;else a.removeAttribute('href');a.style.opacity=u?'':'.3'}}
  else return;
  touch(it);schedulePersist();renderItemCalc();renderDesc()});
$('page-item').addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(!b)return;const it=item();if(!it)return;const act=b.dataset.act,pid=b.dataset.pid,p=pid&&it.parts.find(x=>x.id===pid);
  if(act==='printStart'){openPrintForm();return}if(act==='printCancel'){$('printForm').hidden=true;$('printStartBtn').hidden=false;return}if(act==='printSave'){savePrint();return}
  if(act==='addLink'){it.links.push({title:b.dataset.preset||'',url:''});renderLinks();$('itLinks').querySelector('.linkrow:last-child [data-lf="url"]')?.focus()}
  else if(act==='delLink'){it.links.splice(+b.dataset.li,1);renderLinks()}
  else if(act==='addProto'){const last=it.prototypes.at(-1);it.prototypes.push({id:shortId(),name:'v'+(it.prototypes.length+1),date:now().slice(0,10),materialId:last?.materialId||it.parts[0]?.filaments[0]?.materialId||db.materials[0]?.id||'',grams:0,hours:0,note:'',spoolId:'',at:now()});renderProtos();$('itProtos').querySelector('tr:last-child [data-prf="grams"]')?.focus()}
  else if(act==='delProto'){it.prototypes=it.prototypes.filter(x=>x.id!==b.dataset.pr);renderProtos()}
  else if(act==='addPart'){const last=it.parts.at(-1);it.parts.push({id:shortId(),name:'',qty:1,hours:0,filaments:[{materialId:last?.filaments[0]?.materialId||db.materials[0]?.id||'',grams:0}]});renderParts();$('itParts').querySelector('.part:last-child [data-pf="name"]')?.focus()}
  else if(act==='dupPart'&&p){const cp=structuredClone(p);cp.id=shortId();cp.name=(p.name||'Элемент')+' (копия)';it.parts.splice(it.parts.indexOf(p)+1,0,cp);renderParts()}
  else if(act==='delPart'&&p){if(it.parts.length===1&&!confirm('Это единственный элемент. Удалить?'))return;it.parts=it.parts.filter(x=>x!==p);renderParts()}
  else if(act==='addFil'&&p){p.filaments.push({materialId:db.materials.find(m=>!p.filaments.some(f=>f.materialId===m.id))?.id||db.materials[0]?.id||'',grams:0});renderParts()}
  else if(act==='delFil'&&p){p.filaments.splice(+b.dataset.fi,1);renderParts()}
  else if(act==='cover'){const ph=it.photos.find(x=>x.id===b.dataset.ph);if(ph)it.cover=ph.file;renderPhotos()}
  else if(act==='delPhoto'){const ph=it.photos.find(x=>x.id===b.dataset.ph);if(!ph||!confirm('Удалить фото? Файл будет удалён из папки photos/.'))return;it.photos=it.photos.filter(x=>x!==ph);if(it.cover===ph.file)it.cover=it.photos[0]?.file||'';await removePhotoFiles([ph.file]);renderPhotos()}
  else if(act==='dupItem'){const cp=structuredClone(it);cp.id=uid();cp.name=it.name+' (копия)';cp.photos=[];cp.cover='';cp.prototypes=[];cp.createdAt=cp.updatedAt=now();cp.parts.forEach(x=>x.id=shortId());db.items.unshift(cp);persist();renderList();setStatus('Создана копия изделия');go('item/'+cp.id);return}
  else if(act==='delItem'){if(!confirm(`Удалить изделие «${it.name}»?${it.photos.length?' Его фото тоже будут удалены из папки.':''}`))return;await removePhotoFiles(it.photos.map(x=>x.file));db.items=db.items.filter(x=>x!==it);persist();renderList();setStatus('Изделие удалено');go('catalog');return}
  else return;
  touch(it);persist();renderList();renderItemCalc();renderDesc()});
$('photoAdd').onclick=()=>$('photoInput').click();
$('photoInput').onchange=async e=>{const it=item();try{if(it)await addPhotos(it,[...e.target.files])}catch(err){storeErr(err)}e.target.value=''};
const drop=$('photoDrop');
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over')});drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
drop.addEventListener('drop',async e=>{e.preventDefault();drop.classList.remove('over');const it=item();try{if(it)await addPhotos(it,[...e.dataTransfer.files])}catch(err){storeErr(err)}});
$('descCopy').onclick=async()=>{const text=$('descOut').textContent;try{await navigator.clipboard.writeText(text)}catch{const ta=Object.assign(document.createElement('textarea'),{value:text});document.body.append(ta);ta.select();document.execCommand('copy');ta.remove()}setStatus('Описание скопировано')};

/* ================= Катушки ================= */
const SPOOL_ST={sealed:'Запечатана',open:'Открыта',empty:'Закончилась'};
const OPNAMES={set:'Установлен остаток',sub:'Списание',add:'Добавление'};
const DENS={PETG:1.27,PCTG:1.23,ASA:1.07,ABS:1.04,TPU:1.21,PLA:1.24,PVA:1.23,HIPS:1.04,PA:1.14,PC:1.2};
function guessDensity(name){const n=String(name).toUpperCase();for(const k of Object.keys(DENS))if(n.includes(k))return DENS[k];return 1.24}
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function normSpool(s){return{id:String(s.id||uid()),materialId:String(s.materialId||''),brand:String(s.brand||''),series:String(s.series||''),color:String(s.color||''),colorHex:/^#[0-9a-f]{6}$/i.test(s.colorHex)?s.colorHex:'#d9dee8',colorStops:(Array.isArray(s.colorStops)?s.colorStops:[]).filter(v=>/^#[0-9a-f]{6}$/i.test(v)).slice(0,8),
  diameter:number(s.diameter)||1.75,net:number(s.net)||1000,empty:s.empty===''||s.empty==null?'':number(s.empty),price:number(s.price),purchased:String(s.purchased||''),store:String(s.store||''),
  status:SPOOL_ST[s.status]?s.status:'sealed',opened:String(s.opened||''),dried:String(s.dried||''),notes:String(s.notes||''),createdAt:s.createdAt||now(),
  ops:(Array.isArray(s.ops)?s.ops:[]).filter(o=>OPNAMES[o?.type]).map(o=>({id:String(o.id||shortId()),at:o.at||now(),date:String(o.date||String(o.at||now()).slice(0,10)),type:o.type,grams:number(o.grams),note:String(o.note||'')}))}}
function normPrint(p){return{id:String(p.id||uid()),at:p.at||now(),date:String(p.date||String(p.at||now()).slice(0,10)),itemId:String(p.itemId||''),itemName:String(p.itemName||''),printerId:String(p.printerId||''),sets:Math.max(1,Math.round(number(p.sets))||1),result:p.result==='fail'?'fail':'ok',note:String(p.note||''),
  usage:(Array.isArray(p.usage)?p.usage:[]).map(u=>({label:String(u.label||''),materialId:String(u.materialId||''),spoolId:String(u.spoolId||''),grams:number(u.grams)}))}}
const getSpool=id=>db.spools.find(s=>s.id===id);
const spName=s=>[s.brand,s.series,s.color].map(x=>String(x).trim()).filter(Boolean).join(' ')||'Без названия';
const gPerM=s=>number(getMat(s.materialId).density||guessDensity(getMat(s.materialId).name))*Math.PI*(number(s.diameter)||1.75)**2/4;
const toM=(s,g)=>{const k=gPerM(s);return k?g/k:0};
function spoolState(sp){const ev=[];
  for(const o of sp.ops)ev.push({key:o.date+'|'+o.at,date:o.date,kind:o.type,grams:o.grams,label:OPNAMES[o.type]+(o.note?': '+o.note:''),op:o.id});
  for(const p of db.prints)for(const u of p.usage)if(u.spoolId===sp.id)ev.push({key:p.date+'|'+p.at,date:p.date,kind:'use',grams:u.grams,label:`Печать: ${p.itemName||'изделие'}${p.sets>1?' ×'+p.sets:''}${p.result==='fail'?' — неудачно':''}`,item:p.itemId});
  for(const it of db.items)for(const pr of it.prototypes)if(pr.spoolId===sp.id&&number(pr.grams))ev.push({key:(pr.date||'')+'|'+(pr.at||''),date:pr.date,kind:'use',grams:number(pr.grams),label:`Прототип ${pr.name}: ${it.name}`,item:it.id});
  ev.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  let rem=number(sp.net),used=0;for(const e of ev){if(e.kind==='set'){e.delta=e.grams-rem;rem=e.grams}else if(e.kind==='add'){e.delta=e.grams;rem+=e.grams}else{e.delta=-e.grams;rem-=e.grams;used+=e.grams}e.after=rem}
  return{remaining:rem,used,events:ev}}
function sortedSpools(materialId,keep){const list=db.spools.filter(s=>s.materialId===materialId&&(s.status!=='empty'||s.id===keep)),rem=new Map(list.map(s=>[s.id,spoolState(s).remaining]));list.sort((a,b)=>(a.status==='open'?0:1)-(b.status==='open'?0:1)||rem.get(a.id)-rem.get(b.id));return{list,rem}}
function spoolOptions(materialId,sel){const {list,rem}=sortedSpools(materialId,sel);return'<option value="">— не списывать —</option>'+list.map(s=>`<option value="${escape(s.id)}"${s.id===sel?' selected':''}>${escape(spName(s))} · ${fmt(rem.get(s.id),0)} г</option>`).join('')}
const swatch=(s,cls='')=>`<span class="swatch ${cls}" style="background:${bgOf(s)}"></span>`;
function remBar(s,g){const p=Math.max(0,Math.min(100,number(s.net)?g/number(s.net)*100:0)),low=s.status!=='empty'&&g<number(db.settings.lowStock);return`<div class="minibar"><div style="width:${p}%;background:${low?'#ef5f6f':bgOf(s)}"></div></div>`}

function renderSpools(){
  const q=$('spoolSearch').value.trim().toLowerCase(),f=$('spoolFilter').value,low=number(db.settings.lowStock);
  const all=db.spools.map(s=>({s,st:spoolState(s)}));
  const byMat=new Map();for(const {s,st} of all){if(s.status==='empty')continue;const m=byMat.get(s.materialId)||{n:0,g:0,m:0,low:0};m.n++;m.g+=Math.max(0,st.remaining);m.m+=toM(s,Math.max(0,st.remaining));if(st.remaining<low)m.low++;byMat.set(s.materialId,m)}
  $('spoolTiles').innerHTML=[...byMat.entries()].sort((a,b)=>b[1].g-a[1].g).map(([mid,m])=>`<div class="stat"><span class="muted">${escape(getMat(mid).name)} · ${m.n} кат.</span><strong>${fmt(m.g,0)} г</strong><small>≈ ${fmt(m.m,0)} м${m.low?` · <span style="color:var(--neg)">мало: ${m.low}</span>`:''}</small></div>`).join('');
  const list=all.filter(({s})=>(f==='all'||(f==='empty'?s.status==='empty':s.status!=='empty'))&&(spName(s)+' '+getMat(s.materialId).name+' '+s.store).toLowerCase().includes(q));
  $('spoolEmpty').hidden=list.length>0;$('spoolEmpty').textContent=db.spools.length?'Ничего не найдено.':'Катушек пока нет. Нажмите «+ Катушка».';
  $('spoolRows').innerHTML=list.map(({s,st})=>{const g=st.remaining,isLow=s.status!=='empty'&&g<low;return`<tr class="click" data-spool="${escape(s.id)}"><td>${swatch(s)}</td><td><b>${escape(s.brand||'—')}</b>${s.store?`<div><small>${escape(s.store)}</small></div>`:''}</td><td>${escape([s.series,s.color].filter(x=>String(x).trim()).join(' · ')||'—')}</td><td>${escape(getMat(s.materialId).name)}</td><td><span style="${isLow?'color:var(--neg)':''}">${fmt(g,0)} г · ${fmt(toM(s,g),0)} м${isLow?' · мало':''}</span>${remBar(s,g)}</td><td class="num">${s.price?money(s.price)+`<div><small>${money(s.price/number(s.net)*1000)}/кг</small></div>`:'—'}</td><td>${escape(s.purchased)}</td><td><span class="pill sp-${s.status}">${SPOOL_ST[s.status]}</span></td></tr>`}).join('');
  $('navSpools').textContent=all.filter(({s,st})=>s.status!=='empty'&&st.remaining<low).length?'!':''}


let currentSpoolId=null;const spool=()=>getSpool(currentSpoolId);
function renderSpool(){const s=spool();if(!s)return;if(renderSpool.last!==s.id){renderSpool.last=s.id;for(const k of ['corrVal','corrNote','weighGross'])$(k).value=''}
  $('spMat').innerHTML=matOptions(s.materialId);$('spBrand').innerHTML=brandOptions(s.brand);$('spStatus').innerHTML=Object.entries(SPOOL_ST).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  renderColorEdit();$('page-spool').querySelectorAll('[data-sf]').forEach(el=>{el.value=s[el.dataset.sf]??''});renderColorChips();renderQuick();
  renderSpoolHead();renderSpoolRem()}
function renderSpoolHead(){const s=spool();$('spTitle').textContent=spName(s);$('spSwatch').style.background=bgOf(s);$('spMeta').innerHTML=`${escape(getMat(s.materialId).name)} · ${fmt(s.diameter,2)} мм · <span class="pill sp-${s.status}">${SPOOL_ST[s.status]}</span>`}
function renderSpoolRem(){const s=spool();if(!s)return;const st=spoolState(s),g=st.remaining,k=gPerM(s);
  $('spRem').textContent=`${fmt(g,0)} г`;$('spRem').style.color=g<0?'var(--neg)':'';
  $('spRemSub').textContent=`≈ ${fmt(toM(s,g),0)} м · ${number(s.net)?fmt(Math.max(0,g)/number(s.net)*100,0):0}% от ${fmt(s.net,0)} г · израсходовано ${fmt(st.used,0)} г${s.price&&number(s.net)?` · остаток стоит ${money(Math.max(0,g)*s.price/number(s.net))}`:''} · ${fmt(k,2)} г/м`;
  $('spRemBar').style.width=Math.max(0,Math.min(100,number(s.net)?g/number(s.net)*100:0))+'%';$('spRemBar').style.background=bgOf(s);
  // взвешивание
  const same=db.spools.filter(x=>x!==s&&x.empty!==''&&x.brand.trim()&&x.brand.trim().toLowerCase()===s.brand.trim().toLowerCase());
  const hint=s.empty!==''?`Остаток = вес на весах − ${fmt(s.empty,0)} г (пустая катушка).`
    :`Вес пустой катушки неизвестен. Если катушка новая и запечатанная — взвесьте её и нажмите «Это новая катушка»: вес пустой = брутто − ${fmt(s.net,0)} г.`+(same.length?` <button class="secondary" data-useempty="${same[0].empty}" style="padding:4px 9px;font-size:12px">Взять ${fmt(same[0].empty,0)} г от другой катушки ${escape(same[0].brand)}</button>`:'');
  $('weighHint').innerHTML=hint;$('weighNew').hidden=s.empty!=='';
  updateCorrHint();
  $('spHist').innerHTML=st.events.slice().reverse().map(e=>`<tr><td>${escape(e.date||'')}</td><td>${e.item?`<a href="#item/${escape(e.item)}" class="lnk">${escape(e.label)}</a>`:escape(e.label)}</td><td class="num" style="color:${e.delta<0?'var(--neg)':'var(--pos)'}">${e.delta>0?'+':''}${fmt(e.delta,1)} г<div><small>${e.delta>0?'+':''}${fmt(toM(s,e.delta),1)} м</small></div></td><td class="num">${fmt(e.after,0)} г</td><td>${e.op?`<button class="iconbtn danger" data-delop="${escape(e.op)}" title="Отменить корректировку">×</button>`:''}</td></tr>`).join('')+`<tr><td>${escape(s.purchased||s.createdAt.slice(0,10))}</td><td>Новая катушка</td><td class="num">+${fmt(s.net,0)} г</td><td class="num">${fmt(s.net,0)} г</td><td></td></tr>`}
function updateCorrHint(){const s=spool();if(!s)return;const v=number($('corrVal').value),u=$('corrUnit').value;$('corrHint').textContent=v?(u==='m'?`${fmt(v,1)} м ≈ ${fmt(v*gPerM(s),1)} г`:`${fmt(v,1)} г ≈ ${fmt(toM(s,v),1)} м`):''}
function addOp(s,type,grams,note){s.ops.push({id:shortId(),at:now(),date:today(),type,grams:Math.max(0,grams),note});if(s.status==='sealed'&&type!=='add')s.status='open';const r=spoolState(s).remaining;if(r<=0&&s.status!=='empty'&&confirm('Остаток 0 — отметить катушку как закончившуюся?'))s.status='empty';persist();renderSpool();renderSpools()}
function newSpool(from){const s=normSpool(from?{...structuredClone(from),id:'',ops:[],createdAt:'',status:'sealed',opened:'',dried:''}:{materialId:db.materials[0]?.id,purchased:today()});db.spools.unshift(s);persist();renderSpools();go('spool/'+s.id)}


function afterColor(full){renderColorChips();if(full)renderColorEdit();renderSpoolHead();renderSpoolRem();schedulePersist();renderSpools()}
$('spColors').onclick=e=>{const b=e.target.closest('[data-ci]'),s=spool();if(!b||!s)return;const c=db.lib.colors[+b.dataset.ci];setSpoolColor(s,c.name,c.stops);afterColor(true)};
$('spColorEdit').addEventListener('input',e=>{const s=spool(),el=e.target;if(!s||el.dataset.stop===undefined)return;const st=spStops(s).slice();st[+el.dataset.stop]=el.value;setSpoolColor(s,s.color,st);afterColor(false)});
$('spColorEdit').addEventListener('click',e=>{const b=e.target.closest('button'),s=spool();if(!b||!s)return;
  if(b.dataset.stopadd!==undefined){const st=spStops(s).slice();st.push(st.at(-1));setSpoolColor(s,s.color,st);afterColor(true)}
  else if(b.dataset.stopdel!==undefined){const st=spStops(s).slice();st.splice(+b.dataset.stopdel,1);setSpoolColor(s,s.color,st);afterColor(true)}
  else if(b.id==='spColorSave'){const n=s.color.trim();if(!n){alert('Введите название цвета');$('spColorEdit').querySelector('[data-sf="color"]').focus();return}const st=spStops(s).slice(),ex=db.lib.colors.find(c=>ieq(c.name,n));
    if(ex){if(!confirm(`Цвет «${ex.name}» уже есть в палитре. Заменить его оттенки?`))return;ex.stops=st}else db.lib.colors.push({name:n,stops:st});persist();renderColorChips();renderLibs();setStatus('Цвет сохранён в палитру')}});
$('page-spool').addEventListener('click',e=>{const b=e.target.closest('[data-qf]'),s=spool();if(!b||!s)return;const k=b.dataset.qf;s[k]=b.dataset.v;$('page-spool').querySelector(`[data-sf="${k}"]`).value=s[k];renderQuick();renderSpoolHead();schedulePersist();renderSpools()});
$('page-spool').addEventListener('change',e=>{const s=spool(),k=e.target.dataset.sf;if(!s||!['series','store','brand'].includes(k))return;libAbsorb(s,db.lib,k);renderQuick();renderLibs();schedulePersist()});
$('spoolAdd').onclick=()=>newSpool();
$('spoolSearch').oninput=renderSpools;$('spoolFilter').onchange=renderSpools;
$('spoolRows').onclick=e=>{const tr=e.target.closest('[data-spool]');if(tr)go('spool/'+tr.dataset.spool)};
$('page-spool').addEventListener('input',e=>{const s=spool(),el=e.target,k=el.dataset.sf;if(!s||!k)return;
  if(k==='brand'&&el.value==='__add'){const n=(prompt('Название производителя:')||'').trim();if(n){let b=libBrand(n);if(!b)db.lib.brands.push(b={name:n,series:[]});s.brand=b.name}el.innerHTML=brandOptions(s.brand);persist();renderSpoolHead();renderQuick();renderLibs();return}
  s[k]=['net','price','diameter'].includes(k)?number(el.value):k==='empty'?(el.value===''?'':number(el.value)):el.value;
  if(k==='status'&&el.value==='open'&&!s.opened){s.opened=today();$('page-spool').querySelector('[data-sf="opened"]').value=s.opened}
  if(k==='color')renderColorChips();if(k==='brand'||k==='series'||k==='store')renderQuick();
  schedulePersist();renderSpoolHead();if(!['notes','store','purchased','opened','dried'].includes(k))renderSpoolRem()});
$('corrVal').oninput=updateCorrHint;$('corrUnit').onchange=updateCorrHint;
$('corrApply').onclick=()=>{const s=spool(),v=number($('corrVal').value);if(!s)return;if(!v&&$('corrMode').value!=='set'){alert('Введите значение');return}const g=$('corrUnit').value==='m'?v*gPerM(s):v;const u=$('corrUnit').value==='m'?` (${fmt(v,1)} м)`:'',note=($('corrNote').value.trim()+u).trim();$('corrVal').value='';$('corrNote').value='';addOp(s,$('corrMode').value,g,note);setStatus('Остаток обновлён')};
$('weighApply').onclick=()=>{const s=spool(),gross=number($('weighGross').value);if(!s)return;if(!gross){alert('Введите вес катушки на весах');return}if(s.empty===''){alert('Сначала нужен вес пустой катушки — см. подсказку ниже');return}const r=gross-number(s.empty);if(r<0){alert('Вес на весах меньше веса пустой катушки — проверьте числа');return}$('weighGross').value='';addOp(s,'set',r,`взвешивание, брутто ${fmt(gross,0)} г`);setStatus('Остаток пересчитан по весу')};
$('weighNew').onclick=()=>{const s=spool(),gross=number($('weighGross').value);if(!s)return;if(!gross){alert('Введите вес катушки на весах');return}const e=gross-number(s.net);if(e<=0){alert('Брутто меньше веса филамента — проверьте вес нетто');return}if(spoolState(s).used>0&&!confirm('По катушке уже есть списания. Всё равно считать её полной?'))return;s.empty=Math.round(e);persist();renderSpool();setStatus(`Вес пустой катушки: ${fmt(s.empty,0)} г`)};
$('weighHint').onclick=e=>{const v=e.target.dataset.useempty;if(v===undefined)return;const s=spool();s.empty=number(v);persist();renderSpool()};
$('spHist').onclick=e=>{const id=e.target.dataset.delop;if(!id)return;const s=spool();if(!confirm('Отменить эту корректировку?'))return;s.ops=s.ops.filter(o=>o.id!==id);persist();renderSpool();renderSpools()};
$('spDup').onclick=()=>{const s=spool();if(s){newSpool(s);setStatus('Создана копия катушки')}};
$('spDel').onclick=()=>{const s=spool();if(!s)return;const used=db.prints.some(p=>p.usage.some(u=>u.spoolId===s.id))||db.items.some(i=>i.prototypes.some(p=>p.spoolId===s.id));if(!confirm(used?'Катушка упоминается в журнале печати — записи останутся без катушки. Удалить?':'Удалить катушку?'))return;db.spools=db.spools.filter(x=>x!==s);persist();renderSpools();go('spools')};

/* ================= Справочники катушек: производители и серии, магазины, цвета ================= */
const DEFAULT_BRANDS=[['Bambu Lab',['PLA Basic','PLA Matte','PLA Silk+','PLA Translucent','PLA-CF','PETG HF','PETG Translucent','ABS','ASA','TPU 95A HF','Support for PLA/PETG']],
  ['Polymaker',['PolyTerra PLA','PolyLite PLA','PolyLite PETG','PolyMax PLA','Panchroma Silk']],['eSUN',['PLA+','PLA Matte','eSilk PLA','PETG','ABS+','eTPU-95A']],
  ['Creality',['Hyper PLA','CR-PLA','CR-Silk','Hyper PETG','CR-PETG']],['Elegoo',['PLA','PLA+','PLA Matte','Rapid PETG']],['SUNLU',['PLA','PLA+','PLA Matte','Silk PLA','PETG']],
  ['Prusament',['PLA','PETG','ASA']],['Anycubic',['PLA','PLA+','PETG']],['JAYO',['PLA','PLA+','Silk PLA','PETG']],['Kingroon',['PLA','PETG']],['ERYONE',['PLA','Silk PLA','PETG']],
  ['Overture',['PLA','PLA+','PETG']],['Geeetech',['PLA','PETG']],['Bestfilament',['PLA','PETG','ABS','Watson','Рубин']],['REC',['PLA','PETG','ABS','Rubber']],
  ['U3Print',['PLA','PETG','HP PLA']],['FDplast',['PLA','PETG','ABS']],['Fiberlab',['PLA','PETG']]];
const DEFAULT_STORES=['Ozon','Wildberries','Яндекс Маркет','AliExpress','Официальный сайт'];
const DEFAULT_COLORS=[['Белый',['#f5f5f5']],['Чёрный',['#1b1b1b']],['Серый',['#8a8f98']],['Серебристый',['#c4c8cf']],['Красный',['#d32f2f']],['Оранжевый',['#f57c00']],['Жёлтый',['#fbc02d']],['Зелёный',['#2e9e4f']],['Синий',['#1e5bd8']],['Голубой',['#4fc3f7']],['Фиолетовый',['#7b3fb2']],['Розовый',['#ec6fa6']],['Коричневый',['#6d4c41']],['Бежевый',['#d8c3a5']],['Прозрачный',['#dfe9ee']],
  ['Радуга',['#e53935','#fb8c00','#fdd835','#43a047','#1e88e5','#8e24aa']],['Пастельная радуга',['#f8bbd0','#ffe0b2','#fff9c4','#c8e6c9','#bbdefb','#e1bee7']],['Неоновая радуга',['#ff1744','#ffea00','#00e676','#00e5ff','#d500f9']],
  ['Закат',['#ff7043','#ec407a','#7e57c2']],['Океан',['#00bcd4','#1e88e5','#3949ab']],['Золото / серебро (dual silk)',['#d4af37','#c0c4cc']],['Красный / синий (dual)',['#d32f2f','#1e5bd8']],['Хамелеон',['#2e7d32','#6a1b9a','#1565c0']]];
const isHex=v=>/^#[0-9a-f]{6}$/i.test(String(v));
const normColor=c=>{const stops=(Array.isArray(c?.stops)?c.stops:[c?.hex]).filter(isHex).slice(0,8);return c&&String(c.name||'').trim()&&stops.length?{name:String(c.name).trim(),stops}:null};
const gradCss=stops=>stops.length>1?`linear-gradient(135deg,${stops.join(',')})`:(stops[0]||'#d9dee8');
const spStops=s=>Array.isArray(s.colorStops)&&s.colorStops.length>1?s.colorStops:[s.colorHex];
const bgOf=s=>gradCss(spStops(s));
const ieq=(a,b)=>String(a).trim().toLowerCase()===String(b).trim().toLowerCase();
function normLib(l,d){const L=l&&typeof l==='object'?l:null;
  const brands=Array.isArray(L?.brands)?L.brands.filter(b=>b&&String(b.name||'').trim()).map(b=>({name:String(b.name).trim(),series:[...new Set((Array.isArray(b.series)?b.series:[]).map(x=>String(x).trim()).filter(Boolean))]})):DEFAULT_BRANDS.map(([n,s])=>({name:n,series:[...s]}));
  const colors=Array.isArray(L?.colors)?L.colors.map(normColor).filter(Boolean):DEFAULT_COLORS.map(([n,s])=>({name:n,stops:[...s]}));
  const stores=Array.isArray(L?.stores)?[...new Set(L.stores.map(x=>String(x).trim()).filter(Boolean))]:[...DEFAULT_STORES];
  if(!L){for(const b of Array.isArray(d.brands)?d.brands:[])if(String(b).trim()&&!brands.some(x=>ieq(x.name,b)))brands.push({name:String(b).trim(),series:[]});
    for(const c of Array.isArray(d.colors)?d.colors:[]){const n=normColor(c);if(n&&!colors.some(x=>ieq(x.name,n.name)))colors.push(n)}}
  return{brands,colors,stores}}
// значения, введённые в катушках, попадают в справочники
function libAbsorb(s,L=db.lib,only){const want=k=>!only||only===k;if(s.brand.trim()&&(want('brand')||want('series'))){let b=L.brands.find(x=>ieq(x.name,s.brand));if(!b){b={name:s.brand.trim(),series:[]};L.brands.push(b)}if(want('series')&&s.series.trim()&&!b.series.some(x=>ieq(x,s.series)))b.series.push(s.series.trim())}
  if(want('store')&&s.store.trim()&&!L.stores.some(x=>ieq(x,s.store)))L.stores.push(s.store.trim())}
const libBrand=name=>db.lib.brands.find(b=>ieq(b.name,name));
function brandOptions(sel){const list=db.lib.brands.map(b=>b.name);if(sel&&!list.some(b=>b===sel))list.push(sel);return'<option value="">— не указан —</option>'+list.map(b=>`<option${b===sel?' selected':''}>${escape(b)}</option>`).join('')+'<option value="__add">＋ Добавить производителя…</option>'}
function renderColorChips(){const s=spool();if(!s)return;$('spColors').innerHTML=db.lib.colors.map((c,i)=>{const on=ieq(s.color,c.name);return`<button type="button" class="cchip${on?' on':''}" data-ci="${i}" title="${escape(c.name)}${c.stops.length>1?' — многоцветный':''}"><span class="swatch sm" style="background:${gradCss(c.stops)}"></span>${escape(c.name)}</button>`}).join('')}
function renderColorEdit(){const s=spool();if(!s)return;const st=spStops(s);
  $('spColorEdit').innerHTML=`<input data-sf="color" value="${escape(s.color)}" placeholder="Название цвета"><span class="stops">${st.map((h,i)=>`<span class="stop"><input type="color" data-stop="${i}" value="${escape(h)}" title="Оттенок ${i+1}">${st.length>1?`<button type="button" class="linkbtn" data-stopdel="${i}" title="Убрать оттенок">×</button>`:''}</span>`).join('')}${st.length<8?`<button type="button" class="secondary small" data-stopadd title="Многоцветный / радужный филамент: добавьте оттенки">+ оттенок</button>`:''}</span><button type="button" class="secondary small" id="spColorSave">В палитру</button>`}
function renderQuick(){const s=spool();if(!s)return;const b=libBrand(s.brand),ser=b?b.series:[];
  $('spSeriesQ').innerHTML=ser.map(v=>`<button type="button" class="qchip${ieq(v,s.series)?' on':''}" data-qf="series" data-v="${escape(v)}">${escape(v)}</button>`).join('')||(s.brand?'<span class="muted">Серий пока нет — введите, она запомнится</span>':'<span class="muted">Выберите производителя — появятся его серии</span>');
  $('spStoreQ').innerHTML=db.lib.stores.map(v=>`<button type="button" class="qchip${ieq(v,s.store)?' on':''}" data-qf="store" data-v="${escape(v)}">${escape(v)}</button>`).join('');
  $('dlSeries').innerHTML=ser.map(v=>`<option value="${escape(v)}">`).join('');$('dlStores').innerHTML=db.lib.stores.map(v=>`<option value="${escape(v)}">`).join('')}
function setSpoolColor(s,name,stops){s.color=name;s.colorHex=stops[0];s.colorStops=stops.length>1?stops.slice():[];}

/* --- Настройки → справочники --- */
function renderLibs(){const L=db.lib,cnt=k=>v=>db.spools.filter(s=>ieq(s[k],v)).length,bc=cnt('brand'),cc=cnt('color');
  $('libBrands').innerHTML=L.brands.map((b,i)=>`<div class="librow"><input class="libname" data-bname="${i}" value="${escape(b.name)}" title="Переименование применится ко всем катушкам"><div class="chips">${b.series.map((v,j)=>`<span class="tagchip">${escape(v)}<button class="linkbtn" data-sdel="${i}:${j}" title="Удалить серию">×</button></span>`).join('')}<input class="libadd" data-sadd="${i}" placeholder="+ серия, Enter"></div><button class="iconbtn danger" data-bdel="${i}" title="${bc(b.name)?'Используется в катушках: '+bc(b.name):'Удалить производителя'}">×</button></div>`).join('');
  $('libStores').innerHTML=L.stores.map((v,i)=>`<span class="tagchip">${escape(v)}<button class="linkbtn" data-stdel="${i}" title="Удалить">×</button></span>`).join('')+'<input class="libadd" id="libStoreAdd" placeholder="+ магазин, Enter">';
  $('libColors').innerHTML=L.colors.map((c,i)=>`<div class="librow colrow"><span class="swatch" style="background:${gradCss(c.stops)}"></span><input class="libname" data-cname="${i}" value="${escape(c.name)}" title="Переименование применится к катушкам этого цвета"><span class="stops">${c.stops.map((h,j)=>`<span class="stop"><input type="color" data-cstop="${i}:${j}" value="${h}">${c.stops.length>1?`<button class="linkbtn" data-cstopdel="${i}:${j}" title="Убрать оттенок">×</button>`:''}</span>`).join('')}${c.stops.length<8?`<button class="secondary small" data-cstopadd="${i}" title="Добавить оттенок — получится многоцветный (радужный) цвет">+ оттенок</button>`:''}</span><span class="muted">${cc(c.name)?'катушек: '+cc(c.name):''}</span><button class="iconbtn danger" data-cdel="${i}" title="Удалить цвет из палитры">×</button></div>`).join('')}
function libChanged(){persist();renderLibs();renderSpools();if(currentPage==='spool'){renderSpool()}}
const libPanel=$('libPanel');
libPanel.addEventListener('change',e=>{const el=e.target,L=db.lib;
  if(el.dataset.bname!==undefined){const b=L.brands[+el.dataset.bname],v=el.value.trim();if(!v){el.value=b.name;return}if(L.brands.some(x=>x!==b&&ieq(x.name,v))){alert('Такой производитель уже есть');el.value=b.name;return}db.spools.forEach(s=>{if(ieq(s.brand,b.name))s.brand=v});b.name=v;libChanged()}
  else if(el.dataset.cname!==undefined){const c=L.colors[+el.dataset.cname],v=el.value.trim();if(!v){el.value=c.name;return}if(L.colors.some(x=>x!==c&&ieq(x.name,v))){alert('Такой цвет уже есть');el.value=c.name;return}db.spools.forEach(s=>{if(ieq(s.color,c.name))s.color=v});c.name=v;libChanged()}
  else if(el.dataset.cstop!==undefined){const [i,j]=el.dataset.cstop.split(':').map(Number),c=L.colors[i];c.stops[j]=el.value;db.spools.forEach(s=>{if(ieq(s.color,c.name))setSpoolColor(s,s.color,c.stops)});libChanged()}});
libPanel.addEventListener('input',e=>{const el=e.target;if(el.dataset.cstop===undefined)return;const [i,j]=el.dataset.cstop.split(':').map(Number);el.closest('.colrow').querySelector('.swatch').style.background=gradCss(db.lib.colors[i].stops.map((h,k)=>k===j?el.value:h))});
libPanel.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const el=e.target,v=el.value.trim(),L=db.lib;if(!v)return;
  if(el.dataset.sadd!==undefined){const b=L.brands[+el.dataset.sadd];if(!b.series.some(x=>ieq(x,v)))b.series.push(v)}
  else if(el.id==='libStoreAdd'){if(!L.stores.some(x=>ieq(x,v)))L.stores.push(v)}
  else if(el.id==='libBrandAdd'){if(L.brands.some(x=>ieq(x.name,v))){alert('Такой производитель уже есть');return}L.brands.push({name:v,series:[]});el.value=''}
  else if(el.id==='libColorAdd'){if(L.colors.some(x=>ieq(x.name,v))){alert('Такой цвет уже есть');return}L.colors.push({name:v,stops:['#888888']});el.value=''}
  else return;
  e.preventDefault();const id=el.id||'';libChanged();if(id)$(id)?.focus();else libPanel.querySelector(`[data-sadd="${el.dataset.sadd}"]`)?.focus()});
libPanel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset,L=db.lib;
  if(d.sdel){const [i,j]=d.sdel.split(':').map(Number);L.brands[i].series.splice(j,1)}
  else if(d.bdel!==undefined){const br=L.brands[+d.bdel],n=db.spools.filter(s=>ieq(s.brand,br.name)).length;if(!confirm(n?`Производитель «${br.name}» указан у ${n} катушек — у них он останется, но пропадёт из списка. Удалить?`:`Удалить «${br.name}» со всеми сериями?`))return;L.brands.splice(+d.bdel,1)}
  else if(d.stdel!==undefined){L.stores.splice(+d.stdel,1)}
  else if(d.cdel!==undefined){const c=L.colors[+d.cdel];if(!confirm(`Удалить «${c.name}» из палитры? У катушек цвет сохранится.`))return;L.colors.splice(+d.cdel,1)}
  else if(d.cstopadd!==undefined){const c=L.colors[+d.cstopadd];c.stops.push(c.stops.at(-1));db.spools.forEach(s=>{if(ieq(s.color,c.name))setSpoolColor(s,s.color,c.stops)})}
  else if(d.cstopdel){const [i,j]=d.cstopdel.split(':').map(Number),c=L.colors[i];c.stops.splice(j,1);db.spools.forEach(s=>{if(ieq(s.color,c.name))setSpoolColor(s,s.color,c.stops)})}
  else if(b.id==='libBrandAddBtn'){const el=$('libBrandAdd');el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return}
  else if(b.id==='libColorAddBtn'){const el=$('libColorAdd');el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return}
  else if(b.id==='libReset'){if(!confirm('Добавить в справочники стандартных производителей, серии, магазины и цвета, которых сейчас нет? Ваши записи останутся.'))return;
    for(const [n,s] of DEFAULT_BRANDS){let x=L.brands.find(y=>ieq(y.name,n));if(!x)L.brands.push(x={name:n,series:[]});for(const v of s)if(!x.series.some(y=>ieq(y,v)))x.series.push(v)}
    for(const v of DEFAULT_STORES)if(!L.stores.some(y=>ieq(y,v)))L.stores.push(v);for(const [n,s] of DEFAULT_COLORS)if(!L.colors.some(y=>ieq(y.name,n)))L.colors.push({name:n,stops:[...s]})}
  else return;
  libChanged()});

/* ================= Журнал печати ================= */
const MONTHS=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const printGrams=p=>p.usage.reduce((a,u)=>a+u.grams,0);
function printCost(p){const it=db.items.find(i=>i.id===p.itemId);if(!it)return null;const c=calcItem({...it,printerId:p.printerId||it.printerId});return c.total*p.sets}
function logSummary(list){const g=list.reduce((a,p)=>a+printGrams(p),0),fails=list.filter(p=>p.result==='fail').length,sets=list.filter(p=>p.result==='ok').reduce((a,p)=>a+p.sets,0),cost=list.reduce((a,p)=>a+(printCost(p)||0),0);return{n:list.length,g,fails,sets,cost}}
function renderLog(){const list=db.prints.slice().sort((a,b)=>(b.date+b.at).localeCompare(a.date+a.at)),view=$('logView').value,multi=db.printers.length>1;
  $('logEmpty').hidden=list.length>0;$('logTable').hidden=!list.length;
  const S=logSummary(list);
  $('logSub').textContent=list.length?`Записей: ${S.n} · успешных комплектов: ${S.sets} · неудачных печатей: ${S.fails} · филамента: ${fmt(S.g,0)} г · себестоимость: ${money(S.cost)}`:'Записи создаются кнопкой «Записать печать» в карточке изделия';
  const cols=multi?10:9;$('logHead').innerHTML=`<tr><th>Дата</th>${multi?'<th>Принтер</th>':''}<th>Изделие</th><th class="num">Компл.</th><th>Результат</th><th class="num">Филамент</th><th class="num">Себестоимость</th><th>Катушки</th><th>Комментарий</th><th></th></tr>`;
  if(view==='list'){$('logRows').innerHTML=list.map(p=>printRow(p,true)).join('');return}
  const key=p=>view==='year'?p.date.slice(0,4):p.date.slice(0,7),groups=new Map();for(const p of list){const k=key(p);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p)}
  const title=k=>view==='year'?`${k} год`:`${MONTHS[+k.slice(5,7)-1]||k} ${k.slice(0,4)}`;
  $('logRows').innerHTML=[...groups.entries()].map(([k,ps])=>{const s=logSummary(ps),open=$('logRows').dataset.closed?.split(',').includes(k)?false:true;return`<tr class="grp" data-grp="${k}"><td colspan="${cols}"><span class="caret">${open?'▾':'▸'}</span><b>${title(k)}</b><span class="muted"> · записей ${s.n} · комплектов ${s.sets}${s.fails?` · неудачных ${s.fails}`:''} · ${fmt(s.g,0)} г · ${money(s.cost)}</span></td></tr>`+(open?ps.map(p=>printRow(p,true)).join(''):'')}).join('')}
$('logView').onchange=()=>{try{localStorage.setItem('p2s_log_view',$('logView').value)}catch{}$('logRows').dataset.closed='';renderLog()};
try{$('logView').value=localStorage.getItem('p2s_log_view')||'month'}catch{}
$('logRows').addEventListener('click',e=>{const g=e.target.closest('[data-grp]');if(!g)return;const set=new Set(($('logRows').dataset.closed||'').split(',').filter(Boolean)),k=g.dataset.grp;set.has(k)?set.delete(k):set.add(k);$('logRows').dataset.closed=[...set].join(',');renderLog()});
function printRow(p,withItem){const g=p.usage.reduce((a,u)=>a+u.grams,0),sp=[...new Set(p.usage.map(u=>u.spoolId).filter(Boolean))].map(id=>{const s=getSpool(id);return s?`<a href="#spool/${escape(id)}" class="lnk">${swatch(s,'sm')} ${escape(spName(s))}</a>`:'<small>удалённая катушка</small>'}).join('<br>')||'<small>не списано</small>';
  const cost=printCost(p),multi=db.printers.length>1;
  return`<tr><td>${escape(p.date)}</td>${multi&&withItem?`<td><small>${escape(db.printers.find(x=>x.id===p.printerId)?.name||'—')}</small></td>`:''}${withItem?`<td>${db.items.some(i=>i.id===p.itemId)?`<a href="#item/${escape(p.itemId)}" class="lnk">${escape(p.itemName)}</a>`:escape(p.itemName||'—')}</td>`:''}<td class="num">${p.sets}</td><td><span class="pill ${p.result==='fail'?'fail':'done'}">${p.result==='fail'?'Неудачно':'Успешно'}</span></td><td class="num">${fmt(g,1)} г</td><td class="num">${cost==null?'—':money(cost)}</td><td>${sp}</td><td>${escape(p.note)}</td><td><button class="iconbtn danger" data-delprint="${escape(p.id)}" title="Удалить запись (вернёт граммы на катушки)">×</button></td></tr>`}
function delPrint(id){if(!confirm('Удалить запись? Списанные граммы вернутся на катушки.'))return;db.prints=db.prints.filter(p=>p.id!==id);persist();renderList();if(currentPage==='item')renderItemPrints()}
$('logRows').onclick=e=>{const id=e.target.dataset.delprint;if(id)delPrint(id)};

function renderItemPrints(){const it=item();if(!it)return;const list=db.prints.filter(p=>p.itemId===it.id).sort((a,b)=>(b.date+b.at).localeCompare(a.date+a.at));
  const ok=list.filter(p=>p.result==='ok').reduce((a,p)=>a+p.sets,0),fail=list.filter(p=>p.result==='fail').length;
  $('itPrintSum').textContent=list.length?`Напечатано комплектов: ${ok}${fail?` · неудачных печатей: ${fail}`:''}`:'Ещё не печаталось. Запись спишет пластик с катушек.';
  $('itPrints').innerHTML=list.length?`<div class="tablewrap"><table class="mini"><thead><tr><th>Дата</th><th class="num">Компл.</th><th>Результат</th><th class="num">Филамент</th><th class="num">Себестоимость</th><th>Катушки</th><th>Комментарий</th><th></th></tr></thead><tbody>${list.map(p=>printRow(p,false)).join('')}</tbody></table></div>`:''}
function openPrintForm(){const it=item();$('pfPrinter').innerHTML=printerOptions(getPrinter(it.printerId).id,false);$('pfDate').value=today();$('pfSets').value=1;$('pfResult').value='ok';$('pfNote').value='';
  const rows=[];for(const p of it.parts)for(const f of p.filaments)rows.push({label:`${p.name||'Элемент'}${p.qty>1?' ×'+p.qty:''}`,materialId:f.materialId,per:number(f.grams)*Math.max(1,p.qty)});
  $('pfRows').innerHTML=rows.map((r,i)=>{const {list}=sortedSpools(r.materialId);return`<div class="pfrow" data-pfi="${i}" data-mat="${escape(r.materialId)}" data-label="${escape(r.label)}"><span>${escape(r.label)} <small>· ${escape(getMat(r.materialId).name)}</small></span><select data-pfspool>${spoolOptions(r.materialId,list[0]?.id||'')}</select><label class="inl"><input data-pfg data-per="${r.per}" type="number" min="0" step="0.1" value="${r.per}"> г</label></div>`}).join('')+(db.spools.length?'':'<p class="muted">Катушек ещё нет — добавьте их в разделе «Катушки», иначе печать запишется без списания.</p>');
  $('printForm').hidden=false;$('printStartBtn').hidden=true}
$('pfSets').oninput=()=>{const n=Math.max(1,Math.round(number($('pfSets').value))||1);$('pfRows').querySelectorAll('[data-pfg]').forEach(el=>{if(!el.dataset.edited)el.value=Math.round(number(el.dataset.per)*n*10)/10})};
$('pfRows').addEventListener('input',e=>{if(e.target.dataset.pfg!==undefined)e.target.dataset.edited='1'});
function savePrint(){const it=item();const usage=[...$('pfRows').querySelectorAll('.pfrow')].map(r=>({label:r.dataset.label,materialId:r.dataset.mat,spoolId:r.querySelector('[data-pfspool]').value,grams:number(r.querySelector('[data-pfg]').value)})).filter(u=>u.grams>0);
  const p=normPrint({date:$('pfDate').value||today(),itemId:it.id,itemName:it.name,printerId:$('pfPrinter').value,sets:$('pfSets').value,result:$('pfResult').value,note:$('pfNote').value.trim(),usage});db.prints.push(p);
  for(const u of usage){const s=getSpool(u.spoolId);if(s&&s.status==='sealed'){s.status='open';s.opened||=p.date}}
  const empty=usage.map(u=>getSpool(u.spoolId)).filter(s=>s&&s.status!=='empty'&&spoolState(s).remaining<=0);
  if(empty.length&&confirm(`Катушка закончилась: ${empty.map(spName).join(', ')}. Отметить как закончившуюся?`))empty.forEach(s=>s.status='empty');
  $('printForm').hidden=true;$('printStartBtn').hidden=false;persist();renderList();renderItemPrints();setStatus(`Печать записана, списано ${fmt(usage.filter(u=>u.spoolId).reduce((a,u)=>a+u.grams,0),1)} г`)}
$('itPrints').onclick=e=>{const id=e.target.dataset.delprint;if(id)delPrint(id)};

/* ================= Прочие события ================= */
function setting(){for(const k in baseSettings)db.settings[k]=typeof baseSettings[k]==='number'?number($(k).value):$(k).value.trim();persist();renderCalc();renderList();if(currentPage==='item'){renderItemCalc();renderDesc()}}
for(const k in baseSettings)$(k).addEventListener('change',setting);
for(const k of ['grams','hours','extra','material','calcPrinter'])$(k).addEventListener('input',renderCalc);
$('cProtoAdd').onclick=()=>{calcProtos.push({materialId:$('material').value,grams:0,hours:0});renderCalcProtos();renderCalc();$('cProtos').querySelector('.protorow:last-child [data-cpf="grams"]')?.focus()};
$('cProtos').addEventListener('input',e=>{const p=calcProtos[+e.target.dataset.cp],k=e.target.dataset.cpf;if(!p||!k)return;p[k]=k==='materialId'?e.target.value:number(e.target.value);renderCalc()});
$('cProtos').addEventListener('click',e=>{const i=e.target.dataset.cpdel;if(i===undefined)return;calcProtos.splice(+i,1);renderCalcProtos();renderCalc()});
$('save').onclick=()=>saveCalc(false);$('saveOpen').onclick=()=>saveCalc(true);$('clear').onclick=resetCalc;
$('newItem').onclick=()=>{resetCalc();go('calc');setTimeout(()=>$('name').focus(),50)};
$('search').oninput=()=>renderRows(filtered());$('statusFilter').onchange=()=>renderRows(filtered());$('statMat').onchange=renderStats;
$('rows').onclick=e=>{const tr=e.target.closest('[data-open]');if(tr)go('item/'+tr.dataset.open)};
$('addMaterial').onclick=()=>{const name=$('newMatName').value.trim();if(!name){alert('Введите название материала');return}db.materials.push({id:uid(),name,price:number($('newMatPrice').value),density:guessDensity(name)});$('newMatName').value='';$('newMatPrice').value='';persist();renderAll()};
$('materialsList').onchange=e=>{const k=e.target.dataset.mat,d=e.target.dataset.matdens;if(k){getMat(k).price=number(e.target.value);persist();renderAll()}if(d){getMat(d).density=number(e.target.value)||guessDensity(getMat(d).name);persist();renderAll()}};
$('materialsList').onclick=e=>{const ap=e.target.dataset.applyprice;if(ap){getMat(ap).price=number(e.target.dataset.v);persist();renderAll();setStatus('Цена материала обновлена по катушкам');return}const k=e.target.dataset.delmat;if(!k)return;if(db.spools.some(s=>s.materialId===k)){alert('Материал используется в катушках.');return}if(db.items.some(i=>itemMaterials(i).includes(k))){alert('Материал используется в изделиях. Сначала замените его в элементах этих изделий.');return}if(!confirm('Удалить материал?'))return;db.materials=db.materials.filter(m=>m.id!==k);persist();renderAll()};


$('printersList').addEventListener('change',e=>{const card=e.target.closest('[data-ptr]');if(!card)return;const P=db.printers.find(p=>p.id===card.dataset.ptr);if(!P)return;const k=e.target.dataset.ptk;
  if(k){P[k]=k==='name'?(e.target.value.trim()||P.name):number(e.target.value);if(k==='years'&&!P.years)P.years=5;if(k==='annualHours'&&!P.annualHours)P.annualHours=500}
  else if(e.target.dataset.ptdef!==undefined)db.settings.defaultPrinter=P.id;else return;
  persist();renderAll()});
$('printersList').addEventListener('click',e=>{const b=e.target.closest('[data-ptdel]');if(!b)return;const id=b.closest('[data-ptr]').dataset.ptr,P=db.printers.find(p=>p.id===id);const n=db.items.filter(i=>i.printerId===id).length;
  if(!confirm(`Удалить принтер «${P.name}»?${n?` Изделия (${n}) перейдут на принтер по умолчанию.`:''} Записи журнала сохранятся.`))return;
  db.printers=db.printers.filter(p=>p.id!==id);db.items.forEach(i=>{if(i.printerId===id)i.printerId=''});if(db.settings.defaultPrinter===id)db.settings.defaultPrinter=db.printers[0].id;persist();renderAll()});
$('printerAdd').onclick=()=>{const P=normPrinter({name:'Новый принтер',price:0,years:5,annualHours:500,watts:150,maintenance:0});db.printers.push(P);persist();renderAll();const inp=document.querySelector(`[data-ptr="${P.id}"] [data-ptk="name"]`);inp?.focus();inp?.select()};
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('exportJson').onclick=()=>download('3d-print-data.json',data(),'application/json');
$('exportCsv').onclick=()=>{const quote=x=>'"'+String(x??'').replace(/"/g,'""')+'"',r2=v=>Math.round(v*100)/100;const lines=[['Название','Статус','Теги','Материалы','Элементов','Граммы','Часы','Пластик ₽','Электричество ₽','Амортизация ₽','Обслуживание ₽','Дополнительно ₽','Итого ₽','Прототипов','Прототипы г','Прототипы ч','Прототипы ₽','Итого с прототипами ₽','Ссылка','Дата','Примечания']];
  for(const x of db.items){const c=calcItem(x);lines.push([x.name,STATUSES[x.status],x.tags.join(', '),itemMaterials(x).map(m=>getMat(m).name).join(' + '),x.parts.length,r2(c.grams),r2(c.hours),r2(c.plastic),r2(c.power),r2(c.depreciation),r2(c.maintenance),r2(c.extra),r2(c.total),c.proto.count,r2(c.proto.grams),r2(c.proto.hours),r2(c.proto.total),r2(c.dev),x.links[0]?.url||'',x.createdAt,x.notes])}
  download('3d-print-items.csv','﻿'+lines.map(row=>row.map(quote).join(';')).join('\r\n'),'text/csv;charset=utf-8')};
$('importJson').onclick=()=>$('fileInput').click();
$('fileInput').onchange=async e=>{const f=e.target.files[0];if(f)try{const incoming=valid(JSON.parse(await f.text()));if(confirm('Заменить текущие настройки, материалы и каталог данными из файла?')){applyData(incoming);persist();setStatus('Данные импортированы')}}catch(err){alert('Ошибка импорта: '+err.message)}e.target.value=''};

$('dirPick').onclick=async()=>{try{const d=await window.showDirectoryPicker({id:'p2s-cost',mode:'readwrite'});if(store&&stReady&&stDirty)await writeData();await connect(folderStore(d),'pick')}catch(e){storeErr(e)}};
$('gdNoCfg').hidden=window.GDrive.configured();
$('gdPick').onclick=async()=>{if(!window.GDrive.configured()){alert('Не задан Google Client ID в js/config.js. Откройте инструкцию «Как подключить Google Drive».');return}
  try{const st=gdStore();if(store?.kind==='gdrive'){await window.GDrive.signOut()}if(!(await st.ensure(true)))return;if(store&&stReady&&stDirty)await writeData();setStatus('Подключаюсь к Google Drive…');await connect(st,'pick')}catch(e){storeErr(e)}};
$('stReconnect').onclick=async()=>{if(!store)return;try{if(await store.ensure(true))await connect(store,'restore');else{stError='Доступ не предоставлен.';updateStoreUi()}}catch(e){storeErr(e)}};
$('stSaveNow').onclick=()=>{stDirty=true;writeData().then(()=>{if(!stError&&stReady)setStatus(`Сохранено: ${store.label}`)})};
$('stDetach').onclick=async()=>{if(stDirty&&!confirm('Есть изменения, не записанные в хранилище. Всё равно отключить?'))return;try{await store.forget()}catch{}store=null;stReady=false;stDirty=false;stError='';lastSaved=null;photoUrls.clear();try{localStorage.removeItem(STORE_KEY)}catch{}updateStoreUi();renderList();setStatus('Хранилище отключено, данные остаются в браузере')};
try{$('autosave').checked=localStorage.getItem(AUTO_KEY)!=='0'}catch{}
$('autosave').onchange=()=>{try{localStorage.setItem(AUTO_KEY,autosave()?'1':'0')}catch{}if(autosave()&&stDirty)writeData();updateStoreUi()};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();if(persistTimer)persist();if(store&&stReady)$('stSaveNow').click();else if(store)$('stReconnect').click();else $('exportJson').click()}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncFromRemote();else if(persistTimer)persist()});
window.addEventListener('beforeunload',e=>{if(persistTimer)persist();if(store&&stReady&&stDirty){e.preventDefault();e.returnValue=''}});


/* Предупреждение, если сайт открыт в нескольких вкладках: они перезаписывают данные друг друга */
try{const bc=new BroadcastChannel('p2s_cost_tabs'),me=shortId();let warned=false;
  const warn=()=>{if(warned)return;warned=true;const b=document.createElement('div');b.className='tabwarn';b.innerHTML='Калькулятор открыт в нескольких вкладках — оставьте одну, иначе вкладки будут перезаписывать данные друг друга. <button class="linkbtn">Понятно</button>';b.querySelector('button').onclick=()=>b.remove();document.body.append(b)};
  bc.onmessage=e=>{if(e.data?.id===me)return;if(e.data?.t==='hello')bc.postMessage({t:'here',id:me});warn()};bc.postMessage({t:'hello',id:me})}catch{}

/* ================= Запуск ================= */
(async()=>{
  let stored=null;try{stored=await idbGet('kv','db')}catch{}
  if(!stored)try{stored=JSON.parse(localStorage.getItem(LS2_KEY))}catch{}
  try{db=valid(stored)}catch{try{db=valid(JSON.parse(localStorage.getItem(LS_KEY)))}catch{db=valid({materials:baseMaterials,items:[]})}saveLocal()}
  try{const h=await idbGet('handles','file');if(h)legacyFileName=h.name}catch{}
  fillSettings();renderMaterials();renderPrinters();renderLibs();renderCalcProtos();renderCalc();renderList();route();updateStoreUi();
  let kind=null;try{kind=localStorage.getItem(STORE_KEY)}catch{}
  let st=null;
  if(kind==='gdrive'&&window.GDrive.configured()){st=gdStore();window.GDrive.preload().catch(()=>{})}
  else if(fsOK&&kind!=='gdrive'){let d=null;try{d=await idbGet('handles','dir')}catch{}if(d)st=folderStore(d)}
  if(st){store=st;updateStoreUi();try{if(await st.ensure(false))await connect(st,'restore')}catch(e){stError=e?.message||String(e);stReady=false;updateStoreUi()}}
})();
})();
