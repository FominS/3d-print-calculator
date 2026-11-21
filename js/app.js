(()=>{'use strict';
/* ================= Константы и утилиты ================= */
const LS_KEY='p2s_cost_catalog_v1',AUTO_KEY='p2s_cost_autosave_v1',DATA_NAME='3d-print-data.json',PHOTO_DIR='photos',BACKUP_DIR='backups';
const $=id=>document.getElementById(id);
const fsOK=typeof window.showDirectoryPicker==='function';
const STATUSES={idea:_t('Идея'),wip:_t('В работе'),done:_t('Готово'),published:_t('Опубликовано')};
const PARTS=[['plastic',_t('Пластик'),'var(--s1)'],['power',_t('Электричество'),'var(--s2)'],['depreciation',_t('Амортизация'),'var(--s3)'],['maintenance',_t('Обслуживание'),'var(--s4)'],['extra',_t('Доп. затраты'),'var(--s5)']];
const baseSettings={tariff:7,lowStock:200};
const P0={id:'p2s',name:'Bambu Lab P2S',price:76990,years:5,annualHours:500,watts:120,maintenance:3};
const normPrinter=p=>({id:String(p.id||shortId()),name:String(p.name||_t('Принтер')).trim()||_t('Принтер'),price:number(p.price),years:number(p.years)||5,annualHours:number(p.annualHours)||500,watts:number(p.watts),maintenance:number(p.maintenance),
  bambuDev:String(p.bambuDev||''),baseHours:number(p.baseHours),since:/^\d{4}-\d{2}-\d{2}$/.test(p.since||'')?p.since:'',
  maint:p.maint&&typeof p.maint==='object'?Object.fromEntries(Object.entries(p.maint).filter(([,l])=>Array.isArray(l)).map(([k,l])=>[k,l.filter(e=>e&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)).map(e=>({date:e.date,hours:number(e.hours),grams:number(e.grams)}))])):{},
  maintCfg:p.maintCfg&&typeof p.maintCfg==='object'?Object.fromEntries(Object.entries(p.maintCfg).map(([k,c])=>[k,{...(number(c?.every)?{every:number(c.every)}:{}),...(c?.off?{off:true}:{})}])):{}});
const baseMaterials=[{id:'petg',name:'PETG',price:1000},{id:'pla',name:'PLA',price:1000},{id:'abs',name:'ABS',price:1200}];

const money=n=>new Intl.NumberFormat(I18N.loc,{style:'currency',currency:'RUB',currencyDisplay:'narrowSymbol'}).format(n);
const fmt=(n,d=1,loc=I18N.loc)=>new Intl.NumberFormat(loc,{maximumFractionDigits:d}).format(n);
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
function fmtH(h,lang='ru'){const m=Math.round(number(h)*60),H=Math.floor(m/60),M=m%60;if(lang==='en')return(H?H+'h':'')+(M?(H?' ':'')+M+'m':'')||'0h';return(H?H+_t(' ч'):'')+(M?(H?' ':'')+M+_t(' мин'):'')||_t('0 ч')}

let db,store=null,stReady=false,stDirty=false,stBusy=false,stError='',lastSaved=null,saveTimer=null,persistTimer=null,chain=Promise.resolve(),localChain=Promise.resolve(),legacyFileName='',currentItemId=null;
const getPrinter=id=>db.printers.find(p=>p.id===id)||db.printers.find(p=>p.id===db.settings.defaultPrinter)||db.printers[0];
const printerOptions=(sel,withDefault=true)=>(withDefault?`<option value="">${_t("По умолчанию")} — ${escape(getPrinter('').name)}</option>`:'')+db.printers.map(p=>`<option value="${escape(p.id)}"${p.id===sel?' selected':''}>${escape(p.name)}</option>`).join('');
const amortH=P=>{const life=number(P.years)*number(P.annualHours);return life>0?number(P.price)/life:0};
const getMat=i=>db.materials.find(m=>m.id===i)||{name:_t('Удалённый материал'),price:0};

/* ================= Схема данных v2 ================= */
function normItem(x){
  const it={id:String(x.id||uid()),name:String(x.name||_t('Без названия')),printerId:String(x.printerId||''),status:STATUSES[x.status]?x.status:'done',
    tags:Array.isArray(x.tags)?x.tags.map(String).filter(Boolean):[],createdAt:x.createdAt||now(),updatedAt:x.updatedAt||x.createdAt||'',
    extra:number(x.extra),notes:String(x.notes||''),
    links:Array.isArray(x.links)?x.links.map(l=>({title:String(l?.title||''),url:String(l?.url||'')})):[],
    print:{nozzle:'0.4',layer:'0.2',infill:'',walls:'',supports:'',plate:'',other:'',...(x.print||{})},
    desc:{lang:'ru',intro:'',hardware:'',assembly:'',tips:'',...(x.desc||{})},
    photos:Array.isArray(x.photos)?x.photos.filter(p=>p&&p.file).map(p=>({id:String(p.id||shortId()),file:String(p.file)})):[],
    cover:String(x.cover||''),coverUrl:/^https:\/\//.test(x.coverUrl||'')?String(x.coverUrl):'',bambuKey:String(x.bambuKey||''),parentId:String(x.parentId||'')};
  if(Array.isArray(x.parts)&&x.parts.length){
    it.parts=x.parts.map(p=>({id:String(p.id||shortId()),name:String(p.name||''),qty:Math.max(1,Math.round(number(p.qty))||1),hours:number(p.hours),
      filaments:(Array.isArray(p.filaments)?p.filaments:[]).map(f=>({materialId:String(f.materialId||''),grams:number(f.grams)}))}));
  }else{ // миграция изделия v1: одно изделие = один элемент
    it.parts=[{id:shortId(),name:_t('Изделие целиком'),qty:1,hours:number(x.hours),filaments:[{materialId:String(x.materialId||''),grams:number(x.grams)}]}];
  }
  it.prototypes=(Array.isArray(x.prototypes)?x.prototypes:[]).map((p,i)=>({id:String(p.id||shortId()),name:String(p.name??('v'+(i+1))),date:String(p.date||''),materialId:String(p.materialId||''),grams:number(p.grams),hours:number(p.hours),note:String(p.note||''),spoolId:String(p.spoolId||''),at:p.at||it.createdAt||now()}));
  if(it.cover&&!it.photos.some(p=>p.file===it.cover))it.cover=it.photos[0]?.file||'';
  return it}
function valid(d){
  if(!d||typeof d!=='object'||!Array.isArray(d.materials)||!Array.isArray(d.items))throw Error(_t('Неверная структура файла'));
  if(d.materials.length>1000||d.items.length>100000)throw Error(_t('Слишком большой файл'));
  const s0=d.settings||{};
  const printers=Array.isArray(d.printers)&&d.printers.length?d.printers.map(normPrinter):[normPrinter({id:P0.id,name:s0.printerName||P0.name,price:s0.printerPrice??P0.price,years:s0.years??P0.years,annualHours:s0.annualHours??P0.annualHours,watts:s0.watts??P0.watts,maintenance:s0.maintenance??P0.maintenance})];
  const settings={tariff:s0.tariff??baseSettings.tariff,lowStock:s0.lowStock??baseSettings.lowStock,defaultPrinter:printers.some(p=>p.id===s0.defaultPrinter)?s0.defaultPrinter:printers[0].id,theme:['auto','dark','light'].includes(s0.theme)?s0.theme:undefined};
  const o={version:3,updatedAt:d.updatedAt||'',settings,printers,
    lib:normLib(d.lib,d),
    materials:d.materials.map(m=>({id:String(m.id||uid()),name:String(m.name||'?'),price:number(m.price),density:number(m.density)||guessDensity(m.name)})),
    items:d.items.map(normItem),spools:(Array.isArray(d.spools)?d.spools:[]).map(normSpool),prints:(Array.isArray(d.prints)?d.prints:[]).map(normPrint)};
  for(const s of o.spools)libAbsorb(s,o.lib);
  // целостность связей: печати удалённых изделий/элементов, вложенность без циклов
  const byId=new Map(o.items.map(x=>[x.id,x]));
  // печать удалённого элемента сохраняет partId: так она не считается печатью всего изделия (в комплекты не идёт)
  for(const p of o.prints){if(!byId.has(p.itemId)){p.itemId='';p.partId='';p.partName=''}else if(!p.partId)p.partName=''}
  for(const x of o.items){if(!byId.has(x.parentId)||x.parentId===x.id){x.parentId='';continue}const seen=new Set([x.id]);for(let c=byId.get(x.parentId);c;c=byId.get(c.parentId)){if(seen.has(c.id)){x.parentId='';break}seen.add(c.id)}}
  splitParts(o);
  return o}
// Схема v4: элемент изделия = вложенное изделие. Изделие из нескольких элементов становится сборкой,
// каждый элемент — дочерним изделием; записи журнала по элементу переходят к дочернему изделию.
const needSplit=d=>Array.isArray(d?.items)&&d.items.some(x=>Array.isArray(x?.parts)&&x.parts.length>1);
function splitParts(o){o.version=4;
  for(const x of o.items.slice()){
    if(x.parts.length===1){const one=x.parts[0];for(const p of o.prints)if(p.itemId===x.id&&p.partId===one.id){p.partId='';p.partName='';if(one.qty>1)p.pcs=p.sets}continue}
    if(x.parts.length<2)continue;
    const kids=x.parts.map((pt,i)=>normItem({id:x.id+'-'+pt.id,name:pt.name.trim()||`${x.name} — ${_t("элемент")} ${i+1}`,status:x.status,printerId:x.printerId,createdAt:new Date(Date.parse(x.createdAt)-i*1000||Date.now()).toISOString(),updatedAt:x.updatedAt,print:x.print,parentId:x.id,parts:[{...pt,name:''}]}));
    for(const p of o.prints){if(p.itemId!==x.id)continue;const k=p.partId?x.parts.findIndex(q=>q.id===p.partId):-1,pt=x.parts[k];
      if(p.hours==null)p.hours=pt?number(pt.hours)*p.sets:x.parts.reduce((a,q)=>a+number(q.hours)*Math.max(1,q.qty),0)*p.sets;
      if(pt){p.itemId=kids[k].id;p.itemName=kids[k].name;p.partId='';p.partName='';if(pt.qty>1)p.pcs=p.sets}else if(!p.partId)p.whole=true}
    x.parts=[{id:x.parts[0].id+'-asm',name:'',qty:1,hours:0,filaments:[]}];o.items.push(...kids.filter(k=>!o.items.some(y=>y.id===k.id)))}}

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
const idb=()=>idbP||(idbP=new Promise((res,rej)=>{setTimeout(()=>rej(Error(_t('IndexedDB не отвечает'))),2000);const r=indexedDB.open('p2s_cost',2);r.onupgradeneeded=()=>{for(const s of ['handles','kv'])if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
async function idbSet(store,k,v){const d=await idb();return new Promise((res,rej)=>{const t=d.transaction(store,'readwrite'),s=t.objectStore(store);v===undefined?s.delete(k):s.put(v,k);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})}
async function idbGet(store,k){const d=await idb();return new Promise((res,rej)=>{const r=d.transaction(store).objectStore(store).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}

/* ================= Сохранение и хранилища ================= */
let statusTimer;const setStatus=t=>{const el=$('status');el.textContent=t;el.classList.add('show');clearTimeout(statusTimer);statusTimer=setTimeout(()=>el.classList.remove('show'),3500)};
const autosave=()=>$('autosave').checked;
const data=()=>JSON.stringify(db,null,2);
const LS2_KEY='p2s_cost_catalog_v2',STORE_KEY='p2s_store_kind';
const stamp=()=>now().slice(0,19).replace(/[:T]/g,'-');
function saveLocal(){const snap=structuredClone(db);localChain=localChain.then(()=>idbSet('kv','db',snap)).catch(()=>{try{localStorage.setItem(LS2_KEY,JSON.stringify(snap))}catch(e){setStatus(_t('Не удалось сохранить в браузере — подключите хранилище или скачайте JSON'))}})}
function persist(){clearTimeout(persistTimer);persistTimer=null;db.updatedAt=now();saveLocal();if(store&&stReady){stDirty=true;if(autosave()){clearTimeout(saveTimer);saveTimer=setTimeout(writeData,store.kind==='gdrive'?1500:500)}}updateStoreUi()}
function schedulePersist(){clearTimeout(persistTimer);persistTimer=setTimeout(()=>{persist();renderList()},400)}
async function writeText(dh,name,content){const fh=await dh.getFileHandle(name,{create:true});const w=await fh.createWritable();await w.write(content);await w.close()}
async function hasPermission(h,ask){const o={mode:'readwrite'};try{if(await h.queryPermission(o)==='granted')return true;return ask?await h.requestPermission(o)==='granted':false}catch{return false}}

/* --- Папка на компьютере (Chrome/Edge, File System Access API) --- */
function folderStore(d){return{kind:'folder',name:d.name,label:`${_t("папка")} «${d.name}»`,
  ensure:ask=>hasPermission(d,ask),
  async read(){for(const n of [...new Set([DATA_NAME,legacyFileName].filter(Boolean))]){try{const f=await(await d.getFileHandle(n)).getFile(),t=(await f.text()).trim();if(t)return{name:n,text:t,modified:new Date(f.lastModified)}}catch(e){if(e?.name!=='NotFoundError'&&e?.name!=='TypeMismatchError')throw Error(`${_t("Файл")} «${n}»: ${e.message}`)}}return null},
  async write(text){await writeText(d,DATA_NAME,text)},
  async remoteChanged(){return false},
  async backup(text){await writeText(await d.getDirectoryHandle(BACKUP_DIR,{create:true}),`3d-print-data_${stamp()}.json`,text)},
  async getPhoto(n){return(await(await d.getDirectoryHandle(PHOTO_DIR)).getFileHandle(n)).getFile()},
  async putPhoto(n,blob){await writeText(await d.getDirectoryHandle(PHOTO_DIR,{create:true}),n,blob)},
  async delPhoto(n){try{await(await d.getDirectoryHandle(PHOTO_DIR)).removeEntry(n)}catch{}},
  async remember(){await idbSet('handles','dir',d)},
  async forget(){await idbSet('handles','dir',undefined)}}}
const gdStore=()=>window.GDrive.store();

function applyData(incoming,reason=_t('перед загрузкой данных из хранилища')){if(db&&hasData(db)&&JSON.stringify({...db,updatedAt:0})!==JSON.stringify({...incoming,updatedAt:0}))snapshotLocal(reason);db=incoming;fillSettings();saveLocal();photoUrls.clear();renderAll()}
function writeData(){clearTimeout(saveTimer);chain=chain.then(async()=>{if(!store||!stReady)return;stDirty=false;stBusy=true;updateStoreUi();
  try{
    if(await store.remoteChanged()){const r=await store.read();if(r){
      const remote=valid(JSON.parse(r.text));
      if(!confirm(`${store.label}: ${_t("пока вы работали, данные изменили на другом устройстве или в другой вкладке")} (${r.modified.toLocaleString(I18N.loc)}).\n\n${_t("ОК — оставить данные ЭТОГО экрана (рекомендуется, если вы сейчас что-то вводили). Версия с другого устройства сохранится в backups")}/.\n\n${_t("Отмена — загрузить версию с другого устройства. Данные этого экрана сохранятся в backups")}/.`)){await store.backup(data());applyData(remote);lastSaved=r.modified;return}
      await store.backup(r.text)}}
    await store.write(data());lastSaved=new Date();stError=''}
  catch(e){stDirty=true;if(e?.name==='NotAllowedError'){stReady=false;stError=''}else stError=e?.message||String(e)}
  finally{stBusy=false;updateStoreUi()}});return chain}
// mode: pick — пользователь выбрал хранилище; restore — переподключение запомненного
async function connect(st,mode){
  const r=await st.read();if(r)r.data=valid(JSON.parse(r.text));let write=!r,msg=`${_t("Подключено")}: ${st.label}`;
  if(r){
    if(mode==='pick'){
      const rf=Date.parse(r.data.updatedAt||0)||r.modified.getTime(),lf=Date.parse(db.updatedAt||0)||0,remoteNewer=rf>=lf;
      const info=(d,t)=>`${_t("изделий")} ${d.items.length}, ${_t("катушек")} ${d.spools.length}, ${_t("печатей")} ${d.prints.length}, ${_t("изменены")} ${new Date(t).toLocaleString(I18N.loc)}`;
      if(!hasData(db)){applyData(r.data);msg=`${_t("Данные загружены")}: ${st.label}`}
      else if(JSON.stringify({...db,updatedAt:0})===JSON.stringify({...r.data,updatedAt:0})){applyData(r.data)}
      else{const ok=confirm(`${_t("Данные отличаются")}.\n\n${st.label}: ${info(r.data,rf)}.\n${_t("Этот браузер")}: ${info(db,lf||Date.now())}.\n\n${_t("Новее")}: ${remoteNewer?st.label:_t('этот браузер')}.${(r.data.items.length+r.data.spools.length+r.data.prints.length)<(db.items.length+db.spools.length+db.prints.length)?`\n${_t("⚠ В")} «${st.label}» ${_t("записей МЕНЬШЕ, чем в браузере — проверьте, прежде чем загружать")}.`:''}\n\n${_t("ОК — оставить более новые")} (${remoteNewer?_t('из хранилища'):_t('из браузера')}).\n${_t("Отмена — оставить")} ${remoteNewer?_t('данные браузера'):_t('данные хранилища')}.\n\n${_t("Вторая версия не потеряется: копия браузера — в «Истории в браузере», копия хранилища — в backups")}/.`);
        const useRemote=ok?remoteNewer:!remoteNewer;
        if(useRemote){try{await st.backup(data())}catch{}applyData(r.data,_t('перед загрузкой из ')+st.label);msg=`${_t("Загружены данные")}: ${st.label}; ${_t("данные браузера — в истории и в backups")}/`}
        else{await st.backup(r.text);write=true;snapshotLocal(_t('при подключении ')+st.label);msg=`${_t("Данные браузера записаны")}: ${st.label}, ${_t("прежний файл — в backups")}/`}}
    }else{const f=Date.parse(r.data.updatedAt||0)||0,l=Date.parse(db.updatedAt||0)||0;if(f>=l)applyData(r.data);else{write=true;msg=_t('В браузере данные новее — записаны в хранилище')}}
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
  if(!confirm(`${_t("Перенести фото изделий")} (${files.length}) ${_t("из")} «${from.label}» ${_t("в")} «${to.label}»?`))return;
  let ok=0;for(const n of files){setStatus(`${_t("Перенос фото")} ${ok+1} ${_t("из")} ${files.length}…`);try{await to.putPhoto(n,await from.getPhoto(n));ok++}catch{}}
  photoUrls.clear();renderAll();setStatus(`${_t("Перенесено фото")}: ${ok} ${_t("из")} ${files.length}`)}
let lastInputAt=0,syncRetry=null;
document.addEventListener('input',()=>{lastInputAt=Date.now()},true);
const editing=()=>{const a=document.activeElement;return Date.now()-lastInputAt<5000||(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.type!=='button'&&a.type!=='checkbox')||!$('printForm').hidden};
async function syncFromRemote(){if(!store||!stReady||stDirty||stBusy||persistTimer)return;
  if(editing()){clearTimeout(syncRetry);syncRetry=setTimeout(syncFromRemote,5000);return}
  try{if(await store.remoteChanged()){const r=await store.read();if(r){applyData(valid(JSON.parse(r.text)));lastSaved=r.modified;updateStoreUi();setStatus(_t('Загружены изменения с другого устройства'))}}}
  catch(e){if(e?.name==='NotAllowedError'){stReady=false;updateStoreUi()}}}
function storeErr(e){if(e?.name==='AbortError')return;alert(_t('Ошибка хранилища: ')+(e?.message||e))}

function updateStoreUi(){
  const lbl=store?escape(store.label):'';let dot='',text,short;
  if(!store){text=_t('Хранилище не подключено — данные есть только в этом браузере, фото добавлять нельзя.');short=_t('Только браузер')}
  else if(!stReady){dot='warn';text=store.kind==='gdrive'?_t('Google Drive — нужно войти в аккаунт Google (вход действует около часа).'):`${lbl[0].toUpperCase()+lbl.slice(1)} — ${_t("браузер просит подтвердить доступ")}.`;short=store.kind==='gdrive'?_t('Нужен вход в Google'):_t('Нужен доступ к папке')}
  else if(stError){dot='err';text=`${lbl} — ${_t("ошибка")}: ${escape(stError)}`;short=_t('Ошибка сохранения')}
  else if(stDirty||stBusy){dot='warn';text=`${lbl} — ${autosave()||stBusy?_t('сохранение…'):_t('есть несохранённые изменения')}`;short=autosave()||stBusy?_t('Сохранение…'):_t('Не сохранено')}
  else{dot='ok';text=`${lbl} — ${_t("сохранено")}${lastSaved?' '+lastSaved.toLocaleString(I18N.loc):''}`;short=store.kind==='gdrive'?_t('Сохранено в Google Drive'):_t('Сохранено в папку')}
  $('stState').innerHTML=`<span class="dot ${dot}"></span>${text.charAt(0).toUpperCase()+text.slice(1)}`;
  $('navFile').innerHTML=`<span class="dot ${dot}"></span>${short}`;$('navFile').title=store?store.label:'';
  $('stReconnect').hidden=!(store&&!stReady);$('stReconnect').textContent=store?.kind==='gdrive'?_t('Войти в Google'):_t('Разрешить доступ к папке');
  $('stSaveNow').hidden=!(store&&stReady);$('stDetach').hidden=!store;$('autosaveWrap').hidden=!store;
  $('dirPick').disabled=!fsOK;$('dirPick').textContent=store?.kind==='folder'?_t('Сменить папку'):_t('Выбрать папку');$('dirNote').hidden=fsOK;
  $('gdPick').textContent=store?.kind==='gdrive'?_t('Переподключить'):_t('Подключить Google Drive');
  $('optFolder').classList.toggle('on',store?.kind==='folder');$('optDrive').classList.toggle('on',store?.kind==='gdrive');
  $('legacyNote').hidden=!(fsOK&&!store&&legacyFileName);
  $('legacyNote').innerHTML=`${_t("Раньше данные сохранялись в файл")} <b>${escape(legacyFileName)}</b>. ${_t("Нажмите «Выбрать папку» и укажите папку, где он лежит — данные подхватятся")}.`;
  if(currentPage==='item')renderPhotos()}


/* ================= История в браузере: снимки данных перед заменой ================= */
const SNAP_MAX=20,hasData=d=>!!d&&(d.items?.length||d.spools?.length||d.prints?.length);
async function getSnaps(){try{const l=await idbGet('kv','snapshots');return Array.isArray(l)?l:[]}catch{try{return JSON.parse(localStorage.getItem('p2s_snapshots')||'[]')}catch{return[]}}}
async function putSnaps(l){try{await idbSet('kv','snapshots',l)}catch{try{localStorage.setItem('p2s_snapshots',JSON.stringify(l.slice(0,5)))}catch{}}}
let snapChain=Promise.resolve();
function snapshotLocal(reason,src=db){if(!hasData(src))return snapChain;const s={id:shortId(),at:now(),reason,updatedAt:src.updatedAt||'',counts:{items:src.items?.length??0,spools:src.spools?.length??0,prints:src.prints?.length??0},data:structuredClone(src)};
  snapChain=snapChain.then(async()=>{const l=await getSnaps();if(l[0]&&l[0].updatedAt===s.updatedAt&&JSON.stringify(l[0].counts)===JSON.stringify(s.counts)){l[0].at=s.at;l[0].reason=s.reason}else l.unshift(s);await putSnaps(l.slice(0,SNAP_MAX));renderSnaps()}).catch(()=>{});return snapChain}
async function renderSnaps(){const l=await getSnaps();$('snapList').innerHTML=l.length?l.map(s=>`<div class="line snapline"><span><b>${new Date(s.at).toLocaleString(I18N.loc)}</b> <small>· ${escape(s.reason||'')}</small><div><small>${_t("изделий")} ${s.counts?.items??0} · ${_t("катушек")} ${s.counts?.spools??0} · ${_t("печатей")} ${s.counts?.prints??0}${s.updatedAt?` · ${_t("данные от")} ${new Date(s.updatedAt).toLocaleString(I18N.loc)}`:''}</small></div></span><span style="white-space:nowrap"><button class="secondary small" data-snapdl="${escape(s.id)}">${_t("Скачать")}</button> <button class="small" data-snaprestore="${escape(s.id)}">${_t("Восстановить")}</button></span></div>`).join(''):_t('<p class="muted" style="margin:0">Снимков пока нет. Они создаются автоматически раз в день и перед каждой заменой данных из хранилища или импортом.</p>')}
$('snapList').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;const l=await getSnaps(),s=l.find(x=>x.id===(b.dataset.snapdl||b.dataset.snaprestore));if(!s)return;
  if(b.dataset.snapdl){download(`3d-print-data_${s.at.slice(0,19).replace(/[:T]/g,'-')}.json`,JSON.stringify(s.data,null,2),'application/json');return}
  if(!confirm(`${_t("Восстановить данные от")} ${new Date(s.at).toLocaleString(I18N.loc)} (${_t("изделий")} ${s.counts.items}, ${_t("катушек")} ${s.counts.spools}, ${_t("печатей")} ${s.counts.prints})?\n\n${_t("Текущие данные тоже сохранятся в истории")}.${store?` ${_t("Восстановленные данные будут записаны в")} «${store.label}».`:''}`))return;
  applyData(valid(s.data),_t('перед восстановлением из истории'));persist();setStatus(_t('Данные восстановлены из истории браузера'))});

/* ================= Фото ================= */
const photoUrls=new Map();
function photoUrl(file){if(!photoUrls.has(file)){if(!store||!stReady)return Promise.resolve(null);photoUrls.set(file,store.getPhoto(file).then(b=>URL.createObjectURL(b)).catch(()=>{photoUrls.delete(file);return null}))}return photoUrls.get(file)}
async function hydrate(root){await Promise.all([...root.querySelectorAll('img[data-photo]')].map(async img=>{const u=await photoUrl(img.dataset.photo);if(!img.isConnected)return;if(u)img.src=u;else img.replaceWith(Object.assign(document.createElement('span'),{textContent:'◈'}))}))}
// Уменьшаем фото до 1600 px по длинной стороне — быстрее грузится, особенно из Google Drive и на телефоне
async function shrinkImage(f){if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size<400*1024)return f;try{const bmp=await createImageBitmap(f);const k=Math.min(1,1600/Math.max(bmp.width,bmp.height));if(k===1&&f.size<1.5*1024*1024)return f;const c=Object.assign(document.createElement('canvas'),{width:Math.round(bmp.width*k),height:Math.round(bmp.height*k)});c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);const b=await new Promise(r=>c.toBlob(r,'image/jpeg',.85));return b&&b.size<f.size?b:f}catch{return f}}
async function addPhotos(it,files){
  if(!store||!stReady){alert(_t('Сначала подключите хранилище в настройках — папку или Google Drive'));return}
  const imgs=files.filter(f=>f.type.startsWith('image/'));let n=0;
  for(const f of imgs){setStatus(`${_t("Загрузка фото")} ${n+1} ${_t("из")} ${imgs.length}…`);const blob=await shrinkImage(f);const ext=blob.type==='image/jpeg'?'jpg':(((f.name.split('.').pop()||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5))||'jpg');const pid=shortId(),file=`${it.id.slice(0,8)}-${pid}.${ext}`;
    await store.putPhoto(file,blob);it.photos.push({id:pid,file});photoUrls.set(file,Promise.resolve(URL.createObjectURL(blob)));n++}
  if(!it.cover&&it.photos[0])it.cover=it.photos[0].file;
  if(n){touch(it);persist();renderPhotos();renderList();setStatus(`${_t("Добавлено фото")}: ${n}`)}}
async function removePhotoFiles(files){if(!store||!stReady)return;for(const f of files){try{await store.delPhoto(f)}catch{}}}


/* ================= Тема ================= */
const THEME_KEY='p2s_theme',mq=matchMedia('(prefers-color-scheme: light)');
function themeMode(){try{return localStorage.getItem(THEME_KEY)||'auto'}catch{return'auto'}}
function applyTheme(){const m=themeMode(),t=m==='auto'?(mq.matches?'light':'dark'):m;document.documentElement.dataset.theme=t;document.querySelector('meta[name=theme-color]')?.setAttribute('content',t==='light'?'#ffffff':'#121b30');$('themeBtn').textContent=t==='light'?'☾':'☀';$('themeBtn').title=t==='light'?_t('Тёмная тема'):_t('Светлая тема');$('themeSel').value=m}
function setTheme(m,save=true){try{localStorage.setItem(THEME_KEY,m)}catch{}applyTheme();if(save&&db&&db.settings.theme!==m){db.settings.theme=m;persist()}}
mq.addEventListener?.('change',applyTheme);
$('themeBtn').onclick=()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
$('themeSel').onchange=()=>setTheme($('themeSel').value);
applyTheme();

/* ================= Навигация ================= */
const PAGES=['home','calc','catalog','item','spools','spool','log','stats','settings','printer'];let itemTab='overview',pendingPrint=false;let currentPage='';
function route(){
  let h=decodeURIComponent(location.hash.slice(1));
  if(h.startsWith('catalog/move/')){const id=h.slice(13);history.replaceState(null,'','#catalog');currentItemId=null;show('catalog');structStart(id);return}
  if(struct&&h!=='catalog')structEnd(true);
  if(h.startsWith('item/')){const [id,tab]=h.slice(5).split('/');if(db.items.some(i=>i.id===id)){const same=currentItemId===id&&currentPage==='item';currentItemId=id;itemTab=ITEM_TABS.includes(tab)?tab:'overview';show('item',same);renderItem();setItemTab(itemTab,false);if(pendingPrint){pendingPrint=false;openPrintForm();setTimeout(()=>$('printForm').scrollIntoView({block:'start',behavior:'smooth'}),60)}return}h='catalog'}
  if(h.startsWith('spool/')){const id=h.slice(6);if(getSpool(id)){currentSpoolId=id;currentItemId=null;show('spool');renderSpool();return}h='spools'}
  if(h==='printer'||h.startsWith('printer/')){currentItemId=null;currentSpoolId=null;openPrinterPage(h.slice(8));return}
  currentItemId=null;currentSpoolId=null;show(PAGES.includes(h)&&!['item','spool','printer'].includes(h)?h:'home');
  if(currentPage==='home'){renderDash();cloudRefresh().then(()=>{if(currentPage==='home')renderDashPrinter()}).catch(()=>{})}
  if(currentPage==='settings'){renderPrinters();if(BB.connected()&&!cloud.at)cloudRefresh().then(()=>renderPrinters()).catch(()=>{})}}
function show(p,keepScroll){const changed=!keepScroll&&(p!==currentPage||p==='item'||p==='spool');document.body.classList.remove('more-open');closeMenus();currentPage=p;for(const x of PAGES)$('page-'+x).hidden=x!==p;document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===({item:'catalog',spool:'spools'}[p]||p)));if(changed)window.scrollTo({top:0})}
const go=h=>{if(location.hash==='#'+h)route();else location.hash=h};

/* ================= Вкладки изделия, меню «⋯», «Ещё» в мобильной навигации ================= */
const ITEM_TABS=['overview','log'];
function setItemTab(t,push=true){itemTab=ITEM_TABS.includes(t)?t:'overview';document.querySelectorAll('#page-item [data-pane]').forEach(p=>p.hidden=p.dataset.pane!==itemTab);document.querySelectorAll('#itTabs [data-tab]').forEach(b=>{b.classList.toggle('on',b.dataset.tab===itemTab);b.setAttribute('aria-selected',b.dataset.tab===itemTab)});if(push&&currentItemId)history.replaceState(null,'','#item/'+currentItemId+(itemTab==='overview'?'':'/'+itemTab))}
$('itTabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)setItemTab(b.dataset.tab)};
$('itPrintBtn').onclick=()=>{setItemTab('log');if($('printForm').hidden)openPrintForm();$('printForm').scrollIntoView({block:'start',behavior:'smooth'})};
function closeMenus(except){document.querySelectorAll('details.menu[open]').forEach(d=>{if(d!==except)d.open=false})}
document.addEventListener('click',e=>{const m=e.target.closest('details.menu');closeMenus(m);if(m&&e.target.closest('.menu-list button'))m.open=false;if(!e.target.closest('#navMore,#subNav'))document.body.classList.remove('more-open')});
$('navMore').onclick=e=>{e.stopPropagation();const o=document.body.classList.toggle('more-open');$('navMore').setAttribute('aria-expanded',o)};
// сегментные переключатели
function segInit(id,val,cb){const el=$(id);const set=v=>{el.querySelectorAll('[data-v]').forEach(b=>{b.classList.toggle('on',b.dataset.v===v);b.setAttribute('aria-pressed',b.dataset.v===v)})};set(val);el.onclick=e=>{const b=e.target.closest('[data-v]');if(!b)return;set(b.dataset.v);cb(b.dataset.v)};return set}
const lsGet=(k,d)=>{try{return localStorage.getItem(k)??d}catch{return d}},lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};

window.addEventListener('hashchange',route);

/* ================= Отрисовка: общие ================= */
const matOptions=sel=>db.materials.map(m=>`<option value="${escape(m.id)}"${m.id===sel?' selected':''}>${escape(m.name)}</option>`).join('')+(sel&&!db.materials.some(m=>m.id===sel)?`<option value="${escape(sel)}" selected>${_t("Удалённый материал")}</option>`:'');
function fillSettings(){for(const k in baseSettings)$(k).value=db.settings[k]??baseSettings[k];if(db.settings.theme&&db.settings.theme!==themeMode()){setTheme(db.settings.theme,false)}}
function renderMaterials(){{const mf=$('matFilter').value;$('matFilter').innerHTML=_t('<option value="">Все материалы</option>')+db.materials.map(m=>`<option value="${escape(m.id)}">${escape(m.name)}</option>`).join('');if(db.materials.some(m=>m.id===mf))$('matFilter').value=mf}
  const sm=$('statMat').value;$('statMat').innerHTML=_t('<option value="">Все материалы</option>')+db.materials.map(m=>`<option value="${escape(m.id)}">${escape(m.name)}</option>`).join('');if(db.materials.some(m=>m.id===sm))$('statMat').value=sm;
  const selected=$('material').value;$('material').innerHTML=db.materials.map(m=>`<option value="${escape(m.id)}">${escape(m.name)} — ${money(number(m.price))}/${_t("кг")}</option>`).join('');if(db.materials.some(m=>m.id===selected))$('material').value=selected;
  $('materialsList').innerHTML=db.materials.map(m=>{const sp=db.spools.filter(s=>s.materialId===m.id&&s.price&&number(s.net));const avg=sp.length?sp.reduce((a,s)=>a+s.price/number(s.net)*1000,0)/sp.length:0;return`<div class="line matline"><span>${escape(m.name)}${avg&&Math.abs(avg-m.price)>=1?`<div><button class="linkbtn" data-applyprice="${escape(m.id)}" data-v="${Math.round(avg*100)/100}" title="${_t("Средняя цена купленных катушек")}">${_t("по катушкам")}: ${money(avg)}/${_t("кг ←")}</button></div>`:''}</span><span><input aria-label="${_t("Цена")} ${escape(m.name)}" data-mat="${escape(m.id)}" type="number" min="0" step="0.01" value="${number(m.price)}" style="width:100px;margin:0;padding:6px"> ${_t("₽/кг")} <input aria-label="${_t("Плотность")} ${escape(m.name)}" data-matdens="${escape(m.id)}" type="number" min="0.5" max="3" step="0.01" value="${m.density}" style="width:70px;margin:0 0 0 6px;padding:6px" title="${_t("Плотность, г/см³ — для пересчёта граммов в метры")}"> ${_t("г/см³")} <button class="danger" data-delmat="${escape(m.id)}" title="${_t("Удалить материал")}">×</button></span></div>`}).join('')}
function renderPrinters(){const def=getPrinter('').id,used=id=>db.items.filter(i=>i.printerId===id).length+db.prints.filter(p=>p.printerId===id).length;
  $('printersList').innerHTML=db.printers.map(P=>`<div class="part prcard" data-ptr="${escape(P.id)}"><div class="fields"><label class="wide">${_t("Название")}<input data-ptk="name" value="${escape(P.name)}"></label><label>${_t("Стоимость, ₽")}<input data-ptk="price" type="number" min="0" value="${P.price}"></label><label>${_t("Срок амортизации, лет")}<input data-ptk="years" type="number" min="0.5" step="0.5" value="${P.years}"></label><label>${_t("Часов печати в год")}<input data-ptk="annualHours" type="number" min="1" value="${P.annualHours}"></label><label>${_t("Средняя мощность, Вт")}<input data-ptk="watts" type="number" min="0" value="${P.watts}"></label><label>${_t("Обслуживание, ₽/ч")}<input data-ptk="maintenance" type="number" min="0" step="0.01" value="${P.maintenance}"></label><label>${_t("Принтер в Bambu Cloud")}<select data-ptk="bambuDev">${bambuDevOptions(P.bambuDev)}</select></label><label>${_t("Наработка до начала учёта, ч")}<input data-ptk="baseHours" type="number" min="0" step="1" value="${P.baseHours||''}" placeholder="0"></label><label>${_t("В работе с")}<input data-ptk="since" type="date" value="${escape(P.since)}"></label></div><div class="prfoot"><label class="check" style="margin:0"><input type="radio" name="defPrinter" data-ptdef${P.id===def?' checked':''}> ${_t("По умолчанию")}</label><span class="muted">${_t("Амортизация")} ${money(amortH(P))}/${_t("ч · с обслуживанием")} ${money(amortH(P)+number(P.maintenance))}/${_t("ч")} · <a class="lnk" href="#printer/${escape(P.id)}">${_t("наработка и обслуживание →")}</a></span>${db.printers.length>1?`<button class="iconbtn danger" data-ptdel title="${used(P.id)?_t('Используется: ')+used(P.id):_t('Удалить принтер')}">${_t("Удалить")}</button>`:''}</div></div>`).join('');
  const cp=$('calcPrinter').value;$('calcPrinter').innerHTML=printerOptions(cp);$('calcPrinter').value=db.printers.some(p=>p.id===cp)?cp:''}
function renderAll(){renderMaterials();renderPrinters();renderLibs();renderCalcProtos();renderCalc();renderList();if(currentPage)route()}


/* ================= Ввод времени: часы + минуты + слайдер ================= */
const TMAX=48;
const fmtDec=m=>m%60?'= '+fmt(m/60,2)+_t(' ч'):'';
// часы: целые, дробные (2,5 / 2.5) или «2:30»
function parseHours(v){const s=String(v).trim().replace(',','.');const hm=s.match(/^(\d+)\s*[:чh]\s*(\d{1,2})?/i);if(hm&&/[:чh]/i.test(s))return number(hm[1])*60+number(hm[2]||0);return Math.round(number(s)*60)}
function tin(attrs,hours,{slider=true,compact=false}={}){const m=Math.round(number(hours)*60);
  return`<div class="tin${compact?' compact':''}"><input type="hidden" class="tin-v" ${attrs} value="${number(hours)}"><span class="tin-f"><input type="text" class="tin-h" inputmode="decimal" value="${Math.floor(m/60)}" aria-label="${_t("часы (можно дробные: 2,5 или 2:30")})" title="${_t("Часы. Можно ввести дробные: 2,5 — или 2:30")}"><small>${_t("ч")}</small><input type="number" class="tin-m" min="0" max="59" step="1" inputmode="numeric" value="${m%60}" aria-label="${_t("минуты")}"><small>${_t("мин")}</small><small class="tin-d">${fmtDec(m)}</small></span>${slider?`<input type="range" class="tin-r" min="0" max="${TMAX*60}" step="5" value="${Math.min(m,TMAX*60)}" aria-label="${_t("Время печати, до")} ${TMAX} ${_t("ч")}">`:''}</div>`}
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
function renderCalcProtos(){$('cProtos').innerHTML=calcProtos.map((p,i)=>`<div class="protorow"><span class="muted">v${i+1}</span><select data-cp="${i}" data-cpf="materialId">${matOptions(p.materialId)}</select><input data-cp="${i}" data-cpf="grams" type="number" min="0" step="0.1" value="${p.grams}" placeholder="${_t("г")}" title="${_t("Граммы")}">${tin(`data-cp="${i}" data-cpf="hours"`,p.hours,{slider:false,compact:true})}<button class="iconbtn danger" data-cpdel="${i}" title="${_t("Убрать")}">×</button></div>`).join('')||_t('<p class="muted" style="margin:0">Не было — или добавьте пробные печати.</p>')}
function renderCalc(){const c=calcItem(draft());$('total').textContent=money(c.total);$('breakdown').innerHTML=breakdownHtml(c)+(c.proto.count?`<div class="line"><span>${_t("Прототипы")} · ${c.proto.count} ${_t("шт")} · ${fmt(c.proto.grams)} ${_t("г")} · ${fmtH(c.proto.hours)}</span><b>${money(c.proto.total)}</b></div><div class="line"><span><b>${_t("Итого с прототипами")}</b></span><b>${money(c.dev)}</b></div>`:'');$('bars').innerHTML=barsHtml(c);$('pergram').textContent=c.grams>0?`${_t("Себестоимость на грамм изделия")}: ${money(c.total/c.grams)}`:'';}
function resetCalc(){calcProtos=[];renderCalcProtos();for(const k of ['name','notes'])$(k).value='';$('grams').value=100;$('hours').value=4;syncTin($('hours').closest('.tin'));$('extra').value=0;renderCalc()}
function saveCalc(open){const name=$('name').value.trim();if(!name){alert(_t('Введите название изделия'));$('name').focus();return}
  const it=normItem({name,printerId:$('calcPrinter').value,materialId:$('material').value,grams:number($('grams').value),hours:number($('hours').value),extra:number($('extra').value),notes:$('notes').value.trim(),status:'done',prototypes:calcProtos.map((p,i)=>({...p,name:'v'+(i+1),date:today(),at:now()}))});it.updatedAt=it.createdAt;
  db.items.unshift(it);persist();renderList();resetCalc();setStatus(_t('Изделие добавлено в каталог'));if(open)go('item/'+it.id)}

/* ================= Каталог ================= */
const printsOf=id=>db.prints.filter(p=>p.itemId===id);
/* --- Вложенность изделий: сборка → вложенные изделия --- */
const kidsOf=id=>db.items.filter(x=>x.parentId===id);
const parentOf=it=>it?.parentId?db.items.find(x=>x.id===it.parentId)||null:null;
function isDescendant(id,ofId){const seen=new Set();for(let c=db.items.find(x=>x.id===id);c&&!seen.has(c.id);c=parentOf(c)){if(c.id===ofId)return true;seen.add(c.id)}return false}
const canNest=(childId,parentId)=>!!parentId&&childId!==parentId&&!isDescendant(parentId,childId);
function itemPath(it){const r=[],seen=new Set();for(let c=parentOf(it);c&&!seen.has(c.id);c=parentOf(c)){seen.add(c.id);r.unshift(c)}return r}
function descendants(it){const r=[],q=[it.id],seen=new Set([it.id]);while(q.length){for(const k of kidsOf(q.shift()))if(!seen.has(k.id)){seen.add(k.id);r.push(k);q.push(k.id)}}return r}
function calcTree(it){const c=calcItem(it),d=descendants(it),r={total:c.total,grams:c.grams,hours:c.hours,n:d.length};for(const x of d){const k=calcItem(x);r.total+=k.total;r.grams+=k.grams;r.hours+=k.hours}return r}
// Удаление изделия: записи журнала остаются (время фиксируется, ссылка снимается), вложенные поднимаются на уровень выше
function removeItem(it){for(const p of db.prints)if(p.itemId===it.id){if(p.hours==null)p.hours=printHours(p);p.itemId='';p.partId=''}
  for(const k of kidsOf(it.id))k.parentId=it.parentId&&it.parentId!==it.id?it.parentId:'';
  db.items=db.items.filter(x=>x!==it)}
const coverImg=x=>x.cover?`<img data-photo="${escape(x.cover)}" alt="">`:x.coverUrl?`<img src="${escape(x.coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:'◈';
const catFlat=()=>!struct&&!!($('search').value.trim()||$('statusFilter').value||$('matFilter').value);
function filtered(){const q=struct?'':$('search').value.trim().toLowerCase(),st=struct?'':$('statusFilter').value,mf=struct?'':$('matFilter').value,so=$('catSort').value;
  const list=db.items.filter(x=>(!st||x.status===st)&&(!mf||itemMaterials(x).includes(mf))&&(x.name+' '+x.tags.join(' ')+' '+itemMaterials(x).map(m=>getMat(m).name).join(' ')+' '+x.notes).toLowerCase().includes(q));
  const cost=new Map(list.map(x=>[x.id,calcItem(x).total])),cnt=x=>itemDone(x).sets;
  const cmp={new:(a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''),old:(a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''),name:(a,b)=>a.name.localeCompare(b.name,'ru'),costDesc:(a,b)=>cost.get(b.id)-cost.get(a.id),costAsc:(a,b)=>cost.get(a.id)-cost.get(b.id),printed:(a,b)=>cnt(b)-cnt(a)}[so];
  return cmp?list.sort(cmp):list}
let catView=lsGet('p2s_cat_view','cards');
const matDots=mids=>`<span class="matdots">${mids.map(m=>`<span class="pill">${escape(getMat(m).name)}</span>`).join('')}</span>`;
const topLevel=list=>catFlat()?list:list.filter(x=>!parentOf(x));
const pathHtml=x=>{const p=itemPath(x);return p.length?`<div class="ipath">${_t("в")} «${escape(p.map(y=>y.name).join(' › '))}»</div>`:''};
function kidsHtml(x,order){const ks=order.filter(k=>k.parentId===x.id);if(!ks.length)return'';return`<div class="ikids"><span class="muted">${_t("Состав")} (${descendants(x).length}):</span>${ks.slice(0,6).map(k=>`<a href="#item/${escape(k.id)}" class="kchip">${escape(k.name)}${(k.parts[0]?.qty||1)>1?' ×'+k.parts[0].qty:''}${kidsOf(k.id).length?' ▸':''}</a>`).join('')}${ks.length>6?`<span class="muted">+${ks.length-6}</span>`:''}</div>`}
function renderCards(list){const flat=catFlat();$('catCards').innerHTML=topLevel(list).map(x=>{const c=calcItem(x),n=itemDone(x).sets,t=calcTree(x),T=t.n?t:c;return`<article class="icard" tabindex="0" data-open="${escape(x.id)}"><div class="cover">${coverImg(x)}</div><div class="body">${flat?pathHtml(x):''}<div class="ttl">${escape(x.name)}</div><div class="meta"><span class="pill ${x.status}">${STATUSES[x.status]}</span>${matDots(treeMaterials(x))}</div><div class="meta"><span class="cost">${money(T.total)}</span><span>· ${fmt(T.grams)} ${_t("г")} · ${fmtH(T.hours)}</span></div>${n?`<div class="meta">${_t("напечатано")}: ${n}</div>`:''}${flat?'':kidsHtml(x,list)}</div><div class="acts"><button type="button" data-cact="print" title="${_t("Записать печать")}">${_t("✓ Печать")}</button><button type="button" class="secondary" data-cact="dup" title="${_t("Дублировать")}">⧉</button></div></article>`}).join('');hydrate($('catCards'))}
const treeMaterials=x=>[...new Set([x,...descendants(x)].flatMap(itemMaterials))];
/* --- Список-дерево: головные изделия и их элементы (вложенные изделия) --- */
let catFold=new Set();try{catFold=new Set(JSON.parse(lsGet('p2s_cat_fold','[]')))}catch{}
const saveFold=()=>lsSet('p2s_cat_fold',JSON.stringify([...catFold]));
// Режим «Структура»: перенос изделий по иерархии. orig — исходные родители для «Отменить», moving — выбранное для переноса
let struct=null;
function treeRows(list){const flat=!struct&&catFlat(),out=[];if(flat){for(const x of list)out.push([x,0,false]);return out}
  const src=list,seen=new Set(),kids=new Map();for(const x of src){const k=x.parentId&&src.some(y=>y.id===x.parentId)?x.parentId:'';if(!kids.has(k))kids.set(k,[]);kids.get(k).push(x)}
  const walk=(x,d)=>{if(seen.has(x.id))return;seen.add(x.id);const ks=kids.get(x.id)||[];out.push([x,d,ks.length>0]);if(struct||!catFold.has(x.id))for(const k of ks)walk(k,d+1)};
  for(const x of kids.get('')||[])walk(x,0);return out}
function renderRows(list){
  $('empty').hidden=list.length>0||!!struct;$('empty').textContent=db.items.length?_t('Ничего не найдено.'):_t('Пока нет сохранённых изделий.');
  const flat=!struct&&catFlat(),mv=struct?.moving,mvIt=mv&&db.items.find(x=>x.id===mv);
  $('rows').innerHTML=treeRows(struct?filtered():list).map(([x,d,has])=>{const c=calcItem(x),t=calcTree(x),T=has?t:c,q=x.parts[0]?.qty||1,id=escape(x.id),open=!catFold.has(x.id);
    const tw=has?`<button type="button" class="tw" data-tw="${id}" aria-label="${open||struct?_t('Свернуть'):_t('Развернуть')}" aria-expanded="${open||!!struct}">${open||struct?'▾':'▸'}</button>`:'<span class="tw"></span>';
    const name=`<div class="tname" style="--d:${Math.min(d,6)}">${flat?'':tw}<div class="thumb${d?' sm':''}">${coverImg(x)}</div><div class="tnm">${d?'':'<b>'}${escape(x.name)}${q>1?` <span class="muted">×${q}</span>`:''}${d?'':'</b>'}${flat?pathHtml(x):''}${has?`<div><small class="muted">${_t("сборка")} · ${t.n} ${_t("влож")}.${x.tags.length?' · '+escape(x.tags.join(', ')):''}</small></div>`:x.tags.length&&!struct?`<div><small class="muted">${escape(x.tags.join(', '))}</small></div>`:''}</div></div>`;
    if(struct){const self=x.id===mv,bad=mvIt&&!self&&!canNest(mv,x.id),here=mvIt&&!self&&!bad&&mvIt.parentId!==x.id,moved=(struct.orig.get(x.id)??'')!==x.parentId;
      return`<tr class="srow${d?' child':''}${self?' moving':''}${bad?' nodrop':''}${moved?' moved':''}" draggable="true" data-srow="${id}"><td colspan="7"><span class="handle" aria-hidden="true">⠿</span>${name}</td><td class="sacts">${mvIt?(self?`<button type="button" class="secondary small" data-mvcancel>${_t("Отмена")}</button>`:here?`<button type="button" class="small" data-mvto="${id}">${_t("↳ Сюда")}</button>`:''):`${x.parentId?`<button type="button" class="secondary small" data-mvup="${id}" title="${_t("На уровень выше")}">⇤</button>`:''}<button type="button" class="secondary small" data-mv="${id}">${_t("⇄ Переместить")}</button>`}</td></tr>`}
    return`<tr class="click${d?' child':''}" data-open="${id}"><td colspan="2">${name}</td><td><span class="pill ${x.status}">${STATUSES[x.status]}</span></td><td>${escape((has?treeMaterials(x):itemMaterials(x)).map(m=>getMat(m).name).join(' + '))}</td><td class="num">${fmt(T.grams)} ${_t("г")}</td><td class="num">${fmtH(T.hours)}</td><td class="num"><b>${money(T.total)}</b>${c.proto.count?`<div><small>+ ${money(c.proto.total)} ${_t("прототипы")}</small></div>`:''}</td><td>${escape((x.createdAt||'').slice(0,10))}</td></tr>`}).join('');
  hydrate($('rows'))}
function renderList(){const fl=filtered();renderRows(fl);renderCards(fl);$('catCards').hidden=!!struct||catView!=='cards'||!fl.length;$('catTable').hidden=!struct&&(catView!=='table'||!fl.length);structInfo();$('catSub').textContent=db.items.length?`${_t("Всего")}: ${db.items.length}${fl.length!==db.items.length?` · ${_t("показано")}: ${fl.length}`:''}`:_t('Каталог ваших моделей');if(currentPage==='home')renderDash();renderStats();renderSpools();renderLog();$('navCount').textContent=db.items.length||''}

/* ================= Статистика ================= */
function renderStatBrands(){const f=$('statMat').value,G=new Map(),ok=s=>!f||s.materialId===f;
  for(const s of db.spools){if(!ok(s))continue;const k=(s.brand.trim()||_t('Без производителя'))+'|'+s.materialId;let g=G.get(k);if(!g)G.set(k,g={brand:s.brand.trim()||_t('Без производителя'),mid:s.materialId,n:0,rated:0,sum:0,tags:new Map(),prints:new Set(),fails:new Set(),grams:0,kg:[],ids:new Set()});
    g.n++;g.ids.add(s.id);if(s.rating){g.rated++;g.sum+=s.rating}for(const t of s.rtags)g.tags.set(t,(g.tags.get(t)||0)+1);if(s.price&&number(s.net))g.kg.push(s.price/number(s.net)*1000)}
  const sp=new Map(db.spools.map(s=>[s.id,s]));
  for(const p of db.prints)for(const u of p.usage){const s=sp.get(u.spoolId);if(!s||!ok(s))continue;const g=G.get((s.brand.trim()||_t('Без производителя'))+'|'+s.materialId);g.prints.add(p.id);g.grams+=number(u.grams);if(p.result==='fail')g.fails.add(p.id)}
  const rows=[...G.values()].filter(g=>g.rated||g.prints.size||g.tags.size);
  const best=new Map();for(const g of rows){if(!g.rated)continue;const a=g.sum/g.rated,b=best.get(g.mid);if(!b||a>b.a)best.set(g.mid,{a,g})}
  const multi=new Set();{const c=new Map();for(const g of rows)if(g.rated)c.set(g.mid,(c.get(g.mid)||0)+1);for(const [m,n] of c)if(n>1)multi.add(m)}
  rows.sort((a,b)=>getMat(a.mid).name.localeCompare(getMat(b.mid).name,'ru')||(b.rated?b.sum/b.rated:-1)-(a.rated?a.sum/a.rated:-1)||b.prints.size-a.prints.size);
  $('statBrandsEmpty').hidden=rows.length>0;$('statBrandsWrap').hidden=!rows.length;
  $('statBrands').innerHTML=rows.map(g=>{const a=g.rated?g.sum/g.rated:0,fr=g.prints.size?g.fails.size/g.prints.size*100:null,top=[...g.tags.entries()].sort((x,y)=>y[1]-x[1]).slice(0,4),isBest=multi.has(g.mid)&&best.get(g.mid)?.g===g,kg=g.kg.length?g.kg.reduce((x,y)=>x+y,0)/g.kg.length:0;
    return`<tr><td><b>${escape(g.brand)}</b>${isBest?_t(' <span class="pill done" title="Лучшая средняя оценка среди производителей этого материала">лучший</span>'):''}</td><td>${escape(getMat(g.mid).name)}</td><td class="num">${g.rated}/${g.n}</td><td style="white-space:nowrap">${a?`<span class="stars" title="${fmt(a,1)} ${_t("из 5")}">${starsTxt(a)}</span> <small>${fmt(a,1)}</small>`:'<span class="muted">—</span>'}</td><td class="num">${g.prints.size||'—'}</td><td class="num"${fr!=null&&fr>=20?' style="color:var(--neg)"':''}>${fr==null?'—':fmt(fr,0)+'%'}</td><td class="num">${kg?money(kg):'—'}</td><td>${top.map(([t,n])=>`<span class="rtag sm ${RTAGS[t][0]==='+'?'pos':'neg'}">${escape(RTAGS[t][1])}${n>1?' ×'+n:''}</span>`).join(' ')||'<span class="muted">—</span>'}</td></tr>`}).join('')}
function renderStats(){renderStatPrinters();renderStatBrands();
  const f=$('statMat').value,list=f?db.items.filter(x=>itemMaterials(x).includes(f)):db.items;
  $('statsScope').textContent=f?`${_t("Изделия с материалом")} ${getMat(f).name}: ${list.length} ${_t("из")} ${db.items.length}`:`${_t("Все изделия каталога")}: ${db.items.length}`;
  $('statsEmpty').hidden=list.length>0;$('statsBody').hidden=!list.length;if(!list.length)return;
  const sum={plastic:0,power:0,depreciation:0,maintenance:0,extra:0,total:0};let grams=0,hours=0,top=null,cheap=null,pc=0,pg=0,ph=0,pt=0;const mats=new Map(),months=new Map(),st={};
  for(const x of list){const c=calcItem(x);for(const k in sum)sum[k]+=c[k];grams+=c.grams;hours+=c.hours;st[x.status]=(st[x.status]||0)+1;
    if(!top||c.total>top.total)top={name:x.name,total:c.total};if(!cheap||c.total<cheap.total)cheap={name:x.name,total:c.total};
    pc+=c.proto.count;pg+=c.proto.grams;ph+=c.proto.hours;pt+=c.proto.total;for(const [mid,v] of Object.entries(c.proto.byMat)){const mm=mats.get(mid)||{name:getMat(mid).name,items:0,grams:0,cost:0};mm.grams+=v.grams;mm.cost+=v.cost;mats.set(mid,mm)}
    for(const [mid,v] of Object.entries(c.byMat)){const mm=mats.get(mid)||{name:getMat(mid).name,items:0,grams:0,cost:0};mm.items++;mm.grams+=v.grams;mm.cost+=v.cost;mats.set(mid,mm)}
    const d=new Date(x.createdAt||'');if(!isNaN(d)){const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');const mo=months.get(key)||{date:new Date(d.getFullYear(),d.getMonth(),1),count:0,grams:0,hours:0,total:0};mo.count++;mo.grams+=c.grams;mo.hours+=c.hours;mo.total+=c.total;months.set(key,mo)}}
  const byP=new Map();let kwh=0;for(const x of list){const c=calcItem(x),P=c.printer;byP.set(P.id,(byP.get(P.id)||0)+c.hours+c.proto.hours);kwh+=(c.hours+c.proto.hours)*number(P.watts)/1000}
  const res=db.printers.filter(P=>byP.has(P.id)).map(P=>{const life=number(P.years)*number(P.annualHours),h=byP.get(P.id);return life>0?`${escape(P.name)}: ${fmt(h/life*100,2)}% (${fmt(h,1)} ${_t("из")} ${fmt(life,0)} ${_t("ч")})`:''}).filter(Boolean);
  const tiles=[[_t('Изделий'),fmt(list.length,0)],[_t('Общая себестоимость'),money(sum.total)],[_t('Средняя себестоимость'),money(sum.total/list.length)],[_t('Пластик'),grams>=1000?fmt(grams/1000,2)+_t(' кг'):fmt(grams)+_t(' г')],[_t('Время печати'),fmt(hours,1)+_t(' ч')],[_t('Электроэнергия'),fmt(kwh,1)+_t(' кВт·ч')],[_t('Средняя цена грамма'),grams?money(sum.total/grams):'—'],[_t('Средняя цена часа'),hours?money(sum.total/hours):'—'],[_t('Прототипов'),fmt(pc,0)+(pc?` · ${fmt(pg)} ${_t("г")}`:'')],[_t('Затраты на прототипы'),money(pt)],[_t('Всего с прототипами'),money(sum.total+pt)],[_t('Филамент на складе'),fmt(db.spools.filter(s=>s.status!=='empty').reduce((a,s)=>a+Math.max(0,spoolState(s).remaining),0)/1000,2)+_t(' кг')],[_t('Печатей в журнале'),fmt(db.prints.length,0)]];
  $('statTiles').innerHTML=tiles.map(([l,v])=>`<div class="stat"><span class="muted">${l}</span><strong>${v}</strong></div>`).join('');
  $('statExtra').innerHTML=Object.keys(STATUSES).filter(k=>st[k]).map(k=>`<span class="pill ${k}">${STATUSES[k]}: ${st[k]}</span>`).join(' ')+`<br><br>${_t("Самое дорогое")}: <b>${escape(top.name)}</b> — ${money(top.total)} · ${_t("самое дешёвое")}: <b>${escape(cheap.name)}</b> — ${money(cheap.total)}`+(res.length?`<br>${_t("Ресурс по амортизации, включая прототипы")} — ${res.join(' · ')}`:'');
  $('statBars').innerHTML=barsHtml(sum,true);
  const mg=[...mats.values()].reduce((a,m)=>a+m.grams,0);
  $('statMats').innerHTML=[...mats.values()].sort((a,b)=>b.grams-a.grams).map(m=>{const p=mg?m.grams/mg*100:0;return`<tr><td>${escape(m.name)}</td><td class="num">${m.items}</td><td class="num">${fmt(m.grams)} ${_t("г")}</td><td class="num">${money(m.cost)}</td><td>${Math.round(p)}%<div class="minibar"><div style="width:${p}%"></div></div></td></tr>`}).join('');
  const ms=[...months.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,12).map(e=>e[1]),max=Math.max(...ms.map(m=>m.total),0);
  $('statMonths').innerHTML=ms.length?ms.map(m=>`<tr><td>${m.date.toLocaleDateString(I18N.loc,{month:'long',year:'numeric'})}</td><td class="num">${m.count}</td><td class="num">${fmt(m.grams)} ${_t("г")}</td><td class="num">${fmt(m.hours,1)} ${_t("ч")}</td><td class="num">${money(m.total)}</td><td style="width:30%"><div class="minibar"><div style="width:${max?m.total/max*100:0}%"></div></div></td></tr>`).join(''):_t('<tr><td colspan="6" class="muted">Нет дат у изделий</td></tr>')}

/* ================= Страница изделия ================= */
const item=()=>db.items.find(i=>i.id===currentItemId);
const touch=it=>{it.updatedAt=now()};
// дата ISO-метки в местном времени (YYYY-MM-DD)
const ymd=iso=>{const d=new Date(iso||'');return isNaN(d)?'':d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function renderItemMeta(){const it=item();if(!it)return;$('itMeta').innerHTML=`<span class="pill ${it.status}">${STATUSES[it.status]}</span> · ${_t("создано")} ${escape(ymd(it.createdAt))}${it.updatedAt?_t(' · изменено ')+escape(new Date(it.updatedAt).toLocaleString(I18N.loc)):''}`}
// Дата создания: меняется день, время суток исходной метки сохраняется
$('itCreated').onchange=e=>{const it=item(),v=e.target.value;if(!it)return;const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(v);if(!m){e.target.value=ymd(it.createdAt);return}
  let d=new Date(it.createdAt||'');if(isNaN(d))d=new Date(+m[1],+m[2]-1,+m[3],12);else d.setFullYear(+m[1],+m[2]-1,+m[3]);
  it.createdAt=d.toISOString();touch(it);persist();renderList();renderItemMeta();setStatus(_t('Дата создания изменена'))};
function renderItem(){const it=item();if(!it)return;$('itCover').innerHTML=coverImg(it);hydrate($('itCover'));$('itTabLogN').textContent=printsOf(it.id).length||'';
  $('itTitle').textContent=it.name||_t('Без названия');
  {const path=itemPath(it);$('itPath').innerHTML=path.length?_t('В составе: ')+path.map(x=>`<a class="lnk" href="#item/${escape(x.id)}">${escape(x.name)}</a>`).join(' › '):'';$('itPath').hidden=!path.length}
  renderItemMeta();$('itCreated').value=ymd(it.createdAt);
  $('itPrinter').innerHTML=printerOptions(it.printerId);
  document.querySelectorAll('#page-item [data-f],#descDlg [data-f]').forEach(el=>{const v=getPath(it,el.dataset.f);el.value=el.dataset.f==='tags'?it.tags.join(', '):(v??'')});
  renderKids();renderLinks();renderParts();renderItemPrints();if(printFormFor===it.id&&!$('printForm').hidden)buildPfRows(true);else closePrintForm();renderProtos();renderItemCalc();renderPhotos();renderDesc()}
function renderKids(){const it=item();if(!it)return;const ks=kidsOf(it.id).sort((a,b)=>a.name.localeCompare(b.name,'ru'));
  {const kp=$('itKidsPanel'),pp=$('itPrintPanel');if(ks.length)pp.before(kp);else pp.after(kp)} // у сборки «Состав» важнее — выше «Печати»
  $('itKids').innerHTML=ks.length?ks.map(k=>{const c=calcTree(k),q=k.parts[0]?.qty||1,n=itemDone(k).sets;return`<a class="kid" href="#item/${escape(k.id)}"><span class="thumb">${coverImg(k)}</span><span><b>${escape(k.name)}</b>${q>1?` <span class="muted">×${q}</span>`:''}<br><small class="muted">${escape(itemMaterials(k).map(m=>getMat(m).name).join(' + ')||'—')} · ${fmt(c.grams)} ${_t("г")} · ${fmtH(c.hours)}${c.n?` · ${_t("вложено")}: ${c.n}`:''}${n?` · ${_t("напечатано")}: ${n}`:''}</small></span><b class="kcost">${money(c.total)}</b></a>`}).join('')
    :_t('<p class="muted" style="margin:0">Элементов нет. «+ Элемент» добавит деталь этой сборки — отдельное изделие со своими материалами, временем и журналом печати. Перенести готовые изделия сюда можно в режиме «⇄ Структура» на странице «Изделия».</p>');hydrate($('itKids'))}
function renderLinks(){const it=item();$('itLinks').innerHTML=it.links.length?it.links.map((l,i)=>{const u=safeUrl(l.url);return`<div class="linkrow"><input class="ltitle" data-li="${i}" data-lf="title" value="${escape(l.title)}" placeholder="${_t("Название (MakerWorld, Printables")}...)"><input data-li="${i}" data-lf="url" value="${escape(l.url)}" placeholder="${_t("https://makerworld.com/... или thingiverse.com")}/..."><a ${u?`href="${escape(u)}"`:''} target="_blank" rel="noopener" title="${_t("Открыть")}" data-lopen="${i}" style="${u?'':'opacity:.3'}">↗</a><button class="iconbtn danger" data-act="delLink" data-li="${i}" title="${_t("Удалить")}">×</button></div>`}).join(''):_t('<p class="muted" style="margin-top:0">Ссылок пока нет.</p>')}
// Печать изделия: одна «деталь» — количество, время и материалы на 1 шт (несколько материалов — AMS)
function renderParts(){const it=item(),p=it.parts[0],pid=escape(p.id),asm=kidsOf(it.id).length>0;
  $('itParts').innerHTML=`${asm&&!hasProfile(it)?_t('<p class="muted" style="margin-top:0">Это сборка: печатается через элементы из «Состава». Заполните, только если у самого изделия есть своя деталь (например, корпус).</p>'):''}<div class="part" data-pid="${pid}"><div class="profrow"><label>${_t("Кол-во, шт")}<input data-pid="${pid}" data-pf="qty" type="number" min="1" step="1" value="${p.qty}"></label><div class="lbl ptime">${_t("Время на 1 шт")}${tin(`data-pid="${pid}" data-pf="hours"`,p.hours)}</div><div class="pcost" data-pcost="${pid}"></div></div>
    ${p.filaments.map((f,i)=>`<div class="filrow"><span class="lead">└</span><select data-pid="${pid}" data-fi="${i}" data-ff="materialId">${matOptions(f.materialId)}</select><input data-pid="${pid}" data-fi="${i}" data-ff="grams" type="number" min="0" step="0.1" value="${f.grams}" title="${_t("Граммы на 1 шт")}" aria-label="${_t("Граммы на 1 шт, г")}" placeholder="${_t("г")}"><button class="iconbtn danger" data-act="delFil" data-pid="${pid}" data-fi="${i}" title="${_t("Убрать материал")}">×</button></div>`).join('')}
    <div class="filrow"><span class="lead"></span><button class="secondary" style="justify-self:start;padding:6px 10px;font-size:12.5px" data-act="addFil" data-pid="${pid}">${p.filaments.length?_t('+ материал (AMS)'):_t('+ материал')}</button></div></div>`}
function renderProtos(){const it=item();$('itProtos').innerHTML=it.prototypes.length?`<div class="tablewrap"><table class="mini proto"><thead><tr><th>${_t("Версия")}</th><th>${_t("Дата")}</th><th>${_t("Материал")}</th><th class="num">${_t("Граммы")}</th><th>${_t("Время")}</th><th class="num">${_t("Стоимость")}</th><th>${_t("Катушка")}</th><th>${_t("Что проверяли / что изменили")}</th><th></th></tr></thead><tbody>${it.prototypes.map(p=>{const a=`data-pr="${escape(p.id)}"`;return`<tr><td><input ${a} data-prf="name" value="${escape(p.name)}" style="width:70px"></td><td><input ${a} data-prf="date" type="date" value="${escape(p.date)}" style="width:140px"></td><td><select ${a} data-prf="materialId" style="min-width:90px">${matOptions(p.materialId)}</select></td><td><input ${a} data-prf="grams" type="number" min="0" step="0.1" value="${p.grams}" style="width:80px"></td><td>${tin(`${a} data-prf="hours"`,p.hours,{slider:false,compact:true})}</td><td class="num" data-prcost="${escape(p.id)}"></td><td><select ${a} data-prf="spoolId" style="min-width:150px">${spoolOptions(p.materialId,p.spoolId)}</select></td><td><input ${a} data-prf="note" value="${escape(p.note)}" placeholder="${_t("допуск 0.2 мало, увеличил")}"></td><td><button class="iconbtn danger" data-act="delProto" data-pr="${escape(p.id)}" title="${_t("Удалить")}">×</button></td></tr>`}).join('')}</tbody></table></div>`:_t('<p class="muted" style="margin:0">Пробных печатей пока нет.</p>');$('itProtos').querySelectorAll('select[data-prf="spoolId"]').forEach(spoolPick)}
// Затраты изделия вместе со всеми вложенными (для сборки)
function calcSum(list){const r={plastic:0,power:0,depreciation:0,maintenance:0,extra:0,total:0,grams:0,hours:0,byMat:{}};
  for(const x of list){const c=calcItem(x);for(const k of ['plastic','power','depreciation','maintenance','extra','total','grams','hours'])r[k]+=c[k];for(const [m,v] of Object.entries(c.byMat)){const b=r.byMat[m]??={grams:0,cost:0};b.grams+=v.grams;b.cost+=v.cost}}return r}
function renderItemCalc(){const it=item();if(!it)return;const c=calcItem(it),ds=descendants(it),T=ds.length?calcSum([it,...ds]):c;
  $('itTotal').textContent=money(T.total);
  $('itSummary').textContent=`${ds.length?`${_t("Сборка целиком")} · ${ds.length} ${_t("влож")}. · `:''}${fmt(T.grams)} ${_t("г")} · ${fmtH(T.hours)}${T.grams?` · ${money(T.total/T.grams)}/${_t("г")}`:''}${c.proto.count?` · ${_t("прототипы")}: ${money(c.proto.total)}`:''}`;
  $('itTreeCost').innerHTML=ds.length?`<div class="line"><span>${_t("Само изделие")}</span><b>${money(c.total)}</b></div><div class="line"><span>${_t("Элементы")} · ${ds.length} ${_t("шт")}</span><b>${money(T.total-c.total)}</b></div>`:'';
  $('itBreakdown').innerHTML=breakdownHtml(T);$('itBars').innerHTML=barsHtml(T);
  $('itMats').innerHTML=Object.entries(T.byMat).map(([m,v])=>`<div class="line"><span>${escape(getMat(m).name)} · ${fmt(v.grams)} ${_t("г")}</span><b>${money(v.cost)}</b></div>`).join('')||'<p class="muted">—</p>';
  $('itProtoCost').innerHTML=c.proto.count?`<div class="line"><span>${_t("Прототипы")} · ${c.proto.count} ${_t("шт")}</span><b>${money(c.proto.total)}</b></div><div class="line"><span><b>${_t("Итого с прототипами")}</b></span><b>${money(T.total+c.proto.total)}</b></div>`:'';
  $('itProtoSum').innerHTML=c.proto.count?`${_t("Всего")}: <b>${c.proto.count}</b> ${_t("шт")} · ${fmt(c.proto.grams)} ${_t("г")} · ${fmtH(c.proto.hours)} · <b>${money(c.proto.total)}</b> · ${_t("с учётом изделия")}: <b>${money(T.total+c.proto.total)}</b>`:'';
  for(const p of it.prototypes){const el=document.querySelector(`[data-prcost="${CSS.escape(p.id)}"]`);if(el)el.textContent=money(c.proto.items[p.id]||0)}
  for(const p of it.parts){const el=document.querySelector(`[data-pcost="${CSS.escape(p.id)}"]`),pc=c.parts[p.id];if(el&&pc)el.innerHTML=`${money(pc.total)}${p.qty>1?`<div><small>${money(pc.unit)}/${_t("шт")}</small></div>`:''}`}}
function renderPhotos(){const it=item();if(!it)return;const can=!!(store&&stReady);
  $('photoAdd').disabled=!can;$('photoHint').textContent=can?`${_t("Перетащите фото сюда или нажмите «Добавить». Фото сохраняются в")} ${store.label}, ${_t("папка photos/. ★ — сделать обложкой")}.`:_t('Подключите хранилище в настройках (папку или Google Drive), чтобы добавлять и видеть фото.');
  $('itPhotos').innerHTML=it.photos.map(p=>`<div class="ph${it.cover===p.file?' cover':''}">${it.cover===p.file?_t('<span class="badge">обложка</span>'):''}<img data-photo="${escape(p.file)}" alt=""><div class="acts"><button class="iconbtn" data-act="cover" data-ph="${escape(p.id)}" title="${_t("Сделать обложкой")}">★</button><button class="iconbtn danger" data-act="delPhoto" data-ph="${escape(p.id)}" title="${_t("Удалить фото")}">×</button></div></div>`).join('')||_t('<p class="muted" style="margin:6px">Фото пока нет.</p>');
  hydrate($('itPhotos'))}

/* --- Описание для MakerWorld --- */
const TPL={ru:{parts:_t('Детали для печати'),settings:_t('Настройки печати'),printer:_t('Принтер'),nozzle:_t('Сопло'),layer:_t('Высота слоя'),infill:_t('Заполнение'),walls:_t('Стенки'),supports:_t('Поддержки'),plate:_t('Пластина'),total:_t('Итого'),fil:_t('филамента'),time:_t('печати'),hardware:_t('Что ещё понадобится'),assembly:_t('Сборка'),tips:_t('Советы'),mm:_t('мм'),g:_t('г'),loc:I18N.loc},
  en:{parts:'Printed parts',settings:'Print settings',printer:'Printer',nozzle:'Nozzle',layer:'Layer height',infill:'Infill',walls:'Walls',supports:'Supports',plate:'Build plate',total:'Total',fil:'of filament',time:'print time',hardware:'Hardware',assembly:'Assembly',tips:'Printing tips',mm:'mm',g:'g',loc:'en-US'}};
function buildDesc(it){const lang=it.desc.lang==='en'?'en':'ru',t=TPL[lang],c=calcSum([it,...descendants(it)]),L=[],n=(v,d=1)=>fmt(v,d,t.loc),block=(title,text)=>{if(String(text||'').trim())L.push('',title,String(text).trim())};
  if(it.desc.intro.trim())L.push(it.desc.intro.trim(),'');
  L.push(t.parts);for(const x of [it,...descendants(it)].filter(hasProfile)){const p=x.parts[0],mats=[...new Set(p.filaments.map(f=>getMat(f.materialId).name))].join(' + '),g=p.filaments.reduce((a,f)=>a+number(f.grams),0);L.push(`• ${x.name||'—'} × ${p.qty} — ${mats}, ${n(g)} ${t.g}, ${fmtH(p.hours,lang)}`)}
  L.push('',t.settings,`• ${t.printer}: ${getPrinter(it.printerId).name}`);const P=it.print;
  if(P.nozzle)L.push(`• ${t.nozzle}: ${P.nozzle} ${t.mm}`);if(P.layer)L.push(`• ${t.layer}: ${P.layer} ${t.mm}`);for(const k of ['infill','walls','supports','plate'])if(String(P[k]).trim())L.push(`• ${t[k]}: ${String(P[k]).trim()}`);
  if(String(P.other).trim())L.push(...String(P.other).trim().split('\n').map(s=>'• '+s.replace(/^[•\-*]\s*/,'')));
  L.push(`• ${t.total}: ~${n(c.grams,0)} ${t.g} ${t.fil}, ~${fmtH(c.hours,lang)} ${t.time}`);
  block(t.hardware,it.desc.hardware);block(t.assembly,it.desc.assembly);block(t.tips,it.desc.tips);
  return L.join('\n')}
function renderDesc(){const it=item();if(it)$('descOut').textContent=buildDesc(it)}

/* --- События страницы изделия --- */
$('itStatus').innerHTML=Object.entries(STATUSES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
$('statusFilter').innerHTML=_t('<option value="">Все статусы</option>')+Object.entries(STATUSES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
const itemInput=e=>{const it=item(),el=e.target;if(!it)return;const pid=el.dataset.pid,p=pid&&it.parts.find(x=>x.id===pid);
  if(el.dataset.f){const f=el.dataset.f;let v=el.value;if(f==='tags')v=v.split(',').map(s=>s.trim()).filter(Boolean);else if(f==='extra')v=number(v);setPath(it,f,v);if(f==='name')$('itTitle').textContent=it.name||_t('Без названия');if(f==='status')$('itMeta').querySelector('.pill').outerHTML=`<span class="pill ${it.status}">${STATUSES[it.status]}</span>`}
  else if(el.dataset.pf&&p){const k=el.dataset.pf;p[k]=k==='name'?el.value:k==='qty'?Math.max(1,Math.round(number(el.value))||1):number(el.value)}
  else if(el.dataset.ff&&p){const fl=p.filaments[+el.dataset.fi];if(!fl)return;fl[el.dataset.ff]=el.dataset.ff==='grams'?number(el.value):el.value}
  else if(el.dataset.prf){const p=it.prototypes.find(x=>x.id===el.dataset.pr);if(!p)return;const k=el.dataset.prf;p[k]=['grams','hours'].includes(k)?number(el.value):el.value;if(k==='materialId'){p.spoolId='';renderProtos()}if(k==='spoolId'||k==='grams'||k==='date'){const s=getSpool(p.spoolId);if(s&&s.status==='sealed')s.status='open';renderSpools()}}
  else if(el.dataset.lf){const l=it.links[+el.dataset.li];if(!l)return;l[el.dataset.lf]=el.value;if(el.dataset.lf==='url'){const t=el.parentElement.querySelector('[data-lf="title"]'),sn=siteName(el.value);if(sn&&(!l.title||SITES.some(([,n])=>n===l.title))){l.title=sn;t.value=sn}const a=el.parentElement.querySelector('[data-lopen]'),u=safeUrl(el.value);if(u)a.href=u;else a.removeAttribute('href');a.style.opacity=u?'':'.3'}}
  else return;
  touch(it);schedulePersist();renderItemCalc();renderDesc();if(el.dataset.pf||el.dataset.ff)refreshPrintForm()};
$('page-item').addEventListener('input',itemInput);$('descDlg').addEventListener('input',itemInput);
$('descClose').onclick=()=>$('descDlg').close();$('descDlg').addEventListener('click',e=>{if(e.target===$('descDlg'))$('descDlg').close()});
$('page-item').addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(!b)return;const it=item();if(!it)return;const act=b.dataset.act,pid=b.dataset.pid,p=pid&&it.parts.find(x=>x.id===pid);
  if(act==='printStart'){openPrintForm();return}if(act==='printCancel'){closePrintForm();return}if(act==='printSave'){savePrint();return}
  if(act==='addLink'){it.links.push({title:b.dataset.preset||'',url:''});renderLinks();$('itLinks').querySelector('.linkrow:last-child [data-lf="url"]')?.focus()}
  else if(act==='delLink'){it.links.splice(+b.dataset.li,1);renderLinks()}
  else if(act==='addProto'){const last=it.prototypes.at(-1);it.prototypes.push({id:shortId(),name:'v'+(it.prototypes.length+1),date:now().slice(0,10),materialId:last?.materialId||it.parts[0]?.filaments[0]?.materialId||db.materials[0]?.id||'',grams:0,hours:0,note:'',spoolId:'',at:now()});renderProtos();$('itProtos').querySelector('tr:last-child [data-prf="grams"]')?.focus()}
  else if(act==='delProto'){it.prototypes=it.prototypes.filter(x=>x.id!==b.dataset.pr);renderProtos()}
  else if(act==='addKid'){const k=normItem({name:_t('Новый элемент'),status:it.status,printerId:it.printerId,parentId:it.id,print:it.print,materialId:it.parts[0]?.filaments[0]?.materialId||db.materials[0]?.id||'',grams:0,hours:0});k.updatedAt=k.createdAt;db.items.push(k);touch(it);persist();renderList();go('item/'+k.id);setTimeout(()=>{const n=$('page-item').querySelector('[data-f="name"]');n?.focus();n?.select()},80);return}
  else if(act==='moveItem'){go('catalog/move/'+it.id);return}
  else if(act==='descOpen'){renderDesc();$('descDlg').showModal();return}
  else if(act==='addFil'&&p){p.filaments.push({materialId:db.materials.find(m=>!p.filaments.some(f=>f.materialId===m.id))?.id||db.materials[0]?.id||'',grams:0});renderParts()}
  else if(act==='delFil'&&p){p.filaments.splice(+b.dataset.fi,1);renderParts()}
  else if(act==='cover'){const ph=it.photos.find(x=>x.id===b.dataset.ph);if(ph)it.cover=ph.file;renderPhotos()}
  else if(act==='delPhoto'){const ph=it.photos.find(x=>x.id===b.dataset.ph);if(!ph||!confirm(_t('Удалить фото? Файл будет удалён из папки photos/.')))return;it.photos=it.photos.filter(x=>x!==ph);if(it.cover===ph.file)it.cover=it.photos[0]?.file||'';await removePhotoFiles([ph.file]);renderPhotos()}
  else if(act==='dupItem'){go('item/'+duplicateItem(it).id);return}
  else if(act==='delItem'){const ds=descendants(it),nk=kidsOf(it.id).length;let all=[it];
    if(ds.length){if(confirm(`«${it.name}» — ${_t("сборка, вложенных изделий")}: ${ds.length}.\n\n${_t("ОК — удалить вместе со всеми вложенными")}.\n${_t("Отмена — выбрать другой вариант")}.`))all=[it,...ds];else if(!confirm(`${_t("Удалить только")} «${it.name}»?\n\n${_t("Вложенные")} (${nk}) ${_t("не удалятся — перейдут")} ${parentOf(it)?`${_t("в")} «${parentOf(it).name}»`:_t('на верхний уровень')}.`))return}
    const np=db.prints.filter(p=>all.some(x=>x.id===p.itemId)).length,nph=all.reduce((a,x)=>a+x.photos.length,0);
    if(!confirm(`${_t("Удалить")} ${all.length>1?`«${it.name}» ${_t("и вложенные")} (${all.length-1})`:`${_t("изделие")} «${it.name}»`}?${np?`\n\n${_t("Записи журнала печати")} (${np}) ${_t("останутся с прежним названием, временем и расходом, но без привязки к изделию")}.`:''}${nph?_t('\n\nФото будут удалены из папки.'):''}`))return;
    await removePhotoFiles(all.flatMap(x=>x.photos.map(f=>f.file)));for(const x of all)removeItem(x);persist();renderList();setStatus(`${_t("Удалено изделий")}: ${all.length}${np?` · ${_t("записей журнала без изделия")}: ${np}`:''}`);go('catalog');return}
  else return;
  touch(it);persist();renderList();renderItemCalc();renderDesc();if(/Part|Fil/.test(act))refreshPrintForm()});
$('photoAdd').onclick=()=>$('photoInput').click();
$('photoInput').onchange=async e=>{const it=item();try{if(it)await addPhotos(it,[...e.target.files])}catch(err){storeErr(err)}e.target.value=''};
const drop=$('photoDrop');
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over')});drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
drop.addEventListener('drop',async e=>{e.preventDefault();drop.classList.remove('over');const it=item();try{if(it)await addPhotos(it,[...e.dataTransfer.files])}catch(err){storeErr(err)}});
$('descCopy').onclick=async()=>{const text=$('descOut').textContent;try{await navigator.clipboard.writeText(text)}catch{const ta=Object.assign(document.createElement('textarea'),{value:text});document.body.append(ta);ta.select();document.execCommand('copy');ta.remove()}setStatus(_t('Описание скопировано'))};

/* ================= Катушки ================= */
const SPOOL_ST={sealed:_t('Запечатана'),open:_t('Открыта'),empty:_t('Закончилась')};
// Отзыв о катушке: плюсы (+) и проблемы (−)
const RTAGS={easy:['+',_t('Печатается без проблем')],surface:['+',_t('Красивая поверхность')],strong:['+',_t('Прочный')],colorok:['+',_t('Цвет как на фото')],dia:['+',_t('Ровный диаметр')],
  string:['−',_t('Сопли / стрингинг')],wet:['−',_t('Сырой, нужна сушка')],warp:['−',_t('Коробится / отлипает')],layers:['−',_t('Слабое спекание слоёв')],clog:['−',_t('Засоры / пробуксовка')],tangle:['−',_t('Плохая намотка')],brittle:['−',_t('Хрупкий')],diambad:['−',_t('Скачет диаметр')],colorbad:['−',_t('Цвет не совпадает')]};
const starsTxt=r=>r?'★'.repeat(Math.round(r))+'☆'.repeat(5-Math.round(r)):'';
const OPNAMES={set:_t('Установлен остаток'),sub:_t('Списание'),add:_t('Добавление')};
const DENS={PETG:1.27,PCTG:1.23,ASA:1.07,ABS:1.04,TPU:1.21,PLA:1.24,PVA:1.23,HIPS:1.04,PA:1.14,PC:1.2};
function guessDensity(name){const n=String(name).toUpperCase();for(const k of Object.keys(DENS))if(n.includes(k))return DENS[k];return 1.24}
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function normSpool(s){return{id:String(s.id||uid()),materialId:String(s.materialId||''),brand:String(s.brand||''),series:String(s.series||''),color:String(s.color||''),colorHex:/^#[0-9a-f]{6}$/i.test(s.colorHex)?s.colorHex:'#d9dee8',colorStops:(Array.isArray(s.colorStops)?s.colorStops:[]).filter(v=>/^#[0-9a-f]{6}$/i.test(v)).slice(0,8),
  diameter:number(s.diameter)||1.75,net:number(s.net)||1000,empty:s.empty===''||s.empty==null?'':number(s.empty),price:number(s.price),purchased:String(s.purchased||''),store:String(s.store||''),
  status:SPOOL_ST[s.status]?s.status:'sealed',opened:String(s.opened||''),dried:String(s.dried||''),notes:String(s.notes||''),bambu:String(s.bambu||''),createdAt:s.createdAt||now(),rating:Math.max(0,Math.min(5,Math.round(number(s.rating)))),rtags:(Array.isArray(s.rtags)?s.rtags:[]).filter(t=>RTAGS[t]),review:String(s.review||''),
  ops:(Array.isArray(s.ops)?s.ops:[]).filter(o=>OPNAMES[o?.type]).map(o=>({id:String(o.id||shortId()),at:o.at||now(),date:String(o.date||String(o.at||now()).slice(0,10)),type:o.type,grams:number(o.grams),note:String(o.note||'')}))}}
function normPrint(p){return{id:String(p.id||uid()),at:p.at||now(),date:String(p.date||String(p.at||now()).slice(0,10)),itemId:String(p.itemId||''),itemName:String(p.itemName||''),printerId:String(p.printerId||''),hours:p.hours==null||p.hours===''?null:number(p.hours),sets:Math.max(1,Math.round(number(p.sets))||1),result:p.result==='fail'?'fail':'ok',note:String(p.note||''),src:String(p.src||''),partId:String(p.partId||''),partName:String(p.partName||''),...(p.pcs!=null&&p.pcs!==''?{pcs:Math.max(1,Math.round(number(p.pcs))||1)}:{}),...(p.whole?{whole:true}:{}),plate:String(p.plate||''),cover:/^https:\/\//.test(p.cover||'')?String(p.cover):'',
  usage:(Array.isArray(p.usage)?p.usage:[]).map(u=>({label:String(u.label||''),materialId:String(u.materialId||''),spoolId:String(u.spoolId||''),grams:number(u.grams)}))}}
const getSpool=id=>db.spools.find(s=>s.id===id);
const spName=s=>[s.brand,s.series,s.color].map(x=>String(x).trim()).filter(Boolean).join(' ')||_t('Без названия');
const gPerM=s=>number(getMat(s.materialId).density||guessDensity(getMat(s.materialId).name))*Math.PI*(number(s.diameter)||1.75)**2/4;
const toM=(s,g)=>{const k=gPerM(s);return k?g/k:0};
function spoolState(sp){const ev=[];
  for(const o of sp.ops)ev.push({key:o.date+'|'+o.at,date:o.date,kind:o.type,grams:o.grams,label:OPNAMES[o.type]+(o.note?': '+o.note:''),op:o.id});
  for(const p of db.prints)for(const u of p.usage)if(u.spoolId===sp.id)ev.push({key:p.date+'|'+p.at,date:p.date,kind:'use',grams:u.grams,label:`${_t("Печать")}: ${p.itemName||_t('изделие')}${p.sets>1?' ×'+p.sets:''}${p.result==='fail'?_t(' — неудачно'):''}`,item:p.itemId});
  for(const it of db.items)for(const pr of it.prototypes)if(pr.spoolId===sp.id&&number(pr.grams))ev.push({key:(pr.date||'')+'|'+(pr.at||''),date:pr.date,kind:'use',grams:number(pr.grams),label:`${_t("Прототип")} ${pr.name}: ${it.name}`,item:it.id});
  ev.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  let rem=number(sp.net),used=0;for(const e of ev){if(e.kind==='set'){e.delta=e.grams-rem;rem=e.grams}else if(e.kind==='add'){e.delta=e.grams;rem+=e.grams}else{e.delta=-e.grams;rem-=e.grams;used+=e.grams}e.after=rem}
  return{remaining:rem,used,events:ev}}
function sortedSpools(materialId,keep){const list=db.spools.filter(s=>s.materialId===materialId&&(s.status!=='empty'||s.id===keep)),rem=new Map(list.map(s=>[s.id,spoolState(s).remaining]));list.sort((a,b)=>(a.status==='open'?0:1)-(b.status==='open'?0:1)||rem.get(a.id)-rem.get(b.id));return{list,rem}}
function spoolOptions(materialId,sel){const {list,rem}=sortedSpools(materialId,sel);return _t('<option value="">— не списывать —</option>')+list.map(s=>`<option value="${escape(s.id)}"${s.id===sel?' selected':''}>${escape(spName(s))} · ${fmt(rem.get(s.id),0)} ${_t("г")}</option>`).join('')}
const swatch=(s,cls='')=>`<span class="swatch ${cls}" style="background:${bgOf(s)}"></span>`;
function remBar(s,g){const p=Math.max(0,Math.min(100,number(s.net)?g/number(s.net)*100:0)),low=s.status!=='empty'&&g<number(db.settings.lowStock);return`<div class="minibar"><div style="width:${p}%;background:${low?'#ef5f6f':bgOf(s)}"></div></div>`}

function renderSpools(){
  const q=$('spoolSearch').value.trim().toLowerCase(),f=$('spoolFilter').value,low=number(db.settings.lowStock);
  const all=db.spools.map(s=>({s,st:spoolState(s)}));
  // стоимость остатка: по цене катушки, а если она не указана — по цене материала за кг
  const remValue=(s,g)=>{g=Math.max(0,g);return s.price&&number(s.net)?g*s.price/number(s.net):g*number(getMat(s.materialId).price)/1000};
  const byMat=new Map();let totV=0,totG=0,totN=0,est=0,bought=0;for(const {s,st} of all){if(s.price)bought+=s.price;if(s.status==='empty')continue;const m=byMat.get(s.materialId)||{n:0,g:0,m:0,low:0,v:0};const g=Math.max(0,st.remaining),v=remValue(s,g);m.n++;m.g+=g;m.m+=toM(s,g);m.v+=v;if(st.remaining<low)m.low++;byMat.set(s.materialId,m);totV+=v;totG+=g;totN++;if(!s.price)est++}
  $('spoolTiles').innerHTML=(totN?`<div class="stat stat-total" title="${est?`${_t("У")} ${est} ${_t("кат. цена не указана — посчитано по цене материала за кг")}`:_t('По ценам покупки катушек')}"><span class="muted">${_t("Пластик на складе")} · ${totN} ${_t("кат")}.</span><strong>${money(totV)}</strong><small>${fmt(totG/1000,2)} ${_t("кг")}${bought?` · ${_t("куплено всего на")} ${money(bought)}`:''}${est?` · ${_t("без цены")}: ${est} ${_t("кат. (по цене материала")})`:''}</small></div>`:'')
    +[...byMat.entries()].sort((a,b)=>b[1].g-a[1].g).map(([mid,m])=>`<div class="stat"><span class="muted">${escape(getMat(mid).name)} · ${m.n} ${_t("кат")}.</span><strong>${fmt(m.g,0)} ${_t("г")}</strong><small>≈ ${fmt(m.m,0)} ${_t("м")} · ${money(m.v)}${m.low?` · <span style="color:var(--neg)">${_t("мало")}: ${m.low}</span>`:''}</small></div>`).join('');
  {const fm=$('spoolMat').value,fb=$('spoolBrand').value,mats=[...new Set(db.spools.map(s=>s.materialId))],brands=[...new Set(db.spools.map(s=>s.brand.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
   $('spoolMat').innerHTML=_t('<option value="">Все материалы</option>')+mats.map(m=>`<option value="${escape(m)}">${escape(getMat(m).name)}</option>`).join('');$('spoolMat').value=mats.includes(fm)?fm:'';
   $('spoolBrand').innerHTML=_t('<option value="">Все производители</option>')+brands.map(b=>`<option>${escape(b)}</option>`).join('');$('spoolBrand').value=brands.includes(fb)?fb:''}
  const fm=$('spoolMat').value,fb=$('spoolBrand').value;
  const list=all.filter(({s,st})=>(f==='all'||(f==='empty'?s.status==='empty':f==='low'?s.status!=='empty'&&st.remaining<low:s.status!=='empty'))&&(!fm||s.materialId===fm)&&(!fb||s.brand.trim()===fb)&&(spName(s)+' '+getMat(s.materialId).name+' '+s.store).toLowerCase().includes(q));
  $('spoolEmpty').hidden=list.length>0;$('spoolEmpty').innerHTML=db.spools.length?_t('Ничего не найдено — измените фильтры.'):_t('<b>Катушек пока нет.</b><br>Добавьте катушку — и пластик будет списываться с неё при записи печати.<div class="buttons"><button type="button" onclick="document.getElementById(\'spoolAdd\').click()">+ Катушка</button></div>');
  const cards=spoolView==='cards';$('spoolCards').hidden=!cards||!list.length;$('spoolTable').hidden=cards||!list.length;
  const sortBy=$('spoolSort').value,grp=$('spoolGroup').value,dkey=s=>s.purchased||s.createdAt.slice(0,10);
  const cmp={remAsc:(a,b)=>a.st.remaining-b.st.remaining,remDesc:(a,b)=>b.st.remaining-a.st.remaining,dateDesc:(a,b)=>dkey(b.s).localeCompare(dkey(a.s)),dateAsc:(a,b)=>dkey(a.s).localeCompare(dkey(b.s)),name:(a,b)=>spName(a.s).localeCompare(spName(b.s),'ru')}[sortBy]||(()=>0);
  list.sort(cmp);
  const row=({s,st})=>{const g=st.remaining,isLow=s.status!=='empty'&&g<low;return`<tr class="click" data-spool="${escape(s.id)}"><td>${swatch(s)}</td><td><b>${escape(s.brand||'—')}</b>${s.rating?` <span class="stars sm" title="${_t("Оценка")} ${s.rating} ${_t("из 5")}">${starsTxt(s.rating)}</span>`:''}${s.store?`<div><small>${escape(s.store)}</small></div>`:''}</td><td>${escape([s.series,s.color].filter(x=>String(x).trim()).join(' · ')||'—')}</td><td>${escape(getMat(s.materialId).name)}</td><td><span style="${isLow?'color:var(--neg)':''}">${fmt(g,0)} ${_t("г")} · ${fmt(toM(s,g),0)} ${_t("м")}${isLow?_t(' · мало'):''}</span>${remBar(s,g)}</td><td class="num">${s.price?money(s.price)+`<div><small>${money(s.price/number(s.net)*1000)}/${_t("кг")}</small></div>`:'—'}</td><td>${escape(s.purchased)}</td><td><span class="pill sp-${s.status}">${SPOOL_ST[s.status]}</span></td></tr>`};
  const card=({s,st})=>{const g=st.remaining,isLow=s.status!=='empty'&&g<low;return`<div class="scard${isLow?' low':''}${s.status==='empty'?' empty-s':''}" tabindex="0" data-spool="${escape(s.id)}">${swatch(s)}<div class="nm">${escape(s.brand||_t('Без производителя'))}${s.rating?`<span class="stars sm" title="${_t("Оценка")} ${s.rating} ${_t("из 5")}">${starsTxt(s.rating)}</span>`:''}${isLow?_t('<span class="lowtag">мало</span>'):''}</div><div class="sub">${escape(getMat(s.materialId).name)} · ${escape([s.series,s.color].filter(x=>String(x).trim()).join(' · ')||'—')}</div><div class="rem"><span><b>${fmt(Math.max(0,g),0)} ${_t("г")}</b> <small class="muted">≈ ${fmt(toM(s,Math.max(0,g)),0)} ${_t("м")}</small></span><span class="pill sp-${s.status}">${SPOOL_ST[s.status]}</span></div>${remBar(s,g)}</div>`};
  if(cards){if(grp!=='material')$('spoolCards').innerHTML=`<div class="spcards">${list.map(card).join('')}</div>`;else{const groups=new Map();for(const x of list){const k=x.s.materialId;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)}
    $('spoolCards').innerHTML=[...groups.entries()].sort((a,b)=>getMat(a[0]).name.localeCompare(getMat(b[0]).name,'ru')).map(([k,xs])=>{const g=xs.reduce((a,x)=>a+Math.max(0,x.st.remaining),0);return`<h3 class="spgroup">${escape(getMat(k).name)} <small>· ${xs.length} ${_t("кат")}. · ${fmt(g,0)} ${_t("г")}</small></h3><div class="spcards">${xs.map(card).join('')}</div>`}).join('')}}
  if(grp!=='material'){$('spoolRows').innerHTML=list.map(row).join('')}
  else{const groups=new Map();for(const x of list){const k=x.s.materialId;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x)}
    const closed=new Set(($('spoolRows').dataset.closed||'').split(',').filter(Boolean));
    $('spoolRows').innerHTML=[...groups.entries()].sort((a,b)=>getMat(a[0]).name.localeCompare(getMat(b[0]).name,'ru')).map(([k,xs])=>{const g=xs.reduce((a,x)=>a+Math.max(0,x.st.remaining),0),m=xs.reduce((a,x)=>a+toM(x.s,Math.max(0,x.st.remaining)),0),lw=xs.filter(x=>x.s.status!=='empty'&&x.st.remaining<low).length,open=!closed.has(k);
      return`<tr class="grp" data-sgrp="${escape(k)}"><td colspan="8"><span class="caret">${open?'▾':'▸'}</span><b>${escape(getMat(k).name)}</b><span class="muted"> · ${_t("катушек")} ${xs.length} · ${fmt(g,0)} ${_t("г ≈")} ${fmt(m,0)} ${_t("м")}${lw?` · <span style="color:var(--neg)">${_t("мало")}: ${lw}</span>`:''}</span></td></tr>`+(open?xs.map(row).join(''):'')}).join('')}
  $('navSpools').textContent=all.filter(({s,st})=>s.status!=='empty'&&st.remaining<low).length?'!':''}


let currentSpoolId=null;const spool=()=>getSpool(currentSpoolId);
function renderSpool(){const s=spool();if(!s)return;if(renderSpool.last!==s.id){renderSpool.last=s.id;for(const k of ['corrVal','corrNote','weighGross'])$(k).value=''}
  $('spMat').innerHTML=matOptions(s.materialId);$('spBrand').innerHTML=brandOptions(s.brand);$('spStatus').innerHTML=Object.entries(SPOOL_ST).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  renderColorEdit();$('page-spool').querySelectorAll('[data-sf]').forEach(el=>{el.value=s[el.dataset.sf]??''});renderColorChips();renderQuick();renderRating();
  renderSpoolHead();renderSpoolRem()}
function renderSpoolHead(){const s=spool();$('spTitle').textContent=spName(s);$('spSwatch').style.background=bgOf(s);$('spMeta').innerHTML=`${escape(getMat(s.materialId).name)} · ${fmt(s.diameter,2)} ${_t("мм")} · <span class="pill sp-${s.status}">${SPOOL_ST[s.status]}</span>`}
function renderSpoolRem(){const s=spool();if(!s)return;const st=spoolState(s),g=st.remaining,k=gPerM(s);
  $('spRem').textContent=`${fmt(g,0)} ${_t("г")}`;$('spRem').style.color=g<0?'var(--neg)':'';
  $('spRemSub').textContent=`≈ ${fmt(toM(s,g),0)} ${_t("м")} · ${number(s.net)?fmt(Math.max(0,g)/number(s.net)*100,0):0}${_t("% от")} ${fmt(s.net,0)} ${_t("г · израсходовано")} ${fmt(st.used,0)} ${_t("г")}${s.price&&number(s.net)?` · ${_t("остаток стоит")} ${money(Math.max(0,g)*s.price/number(s.net))}`:''} · ${fmt(k,2)} ${_t("г/м")}`;
  $('spRemBar').style.width=Math.max(0,Math.min(100,number(s.net)?g/number(s.net)*100:0))+'%';$('spRemBar').style.background=bgOf(s);
  // взвешивание
  const same=db.spools.filter(x=>x!==s&&x.empty!==''&&x.brand.trim()&&x.brand.trim().toLowerCase()===s.brand.trim().toLowerCase());
  const hint=s.empty!==''?`${_t("Остаток = вес на весах −")} ${fmt(s.empty,0)} ${_t("г (пустая катушка")}).`
    :`${_t("Вес пустой катушки неизвестен. Если катушка новая и запечатанная — взвесьте её и нажмите «Это новая катушка»: вес пустой = брутто −")} ${fmt(s.net,0)} ${_t("г")}.`+(same.length?` <button class="secondary" data-useempty="${same[0].empty}" style="padding:4px 9px;font-size:12px">${_t("Взять")} ${fmt(same[0].empty,0)} ${_t("г от другой катушки")} ${escape(same[0].brand)}</button>`:'');
  $('weighHint').innerHTML=hint;$('weighNew').hidden=s.empty!=='';
  updateCorrHint();
  $('spHist').innerHTML=st.events.slice().reverse().map(e=>`<tr><td>${escape(e.date||'')}</td><td>${e.item?`<a href="#item/${escape(e.item)}" class="lnk">${escape(e.label)}</a>`:escape(e.label)}</td><td class="num" style="color:${e.delta<0?'var(--neg)':'var(--pos)'}">${e.delta>0?'+':''}${fmt(e.delta,1)} ${_t("г")}<div><small>${e.delta>0?'+':''}${fmt(toM(s,e.delta),1)} ${_t("м")}</small></div></td><td class="num">${fmt(e.after,0)} ${_t("г")}</td><td>${e.op?`<button class="iconbtn danger" data-delop="${escape(e.op)}" title="${_t("Отменить корректировку")}">×</button>`:''}</td></tr>`).join('')+`<tr><td>${escape(s.purchased||s.createdAt.slice(0,10))}</td><td>${_t("Новая катушка")}</td><td class="num">+${fmt(s.net,0)} ${_t("г")}</td><td class="num">${fmt(s.net,0)} ${_t("г")}</td><td></td></tr>`}
function renderRating(){const s=spool();if(!s)return;
  $('spStars').innerHTML=[1,2,3,4,5].map(n=>`<button type="button" class="star${n<=s.rating?' on':''}" data-rate="${n}" title="${['',_t('Плохо'),_t('Слабо'),_t('Нормально'),_t('Хорошо'),_t('Отлично')][n]}" aria-label="${n} ${_t("из 5")}">★</button>`).join('')+`<span class="muted">${s.rating?['',_t('Плохо'),_t('Слабо'),_t('Нормально'),_t('Хорошо'),_t('Отлично')][s.rating]:_t('не оценена')}</span>`;
  $('spRtags').innerHTML=Object.entries(RTAGS).map(([k,[sg,n]])=>`<button type="button" class="rtag ${sg==='+'?'pos':'neg'}${s.rtags.includes(k)?' on':''}" data-rtag="${k}">${sg} ${escape(n)}</button>`).join('');
  const ps=db.prints.filter(p=>p.usage.some(u=>u.spoolId===s.id)),f=ps.filter(p=>p.result==='fail').length;
  $('spRateStat').textContent=ps.length?`${_t("По журналу: печатей с этой катушкой")} ${ps.length}, ${_t("неудачных")} ${f} (${fmt(f/ps.length*100,0)}%).`:_t('Печатей с этой катушкой в журнале пока нет.')}
function updateCorrHint(){const s=spool();if(!s)return;const v=number($('corrVal').value),u=$('corrUnit').value;$('corrHint').textContent=v?(u==='m'?`${fmt(v,1)} ${_t("м ≈")} ${fmt(v*gPerM(s),1)} ${_t("г")}`:`${fmt(v,1)} ${_t("г ≈")} ${fmt(toM(s,v),1)} ${_t("м")}`):''}
function addOp(s,type,grams,note){s.ops.push({id:shortId(),at:now(),date:today(),type,grams:Math.max(0,grams),note});if(s.status==='sealed'&&type!=='add')s.status='open';const r=spoolState(s).remaining;if(r<=0&&s.status!=='empty'&&confirm(_t('Остаток 0 — отметить катушку как закончившуюся?')))s.status='empty';persist();renderSpool();renderSpools()}
function newSpool(from,tpl){const s=normSpool(from?{...structuredClone(from),id:'',bambu:'',ops:[],createdAt:'',status:'sealed',opened:'',dried:''}:{materialId:tpl?.materialId||db.materials[0]?.id,diameter:tpl?.diameter,net:tpl?.net,purchased:today()});db.spools.unshift(s);persist();renderSpools();go('spool/'+s.id)}


function afterColor(full){renderColorChips();if(full)renderColorEdit();renderSpoolHead();renderSpoolRem();schedulePersist();renderSpools()}
$('spColors').onclick=e=>{const b=e.target.closest('[data-ci]'),s=spool();if(!b||!s)return;const c=db.lib.colors[+b.dataset.ci];setSpoolColor(s,c.name,c.stops);afterColor(true)};
$('spColorEdit').addEventListener('input',e=>{const s=spool(),el=e.target;if(!s||el.dataset.stop===undefined)return;const st=spStops(s).slice();st[+el.dataset.stop]=el.value;setSpoolColor(s,s.color,st);afterColor(false)});
$('spColorEdit').addEventListener('click',e=>{const b=e.target.closest('button'),s=spool();if(!b||!s)return;
  if(b.dataset.stopadd!==undefined){const st=spStops(s).slice();st.push(st.at(-1));setSpoolColor(s,s.color,st);afterColor(true)}
  else if(b.dataset.stopdel!==undefined){const st=spStops(s).slice();st.splice(+b.dataset.stopdel,1);setSpoolColor(s,s.color,st);afterColor(true)}
  else if(b.id==='spColorSave'){const n=s.color.trim();if(!n){alert(_t('Введите название цвета'));$('spColorEdit').querySelector('[data-sf="color"]').focus();return}const st=spStops(s).slice(),ex=db.lib.colors.find(c=>ieq(c.name,n));
    if(ex){if(!confirm(`${_t("Цвет")} «${ex.name}» ${_t("уже есть в палитре. Заменить его оттенки")}?`))return;ex.stops=st}else db.lib.colors.push({name:n,stops:st});persist();renderColorChips();renderLibs();setStatus(_t('Цвет сохранён в палитру'))}});
$('page-spool').addEventListener('click',e=>{const s=spool();if(!s)return;const r=e.target.closest('[data-rate],[data-rtag]');
  if(r){if(r.dataset.rate){const n=+r.dataset.rate;s.rating=s.rating===n?0:n}else{const k=r.dataset.rtag;s.rtags=s.rtags.includes(k)?s.rtags.filter(x=>x!==k):[...s.rtags,k]}renderRating();schedulePersist();renderSpools();return}
  const b=e.target.closest('[data-qf]');if(!b)return;const k=b.dataset.qf;s[k]=b.dataset.v;$('page-spool').querySelector(`[data-sf="${k}"]`).value=s[k];renderQuick();renderSpoolHead();schedulePersist();renderSpools()});
$('page-spool').addEventListener('change',e=>{const s=spool(),k=e.target.dataset.sf;if(!s||!['series','store','brand'].includes(k))return;libAbsorb(s,db.lib,k);renderQuick();renderLibs();schedulePersist()});
$('spoolAdd').onclick=()=>newSpool();
let spoolView=lsGet('p2s_spool_view2','cards');
$('spoolSearch').oninput=renderSpools;$('spoolFilter').onchange=renderSpools;$('spoolMat').onchange=renderSpools;$('spoolBrand').onchange=renderSpools;
segInit('spoolView',spoolView,v=>{spoolView=v;lsSet('p2s_spool_view2',v);renderSpools()});
$('spoolCards').addEventListener('click',e=>{const c=e.target.closest('[data-spool]');if(c)go('spool/'+c.dataset.spool)});
$('spoolCards').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('.scard'))go('spool/'+e.target.dataset.spool)});
try{const v=JSON.parse(localStorage.getItem('p2s_spool_view')||'{}');if(v.sort)$('spoolSort').value=v.sort;if(v.group)$('spoolGroup').value=v.group}catch{}
const saveSpoolView=()=>{try{localStorage.setItem('p2s_spool_view',JSON.stringify({sort:$('spoolSort').value,group:$('spoolGroup').value}))}catch{}renderSpools()};
$('spoolSort').onchange=saveSpoolView;$('spoolGroup').onchange=saveSpoolView;
$('spoolRows').onclick=e=>{const g=e.target.closest('[data-sgrp]');if(g){const set=new Set(($('spoolRows').dataset.closed||'').split(',').filter(Boolean)),k=g.dataset.sgrp;set.has(k)?set.delete(k):set.add(k);$('spoolRows').dataset.closed=[...set].join(',');renderSpools();return}const tr=e.target.closest('[data-spool]');if(tr)go('spool/'+tr.dataset.spool)};
$('page-spool').addEventListener('input',e=>{const s=spool(),el=e.target,k=el.dataset.sf;if(!s||!k)return;
  if(k==='brand'&&el.value==='__add'){const n=(prompt(_t('Название производителя:'))||'').trim();if(n){let b=libBrand(n);if(!b)db.lib.brands.push(b={name:n,series:[]});s.brand=b.name}el.innerHTML=brandOptions(s.brand);persist();renderSpoolHead();renderQuick();renderLibs();return}
  s[k]=['net','price','diameter'].includes(k)?number(el.value):k==='empty'?(el.value===''?'':number(el.value)):el.value;
  if(k==='status'&&el.value==='open'&&!s.opened){s.opened=today();$('page-spool').querySelector('[data-sf="opened"]').value=s.opened}
  if(k==='color')renderColorChips();if(k==='brand'||k==='series'||k==='store')renderQuick();
  schedulePersist();renderSpoolHead();if(!['notes','store','purchased','opened','dried'].includes(k))renderSpoolRem()});
$('corrVal').oninput=updateCorrHint;$('corrUnit').onchange=updateCorrHint;
$('corrApply').onclick=()=>{const s=spool(),v=number($('corrVal').value);if(!s)return;if(!v&&$('corrMode').value!=='set'){alert(_t('Введите значение'));return}const g=$('corrUnit').value==='m'?v*gPerM(s):v;const u=$('corrUnit').value==='m'?` (${fmt(v,1)} ${_t("м")})`:'',note=($('corrNote').value.trim()+u).trim();$('corrVal').value='';$('corrNote').value='';addOp(s,$('corrMode').value,g,note);setStatus(_t('Остаток обновлён'))};
$('weighApply').onclick=()=>{const s=spool(),gross=number($('weighGross').value);if(!s)return;if(!gross){alert(_t('Введите вес катушки на весах'));return}if(s.empty===''){alert(_t('Сначала нужен вес пустой катушки — см. подсказку ниже'));return}const r=gross-number(s.empty);if(r<0){alert(_t('Вес на весах меньше веса пустой катушки — проверьте числа'));return}$('weighGross').value='';addOp(s,'set',r,`${_t("взвешивание, брутто")} ${fmt(gross,0)} ${_t("г")}`);setStatus(_t('Остаток пересчитан по весу'))};
$('weighNew').onclick=()=>{const s=spool(),gross=number($('weighGross').value);if(!s)return;if(!gross){alert(_t('Введите вес катушки на весах'));return}const e=gross-number(s.net);if(e<=0){alert(_t('Брутто меньше веса филамента — проверьте вес нетто'));return}if(spoolState(s).used>0&&!confirm(_t('По катушке уже есть списания. Всё равно считать её полной?')))return;s.empty=Math.round(e);persist();renderSpool();setStatus(`${_t("Вес пустой катушки")}: ${fmt(s.empty,0)} ${_t("г")}`)};
$('weighHint').onclick=e=>{const v=e.target.dataset.useempty;if(v===undefined)return;const s=spool();s.empty=number(v);persist();renderSpool()};
$('spHist').onclick=e=>{const id=e.target.dataset.delop;if(!id)return;const s=spool();if(!confirm(_t('Отменить эту корректировку?')))return;s.ops=s.ops.filter(o=>o.id!==id);persist();renderSpool();renderSpools()};
$('spNew').onclick=()=>{const s=spool();newSpool(null,s);setStatus(_t('Новая катушка — заполните параметры'))};
$('spDup').onclick=()=>{const s=spool();if(s){newSpool(s);setStatus(_t('Создана копия катушки'))}};
$('spDel').onclick=()=>{const s=spool();if(!s)return;const used=db.prints.some(p=>p.usage.some(u=>u.spoolId===s.id))||db.items.some(i=>i.prototypes.some(p=>p.spoolId===s.id));if(!confirm(used?_t('Катушка упоминается в журнале печати — записи останутся без катушки. Удалить?'):_t('Удалить катушку?')))return;db.spools=db.spools.filter(x=>x!==s);persist();renderSpools();go('spools')};

/* ================= Справочники катушек: производители и серии, магазины, цвета ================= */
const DEFAULT_BRANDS=[['Bambu Lab',['PLA Basic','PLA Matte','PLA Silk+','PLA Translucent','PLA-CF','PETG HF','PETG Translucent','ABS','ASA','TPU 95A HF','Support for PLA/PETG']],
  ['Polymaker',['PolyTerra PLA','PolyLite PLA','PolyLite PETG','PolyMax PLA','Panchroma Silk']],['eSUN',['PLA+','PLA Matte','eSilk PLA','PETG','ABS+','eTPU-95A']],
  ['Creality',['Hyper PLA','CR-PLA','CR-Silk','Hyper PETG','CR-PETG']],['Elegoo',['PLA','PLA+','PLA Matte','Rapid PETG']],['SUNLU',['PLA','PLA+','PLA Matte','Silk PLA','PETG']],
  ['Prusament',['PLA','PETG','ASA']],['Anycubic',['PLA','PLA+','PETG']],['JAYO',['PLA','PLA+','Silk PLA','PETG']],['Kingroon',['PLA','PETG']],['ERYONE',['PLA','Silk PLA','PETG']],
  ['Overture',['PLA','PLA+','PETG']],['Geeetech',['PLA','PETG']],['Bestfilament',['PLA','PETG','ABS','Watson',_t('Рубин')]],['REC',['PLA','PETG','ABS','Rubber']],
  ['U3Print',['PLA','PETG','HP PLA']],['FDplast',['PLA','PETG','ABS']],['Fiberlab',['PLA','PETG']]];
const DEFAULT_STORES=['Ozon','Wildberries',_t('Яндекс Маркет'),'AliExpress',_t('Официальный сайт')];
const DEFAULT_COLORS=[[_t('Белый'),['#f5f5f5']],[_t('Чёрный'),['#1b1b1b']],[_t('Серый'),['#8a8f98']],[_t('Серебристый'),['#c4c8cf']],[_t('Красный'),['#d32f2f']],[_t('Оранжевый'),['#f57c00']],[_t('Жёлтый'),['#fbc02d']],[_t('Зелёный'),['#2e9e4f']],[_t('Синий'),['#1e5bd8']],[_t('Голубой'),['#4fc3f7']],[_t('Фиолетовый'),['#7b3fb2']],[_t('Розовый'),['#ec6fa6']],[_t('Коричневый'),['#6d4c41']],[_t('Бежевый'),['#d8c3a5']],[_t('Прозрачный'),['#dfe9ee']],
  [_t('Радуга'),['#e53935','#fb8c00','#fdd835','#43a047','#1e88e5','#8e24aa']],[_t('Пастельная радуга'),['#f8bbd0','#ffe0b2','#fff9c4','#c8e6c9','#bbdefb','#e1bee7']],[_t('Неоновая радуга'),['#ff1744','#ffea00','#00e676','#00e5ff','#d500f9']],
  [_t('Закат'),['#ff7043','#ec407a','#7e57c2']],[_t('Океан'),['#00bcd4','#1e88e5','#3949ab']],[_t('Золото / серебро (dual silk)'),['#d4af37','#c0c4cc']],[_t('Красный / синий (dual)'),['#d32f2f','#1e5bd8']],[_t('Хамелеон'),['#2e7d32','#6a1b9a','#1565c0']]];
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
function brandOptions(sel){const list=db.lib.brands.map(b=>b.name);if(sel&&!list.some(b=>b===sel))list.push(sel);return _t('<option value="">— не указан —</option>')+list.map(b=>`<option${b===sel?' selected':''}>${escape(b)}</option>`).join('')+_t('<option value="__add">＋ Добавить производителя…</option>')}
function renderColorChips(){const s=spool();if(!s)return;$('spColors').innerHTML=db.lib.colors.map((c,i)=>{const on=ieq(s.color,c.name);return`<button type="button" class="cchip${on?' on':''}" data-ci="${i}" title="${escape(c.name)}${c.stops.length>1?_t(' — многоцветный'):''}"><span class="swatch sm" style="background:${gradCss(c.stops)}"></span>${escape(c.name)}</button>`}).join('')}
function renderColorEdit(){const s=spool();if(!s)return;const st=spStops(s);
  $('spColorEdit').innerHTML=`<input data-sf="color" value="${escape(s.color)}" placeholder="${_t("Название цвета")}"><span class="stops">${st.map((h,i)=>`<span class="stop"><input type="color" data-stop="${i}" value="${escape(h)}" title="${_t("Оттенок")} ${i+1}">${st.length>1?`<button type="button" class="linkbtn" data-stopdel="${i}" title="${_t("Убрать оттенок")}">×</button>`:''}</span>`).join('')}${st.length<8?`<button type="button" class="secondary small" data-stopadd title="${_t("Многоцветный / радужный филамент: добавьте оттенки")}">+ ${_t("оттенок")}</button>`:''}</span><button type="button" class="secondary small" id="spColorSave">${_t("В палитру")}</button>`}
function renderQuick(){const s=spool();if(!s)return;const b=libBrand(s.brand),ser=b?b.series:[];
  $('spSeriesQ').innerHTML=ser.map(v=>`<button type="button" class="qchip${ieq(v,s.series)?' on':''}" data-qf="series" data-v="${escape(v)}">${escape(v)}</button>`).join('')||(s.brand?_t('<span class="muted">Серий пока нет — введите, она запомнится</span>'):_t('<span class="muted">Выберите производителя — появятся его серии</span>'));
  $('spStoreQ').innerHTML=db.lib.stores.map(v=>`<button type="button" class="qchip${ieq(v,s.store)?' on':''}" data-qf="store" data-v="${escape(v)}">${escape(v)}</button>`).join('');
  $('dlSeries').innerHTML=ser.map(v=>`<option value="${escape(v)}">`).join('');$('dlStores').innerHTML=db.lib.stores.map(v=>`<option value="${escape(v)}">`).join('')}
function setSpoolColor(s,name,stops){s.color=name;s.colorHex=stops[0];s.colorStops=stops.length>1?stops.slice():[];}

/* --- Настройки → справочники --- */
function renderLibs(){const L=db.lib,cnt=k=>v=>db.spools.filter(s=>ieq(s[k],v)).length,bc=cnt('brand'),cc=cnt('color');
  $('libBrands').innerHTML=L.brands.map((b,i)=>`<div class="librow"><input class="libname" data-bname="${i}" value="${escape(b.name)}" title="${_t("Переименование применится ко всем катушкам")}"><div class="chips">${b.series.map((v,j)=>`<span class="tagchip">${escape(v)}<button class="linkbtn" data-sdel="${i}:${j}" title="${_t("Удалить серию")}">×</button></span>`).join('')}<input class="libadd" data-sadd="${i}" placeholder="+ ${_t("серия, Enter")}"></div><button class="iconbtn danger" data-bdel="${i}" title="${bc(b.name)?_t('Используется в катушках: ')+bc(b.name):_t('Удалить производителя')}">×</button></div>`).join('');
  $('libStores').innerHTML=L.stores.map((v,i)=>`<span class="tagchip">${escape(v)}<button class="linkbtn" data-stdel="${i}" title="${_t("Удалить")}">×</button></span>`).join('')+_t('<input class="libadd" id="libStoreAdd" placeholder="+ магазин, Enter">');
  $('libColors').innerHTML=L.colors.map((c,i)=>`<div class="librow colrow"><span class="swatch" style="background:${gradCss(c.stops)}"></span><input class="libname" data-cname="${i}" value="${escape(c.name)}" title="${_t("Переименование применится к катушкам этого цвета")}"><span class="stops">${c.stops.map((h,j)=>`<span class="stop"><input type="color" data-cstop="${i}:${j}" value="${h}">${c.stops.length>1?`<button class="linkbtn" data-cstopdel="${i}:${j}" title="${_t("Убрать оттенок")}">×</button>`:''}</span>`).join('')}${c.stops.length<8?`<button class="secondary small" data-cstopadd="${i}" title="${_t("Добавить оттенок — получится многоцветный (радужный) цвет")}">+ ${_t("оттенок")}</button>`:''}</span><span class="muted">${cc(c.name)?_t('катушек: ')+cc(c.name):''}</span><button class="iconbtn danger" data-cdel="${i}" title="${_t("Удалить цвет из палитры")}">×</button></div>`).join('')}
function libChanged(){persist();renderLibs();renderSpools();if(currentPage==='spool'){renderSpool()}}
const libPanel=$('libPanel');
libPanel.addEventListener('change',e=>{const el=e.target,L=db.lib;
  if(el.dataset.bname!==undefined){const b=L.brands[+el.dataset.bname],v=el.value.trim();if(!v){el.value=b.name;return}if(L.brands.some(x=>x!==b&&ieq(x.name,v))){alert(_t('Такой производитель уже есть'));el.value=b.name;return}db.spools.forEach(s=>{if(ieq(s.brand,b.name))s.brand=v});b.name=v;libChanged()}
  else if(el.dataset.cname!==undefined){const c=L.colors[+el.dataset.cname],v=el.value.trim();if(!v){el.value=c.name;return}if(L.colors.some(x=>x!==c&&ieq(x.name,v))){alert(_t('Такой цвет уже есть'));el.value=c.name;return}db.spools.forEach(s=>{if(ieq(s.color,c.name))s.color=v});c.name=v;libChanged()}
  else if(el.dataset.cstop!==undefined){const [i,j]=el.dataset.cstop.split(':').map(Number),c=L.colors[i];c.stops[j]=el.value;db.spools.forEach(s=>{if(ieq(s.color,c.name))setSpoolColor(s,s.color,c.stops)});libChanged()}});
libPanel.addEventListener('input',e=>{const el=e.target;if(el.dataset.cstop===undefined)return;const [i,j]=el.dataset.cstop.split(':').map(Number);el.closest('.colrow').querySelector('.swatch').style.background=gradCss(db.lib.colors[i].stops.map((h,k)=>k===j?el.value:h))});
libPanel.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const el=e.target,v=el.value.trim(),L=db.lib;if(!v)return;
  if(el.dataset.sadd!==undefined){const b=L.brands[+el.dataset.sadd];if(!b.series.some(x=>ieq(x,v)))b.series.push(v)}
  else if(el.id==='libStoreAdd'){if(!L.stores.some(x=>ieq(x,v)))L.stores.push(v)}
  else if(el.id==='libBrandAdd'){if(L.brands.some(x=>ieq(x.name,v))){alert(_t('Такой производитель уже есть'));return}L.brands.push({name:v,series:[]});el.value=''}
  else if(el.id==='libColorAdd'){if(L.colors.some(x=>ieq(x.name,v))){alert(_t('Такой цвет уже есть'));return}L.colors.push({name:v,stops:['#888888']});el.value=''}
  else return;
  e.preventDefault();const id=el.id||'';libChanged();if(id)$(id)?.focus();else libPanel.querySelector(`[data-sadd="${el.dataset.sadd}"]`)?.focus()});
libPanel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset,L=db.lib;
  if(d.sdel){const [i,j]=d.sdel.split(':').map(Number);L.brands[i].series.splice(j,1)}
  else if(d.bdel!==undefined){const br=L.brands[+d.bdel],n=db.spools.filter(s=>ieq(s.brand,br.name)).length;if(!confirm(n?`${_t("Производитель")} «${br.name}» ${_t("указан у")} ${n} ${_t("катушек — у них он останется, но пропадёт из списка. Удалить")}?`:`${_t("Удалить")} «${br.name}» ${_t("со всеми сериями")}?`))return;L.brands.splice(+d.bdel,1)}
  else if(d.stdel!==undefined){L.stores.splice(+d.stdel,1)}
  else if(d.cdel!==undefined){const c=L.colors[+d.cdel];if(!confirm(`${_t("Удалить")} «${c.name}» ${_t("из палитры? У катушек цвет сохранится")}.`))return;L.colors.splice(+d.cdel,1)}
  else if(d.cstopadd!==undefined){const c=L.colors[+d.cstopadd];c.stops.push(c.stops.at(-1));db.spools.forEach(s=>{if(ieq(s.color,c.name))setSpoolColor(s,s.color,c.stops)})}
  else if(d.cstopdel){const [i,j]=d.cstopdel.split(':').map(Number),c=L.colors[i];c.stops.splice(j,1);db.spools.forEach(s=>{if(ieq(s.color,c.name))setSpoolColor(s,s.color,c.stops)})}
  else if(b.id==='libBrandAddBtn'){const el=$('libBrandAdd');el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return}
  else if(b.id==='libColorAddBtn'){const el=$('libColorAdd');el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));return}
  else if(b.id==='libReset'){if(!confirm(_t('Добавить в справочники стандартных производителей, серии, магазины и цвета, которых сейчас нет? Ваши записи останутся.')))return;
    for(const [n,s] of DEFAULT_BRANDS){let x=L.brands.find(y=>ieq(y.name,n));if(!x)L.brands.push(x={name:n,series:[]});for(const v of s)if(!x.series.some(y=>ieq(y,v)))x.series.push(v)}
    for(const v of DEFAULT_STORES)if(!L.stores.some(y=>ieq(y,v)))L.stores.push(v);for(const [n,s] of DEFAULT_COLORS)if(!L.colors.some(y=>ieq(y.name,n)))L.colors.push({name:n,stops:[...s]})}
  else return;
  libChanged()});


/* ================= Выпадающий список катушек с цветом =================
   Обёртка над обычным <select>: select остаётся в DOM (скрыт) и хранит значение,
   поэтому остальной код читает select.value как раньше. */
function spickLabel(id){const s=getSpool(id);if(!s)return _t('<span class="swatch sm empty"></span><span class="spick-t muted">— не списывать —</span>');const r=spoolState(s).remaining;return`${swatch(s,'sm')}<span class="spick-t">${escape(spName(s))}</span><span class="spick-r">${fmt(r,0)} ${_t("г")}</span>`}
function spoolPick(sel){if(sel.dataset.spick)return;sel.dataset.spick='1';const wrap=document.createElement('div');wrap.className='spick';sel.before(wrap);wrap.append(sel);sel.hidden=true;
  const btn=document.createElement('button');btn.type='button';btn.className='spick-btn';btn.setAttribute('aria-haspopup','listbox');btn.setAttribute('aria-expanded','false');wrap.append(btn);
  const draw=()=>{btn.innerHTML=spickLabel(sel.value)+'<span class="spick-caret">▾</span>';btn.title=btn.textContent.replace('▾','').trim()};draw();
  btn.onclick=()=>spickOpen&&spickOpen.btn===btn?closeSpick():openSpick(btn,sel,draw);
  btn.onkeydown=e=>{if(!spickOpen&&['ArrowDown','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();openSpick(btn,sel,draw)}}}
let spickOpen=null;
function closeSpick(){if(!spickOpen)return;spickOpen.list.remove();spickOpen.btn.setAttribute('aria-expanded','false');spickOpen=null}
function openSpick(btn,sel,draw){closeSpick();const opts=[...sel.options],low=number(db.settings.lowStock);
  const list=document.createElement('div');list.className='spick-list';list.setAttribute('role','listbox');
  list.innerHTML=opts.map((o,i)=>{const s=getSpool(o.value),r=s?spoolState(s).remaining:0;return`<div class="spick-opt${o.value===sel.value?' on':''}" role="option" data-i="${i}">${s?`${swatch(s)}<span class="spick-main"><b>${escape(spName(s))}</b><small>${escape(getMat(s.materialId).name)} · ${SPOOL_ST[s.status]}${s.store?' · '+escape(s.store):''}</small></span><span class="spick-r${s.status!=='empty'&&r<low?' low':''}">${fmt(r,0)} ${_t("г")}<small>≈ ${fmt(toM(s,r),0)} ${_t("м")}</small></span>`:_t('<span class="swatch empty"></span><span class="spick-main"><b>Не списывать</b><small>печать запишется без катушки</small></span>')}</div>`}).join('')+(opts.length<2?_t('<div class="spick-none">Нет катушек этого материала — добавьте в разделе «Катушки»</div>'):'');
  document.body.append(list);btn.setAttribute('aria-expanded','true');
  const place=()=>{const r=btn.getBoundingClientRect(),w=Math.max(r.width,320),below=innerHeight-r.bottom;list.style.width=Math.min(w,innerWidth-16)+'px';list.style.left=Math.max(8,Math.min(r.left,innerWidth-Math.min(w,innerWidth-16)-8))+'px';
    if(below<280&&r.top>below){list.style.top='';list.style.bottom=(innerHeight-r.top+4)+'px';list.style.maxHeight=Math.min(340,r.top-12)+'px'}else{list.style.bottom='';list.style.top=(r.bottom+4)+'px';list.style.maxHeight=Math.min(340,below-12)+'px'}};
  place();let act=Math.max(0,opts.findIndex(o=>o.value===sel.value));
  const hi=()=>{list.querySelectorAll('.spick-opt').forEach((el,i)=>el.classList.toggle('act',i===act));list.querySelector('.spick-opt.act')?.scrollIntoView({block:'nearest'})};hi();
  const choose=i=>{if(sel.value!==opts[i].value){sel.value=opts[i].value;sel.dispatchEvent(new Event('input',{bubbles:true}));sel.dispatchEvent(new Event('change',{bubbles:true}))}draw();closeSpick();btn.focus()};
  list.onmousedown=e=>e.preventDefault();list.onclick=e=>{const o=e.target.closest('.spick-opt');if(o)choose(+o.dataset.i)};
  list.onmousemove=e=>{const o=e.target.closest('.spick-opt');if(o&&+o.dataset.i!==act){act=+o.dataset.i;hi()}};
  spickOpen={list,btn,key:e=>{if(e.key==='Escape'){e.preventDefault();closeSpick();btn.focus()}else if(e.key==='ArrowDown'){e.preventDefault();act=Math.min(opts.length-1,act+1);hi()}else if(e.key==='ArrowUp'){e.preventDefault();act=Math.max(0,act-1);hi()}else if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(act)}else if(e.key==='Tab')closeSpick()},place}}
document.addEventListener('keydown',e=>{if(spickOpen)spickOpen.key(e)},true);
document.addEventListener('mousedown',e=>{if(spickOpen&&!spickOpen.list.contains(e.target)&&!spickOpen.btn.contains(e.target))closeSpick()});
document.addEventListener('scroll',e=>{if(spickOpen&&!spickOpen.list.contains(e.target))spickOpen.place()},true);
window.addEventListener('resize',closeSpick);

/* ================= Журнал печати ================= */
const MONTHS=[_t('Январь'),_t('Февраль'),_t('Март'),_t('Апрель'),_t('Май'),_t('Июнь'),_t('Июль'),_t('Август'),_t('Сентябрь'),_t('Октябрь'),_t('Ноябрь'),_t('Декабрь')];
const printGrams=p=>p.usage.reduce((a,u)=>a+u.grams,0);
// Себестоимость записи журнала по факту: граммы из списания (цена катушки, иначе цена материала) + время печати × параметры принтера.
// Для старых записей без времени берётся расчётное время изделия × комплекты.
function printHours(p){if(p.hours!=null)return number(p.hours);const it=db.items.find(i=>i.id===p.itemId),pt=p.partId&&it?.parts.find(x=>x.id===p.partId);return pt?number(pt.hours)*p.sets:it?(p.whole?calcTree(it):calcItem(it)).hours*p.sets:0}
function printCalc(p){const it=db.items.find(i=>i.id===p.itemId),P=getPrinter(p.printerId||it?.printerId),h=printHours(p),tariff=number(db.settings.tariff);
  const r={hours:h,grams:0,plastic:0,byMat:{},printer:P};
  for(const u of p.usage){const s=getSpool(u.spoolId),mid=u.materialId||s?.materialId||'',g=number(u.grams),pr=s&&s.price&&number(s.net)?s.price/number(s.net):number(getMat(mid).price)/1000,c=g*pr;r.grams+=g;r.plastic+=c;const b=r.byMat[mid]??={grams:0,cost:0};b.grams+=g;b.cost+=c}
  r.power=h*number(P.watts)/1000*tariff;r.depreciation=h*amortH(P);r.maintenance=h*number(P.maintenance);r.total=r.plastic+r.power+r.depreciation+r.maintenance;return r}
function printCost(p){return printCalc(p).total}
function printCostOld(p){const it=db.items.find(i=>i.id===p.itemId);if(!it)return null;const c=calcItem({...it,printerId:p.printerId||it.printerId});return c.total*p.sets}
function logSummary(list){let g=0,cost=0,hours=0,failCost=0;for(const p of list){const c=printCalc(p);g+=c.grams;cost+=c.total;hours+=c.hours;if(p.result==='fail')failCost+=c.total}const fails=list.filter(p=>p.result==='fail').length,sets=list.filter(p=>p.result==='ok').reduce((a,p)=>a+(p.partId?0:p.sets),0);return{n:list.length,g,fails,sets,cost,hours,failCost}}
let logView=lsGet('p2s_log_view2','timeline');
const WD=[_t('вс'),_t('пн'),_t('вт'),_t('ср'),_t('чт'),_t('пт'),_t('сб')];
const dayTitle=d=>{const x=new Date(d+'T12:00:00');if(isNaN(x))return d;const t=today(),y=new Date(Date.now()-864e5),ys=y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');return(d===t?_t('Сегодня, '):d===ys?_t('Вчера, '):'')+x.toLocaleDateString(I18N.loc,{day:'numeric',month:'long',year:x.getFullYear()===new Date().getFullYear()?undefined:'numeric'})+', '+WD[x.getDay()]};
// Элемент, к которому привязана печать: {name, gone}. gone — элемент удалён из изделия (название сохранено в записи)
function printPart(p,it=db.items.find(i=>i.id===p.itemId)){if(!p.partId||!it)return null;const pt=it.parts.find(x=>x.id===p.partId);return pt?{name:pt.name,gone:false}:{name:p.partName,gone:true}}
function tlItem(p,inItem){const c=printCalc(p),it=db.items.find(i=>i.id===p.itemId),ok=p.result!=='fail',sp=usageSpools(p);
  const im=printImgSrc(p),pt=printPart(p,it);
  return`<div class="tl-item${im?' has-img':''}">${im?`<div class="tl-img">${imgTag(im)}<span class="ricon ${ok?'ok':'fail'}" title="${ok?_t('Успешно'):_t('Неудачно')}">${ok?'✓':'✕'}</span></div>`:`<span class="ricon ${ok?'ok':'fail'}" title="${ok?_t('Успешно'):_t('Неудачно')}">${ok?'✓':'✕'}</span>`}<div class="tl-main">${inItem?`<b>${dayTitle(p.date)}</b>`:it?`<a href="#item/${escape(it.id)}" class="lnk">${escape(p.itemName||it.name)}</a>`:`<b>${escape(p.itemName||_t('Удалённое изделие'))}</b>`}<div class="tl-meta">${sp.length?`<span>${sp.map(s=>swatch(s,'sm')).join(' ')} ${escape(usageMats(p).map(m=>getMat(m).name).join(' + '))}</span>`:`<span>${escape(usageMats(p).map(m=>getMat(m).name).join(' + ')||_t('без списания'))}</span>`}<span>⏱ ${fmtH(c.hours)}</span><span>${fmt(c.grams,1)} ${_t("г")}</span>${pt?`<span class="pill sp-empty"${pt.gone?_t(' title="Элемент удалён из изделия — печать не входит в напечатанные комплекты"'):''}>◧ ${escape(pt.name||_t('элемент'))}${pt.gone?_t(' (элемент удалён)'):''}${p.sets>1?' × '+p.sets+_t(' шт'):''}</span>`:p.pcs!=null?`<span>× ${p.pcs} ${_t("шт")}</span>`:p.sets>1?`<span>× ${p.sets} ${_t("компл")}.</span>`:''}${p.whole&&it?_t('<span class="pill sp-empty" title="Напечатано изделие вместе со всеми вложенными">▦ вся сборка</span>'):''}${db.printers.length>1?`<span>${escape(c.printer.name)}</span>`:''}</div>${p.note?`<div class="tl-note">${escape(p.note)}</div>`:''}</div><div class="tl-side"><b>${money(c.total)}</b><div class="tl-acts"><button class="secondary" data-editprint="${escape(p.id)}" title="${_t("Изменить дату, результат, время, списание")}">${_t("✎ Изменить")}</button><button class="secondary" data-linkprint="${escape(p.id)}" title="${_t("Привязать к изделию из каталога")}">${_t("⛓ Изделие")}</button><button class="secondary" data-repeat="${escape(p.id)}" title="${_t("Повторить печать с теми же параметрами")}">${_t("↻ Повторить")}</button><button class="iconbtn danger" data-delprint="${escape(p.id)}" title="${_t("Удалить запись (вернёт граммы на катушки")})">×</button></div></div></div>`}
function renderLog(){const q=$('logSearch').value.trim().toLowerCase(),rf=$('logResult').value,multi=db.printers.length>1;
  const all=db.prints.slice().sort((a,b)=>(b.date+b.at).localeCompare(a.date+a.at)),list=all.filter(p=>(!rf||p.result===rf)&&(p.itemName||'').toLowerCase().includes(q));
  const S=logSummary(list);
  $('logSub').textContent=all.length?`${_t("Записей")}: ${S.n}${list.length!==all.length?` ${_t("из")} ${all.length}`:''} · ${_t("успешных комплектов")}: ${S.sets} · ${_t("неудачных")}: ${S.fails} · ${fmtH(S.hours)} · ${fmt(S.g,0)} ${_t("г")} · ${money(S.cost)}`:_t('Каждая печать: что, когда, с каких катушек и сколько стоила');
  $('logEmpty').hidden=list.length>0;$('logEmpty').innerHTML=all.length?_t('Ничего не найдено — измените фильтры.'):_t('<b>Записей пока нет.</b><br>Нажмите «Записать печать» и выберите изделие — пластик спишется с катушек, а себестоимость попадёт в статистику.');
  const tl=logView==='timeline';$('logTimeline').hidden=!tl||!list.length;$('logTableWrap').hidden=tl||!list.length;
  if(tl){let last='';$('logTimeline').innerHTML=list.map(p=>{let hdr='';if(p.date!==last){last=p.date;const day=list.filter(x=>x.date===p.date),s=logSummary(day);hdr=`<div class="tl-day"><b>${dayTitle(p.date)}</b><small>${s.n} ${s.n===1?_t('печать'):s.n<5?_t('печати'):_t('печатей')} · ${money(s.cost)}</small></div>`}return hdr+tlItem(p)}).join('');hydrate($('logTimeline'));return}
  const cols=multi?12:11;$('logHead').innerHTML=LOG_HEAD(true,multi);
  if(logView==='list'){$('logRows').innerHTML=list.map(p=>printRow(p,true)).join('');hydrate($('logRows'));return}
  const key=p=>logView==='year'?p.date.slice(0,4):p.date.slice(0,7),groups=new Map();for(const p of list){const k=key(p);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p)}
  const title=k=>logView==='year'?`${k} ${_t("год")}`:`${MONTHS[+k.slice(5,7)-1]||k} ${k.slice(0,4)}`,closed=new Set(($('logRows').dataset.closed||'').split(',').filter(Boolean));
  $('logRows').innerHTML=[...groups.entries()].map(([k,ps])=>{const s=logSummary(ps),open=!closed.has(k);return`<tr class="grp" data-grp="${k}"><td colspan="${cols}"><span class="caret">${open?'▾':'▸'}</span><b>${title(k)}</b><span class="muted"> · ${_t("записей")} ${s.n} · ${_t("комплектов")} ${s.sets}${s.fails?` · ${_t("неудачных")} ${s.fails}`:''} · ${fmtH(s.hours)} · ${fmt(s.g,0)} ${_t("г")} · ${money(s.cost)}</span></td></tr>`+(open?ps.map(p=>printRow(p,true)).join(''):'')}).join('')}
segInit('logViewSeg',logView,v=>{logView=v;lsSet('p2s_log_view2',v);$('logView').value=v;renderLog()});
$('logSearch').oninput=renderLog;$('logResult').onchange=renderLog;
$('logRows').addEventListener('click',e=>{const g=e.target.closest('[data-grp]');if(!g)return;const set=new Set(($('logRows').dataset.closed||'').split(',').filter(Boolean)),k=g.dataset.grp;set.has(k)?set.delete(k):set.add(k);$('logRows').dataset.closed=[...set].join(',');renderLog()});
$('logTimeline').addEventListener('click',e=>{const id=e.target.closest('[data-delprint]')?.dataset.delprint;if(id)delPrint(id)});
const usageSpools=p=>[...new Set(p.usage.map(u=>u.spoolId).filter(Boolean))].map(getSpool).filter(Boolean);
const usageMats=p=>[...new Set(p.usage.map(u=>u.materialId||getSpool(u.spoolId)?.materialId).filter(Boolean))];
function printRow(p,withItem){const c=printCalc(p),multi=db.printers.length>1,sp=usageSpools(p).map(s=>`<a href="#spool/${escape(s.id)}" class="lnk" title="${escape(spName(s))}">${swatch(s,'sm')} ${escape(spName(s))}</a>`).join('<br>')||_t('<small>не списано</small>');
  return`<tr><td>${escape(p.date)}</td>${multi&&withItem?`<td><small>${escape(db.printers.find(x=>x.id===p.printerId)?.name||'—')}</small></td>`:''}${withItem?`<td>${(im=>im?`<span class="thumb xs">${imgTag(im)}</span>`:'')(printImgSrc(p))}${db.items.some(i=>i.id===p.itemId)?`<a href="#item/${escape(p.itemId)}" class="lnk">${escape(p.itemName)}</a>`:escape(p.itemName||'—')}${(pt=>pt?`<br><small>◧ ${escape(pt.name||_t('элемент'))}${pt.gone?_t(' (элемент удалён)'):''}</small>`:'')(printPart(p))}</td>`:''}<td>${escape(usageMats(p).map(m=>getMat(m).name).join(' + ')||'—')}</td><td class="num">${p.sets}</td><td class="num">${fmtH(c.hours)}</td><td><span class="pill ${p.result==='fail'?'fail':'done'}">${p.result==='fail'?_t('✕ Неудачно'):_t('✓ Успешно')}</span></td><td class="num">${fmt(c.grams,1)} ${_t("г")}</td><td class="num">${money(c.total)}</td><td>${sp}</td><td>${escape(p.note)}</td><td style="white-space:nowrap"><button class="iconbtn" data-editprint="${escape(p.id)}" title="${_t("Изменить запись")}">✎</button> <button class="iconbtn" data-linkprint="${escape(p.id)}" title="${_t("Привязать к изделию")}">⛓</button> <button class="iconbtn" data-repeat="${escape(p.id)}" title="${_t("Повторить печать с теми же параметрами")}">↻</button> <button class="iconbtn danger" data-delprint="${escape(p.id)}" title="${_t("Удалить запись (вернёт граммы на катушки")})">×</button></td></tr>`}
const LOG_HEAD=(withItem,multi)=>`<tr><th>${_t("Дата")}</th>${multi&&withItem?_t('<th>Принтер</th>'):''}${withItem?_t('<th>Изделие</th>'):''}<th>${_t("Материал")}</th><th class="num">${_t("Компл")}.</th><th class="num">${_t("Время")}</th><th>${_t("Результат")}</th><th class="num">${_t("Филамент")}</th><th class="num">${_t("Себестоимость")}</th><th>${_t("Катушки")}</th><th>${_t("Комментарий")}</th><th></th></tr>`;
function repeatPrint(id){const p=db.prints.find(x=>x.id===id);if(!p)return;const low=p.usage.map(u=>getSpool(u.spoolId)).filter(s=>s&&spoolState(s).remaining<number(p.usage.find(u=>u.spoolId===s.id).grams));
  if(!confirm(`${_t("Повторить печать")} «${p.itemName}» ${_t("сегодня с теми же параметрами")}?\n${p.sets>1?p.sets+_t(' компл. · '):''}${fmtH(printHours(p))} · ${fmt(printGrams(p),1)} ${_t("г")}${low.length?`\n\n${_t("⚠ На катушке не хватает пластика")}: ${low.map(spName).join(', ')}`:''}`))return;
  const np=normPrint({...structuredClone(p),id:'',src:'',cover:'',at:now(),date:today(),result:'ok',hours:printHours(p)});db.prints.push(np);persist();renderList();if(currentPage==='item')renderItemPrints();setStatus(_t('Печать повторена и записана'))}
document.addEventListener('click',e=>{const b=e.target.closest('[data-repeat]');if(b){e.preventDefault();repeatPrint(b.dataset.repeat)}});
function delPrint(id){if(!confirm(_t('Удалить запись? Списанные граммы вернутся на катушки.')))return;db.prints=db.prints.filter(p=>p.id!==id);persist();renderList();if(currentPage==='item')renderItemPrints()}
$('logRows').onclick=e=>{const id=e.target.dataset.delprint;if(id)delPrint(id)};

/* --- Редактирование записи журнала: дата, результат, комплекты, время, принтер, комментарий, списание --- */
let pePid='',peUsage=[];
const setPeResult=segInit('peResultSeg','ok',()=>{});
const peResult=()=>$('peResultSeg').querySelector('.on')?.dataset.v==='fail'?'fail':'ok';
function peRead(){$('peRows').querySelectorAll('.perow').forEach(r=>{const u=peUsage[+r.dataset.i];if(!u)return;u.materialId=r.querySelector('[data-pemat]').value;u.spoolId=r.querySelector('[data-pespool]').value;u.grams=number(r.querySelector('[data-peg]').value)})}
function peRender(){const mats=sel=>(db.materials.some(m=>m.id===sel)?'':`<option value="${escape(sel)}" selected>${escape(sel?getMat(sel).name:_t('— материал не указан —'))}</option>`)+db.materials.map(m=>`<option value="${escape(m.id)}"${m.id===sel?' selected':''}>${escape(m.name)}</option>`).join('');
  $('peRows').innerHTML=peUsage.map((u,i)=>`<div class="pfrow perow" data-i="${i}"><select data-pemat aria-label="${_t("Материал")}" title="${escape(u.label||'')}">${mats(u.materialId)}</select><select data-pespool aria-label="${_t("Катушка")}">${spoolOptions(u.materialId,u.spoolId)}</select><label class="inl"><input data-peg type="number" min="0" step="0.1" value="${Math.round(number(u.grams)*10)/10}"> ${_t("г")}<button type="button" class="iconbtn danger" data-pedel="${i}" title="${_t("Убрать строку (граммы вернутся на катушку")})">×</button></label></div>`).join('')||_t('<p class="muted" style="margin:0 0 8px">Списания нет — пластик не учитывается в себестоимости этой записи.</p>');
  $('peRows').querySelectorAll('select[data-pespool]').forEach(spoolPick)}
function openPrintEdit(pid){const p=db.prints.find(x=>x.id===pid);if(!p)return;pePid=pid;const it=db.items.find(i=>i.id===p.itemId),pt=printPart(p,it);
  $('peSub').innerHTML=it?`<a class="lnk" href="#item/${escape(it.id)}">${escape(it.name)}</a>${pt?` · ◧ ${escape(pt.name||_t('элемент'))}${pt.gone?_t(' (элемент удалён)'):''}`:''} · <button type="button" class="linkbtn lnk" data-pelink>${_t("изменить привязку")}</button>`:`${_t("Не привязано к изделию")} · <button type="button" class="linkbtn lnk" data-pelink>${_t("привязать")}</button>`;
  setPeResult(p.result);$('peDate').value=p.date;$('peSets').value=p.sets;$('peHours').value=Math.round(printHours(p)*10000)/10000;syncTin($('peHours').closest('.tin'));
  $('pePrinter').innerHTML=printerOptions(p.printerId,true);$('peNote').value=p.note;$('peName').value=p.itemName;$('peName').closest('label').hidden=!!it;
  $('peHours').dataset.orig=$('peHours').value;
  peUsage=p.usage.map(u=>({...u,materialId:u.materialId||getSpool(u.spoolId)?.materialId||''}));peRender();$('peDlg').showModal()}
$('peRows').addEventListener('change',e=>{if(e.target.matches('[data-pemat]')){peRead();const u=peUsage[+e.target.closest('.perow').dataset.i];if(u){u.spoolId='';peRender()}}});
$('peRows').addEventListener('click',e=>{const b=e.target.closest('[data-pedel]');if(!b)return;peRead();peUsage.splice(+b.dataset.pedel,1);peRender()});
$('peAdd').onclick=()=>{peRead();const last=peUsage[peUsage.length-1];peUsage.push({label:'',materialId:last?.materialId||db.materials[0]?.id||'',spoolId:'',grams:0});peRender()};
$('peClose').onclick=$('peCancel').onclick=()=>$('peDlg').close();
$('peDlg').addEventListener('click',e=>{if(e.target===$('peDlg')){$('peDlg').close();return}if(e.target.closest('[data-pelink]')){$('peDlg').close();openLink(pePid)}else if(e.target.closest('a[href^="#item/"]'))$('peDlg').close()});
$('peSave').onclick=()=>{const p=db.prints.find(x=>x.id===pePid);if(!p)return $('peDlg').close();peRead();
  const date=$('peDate').value;if(!/^\d{4}-\d\d-\d\d$/.test(date)){alert(_t('Укажите дату печати'));return}
  p.date=date;p.result=peResult();p.sets=Math.max(1,Math.round(number($('peSets').value))||1);if($('peHours').value!==$('peHours').dataset.orig)p.hours=Math.max(0,number($('peHours').value));else if(p.hours==null)p.hours=printHours(p);p.printerId=$('pePrinter').value;p.note=$('peNote').value.trim();
  if(!p.itemId)p.itemName=$('peName').value.trim();
  p.usage=peUsage.filter(u=>number(u.grams)>0).map(u=>({label:String(u.label||''),materialId:u.materialId,spoolId:u.spoolId,grams:number(u.grams)}));
  for(const u of p.usage){const s=getSpool(u.spoolId);if(s&&s.status==='sealed'){s.status='open';s.opened||=p.date}}
  persist();renderList();renderSpools();if(currentPage==='item')renderItemPrints();$('peDlg').close();setStatus(_t('Запись журнала изменена'))};
document.addEventListener('click',e=>{const b=e.target.closest('[data-editprint]');if(b){e.preventDefault();e.stopPropagation();openPrintEdit(b.dataset.editprint)}},true);

function renderItemPrints(){const it=item();if(!it)return;$('itTabLogN').textContent=printsOf(it.id).length||'';const list=db.prints.filter(p=>p.itemId===it.id).sort((a,b)=>(b.date+b.at).localeCompare(a.date+a.at));
  const D=itemDone(it),fail=list.filter(p=>p.result==='fail').length,ks=kidsOf(it.id);
  $('itPrintSum').textContent=list.length||D.sets?`${_t("Напечатано комплектов")}: ${D.sets}${D.qty>1?` · ${_t("деталей")}: ${D.pcs} (${_t("по")} ${D.qty} ${_t("в комплекте")})`:''}${ks.length?_t(' · вложенные: ')+ks.map(k=>`${k.name} — ${itemDone(k).sets}`).join(', '):''}${fail?` · ${_t("неудачных печатей")}: ${fail}`:''}`:_t('Ещё не печаталось. Запись спишет пластик с катушек.');
  $('itPrints').innerHTML=list.length?`<div class="timeline" style="margin:0">${list.map(p=>tlItem(p,true)).join('')}</div>`:'';hydrate($('itPrints'))}
let printFormFor=null;
// Строки списания строятся из элементов изделия. keep=true — перестроить с сохранением выбранных катушек и вручную изменённых граммов
function buildPfRows(keep){const it=item();if(!it)return;const prev=new Map();
  if(keep)$('pfRows').querySelectorAll('.pfrow').forEach(r=>{const g=r.querySelector('[data-pfg]');prev.set(r.dataset.key,{mat:r.dataset.mat,spool:r.querySelector('[data-pfspool]').value,grams:g.value,edited:!!g.dataset.edited})});
  const n=Math.max(1,Math.round(number($('pfSets').value))||1),rows=[];
  for(const x of [it,...(pfWhole()?descendants(it):[])]){const p=x.parts[0];if(p)p.filaments.forEach((f,i)=>rows.push({key:x.id+':'+i,label:`${x.name||_t('Изделие')}${p.qty>1?' ×'+p.qty:''}`,materialId:f.materialId,per:number(f.grams)*Math.max(1,p.qty)}))}
  $('pfRows').innerHTML=rows.map(r=>{const pv=prev.get(r.key),same=pv&&pv.mat===r.materialId,{list}=sortedSpools(r.materialId),sp=same?pv.spool:(list[0]?.id||''),edited=same&&pv.edited,g=edited?pv.grams:Math.round(r.per*n*10)/10;
    return`<div class="pfrow" data-key="${escape(r.key)}" data-mat="${escape(r.materialId)}" data-label="${escape(r.label)}"><span>${escape(r.label)} <small>· ${escape(getMat(r.materialId).name)}</small></span><select data-pfspool>${spoolOptions(r.materialId,sp)}</select><label class="inl"><input data-pfg data-per="${r.per}"${edited?' data-edited="1"':''} type="number" min="0" step="0.1" value="${g}"> ${_t("г")}</label></div>`}).join('')+(db.spools.length?'':_t('<p class="muted">Катушек ещё нет — добавьте их в разделе «Катушки», иначе печать запишется без списания.</p>'));
  $('pfRows').querySelectorAll('select[data-pfspool]').forEach(spoolPick)}
// Печать изделия со вложенными: «только это изделие» или «вся сборка» (списание и время — со всеми вложенными)
const pfWhole=()=>$('pfScope').value==='whole'&&!!item()&&kidsOf(item().id).length>0;
const pfCalc=it=>(pfWhole()?calcTree:calcItem)(it);
const setPfScope=segInit('pfScopeSeg','own',v=>{$('pfScope').value=v;const it=item();if(!it)return;if(!pfHoursEdited){const n=Math.max(1,Math.round(number($('pfSets').value))||1);$('pfHours').value=Math.round(pfCalc(it).hours*n*10000)/10000;syncTin($('pfHours').closest('.tin'))}buildPfRows(true)});
function openPrintForm(){const it=item();printFormFor=it.id;pfHoursEdited=false;setPfResult('ok');$('pfResult').value='ok';
  {const ks=kidsOf(it.id).length,v=ks&&!hasProfile(it)?'whole':'own';$('pfScope').value=v;setPfScope(v);$('pfScopeSeg').hidden=!ks;$('pfScopeSeg').querySelector('[data-v="whole"]').textContent=`${_t("Вся сборка")} (+${descendants(it).length} ${_t("влож")}.)`}
  $('pfHours').value=Math.round(pfCalc(it).hours*10000)/10000;syncTin($('pfHours').closest('.tin'));$('pfPrinter').innerHTML=printerOptions(getPrinter(it.printerId).id,false);$('pfDate').value=today();$('pfSets').value=1;$('pfNote').value='';
  buildPfRows(false);$('printForm').hidden=false;$('printStartBtn').hidden=true}
function closePrintForm(){printFormFor=null;$('printForm').hidden=true;$('printStartBtn').hidden=false}
const refreshPrintForm=()=>{if(!$('printForm').hidden)buildPfRows(true)};
let pfHoursEdited=false;
const setPfResult=segInit('pfResultSeg','ok',v=>{$('pfResult').value=v});const _spr=setPfResult;
$('pfHours').addEventListener('input',()=>{pfHoursEdited=true});
$('pfSets').addEventListener('input',()=>{const it=item();if(!it||pfHoursEdited)return;const n=Math.max(1,Math.round(number($('pfSets').value))||1);$('pfHours').value=Math.round(pfCalc(it).hours*n*10000)/10000;syncTin($('pfHours').closest('.tin'))});
$('pfSets').oninput=()=>{const n=Math.max(1,Math.round(number($('pfSets').value))||1);$('pfRows').querySelectorAll('[data-pfg]').forEach(el=>{if(!el.dataset.edited)el.value=Math.round(number(el.dataset.per)*n*10)/10})};
$('pfRows').addEventListener('input',e=>{if(e.target.dataset.pfg!==undefined)e.target.dataset.edited='1'});
function savePrint(){const it=item();const usage=[...$('pfRows').querySelectorAll('.pfrow')].map(r=>({label:r.dataset.label,materialId:r.dataset.mat,spoolId:r.querySelector('[data-pfspool]').value,grams:number(r.querySelector('[data-pfg]').value)})).filter(u=>u.grams>0);
  const p=normPrint({date:$('pfDate').value||today(),itemId:it.id,itemName:it.name,printerId:$('pfPrinter').value,sets:$('pfSets').value,hours:number($('pfHours').value),result:$('pfResult').value,note:$('pfNote').value.trim(),whole:pfWhole(),usage});db.prints.push(p);
  for(const u of usage){const s=getSpool(u.spoolId);if(s&&s.status==='sealed'){s.status='open';s.opened||=p.date}}
  const empty=usage.map(u=>getSpool(u.spoolId)).filter(s=>s&&s.status!=='empty'&&spoolState(s).remaining<=0);
  if(empty.length&&confirm(`${_t("Катушка закончилась")}: ${empty.map(spName).join(', ')}. ${_t("Отметить как закончившуюся")}?`))empty.forEach(s=>s.status='empty');
  closePrintForm();persist();renderList();renderItemPrints();setStatus(`${_t("Печать записана, списано")} ${fmt(usage.filter(u=>u.spoolId).reduce((a,u)=>a+u.grams,0),1)} ${_t("г")}`)}
$('itPrints').onclick=e=>{const id=e.target.closest('[data-delprint]')?.dataset.delprint;if(id)delPrint(id)};


/* ================= Выбор изделия для «Записать печать» ================= */
function lastPrintDate(id){return printsOf(id).reduce((a,p)=>p.date>a?p.date:a,'')}
function renderPick(){const q=$('pickSearch').value.trim().toLowerCase();const list=db.items.filter(x=>(x.name+' '+x.tags.join(' ')).toLowerCase().includes(q)).sort((a,b)=>lastPrintDate(b.id).localeCompare(lastPrintDate(a.id))||(b.updatedAt||'').localeCompare(a.updatedAt||''));
  $('pickList').innerHTML=list.length?list.slice(0,60).map(x=>{const lp=lastPrintDate(x.id);return`<button type="button" class="pick-row" data-pick="${escape(x.id)}"><span class="thumb">${coverImg(x)}</span><span><b>${escape(x.name)}</b><br><small>${escape(itemMaterials(x).map(m=>getMat(m).name).join(' + '))}${lp?_t(' · печаталось ')+lp:''}</small></span><small>${money(calcItem(x).total)}</small></button>`}).join(''):`<div class="empty" style="margin:6px 0">${db.items.length?_t('Ничего не найдено.'):_t('Изделий пока нет.')}<div class="buttons"><button type="button" id="pickNew">+ ${_t("Создать изделие")}</button></div></div>`;hydrate($('pickList'))}
function openPick(){if(!db.items.length){if(confirm(_t('В каталоге пока нет изделий. Создать новое?')))createBlankItem();return}$('pickSearch').value='';renderPick();$('pickDlg').showModal();setTimeout(()=>$('pickSearch').focus(),30)}
$('pickSearch').oninput=renderPick;$('pickClose').onclick=()=>$('pickDlg').close();
$('pickDlg').addEventListener('click',e=>{if(e.target===$('pickDlg')){$('pickDlg').close();return}const b=e.target.closest('[data-pick]');if(b){$('pickDlg').close();openItemPrint(b.dataset.pick)}if(e.target.id==='pickNew'){$('pickDlg').close();createBlankItem()}});
$('pickSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){const b=$('pickList').querySelector('[data-pick]');if(b){e.preventDefault();b.click()}}});
$('logAdd').onclick=openPick;

/* ================= Главная: обзор по журналу печати ================= */
const MONTHS_GEN=[_t('января'),_t('февраля'),_t('марта'),_t('апреля'),_t('мая'),_t('июня'),_t('июля'),_t('августа'),_t('сентября'),_t('октября'),_t('ноября'),_t('декабря')];
let dash=(()=>{const d=new Date();let s={};try{s=JSON.parse(lsGet('p2s_dash','{}'))}catch{}return{type:['month','year','all'].includes(s.type)?s.type:'month',y:d.getFullYear(),m:d.getMonth(),metric:s.metric==='count'?'count':'cost'}})();
const pad2=n=>String(n).padStart(2,'0');
const dashKey=()=>dash.type==='month'?`${dash.y}-${pad2(dash.m+1)}`:dash.type==='year'?String(dash.y):'';
const inDash=p=>!dashKey()||p.date.startsWith(dashKey());
const lc=s=>I18N.lang==='en'?s:s.toLowerCase();
function dashLabel(){return dash.type==='month'?`${MONTHS[dash.m]} ${dash.y}`:dash.type==='year'?(I18N.lang==='en'?String(dash.y):`${dash.y} ${_t("год")}`):_t('Всё время')}
function dashShift(k){if(dash.type==='month'){dash.m+=k;if(dash.m<0){dash.m=11;dash.y--}if(dash.m>11){dash.m=0;dash.y++}}else if(dash.type==='year')dash.y+=k;renderDash()}
const isFuture=()=>{const d=new Date();return dash.type==='month'?(dash.y>d.getFullYear()||dash.y===d.getFullYear()&&dash.m>=d.getMonth()):dash.type==='year'?dash.y>=d.getFullYear():true};
const plural=(n,a,b,c)=>{if(I18N.lang==='en')return n===1?a:b;const m=n%10,h=n%100;return m===1&&h!==11?a:m>=2&&m<=4&&(h<12||h>14)?b:c};
function niceMax(v){if(v<=0)return 1;const p=10**Math.floor(Math.log10(v)),f=v/p;return(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p}
function vChart(cols,metric){// cols: [{label,tip,ok,fail,cost}]
  const val=c=>metric==='cost'?c.cost:c.ok+c.fail,max=niceMax(Math.max(...cols.map(val),0)),yl=[max,max/2,0];
  const fmtY=v=>metric==='cost'?(v>=1000?fmt(v/1000,1)+_t('к'):fmt(v,0)):fmt(v,0);
  const every=cols.length>16?Math.ceil(cols.length/8):1,showX=i=>cols.length>20?(i===0||(i+1)%5===0)&&!(cols.length-i<3&&(i+1)%5!==0):i%every===0;
  return`<div class="vc"><div class="vc-y">${yl.map(v=>`<span>${fmtY(v)}</span>`).join('')}</div><div class="vc-plot"><div class="vc-grid" style="top:0"></div><div class="vc-grid" style="top:50%"></div><div class="vc-cols">${cols.map(c=>{const okH=metric==='cost'?c.cost/max*100:c.ok/max*100,fH=metric==='cost'?0:c.fail/max*100;
    return`<div class="vc-col" tabindex="0" data-tip="${escape(c.tip)}">${fH?`<div class="vc-bar fail" style="height:${fH}%"></div>`:''}${okH?`<div class="vc-bar" style="height:${okH}%"></div>`:''}</div>`}).join('')}</div></div>
  <div class="vc-x">${cols.map((c,i)=>`<span>${showX(i)?escape(c.label):''}</span>`).join('')}</div></div>
  <div class="vc-legend">${metric==='cost'?_t('<span><i style="background:var(--s1)"></i>Себестоимость печатей, ₽</span>'):_t('<span><i style="background:var(--s1)"></i>✓ Успешные</span><span><i style="background:var(--neg)"></i>✕ Неудачные</span>')}</div>`}
function renderDash(){renderDashPrinter();
  $('dType').value=dash.type;$('dLabel').textContent=dashLabel();$('dPrev').disabled=dash.type==='all';$('dNext').disabled=isFuture();
  const list=db.prints.filter(inDash),S={n:list.length,ok:0,fail:0,sets:0,hours:0,grams:0,plastic:0,power:0,depreciation:0,maintenance:0,total:0,failCost:0,items:new Set(),byMat:{}};
  for(const p of list){const c=printCalc(p);if(p.result==='fail'){S.fail++;S.failCost+=c.total}else{S.ok++;S.sets+=p.partId?0:p.sets;S.items.add(p.itemId)}S.hours+=c.hours;S.grams+=c.grams;for(const k of ['plastic','power','depreciation','maintenance','total'])S[k]+=c[k];for(const [m,v] of Object.entries(c.byMat)){const b=S.byMat[m]??={grams:0,cost:0};b.grams+=v.grams;b.cost+=v.cost}}
  $('dashSub').textContent=`${_t("Статистика по журналу печати")} · ${lc(dashLabel())}`;
  const none=!list.length;$('dashBody').hidden=none;$('dashEmpty').hidden=!none;
  $('dashEmpty').innerHTML=db.prints.length?`<b>${_t("За")} ${dash.type==='month'?lc(MONTHS[dash.m])+' '+dash.y:lc(dashLabel())} ${_t("печатей нет")}.</b><br>${_t("Выберите другой период стрелками или запишите печать")}.`:_t('<b>Здесь появится статистика ваших печатей.</b><br>Записывайте каждую печать — успешную или нет: пластик спишется с катушек, а время, расход и себестоимость соберутся здесь по месяцам.<div class="buttons"><button type="button" onclick="document.getElementById(\'qaPrint\').click()">✓ Записать первую печать</button></div>');
  // низкие остатки — всегда
  const low=number(db.settings.lowStock),lows=db.spools.map(s=>({s,r:spoolState(s).remaining})).filter(x=>x.s.status!=='empty'&&x.r<low).sort((a,b)=>a.r-b.r);
  $('dLowPanel').hidden=!lows.length;$('dLow').innerHTML=lows.slice(0,6).map(({s,r})=>`<div class="lowrow" data-spool="${escape(s.id)}">${swatch(s)}<div><b style="color:var(--text)">${escape(spName(s))}</b><div class="muted" style="font-size:12px">${escape(getMat(s.materialId).name)}</div></div><div><span style="color:var(--neg);font-weight:650">${fmt(Math.max(0,r),0)} ${_t("г")}</span> <small class="muted">≈ ${fmt(toM(s,Math.max(0,r)),0)} ${_t("м")}</small>${remBar(s,r)}</div></div>`).join('')+(lows.length>6?`<p class="muted" style="margin:8px 0 0">${_t("И ещё")} ${lows.length-6}…</p>`:'');
  if(none)return;
  const failPct=S.n?S.fail/S.n*100:0;
  const tiles=[
    [_t('Печатей'),`${S.n}`,`✓ ${S.ok} ${_t("успешных · ✕")} ${S.fail} ${_t("неудачных")}`],
    [_t('Напечатано изделий'),`${S.sets}`,`${S.items.size} ${plural(S.items.size,_t('модель'),_t('модели'),_t('моделей'))}`],
    [_t('Время работы принтера'),fmtH(S.hours),S.n?`${_t("в среднем")} ${fmtH(S.hours/S.n)} ${_t("на печать")}`:''],
    [_t('Расход филамента'),S.grams>=1000?fmt(S.grams/1000,2)+_t(' кг'):fmt(S.grams,0)+_t(' г'),Object.entries(S.byMat).sort((a,b)=>b[1].grams-a[1].grams).slice(0,3).map(([m,v])=>`${getMat(m).name} ${fmt(v.grams,0)} ${_t("г")}`).join(' · ')],
    [_t('Себестоимость'),money(S.total),S.n?`${_t("в среднем")} ${money(S.total/S.n)} ${_t("на печать")}`:''],
    [_t('Брак'),`${fmt(failPct,0)}%`,S.fail?`${_t("потеряно")} ${money(S.failCost)}`:_t('неудачных печатей нет'),S.fail?'kpi-fail':'']];
  $('dashKpi').innerHTML=tiles.map(([l,v,s,cls])=>`<div class="stat ${cls||''}"><span class="muted">${l}</span><strong>${v}</strong>${s?`<small>${escape(s)}</small>`:''}</div>`).join('');
  // график по дням / месяцам
  let cols=[];
  if(dash.type==='month'){const n=new Date(dash.y,dash.m+1,0).getDate();cols=Array.from({length:n},(_,i)=>({key:`${dash.y}-${pad2(dash.m+1)}-${pad2(i+1)}`,label:String(i+1),title:`${i+1} ${MONTHS_GEN[dash.m]}`}));$('dChartTitle').textContent=_t('По дням')}
  else if(dash.type==='year'){cols=MONTHS.map((m,i)=>({key:`${dash.y}-${pad2(i+1)}`,label:m.slice(0,3),title:`${m} ${dash.y}`}));$('dChartTitle').textContent=_t('По месяцам')}
  else{const ks=[...new Set(db.prints.map(p=>p.date.slice(0,7)))].sort().slice(-24);if(ks.length){let [y,m]=ks[0].split('-').map(Number);const [ey,em]=ks.at(-1).split('-').map(Number);while(y<ey||y===ey&&m<=em){cols.push({key:`${y}-${pad2(m)}`,label:`${MONTHS[m-1].slice(0,3)}${m===1||!cols.length?' '+String(y).slice(2):''}`,title:`${MONTHS[m-1]} ${y}`});m++;if(m>12){m=1;y++}}}$('dChartTitle').textContent=_t('По месяцам')}
  for(const c of cols){const ps=list.filter(p=>p.date.startsWith(c.key));c.ok=ps.filter(p=>p.result!=='fail').length;c.fail=ps.length-c.ok;c.cost=ps.reduce((a,p)=>a+printCalc(p).total,0);c.tip=`<b>${c.title}</b><br>${ps.length?`${_t("Печатей")}: ${ps.length}${c.fail?` (✕ ${c.fail})`:''}<br>${_t("Себестоимость")}: ${money(c.cost)}<br>${_t("Филамент")}: ${fmt(ps.reduce((a,p)=>a+printGrams(p),0),0)} ${_t("г")}`:_t('Печатей нет')}`}
  $('dChart').innerHTML=vChart(cols,dash.metric);
  // структура затрат
  const cats=PARTS.filter(([k])=>k!=='extra').map(([k,n,col])=>({n,col,v:S[k]})),tot=cats.reduce((a,c)=>a+c.v,0);
  $('dCats').innerHTML=`<div class="hstack" role="img" aria-label="${_t("Структура затрат")}">${cats.filter(c=>c.v>0).map(c=>`<span style="flex:${c.v};background:${c.col}" data-tip="${escape(`<b>${c.n}</b><br>${money(c.v)} · ${fmt(tot?c.v/tot*100:0,0)}%`)}"></span>`).join('')}</div>`
    +cats.map(c=>`<div class="lg-row"><i style="background:${c.col}"></i><span>${c.n}</span><b>${money(c.v)}</b><small>${fmt(tot?c.v/tot*100:0,0)}%</small></div>`).join('')+`<div class="lg-row" style="border-top:1px solid var(--input-line)"><i></i><b>${_t("Итого")}</b><b>${money(tot)}</b><small></small></div>`;
  // филамент по материалам
  const mats=Object.entries(S.byMat).sort((a,b)=>b[1].grams-a[1].grams),mmax=Math.max(...mats.map(x=>x[1].grams),1);
  $('dMats').innerHTML=mats.length?mats.map(([m,v])=>`<div class="mrow" data-tip="${escape(`<b>${getMat(m).name}</b><br>${fmt(v.grams,0)} ${_t("г")} · ${money(v.cost)}`)}"><span>${escape(getMat(m).name)}</span><div class="track"><div style="width:${v.grams/mmax*100}%"></div></div><b>${fmt(v.grams,0)} ${_t("г")} <small>· ${fmt(S.grams?v.grams/S.grams*100:0,0)}%</small></b></div>`).join(''):_t('<p class="muted">В записях нет списаний с катушек.</p>');
  // последние печати
  $('dRecent').innerHTML=list.slice().sort((a,b)=>(b.date+b.at).localeCompare(a.date+a.at)).slice(0,5).map(p=>{const c=printCalc(p),ok=p.result!=='fail',it=db.items.find(i=>i.id===p.itemId);return`<div class="rrow"><span class="ricon ${ok?'ok':'fail'}">${ok?'✓':'✕'}</span><div>${it?`<a class="lnk" href="#item/${escape(it.id)}">${escape(p.itemName||it.name)}</a>`:escape(p.itemName||'—')}<div class="rmeta">${escape(p.date)} · ${fmtH(c.hours)} · ${fmt(c.grams,0)} ${_t("г")}${p.sets>1?' · × '+p.sets:''}</div></div><div class="rnum"><b>${money(c.total)}</b></div></div>`}).join('')}
$('dPrev').onclick=()=>dashShift(-1);$('dNext').onclick=()=>dashShift(1);
$('dType').onchange=()=>{dash.type=$('dType').value;const d=new Date();dash.y=d.getFullYear();dash.m=d.getMonth();lsSet('p2s_dash',JSON.stringify({type:dash.type,metric:dash.metric}));renderDash()};
segInit('dMetric',dash.metric,v=>{dash.metric=v;lsSet('p2s_dash',JSON.stringify({type:dash.type,metric:v}));renderDash()});
$('dLow').addEventListener('click',e=>{const r=e.target.closest('[data-spool]');if(r)go('spool/'+r.dataset.spool)});
$('qaCalc').onclick=()=>go('calc');$('qaItem').onclick=createBlankItem;$('qaPrint').onclick=openPick;
/* всплывающие подсказки графиков */
(()=>{const tip=$('vtip');const showT=(el,x,y)=>{tip.innerHTML=el.dataset.tip;tip.hidden=false;const w=tip.offsetWidth,h=tip.offsetHeight;tip.style.left=Math.min(innerWidth-w-8,Math.max(8,x+14))+'px';tip.style.top=Math.max(8,y-h-12)+'px'};
  document.addEventListener('mousemove',e=>{const el=e.target.closest?.('[data-tip]');if(el)showT(el,e.clientX,e.clientY);else tip.hidden=true});
  document.addEventListener('focusin',e=>{const el=e.target.closest?.('[data-tip]');if(el){const r=el.getBoundingClientRect();showT(el,r.left+r.width/2,r.top)}else tip.hidden=true});
  document.addEventListener('scroll',()=>{tip.hidden=true},true)})();

/* ================= Прочие события ================= */
function setting(){for(const k in baseSettings)db.settings[k]=typeof baseSettings[k]==='number'?number($(k).value):$(k).value.trim();persist();renderCalc();renderList();if(currentPage==='item'){renderItemCalc();renderDesc()}}
for(const k in baseSettings)$(k).addEventListener('change',setting);
for(const k of ['grams','hours','extra','material','calcPrinter'])$(k).addEventListener('input',renderCalc);
$('cProtoAdd').onclick=()=>{calcProtos.push({materialId:$('material').value,grams:0,hours:0});renderCalcProtos();renderCalc();$('cProtos').querySelector('.protorow:last-child [data-cpf="grams"]')?.focus()};
$('cProtos').addEventListener('input',e=>{const p=calcProtos[+e.target.dataset.cp],k=e.target.dataset.cpf;if(!p||!k)return;p[k]=k==='materialId'?e.target.value:number(e.target.value);renderCalc()});
$('cProtos').addEventListener('click',e=>{const i=e.target.dataset.cpdel;if(i===undefined)return;calcProtos.splice(+i,1);renderCalcProtos();renderCalc()});
$('save').onclick=()=>saveCalc(false);$('saveOpen').onclick=()=>saveCalc(true);$('clear').onclick=resetCalc;
function createBlankItem(){const it=normItem({name:_t('Новое изделие'),status:'idea',materialId:db.materials[0]?.id||'',grams:0,hours:0});it.parts[0].name='';it.updatedAt=it.createdAt;db.items.unshift(it);persist();renderList();go('item/'+it.id);setTimeout(()=>{const n=$('page-item').querySelector('[data-f="name"]');n?.focus();n?.select()},80)}
$('newItem').onclick=createBlankItem;
$('search').oninput=renderList;$('statusFilter').onchange=renderList;$('statMat').onchange=renderStats;
// Копия изделия вместе со всеми вложенными (фото и прототипы не копируются)
function duplicateItem(it){let n=0;const cl=(x,parentId,top)=>{const ks=kidsOf(x.id),cp=structuredClone(x);cp.id=uid();cp.bambuKey='';if(top)cp.name=x.name+_t(' (копия)');cp.photos=[];cp.cover='';cp.prototypes=[];cp.createdAt=cp.updatedAt=now();cp.parts.forEach(q=>q.id=shortId());cp.parentId=parentId;if(top)db.items.unshift(cp);else{db.items.push(cp);n++}for(const k of ks)cl(k,cp.id,false);return cp};
  const cp=cl(it,it.parentId,true);persist();renderList();setStatus(n?`${_t("Создана копия изделия вместе с вложенными")} (${n})`:_t('Создана копия изделия'));return cp}
function openItemPrint(id){pendingPrint=true;go('item/'+id+'/log')}
$('catCards').addEventListener('click',e=>{const card=e.target.closest('[data-open]');if(!card)return;const a=e.target.closest('[data-cact]')?.dataset.cact,id=card.dataset.open;
  if(a==='print')openItemPrint(id);else if(a==='dup'){const it=db.items.find(i=>i.id===id);if(it)go('item/'+duplicateItem(it).id)}else go('item/'+id)});
$('catCards').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('.icard'))go('item/'+e.target.dataset.open)});
// Режим «Структура»: перетаскивание строки на другую — вложить; «Переместить» → «Сюда» — то же без мыши; «⇤» — на уровень выше
function structStart(focusId=''){if(!struct)struct={orig:new Map(db.items.map(x=>[x.id,x.parentId])),moving:''};struct.moving=db.items.some(x=>x.id===focusId)?focusId:'';
  $('page-catalog').classList.add('struct');$('structBar').hidden=false;renderList();
  if(struct.moving)setTimeout(()=>$('rows').querySelector(`[data-srow="${CSS.escape(struct.moving)}"]`)?.scrollIntoView({block:'center',behavior:'smooth'}),40)}
const structChanged=()=>struct?db.items.filter(x=>(struct.orig.get(x.id)??'')!==x.parentId):[];
function structEnd(keep){if(!struct)return;const ch=structChanged();
  if(!keep)for(const x of ch)x.parentId=struct.orig.get(x.id)??'';else if(ch.length){for(const x of ch)touch(x);persist()}
  struct=null;$('page-catalog').classList.remove('struct');$('structBar').hidden=true;renderList();if(currentPage==='catalog')setStatus(keep?(ch.length?`${_t("Структура сохранена · перемещено")}: ${ch.length}`:_t('Структура не изменилась')):_t('Изменения структуры отменены'))}
function structMove(id,parentId){const x=db.items.find(i=>i.id===id);if(!x)return;if(parentId&&!canNest(id,parentId)){setStatus(_t('Нельзя вложить изделие само в себя или в своё вложенное'));return}
  x.parentId=parentId||'';if(struct)struct.moving='';renderList();
  setTimeout(()=>{const r=$('rows').querySelector(`[data-srow="${CSS.escape(id)}"]`);if(r){r.classList.add('flash');r.scrollIntoView({block:'nearest'})}},20)}
function structInfo(){if(!struct)return;const mv=db.items.find(x=>x.id===struct.moving),n=structChanged().length;
  $('structInfo').innerHTML=mv?`${_t("Куда переместить")} <b>«${escape(mv.name)}»</b>? ${_t("Нажмите «↳ Сюда» у нового родителя")}${mv.parentId?_t(' или «На верхний уровень»'):''}.`:`${_t("Перетащите изделие на другое, чтобы вложить его, или нажмите «⇄ Переместить")}».${n?` <b>${_t("Перемещено")}: ${n}</b>`:''}`;
  $('structRoot').hidden=!(mv&&mv.parentId);$('structDone').textContent=n?`${_t("Сохранить")} (${n})`:_t('Готово')}
$('structBtn').onclick=()=>structStart();$('structDone').onclick=()=>structEnd(true);$('structCancel').onclick=()=>structEnd(false);
$('structRoot').onclick=()=>{if(struct?.moving)structMove(struct.moving,'')};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&struct&&currentPage==='catalog'&&!document.querySelector('dialog[open]')){if(struct.moving){struct.moving='';renderList()}}});
$('rows').addEventListener('click',e=>{const tw=e.target.closest('[data-tw]');
  if(tw){e.stopPropagation();if(struct)return;const id=tw.dataset.tw;catFold.has(id)?catFold.delete(id):catFold.add(id);saveFold();renderRows(filtered());return}
  if(struct){const b=e.target.closest('button');if(!b)return;
    if(b.dataset.mv!==undefined){struct.moving=b.dataset.mv;renderList()}else if(b.dataset.mvto)structMove(struct.moving,b.dataset.mvto);else if(b.dataset.mvup){const x=db.items.find(i=>i.id===b.dataset.mvup);if(x)structMove(x.id,parentOf(x)?.parentId||'')}else if(b.dataset.mvcancel!==undefined){struct.moving='';renderList()}return}
  const tr=e.target.closest('[data-open]');if(tr)go('item/'+tr.dataset.open)});
{let dragId='';const clr=()=>document.querySelectorAll('.drop-on,.drop-no').forEach(x=>x.classList.remove('drop-on','drop-no')),rt=$('structRoot');
 const R=$('rows');
 R.addEventListener('dragstart',e=>{const t=e.target.closest('[data-srow]');if(!struct||!t){e.preventDefault();return}dragId=t.dataset.srow;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragId);t.classList.add('dragging');rt.hidden=!parentOf(db.items.find(x=>x.id===dragId))});
 R.addEventListener('dragend',()=>{dragId='';clr();document.querySelectorAll('.dragging').forEach(x=>x.classList.remove('dragging'));structInfo()});
 R.addEventListener('dragover',e=>{if(!dragId)return;const t=e.target.closest('[data-srow]');clr();if(!t||t.dataset.srow===dragId)return;const ok=canNest(dragId,t.dataset.srow);t.classList.add(ok?'drop-on':'drop-no');if(ok){e.preventDefault();e.dataTransfer.dropEffect='move'}});
 R.addEventListener('drop',e=>{const t=e.target.closest('[data-srow]');if(!dragId||!t)return;e.preventDefault();const id=dragId;dragId='';clr();structMove(id,t.dataset.srow)});
 rt.addEventListener('dragover',e=>{if(!dragId)return;e.preventDefault();rt.classList.add('drop-on')});rt.addEventListener('dragleave',()=>rt.classList.remove('drop-on'));
 rt.addEventListener('drop',e=>{e.preventDefault();rt.classList.remove('drop-on');const id=dragId;dragId='';if(id)structMove(id,'')})}
for(const id of ['matFilter','catSort'])$(id).onchange=()=>{lsSet('p2s_cat_sort',$('catSort').value);renderList()};
$('catSort').value=lsGet('p2s_cat_sort','new');
segInit('catView',catView,v=>{catView=v;lsSet('p2s_cat_view',v);renderList()});
$('addMaterial').onclick=()=>{const name=$('newMatName').value.trim();if(!name){alert(_t('Введите название материала'));return}db.materials.push({id:uid(),name,price:number($('newMatPrice').value),density:guessDensity(name)});$('newMatName').value='';$('newMatPrice').value='';persist();renderAll()};
$('materialsList').onchange=e=>{const k=e.target.dataset.mat,d=e.target.dataset.matdens;if(k){getMat(k).price=number(e.target.value);persist();renderAll()}if(d){getMat(d).density=number(e.target.value)||guessDensity(getMat(d).name);persist();renderAll()}};
$('materialsList').onclick=e=>{const ap=e.target.dataset.applyprice;if(ap){getMat(ap).price=number(e.target.dataset.v);persist();renderAll();setStatus(_t('Цена материала обновлена по катушкам'));return}const k=e.target.dataset.delmat;if(!k)return;if(db.spools.some(s=>s.materialId===k)){alert(_t('Материал используется в катушках.'));return}if(db.items.some(i=>itemMaterials(i).includes(k))){alert(_t('Материал используется в изделиях. Сначала замените его в элементах этих изделий.'));return}if(!confirm(_t('Удалить материал?')))return;db.materials=db.materials.filter(m=>m.id!==k);persist();renderAll()};


$('printersList').addEventListener('change',e=>{const card=e.target.closest('[data-ptr]');if(!card)return;const P=db.printers.find(p=>p.id===card.dataset.ptr);if(!P)return;const k=e.target.dataset.ptk;
  if(k==='bambuDev'||k==='since'){P[k]=e.target.value;if(k==='bambuDev'){for(const x of db.printers)if(x!==P&&P.bambuDev&&x.bambuDev===P.bambuDev)x.bambuDev='';cloud.at=0}}
  else if(k){P[k]=k==='name'?(e.target.value.trim()||P.name):number(e.target.value);if(k==='years'&&!P.years)P.years=5;if(k==='annualHours'&&!P.annualHours)P.annualHours=500}
  else if(e.target.dataset.ptdef!==undefined)db.settings.defaultPrinter=P.id;else return;
  persist();renderAll()});
$('printersList').addEventListener('click',e=>{const b=e.target.closest('[data-ptdel]');if(!b)return;const id=b.closest('[data-ptr]').dataset.ptr,P=db.printers.find(p=>p.id===id);const n=db.items.filter(i=>i.printerId===id).length;
  if(!confirm(`${_t("Удалить принтер")} «${P.name}»?${n?` ${_t("Изделия")} (${n}) ${_t("перейдут на принтер по умолчанию")}.`:''} ${_t("Записи журнала сохранятся")}.`))return;
  db.printers=db.printers.filter(p=>p.id!==id);db.items.forEach(i=>{if(i.printerId===id)i.printerId=''});if(db.settings.defaultPrinter===id)db.settings.defaultPrinter=db.printers[0].id;persist();renderAll()});
$('printerAdd').onclick=()=>{const P=normPrinter({name:_t('Новый принтер'),price:0,years:5,annualHours:500,watts:150,maintenance:0});db.printers.push(P);persist();renderAll();const inp=document.querySelector(`[data-ptr="${P.id}"] [data-ptk="name"]`);inp?.focus();inp?.select()};
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('exportJson').onclick=()=>download('3d-print-data.json',data(),'application/json');
$('exportCsv').onclick=()=>{const quote=x=>'"'+String(x??'').replace(/"/g,'""')+'"',r2=v=>Math.round(v*100)/100;const lines=[[_t('Название'),_t('Статус'),_t('Теги'),_t('Материалы'),_t('Входит в'),_t('Кол-во'),_t('Граммы'),_t('Часы'),_t('Пластик ₽'),_t('Электричество ₽'),_t('Амортизация ₽'),_t('Обслуживание ₽'),_t('Дополнительно ₽'),_t('Итого ₽'),_t('Прототипов'),_t('Прототипы г'),_t('Прототипы ч'),_t('Прототипы ₽'),_t('Итого с прототипами ₽'),_t('Ссылка'),_t('Дата'),_t('Примечания')]];
  for(const x of db.items){const c=calcItem(x);lines.push([x.name,STATUSES[x.status],x.tags.join(', '),itemMaterials(x).map(m=>getMat(m).name).join(' + '),itemPath(x).map(y=>y.name).join(' › '),x.parts[0]?.qty||1,r2(c.grams),r2(c.hours),r2(c.plastic),r2(c.power),r2(c.depreciation),r2(c.maintenance),r2(c.extra),r2(c.total),c.proto.count,r2(c.proto.grams),r2(c.proto.hours),r2(c.proto.total),r2(c.dev),x.links[0]?.url||'',x.createdAt,x.notes])}
  download('3d-print-items.csv','﻿'+lines.map(row=>row.map(quote).join(';')).join('\r\n'),'text/csv;charset=utf-8')};
$('importJson').onclick=()=>$('fileInput').click();
$('fileInput').onchange=async e=>{const f=e.target.files[0];if(f)try{const incoming=valid(JSON.parse(await f.text()));if(confirm(_t('Заменить текущие настройки, материалы и каталог данными из файла?'))){applyData(incoming,_t('перед импортом JSON'));persist();setStatus(_t('Данные импортированы'))}}catch(err){alert(_t('Ошибка импорта: ')+err.message)}e.target.value=''};

$('dirPick').onclick=async()=>{try{const d=await window.showDirectoryPicker({id:'p2s-cost',mode:'readwrite'});if(store&&stReady&&stDirty)await writeData();await connect(folderStore(d),'pick')}catch(e){storeErr(e)}};
$('gdNoCfg').hidden=window.GDrive.configured();
$('gdPick').onclick=async()=>{if(!window.GDrive.configured()){alert(_t('Не задан Google Client ID в js/config.js. Откройте инструкцию «Как подключить Google Drive».'));return}
  try{const st=gdStore();if(store?.kind==='gdrive'){await window.GDrive.signOut()}if(!(await st.ensure(true)))return;if(store&&stReady&&stDirty)await writeData();setStatus(_t('Подключаюсь к Google Drive…'));await connect(st,'pick')}catch(e){storeErr(e)}};
$('stReconnect').onclick=async()=>{if(!store)return;try{if(await store.ensure(true))await connect(store,'restore');else{stError=_t('Доступ не предоставлен.');updateStoreUi()}}catch(e){storeErr(e)}};
$('stSaveNow').onclick=()=>{stDirty=true;writeData().then(()=>{if(!stError&&stReady)setStatus(`${_t("Сохранено")}: ${store.label}`)})};
$('stDetach').onclick=async()=>{if(stDirty&&!confirm(_t('Есть изменения, не записанные в хранилище. Всё равно отключить?')))return;try{await store.forget()}catch{}store=null;stReady=false;stDirty=false;stError='';lastSaved=null;photoUrls.clear();try{localStorage.removeItem(STORE_KEY)}catch{}updateStoreUi();renderList();setStatus(_t('Хранилище отключено, данные остаются в браузере'))};
try{$('autosave').checked=localStorage.getItem(AUTO_KEY)!=='0'}catch{}
$('autosave').onchange=()=>{try{localStorage.setItem(AUTO_KEY,autosave()?'1':'0')}catch{}if(autosave()&&stDirty)writeData();updateStoreUi()};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.code==='KeyS'){e.preventDefault();if(persistTimer)persist();if(store&&stReady)$('stSaveNow').click();else if(store)$('stReconnect').click();else $('exportJson').click()}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncFromRemote();else if(persistTimer)persist()});
window.addEventListener('beforeunload',e=>{if(persistTimer)persist();if(store&&stReady&&stDirty){e.preventDefault();e.returnValue=''}});


/* Предупреждение, если сайт открыт в нескольких вкладках: они перезаписывают данные друг друга */
try{const bc=new BroadcastChannel('p2s_cost_tabs'),me=shortId();let warned=false;
  const warn=()=>{if(warned)return;warned=true;const b=document.createElement('div');b.className='tabwarn';b.innerHTML=_t('Калькулятор открыт в нескольких вкладках — оставьте одну, иначе вкладки будут перезаписывать данные друг друга. <button class="linkbtn">Понятно</button>');b.querySelector('button').onclick=()=>b.remove();document.body.append(b)};
  bc.onmessage=e=>{if(e.data?.id===me)return;if(e.data?.t==='hello')bc.postMessage({t:'here',id:me});warn()};bc.postMessage({t:'hello',id:me})}catch{}

/* ================= Bambu Lab Cloud: вход и импорт истории печати ================= */
const BB=window.Bambu;
let bbTasks=[],bbPick=new Map(),bbAccount='',bbBusy=false;
function bbStateUi(){const s=BB.state(),on=BB.connected();
  if(document.activeElement!==$('bbProxy'))$('bbProxy').value=s.proxy||window.APP_CONFIG?.bambuProxy||'';$('bbRegion').value=BB.region();
  if(!$('bbEmail').value&&s.account)$('bbEmail').value=s.account;
  $('bbState').innerHTML=on?`<span class="ok">${_t("● Подключено")}</span>${s.account?' · '+escape(s.account):''}${s.expires?` · ${_t("токен до")} ${new Date(s.expires).toLocaleDateString(I18N.loc)}${BB.expired()?_t(' — <b>истёк</b>'):''}`:''}`:BB.proxy()?_t('Не подключено'):_t('Не подключено · сначала укажите адрес прокси');
  $('bbLoginBox').hidden=on;$('bbLogout').hidden=!on;$('bbOpen2').hidden=!on}
async function bbRun(btn,fn){if(bbBusy)return;bbBusy=true;const t=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='…'}
  try{return await fn()}catch(e){if(!e?.silent)alert(e?.message||String(e))}finally{bbBusy=false;if(btn){btn.disabled=false;btn.textContent=t}bbStateUi()}}
const bbEmail=()=>{const v=$('bbEmail').value.trim();if(!v){alert(_t('Введите email аккаунта Bambu Lab'));$('bbEmail').focus();throw Object.assign(new Error(''),{silent:true})}return v};
$('bbProxy').onchange=()=>{BB.patch({proxy:$('bbProxy').value.trim().replace(/\/+$/,'')});bbStateUi()};
$('bbRegion').onchange=()=>{BB.patch({region:$('bbRegion').value});bbStateUi()};
function bbAskCode(acc,hint){bbAccount=acc;$('bbCodeBox').hidden=false;$('bbCodeHint').textContent=hint||`${_t("Bambu Lab отправил код на")} ${acc}. ${_t("Введите его ниже")}.`;$('bbCode').value='';$('bbCode').focus()}
function bbDone(){$('bbPass').value='';$('bbCode').value='';$('bbCodeBox').hidden=true;setStatus(_t('Bambu Lab Cloud подключён'));bbStateUi()}
$('bbLogin').onclick=()=>{let acc;try{acc=bbEmail()}catch{return}const pw=$('bbPass').value;if(!pw){alert(_t('Введите пароль или войдите по коду из письма'));$('bbPass').focus();return}
  bbRun($('bbLogin'),async()=>{const r=await BB.login(acc,pw);$('bbPass').value='';
    if(r.needCode)bbAskCode(acc);else if(r.tfa)alert(_t('В аккаунте включена двухфакторная аутентификация — этот вход сайт не поддерживает. Используйте «Ввести токен вручную» (см. инструкцию).'));else bbDone()})};
$('bbCodeOnly').onclick=()=>{let acc;try{acc=bbEmail()}catch{return}bbRun($('bbCodeOnly'),async()=>{await BB.sendCode(acc);bbAskCode(acc)})};
$('bbResend').onclick=()=>bbRun($('bbResend'),async()=>{await BB.sendCode(bbAccount||bbEmail());setStatus(_t('Код отправлен ещё раз'))});
$('bbCodeOk').onclick=()=>{const c=$('bbCode').value.trim();if(!c){$('bbCode').focus();return}bbRun($('bbCodeOk'),async()=>{await BB.loginCode(bbAccount||bbEmail(),c);bbDone()})};
$('bbCode').onkeydown=e=>{if(e.key==='Enter')$('bbCodeOk').click()};
$('bbPass').onkeydown=e=>{if(e.key==='Enter')$('bbLogin').click()};
$('bbTokenOk').onclick=()=>{try{BB.setToken($('bbToken').value);if($('bbEmail').value.trim())BB.patch({account:$('bbEmail').value.trim()});$('bbToken').value='';bbDone()}catch(e){alert(e.message)}};
$('bbLogout').onclick=()=>{if(!confirm(_t('Выйти из Bambu Lab Cloud? Токен будет удалён из этого браузера. Импортированные записи журнала останутся.')))return;BB.logout();bbStateUi()};

/* --- сопоставление с данными калькулятора --- */
const bbNorm=s=>String(s||'').toLowerCase().replace(/\.(gcode\.)?3mf$/,'').replace(/[_\-–—.()[\]]+/g,' ').replace(/\s+/g,' ').trim();
function bbMatchItem(t){const a=bbNorm(t.title),b=bbNorm(t.file),its=db.items.map(i=>[i,bbNorm(i.name)]).filter(([,n])=>n);
  const eq=its.find(([,n])=>n===a||n===b);if(eq)return eq[0].id;
  const inc=its.filter(([,n])=>n.length>=4&&(a.includes(n)||b.includes(n)||(a.length>=4&&n.includes(a)))).sort((x,y)=>y[1].length-x[1].length);return inc[0]?.[0].id||''}
function bbMatchMat(type){const T=String(type).toUpperCase().trim();if(!T)return'';const ms=db.materials.map(m=>[m,m.name.toUpperCase().trim()]);
  const eq=ms.find(([,n])=>n===T);if(eq)return eq[0].id;const inc=ms.filter(([,n])=>n&&(T.includes(n)||n.includes(T))).sort((a,b)=>b[1].length-a[1].length);return inc[0]?.[0].id||''}
const hexRgb=h=>{const m=/^#?([0-9a-f]{6})/i.exec(h||'');if(!m)return null;const n=parseInt(m[1],16);return[n>>16&255,n>>8&255,n&255]};
const colDist=(a,b)=>{const x=hexRgb(a),y=hexRgb(b);if(!x||!y)return 999;return Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2])};
function bbMatchSpool(f,mid){if(!mid)return'';const {list,rem}=sortedSpools(mid);let best='',bd=1e9;
  for(const s of list){if(rem.get(s.id)<=0)continue;const d=Math.min(colDist(f.color,s.colorHex),...s.colorStops.map(c=>colDist(f.color,c)))+(s.status==='open'?0:15);if(d<bd){bd=d;best=s.id}}
  return bd<=110?best:''}
// Для неудачной печати Bambu отдаёт расход всей модели — уменьшаем пропорционально фактическому времени.
const bbRatio=t=>t.result==='fail'&&t.est>0&&!t.estimated?Math.min(1,t.seconds/t.est):1;
function bbDefault(t){const k=bbRatio(t),fil=t.filaments.length?t.filaments:(t.grams?[{type:'',color:'',grams:t.grams,slot:''}]:[]);
  return{on:t.result!=='running'&&!bbImported(t.id),itemId:bbMatchItem(t),
    usage:fil.map(f=>{const mid=bbMatchMat(f.type),sid=bbMatchSpool(f,mid);return{f,pick:sid?'s:'+sid:'m:'+mid,grams:Math.round(f.grams*k*10)/10}})}}
const bbImported=id=>db.prints.some(p=>p.src==='bambu:'+id);
function bbUseOptions(sel){const spools=db.spools.filter(s=>s.status!=='empty'||sel==='s:'+s.id).slice().sort((a,b)=>getMat(a.materialId).name.localeCompare(getMat(b.materialId).name)||spName(a).localeCompare(spName(b)));
  return`<optgroup label="${_t("Списать с катушки")}">${spools.map(s=>`<option value="s:${escape(s.id)}"${sel==='s:'+s.id?' selected':''}>${escape(getMat(s.materialId).name)} · ${escape(spName(s))} · ${fmt(spoolState(s).remaining,0)} ${_t("г")}</option>`).join('')}</optgroup>`+
    `<optgroup label="${_t("Без списания, только материал")}">${db.materials.map(m=>`<option value="m:${escape(m.id)}"${sel==='m:'+m.id?' selected':''}>${escape(m.name)}</option>`).join('')}<option value="m:"${sel==='m:'?' selected':''}>${_t("Материал не выбран")}</option></optgroup>`}
const bbDate=iso=>{const d=new Date(iso);return isNaN(d)?today():d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};

/* --- диалог импорта --- */
function bbRender(){const show=$('bbShowDone').checked,list=bbTasks.filter(t=>show||!bbImported(t.id));
  const nDone=bbTasks.filter(t=>bbImported(t.id)).length;
  $('bbInfo').textContent=bbTasks.length?`${_t("Заданий в облаке")}: ${bbTasks.length}${nDone?` · ${_t("уже в журнале")}: ${nDone}`:''}. ${_t("Проверьте изделие и катушки — граммы спишутся с выбранных катушек")}.`:'';
  const itemOpts=sel=>`<option value="">— ${_t("без изделия")} —</option><option value="__new"${sel==='__new'?' selected':''}>＋ ${_t("Создать новое изделие")}</option>`+db.items.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<option value="${escape(i.id)}"${i.id===sel?' selected':''}>${escape(i.name)}</option>`).join('');
  $('bbList').innerHTML=list.length?list.map(t=>{const st=bbPick.get(t.id),done=bbImported(t.id),run=t.result==='running',dis=run||done;
    return`<div class="bb-row${st.on&&!dis?' on':''}${dis?' dis':''}" data-bt="${escape(t.id)}"><label class="bb-chk"><input type="checkbox" data-bf="on"${st.on&&!dis?' checked':''}${dis?' disabled':''} aria-label="${_t("Импортировать")}"></label>
      <div class="thumb">${t.cover?`<img src="${escape(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'◈'}</div>
      <div class="bb-main"><div class="bb-ttl"><b>${escape(t.title)}</b>${run?_t('<span class="pill wip">печатается</span>'):`<span class="pill ${t.result==='fail'?'fail':'done'}">${t.result==='fail'?_t('✕ Неудачно'):_t('✓ Успешно')}</span>`}${done?_t('<span class="pill sp-empty">в журнале</span>'):''}</div>
        <div class="tl-meta"><span>${t.start?escape(new Date(t.start).toLocaleString(I18N.loc,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})):'—'}</span><span>⏱ ${fmtH(t.seconds/3600)}${t.estimated?_t(' <small>(оценка)</small>'):''}</span><span>${fmt(t.grams,1)} ${_t("г")}</span>${t.plate?`<span>${escape(t.plate)}</span>`:''}${t.deviceName?`<span>${escape(t.deviceName)}</span>`:''}</div>
        ${dis?'':`<label class="bb-it">${_t("Изделие")}<select data-bf="item">${itemOpts(st.itemId)}</select></label>${(it=>it?`<label class="bb-it">${_t("Что напечатано")}<select data-bf="part">${kidsOf(it.id).length?`<option value="">${_t("Только")} «${escape(it.name)}»</option><option value="__whole"${st.partId==='__whole'?' selected':''}>${_t("Вся сборка")}</option>`:_t('<option value="">Изделие целиком</option>')}${descendants(it).map(x=>`<option value="${escape(x.id)}"${x.id===st.partId?' selected':''}>${_t("Элемент")}: ${escape(x.name||_t('без названия'))}</option>`).join('')}<option value="__new"${st.partId==='__new'?' selected':''}>＋ ${_t("Новый элемент")} «${escape(plateName(t.plate)||cleanName(t.title))}»</option></select></label>`:'')(db.items.find(i=>i.id===st.itemId))}
        ${st.usage.map((u,i)=>`<div class="bb-fil"><span class="swatch sm" style="background:${u.f.color||'var(--faint)'}"></span><small>${escape(u.f.type||'?')}${u.f.slot?' · '+escape(u.f.slot):''}</small><input type="number" min="0" step="0.1" value="${u.grams}" data-bf="g" data-i="${i}" aria-label="${_t("Граммы")}"><small>${_t("г")}</small><select data-bf="use" data-i="${i}">${bbUseOptions(u.pick)}</select></div>`).join('')}
        ${t.result==='fail'&&bbRatio(t)<1?`<small class="muted">${_t("Расход уменьшен пропорционально времени")}: ${Math.round(bbRatio(t)*100)}${_t("% от модели")}.</small>`:''}`}
      </div></div>`}).join(''):`<div class="empty" style="display:block">${bbTasks.length?_t('Все задания уже импортированы.'):_t('Заданий не найдено.')}</div>`;
  bbSelInfo()}
function bbSelInfo(){const n=bbTasks.filter(t=>bbPick.get(t.id)?.on&&t.result!=='running'&&!bbImported(t.id)).length;$('bbSelInfo').textContent=n?`${_t("Выбрано")}: ${n}`:_t('Ничего не выбрано');$('bbImport').disabled=!n}
async function bbLoad(){$('bbList').innerHTML=_t('<div class="empty" style="display:block">Загрузка истории из Bambu Cloud…</div>');$('bbInfo').textContent='';
  try{const dev=$('bbDevice').value;bbTasks=(await BB.tasks({deviceId:dev,limit:100})).sort((a,b)=>String(b.start).localeCompare(String(a.start)));
    for(const t of bbTasks)if(!bbPick.has(t.id))bbPick.set(t.id,bbDefault(t));bbRender()}
  catch(e){$('bbList').innerHTML=`<div class="empty" style="display:block">${escape(e.message)}</div>`;if(e.code==='auth'){bbStateUi()}$('bbImport').disabled=true}}
async function bbOpen(){if(!BB.connected()){go('settings');setTimeout(()=>{$('bambuPanel').scrollIntoView({block:'start',behavior:'smooth'});(BB.proxy()?$('bbEmail'):$('bbProxy')).focus()},80);setStatus(_t('Сначала подключите Bambu Lab Cloud'));return}
  const s=BB.state();$('bbPrinter').innerHTML=db.printers.map(p=>`<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('');$('bbPrinter').value=db.printers.some(p=>p.id===s.printer)?s.printer:getPrinter('').id;
  bbPick=new Map();bbTasks=[];$('bbList').innerHTML=_t('<div class="empty" style="display:block">Подключение к Bambu Cloud…</div>');$('bbImport').disabled=true;$('bbDlg').showModal();
  try{const ds=await BB.devices();$('bbDevice').innerHTML=_t('<option value="">Все принтеры аккаунта</option>')+ds.map(d=>`<option value="${escape(d.id)}">${escape(d.name||d.model||d.id)}${d.model&&d.name!==d.model?' · '+escape(d.model):''}</option>`).join('');$('bbDevice').value=ds.some(d=>d.id===s.device)?s.device:''}catch{}
  bbLoad()}
$('bbOpen').onclick=bbOpen;$('bbOpen2').onclick=bbOpen;$('bbClose').onclick=()=>$('bbDlg').close();
$('bbDlg').addEventListener('click',e=>{if(e.target===$('bbDlg'))$('bbDlg').close()});
$('bbReload').onclick=bbLoad;$('bbShowDone').onchange=bbRender;
$('bbDevice').onchange=()=>{BB.patch({device:$('bbDevice').value});const lp=db.printers.find(p=>p.bambuDev&&p.bambuDev===$('bbDevice').value);if(lp){$('bbPrinter').value=lp.id;BB.patch({printer:lp.id})}bbLoad()};$('bbPrinter').onchange=()=>BB.patch({printer:$('bbPrinter').value});
$('bbList').addEventListener('change',e=>{const row=e.target.closest('[data-bt]');if(!row)return;const st=bbPick.get(row.dataset.bt),f=e.target.dataset.bf,i=+e.target.dataset.i;if(!st)return;
  if(f==='on'){st.on=e.target.checked;row.classList.toggle('on',st.on);bbSelInfo()}else if(f==='item'){st.itemId=e.target.value;st.partId='';bbRender()}else if(f==='part')st.partId=e.target.value;else if(f==='g')st.usage[i].grams=number(e.target.value);else if(f==='use')st.usage[i].pick=e.target.value});
$('bbImport').onclick=()=>{const pid=$('bbPrinter').value,sel=bbTasks.filter(t=>bbPick.get(t.id)?.on&&t.result!=='running'&&!bbImported(t.id));if(!sel.length)return;
  for(const t of sel){const st=bbPick.get(t.id),it=db.items.find(i=>i.id===st.itemId);
    const np=normPrint({at:t.start||now(),plate:t.plate,cover:t.cover,date:bbDate(t.start),itemId:it?.id||'',itemName:it?.name||t.title,printerId:pid,hours:Math.round(t.seconds/36)/100,sets:1,result:t.result==='fail'?'fail':'ok',src:'bambu:'+t.id,
      note:['Bambu Cloud',it&&bbNorm(it.name)!==bbNorm(t.title)?t.title:'',t.plate,t.estimated?_t('время по оценке слайсера'):''].filter(Boolean).join(' · '),
      usage:st.usage.filter(u=>u.grams>0).map(u=>{const[k,id]=u.pick.split(':');const s=k==='s'?getSpool(id):null;return{label:[u.f.type,u.f.slot].filter(Boolean).join(' · '),materialId:s?s.materialId:id||'',spoolId:s?s.id:'',grams:u.grams}})});
    db.prints.push(np);
    if(st.itemId==='__new')itemFromPrint(np.id,{silent:true});else if(it&&st.partId==='__new')partFromPrint(np.id,it.id,{silent:true});else if(it&&st.partId==='__whole')np.whole=true;else if(it&&st.partId){const k=descendants(it).find(x=>x.id===st.partId);if(k)applyLink(np,k)}}
  persist();renderList();if(currentPage==='item')renderItem();$('bbDlg').close();setStatus(`${_t("Импортировано записей")}: ${sel.length}`)};
bbStateUi();

/* --- Катушки из Bambu Cloud: сверка остатков и создание фирменных катушек --- */
let bfList=[],bfPick=new Map();
const bfBrand=()=>db.lib.brands.find(b=>/bambu/i.test(b.name))?.name||'Bambu Lab';
const r1=n=>Math.round(n*10)/10;
function bfColorName(hex){let best='',bd=1e9;for(const c of db.lib.colors){if(c.stops.length!==1)continue;const d=colDist(hex,c.stops[0]);if(d<bd){bd=d;best=c.name}}return bd<=45?best:''}
// Материал катушки — строго по типу пластика: PLA-CF ≠ PLA.
const bfKey=t=>String(t||'').toUpperCase().replace(/[\s_\-]+/g,'');
const bfMat=type=>{const k=bfKey(type);return k?db.materials.find(m=>bfKey(m.name)===k)?.id||'':''};
function bfMatch(f,used){const linked=db.spools.find(s=>s.bambu===f.key);if(linked&&!used.has(linked.id))return linked.id;
  const mid=bfMat(f.type),taken=new Set(bfList.map(x=>x.key));if(!mid)return'';let best='',bd=1e9;
  for(const s of db.spools){if(used.has(s.id)||(s.bambu&&s.bambu!==f.key&&taken.has(s.bambu)))continue;if(s.materialId!==mid)continue;
    const cd=Math.min(colDist(f.color,s.colorHex),...s.colorStops.map(c=>colDist(f.color,c)));if(cd>70)continue;
    const d=cd+(/bambu/i.test(s.brand)?0:25)+(f.name&&ieq(s.series,f.name)?0:20)+(s.status==='empty'?40:0)+(s.bambu?60:0)+(number(s.net)&&f.total&&Math.abs(number(s.net)-f.total)>1?15:0);
    if(d<bd){bd=d;best=s.id}}return best}
function bfChange(f,target){if(target==='new')return{isNew:true};const s=getSpool(target);if(!s)return null;
  const cur=spoolState(s).remaining,set=Math.abs(f.remaining-cur)>=1;
  const status=f.depleted&&s.status!=='empty'?'empty':!f.depleted&&s.status==='sealed'&&(f.inPrinter||f.remaining<f.total-1)?'open':'';
  return{s,cur,set,status,link:s.bambu!==f.key,none:!set&&!status&&s.bambu===f.key}}
function bfDefault(f,used){const sid=bfMatch(f,used);if(sid)used.add(sid);const target=sid||(f.depleted?'skip':'new'),ch=bfChange(f,target);return{target,on:target!=='skip'&&!(ch&&ch.none)}}
function bfTargetOptions(f,sel){const mid=bfMat(f.type),list=db.spools.slice().sort((a,b)=>(b.materialId===mid)-(a.materialId===mid)||(a.status==='empty')-(b.status==='empty')||spName(a).localeCompare(spName(b)));
  return`<option value="new"${sel==='new'?' selected':''}>＋ ${_t("Создать новую катушку")}</option><option value="skip"${sel==='skip'?' selected':''}>${_t("Пропустить")}</option><optgroup label="${_t("Связать с катушкой")}">${list.map(s=>`<option value="${escape(s.id)}"${sel===s.id?' selected':''}>${escape(getMat(s.materialId).name)} · ${escape(spName(s))} · ${fmt(spoolState(s).remaining,0)} ${_t("г")}${s.status==='empty'?_t(' · закончилась'):''}</option>`).join('')}</optgroup>`}
function bfDesc(f,st){if(st.target==='skip')return _t('<small class="muted">Не изменится</small>');const ch=bfChange(f,st.target);if(!ch)return'';
  if(ch.isNew){const mid=bfMat(f.type);return`<small>${_t("Новая")}: ${escape(bfBrand())} ${escape(f.name||f.type)}${bfColorName(f.color)?' · '+escape(bfColorName(f.color)):''} · ${fmt(f.remaining,0)} ${_t("из")} ${fmt(f.total||1000,0)} ${_t("г")}${mid?'':` · <b>${_t("материал")} «${escape(f.type||'?')}» ${_t("будет создан без цены")}</b>`}</small>`}
  const parts=[];if(ch.set){const d=f.remaining-ch.cur;parts.push(`${_t("остаток")} ${fmt(ch.cur,0)} → <b>${fmt(f.remaining,0)} ${_t("г")}</b> (${d>0?'+':'−'}${fmt(Math.abs(d),0)} ${_t("г")})`)}
  if(ch.status)parts.push(`${_t("статус →")} ${SPOOL_ST[ch.status]}`);if(ch.link&&!parts.length)parts.push(_t('только связать'));
  return`<small>${parts.length?parts.join(' · '):_t('Без изменений')}</small>`}
function bfRender(){const show=$('bfShowSame').checked;
  const rows=bfList.filter(f=>{const st=bfPick.get(f.key),ch=bfChange(f,st.target);return show||!(ch&&ch.none)});
  const same=bfList.length-bfList.filter(f=>{const ch=bfChange(f,bfPick.get(f.key).target);return!(ch&&ch.none)}).length;
  $('bfInfo').textContent=bfList.length?`${_t("Катушек в облаке")}: ${bfList.length}${same?` · ${_t("совпадают с вашими")}: ${same}`:''}.`:'';
  $('bfList').innerHTML=rows.length?rows.map(f=>{const st=bfPick.get(f.key),pct=f.total?Math.round(f.remaining/f.total*100):0;
    return`<div class="bb-row${st.on?' on':''}" data-fk="${escape(f.key)}"><label class="bb-chk"><input type="checkbox" data-ff="on"${st.on?' checked':''} aria-label="${_t("Применить")}"></label>
      <div class="thumb"><span class="swatch big" style="background:${f.color||'var(--faint)'}"></span></div>
      <div class="bb-main"><div class="bb-ttl"><b>${escape(f.name||f.type||_t('Катушка'))}</b><small>${escape(f.type)}</small>${f.slot&&f.inPrinter?`<span class="pill sp-open">${escape(f.slot)}</span>`:_t('<span class="pill sp-empty">не в AMS</span>')}${f.depleted?_t('<span class="pill fail">закончилась</span>'):''}</div>
        <div class="tl-meta"><span>${_t("В облаке")}: <b>${fmt(f.remaining,0)} ${_t("г")}</b>${f.total?` ${_t("из")} ${fmt(f.total,0)} ${_t("г")} · ${pct}%`:''}</span></div>
        <label class="bb-it">${_t("Катушка")}<select data-ff="target">${bfTargetOptions(f,st.target)}</select></label>
        <div style="margin-top:6px">${bfDesc(f,st)}</div></div></div>`}).join(''):`<div class="empty" style="display:block">${bfList.length?_t('Все катушки совпадают с облаком.'):_t('В облаке нет катушек. Видны только катушки Bambu Lab с RFID, которые AMS хоть раз считал.')}</div>`;
  bfSel()}
function bfSel(){const n=bfList.filter(f=>{const st=bfPick.get(f.key);return st.on&&st.target!=='skip'}).length;$('bfSelInfo').textContent=n?`${_t("Выбрано")}: ${n}`:_t('Ничего не выбрано');$('bfApply').disabled=!n}
async function bfLoad(){$('bfList').innerHTML=_t('<div class="empty" style="display:block">Загрузка катушек из Bambu Cloud…</div>');$('bfInfo').textContent='';$('bfApply').disabled=true;
  try{bfList=(await BB.filaments()).sort((a,b)=>(b.inPrinter-a.inPrinter)||String(a.slot).localeCompare(String(b.slot))||a.type.localeCompare(b.type));const used=new Set();bfPick=new Map();for(const f of bfList)if(db.spools.some(s=>s.bambu===f.key))bfPick.set(f.key,bfDefault(f,used));for(const f of bfList)if(!bfPick.has(f.key))bfPick.set(f.key,bfDefault(f,used));bfRender()}
  catch(e){$('bfList').innerHTML=`<div class="empty" style="display:block">${escape(e.message)}</div>`;if(e.code==='auth')bbStateUi()}}
function bfOpen(){if(!BB.connected()){go('settings');setTimeout(()=>{$('bambuPanel').scrollIntoView({block:'start',behavior:'smooth'})},80);setStatus(_t('Сначала подключите Bambu Lab Cloud'));return}$('bfDlg').showModal();bfLoad()}
$('bfOpen').onclick=bfOpen;$('bfClose').onclick=()=>$('bfDlg').close();$('bfDlg').addEventListener('click',e=>{if(e.target===$('bfDlg'))$('bfDlg').close()});
$('bfReload').onclick=bfLoad;$('bfShowSame').onchange=bfRender;
$('bfList').addEventListener('change',e=>{const row=e.target.closest('[data-fk]');if(!row)return;const st=bfPick.get(row.dataset.fk);if(!st)return;
  if(e.target.dataset.ff==='on'){st.on=e.target.checked;row.classList.toggle('on',st.on);bfSel()}else if(e.target.dataset.ff==='target'){st.target=e.target.value;st.on=st.target!=='skip';bfRender()}});
$('bfApply').onclick=()=>{const sel=bfList.filter(f=>{const st=bfPick.get(f.key);return st.on&&st.target!=='skip'});if(!sel.length)return;
  const used=new Map();for(const f of sel){const t=bfPick.get(f.key).target;if(t!=='new'){if(used.has(t)){alert(`${_t("Катушка")} «${spName(getSpool(t))}» ${_t("выбрана для двух облачных катушек. Выберите разные или создайте новую")}.`);return}used.set(t,f)}}
  let upd=0,created=0;const newMats=[];
  for(const f of sel){const t=bfPick.get(f.key).target,note='Bambu Cloud'+(f.slot&&f.inPrinter?' · '+f.slot:'');
    for(const s of db.spools)if(s.bambu===f.key&&s.id!==t)s.bambu='';
    if(t==='new'){let mid=bfMat(f.type);if(!mid){const m={id:shortId(),name:f.type||'Bambu Lab',price:0,density:guessDensity(f.type)};db.materials.push(m);mid=m.id;newMats.push(m.name)}
      const st=f.depleted?'empty':f.inPrinter||(f.total&&f.remaining<f.total-1)?'open':'sealed',net=f.total||1000;
      const s=normSpool({materialId:mid,brand:bfBrand(),series:f.name,color:bfColorName(f.color),colorHex:f.color||'#d9dee8',net,status:st,opened:st==='sealed'?'':today(),bambu:f.key,notes:_t('Создана из Bambu Cloud')});
      if(Math.abs(f.remaining-net)>=1)s.ops.push({id:shortId(),at:now(),date:today(),type:'set',grams:r1(f.remaining),note});
      libAbsorb(s);db.spools.unshift(s);created++;continue}
    const ch=bfChange(f,t);if(!ch||ch.isNew)continue;const s=ch.s;s.bambu=f.key;
    if(ch.set)s.ops.push({id:shortId(),at:now(),date:today(),type:'set',grams:r1(f.remaining),note});
    if(ch.status){s.status=ch.status;if(ch.status==='open'&&!s.opened)s.opened=today()}upd++}
  persist();renderAll();$('bfDlg').close();
  setStatus([upd&&`${_t("Обновлено катушек")}: ${upd}`,created&&`${_t("создано")}: ${created}`].filter(Boolean).join(' · ')||_t('Готово'));
  if(newMats.length)alert(`${_t("Добавлены материалы без цены")}: ${newMats.join(', ')}.\n${_t("Укажите цену в «Настройки → Материалы» или цену катушки в её карточке")}.`)};

/* --- Привязка записи журнала к изделию и его элементу --- */
let linkPid='',linkItem='';
const cleanName=s=>String(s||'').replace(/\.(gcode\.)?3mf$/i,'').trim();
const plateName=pl=>/^plate\s*\d+$/i.test(String(pl||'').trim())?'':cleanName(pl);
function renderLinkList(){const p=db.prints.find(x=>x.id===linkPid);if(!p)return;
  if(linkItem){const it=db.items.find(i=>i.id===linkItem);if(!it){linkItem='';return renderLinkList()}
    $('linkTitle').textContent=_t('Что напечатано');$('linkSearch').hidden=true;$('linkNew').hidden=true;$('linkBack').hidden=false;$('linkNone').hidden=true;
    const ds=descendants(it),depth=x=>itemPath(x).length-itemPath(it).length;
    $('linkSub').innerHTML=`<b>${escape(it.name)}</b> — ${ds.length?_t('это изделие, вся сборка или одно из вложенных?'):_t('привязать печать к изделию или создать из неё вложенный элемент?')}`;
    const row=(v,on,ic,title,sub)=>`<button type="button" class="pick-row${on?' on':''}" data-linkpart="${escape(v)}"><span class="thumb">${ic}</span><span><b>${title}</b><br><small>${sub}</small></span><small>${on?_t('привязано'):''}</small></button>`,c=calcItem(it),t=calcTree(it);
    $('linkList').innerHTML=row('',p.itemId===it.id&&!p.whole,'◈',ds.length?`${_t("Только")} «${escape(it.name)}»`:_t('Изделие целиком'),`${fmtH(c.hours)} · ${fmt(c.grams,1)} ${_t("г")}`)+
      (ds.length?row('__whole',p.itemId===it.id&&p.whole,'▦',_t('Вся сборка'),`${_t("с вложенными")} (${ds.length}) · ${fmtH(t.hours)} · ${fmt(t.grams,1)} ${_t("г")}`):'')+
      ds.map(k=>{const kc=calcItem(k);return row(k.id,p.itemId===k.id,'◧',`${'— '.repeat(Math.max(0,depth(k)-1))}${escape(k.name)}`,`${fmtH(kc.hours)} · ${fmt(kc.grams,1)} ${_t("г")}`)}).join('')+
      `<button type="button" class="pick-row" data-linkpart="__new"><span class="thumb">＋</span><span><b>${_t("Новый элемент из этой печати")}</b><br><small>«${escape(plateName(p.plate)||cleanName(p.itemName)||_t('Элемент'))}» · ${fmtH(printHours(p)/Math.max(1,p.sets))} · ${fmt(printGrams(p)/Math.max(1,p.sets),1)} ${_t("г")}</small></span><small></small></button>`;return}
  $('linkTitle').textContent=_t('Изделие для печати');$('linkSearch').hidden=false;$('linkNew').hidden=false;$('linkBack').hidden=true;$('linkNone').hidden=!p.itemId;
  $('linkSub').textContent=`${dayTitle(p.date)} · ${p.itemName||_t('без названия')}${p.plate?' · '+p.plate:''} · ${fmtH(printHours(p))} · ${fmt(printGrams(p),1)} ${_t("г")}`;
  const q=$('linkSearch').value.trim().toLowerCase(),hint=bbNorm(p.itemName);
  const list=db.items.filter(x=>(x.name+' '+x.tags.join(' ')).toLowerCase().includes(q)).sort((a,b)=>(b.id===p.itemId)-(a.id===p.itemId)||(bbNorm(b.name)===hint)-(bbNorm(a.name)===hint)||(b.updatedAt||'').localeCompare(a.updatedAt||''));
  $('linkList').innerHTML=list.length?list.slice(0,80).map(x=>`<button type="button" class="pick-row${x.id===p.itemId?' on':''}" data-linkto="${escape(x.id)}"><span class="thumb">${coverImg(x)}</span><span><b>${escape(x.name)}</b><br><small>${itemPath(x).length?_t('в «')+escape(itemPath(x).map(y=>y.name).join(' › '))+'» · ':''}${escape(itemMaterials(x).map(m=>getMat(m).name).join(' + '))}${kidsOf(x.id).length?_t(' · вложенных: ')+descendants(x).length:''}${x.id===p.itemId?_t(' · привязано сейчас'):''}</small></span><small>${money(calcItem(x).total)}</small></button>`).join(''):`<div class="empty" style="margin:6px 0">${db.items.length?_t('Ничего не найдено.'):_t('Изделий пока нет.')}</div>`;hydrate($('linkList'))}
function openLink(pid){const p=db.prints.find(x=>x.id===pid);if(!p)return;linkPid=pid;linkItem='';$('linkSearch').value='';renderLinkList();$('linkDlg').showModal();setTimeout(()=>$('linkSearch').focus(),30)}
// Привязать без сохранения (общая логика для журнала, импорта и моделей из облака)
function applyLink(p,it,whole=false){if(p.hours==null)p.hours=printHours(p); // время фиксируется, чтобы смена изделия не меняла себестоимость записи
  const ORIG=/(?:^| · )исходно: ([^·]+?)(?= · |$)/,m=ORIG.exec(p.note),orig=p.itemName;
  p.partName='';p.partId='';delete p.pcs;if(whole&&it&&kidsOf(it.id).length)p.whole=true;else delete p.whole;if(it){p.itemId=it.id;p.itemName=it.name;if(!m&&orig&&!ieq(cleanName(orig),cleanName(it.name)))p.note=[p.note,_t('исходно: ')+orig].filter(Boolean).join(' · ')}
  else{p.itemId='';if(m){p.itemName=m[1].trim();p.note=p.note.replace(ORIG,'').replace(/^ · /,'')}}}
// v: '' — само изделие, '__whole' — вся сборка, id — одно из вложенных
function linkPrint(pid,itemId,v=''){const p=db.prints.find(x=>x.id===pid);if(!p)return;let it=db.items.find(i=>i.id===itemId);const whole=!!it&&v==='__whole';if(it&&v&&!whole)it=db.items.find(i=>i.id===v)||it;applyLink(p,it,whole);
  persist();renderList();if(currentPage==='item')renderItem();$('linkDlg').close();setStatus(it?`${_t("Печать привязана к")} «${it.name}»${p.whole?_t(' · вся сборка'):''}`:_t('Печать отвязана от изделия'))}
function filamentsOfPrint(p){const k=Math.max(1,p.sets),by=new Map();for(const u of p.usage){const mid=u.materialId||getSpool(u.spoolId)?.materialId||'';if(mid)by.set(mid,(by.get(mid)||0)+number(u.grams)/k)}
  const fil=[...by].map(([materialId,g])=>({materialId,grams:Math.round(g*10)/10}));return fil.length?fil:[{materialId:db.materials[0]?.id||'',grams:0}]}
const partOfPrint=(p,name)=>({id:shortId(),name:name??(plateName(p.plate)||_t('Изделие целиком')),qty:1,hours:Math.round(printHours(p)/Math.max(1,p.sets)*10000)/10000,filaments:filamentsOfPrint(p)});
// Новое изделие по печати. silent — без перехода в карточку (импорт)
function itemFromPrint(pid,{silent=false}={}){const p=db.prints.find(x=>x.id===pid);if(!p)return null;
  const it=normItem({name:cleanName(p.itemName)||_t('Новое изделие'),status:'done',printerId:p.printerId,coverUrl:p.cover,parts:[partOfPrint(p,plateName(p.plate)||_t('Изделие целиком'))]});
  it.updatedAt=it.createdAt;db.items.unshift(it);applyLink(p,it);if(p.cover)savePhotoFromUrl(it,p.cover);
  if(!silent){persist();renderList();$('linkDlg').close();go('item/'+it.id);setStatus(_t('Изделие создано по печати — граммы и время взяты из записи'))}return it}
// Новый элемент (вложенное изделие) по печати
function partFromPrint(pid,itemId,{silent=false}={}){const p=db.prints.find(x=>x.id===pid),it=db.items.find(i=>i.id===itemId);if(!p||!it)return null;
  const k=normItem({name:plateName(p.plate)||cleanName(p.itemName)||_t('Элемент'),status:it.status,printerId:p.printerId||it.printerId,parentId:it.id,print:it.print,parts:[partOfPrint(p,'')]});k.updatedAt=k.createdAt;db.items.push(k);touch(it);applyLink(p,k);
  if(!silent){persist();renderList();if(currentPage==='item')renderItem();$('linkDlg').close();setStatus(`${_t("Элемент")} «${k.name}» ${_t("добавлен в")} «${it.name}» ${_t("и привязан к печати")}`)}return k}
document.addEventListener('click',e=>{const b=e.target.closest('[data-linkprint]');if(b){e.preventDefault();e.stopPropagation();openLink(b.dataset.linkprint)}},true);
$('linkSearch').oninput=renderLinkList;$('linkClose').onclick=()=>$('linkDlg').close();$('linkBack').onclick=()=>{linkItem='';renderLinkList()};
$('linkDlg').addEventListener('click',e=>{if(e.target===$('linkDlg')){$('linkDlg').close();return}
  const b=e.target.closest('[data-linkto]');if(b){linkItem=b.dataset.linkto;renderLinkList();return}
  const pp=e.target.closest('[data-linkpart]');if(pp){const v=pp.dataset.linkpart;if(v==='__new')partFromPrint(linkPid,linkItem);else linkPrint(linkPid,linkItem,v)}});
$('linkNone').onclick=()=>linkPrint(linkPid,'');$('linkNew').onclick=()=>itemFromPrint(linkPid);

/* --- картинки из Bambu Cloud --- */
// Скачать картинку через Worker и сохранить фото изделия в хранилище (папка / Google Drive)
async function savePhotoFromUrl(it,url){if(!url||!store||!stReady||!BB.proxy())return false;
  try{const raw=await BB.image(url),blob=await shrinkImage(raw),ext=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg',pid=shortId(),file=`${it.id.slice(0,8)}-${pid}.${ext}`;
    await store.putPhoto(file,blob);it.photos.push({id:pid,file});if(!it.cover)it.cover=file;photoUrls.set(file,Promise.resolve(URL.createObjectURL(blob)));persist();renderList();if(currentPage==='item'&&currentItemId===it.id)renderItem();return true}
  catch{return false}}
const printImgSrc=p=>{if(p.cover)return{url:p.cover};const it=db.items.find(i=>i.id===p.itemId);return it?.cover?{photo:it.cover}:it?.coverUrl?{url:it.coverUrl}:null};
const imgTag=s=>s.photo?`<img data-photo="${escape(s.photo)}" alt="">`:`<img src="${escape(s.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
// Сколько комплектов напечатано. Печать изделия даёт его собственные детали; печать «всей сборки» (whole) — ещё и детали всех вложенных.
// Сборка готова, когда готовы своё (если есть что печатать) и каждое вложенное изделие.
const hasProfile=it=>{const p=it.parts[0];return!!p&&(number(p.hours)>0||p.filaments.some(f=>number(f.grams)>0))};
function itemDone(it,_seen=new Set()){_seen.add(it.id);const q=Math.max(1,it.parts[0]?.qty||1),anc=new Set(itemPath(it).map(x=>x.id));let pcs=0;
  for(const p of db.prints){if(p.result!=='ok'||p.partId)continue;if(p.itemId===it.id)pcs+=p.pcs??p.sets*q;else if(p.whole&&anc.has(p.itemId))pcs+=p.sets*q}
  const parts=[];if(hasProfile(it))parts.push(Math.floor(pcs/q));for(const k of kidsOf(it.id))if(!_seen.has(k.id))parts.push(itemDone(k,_seen).sets);
  return{sets:parts.length?Math.min(...parts):0,pcs,qty:q}}

/* --- модели из истории Bambu Cloud → каталог изделий --- */
let bmGroups=[],bmPick=new Map();
const bmKey=t=>t.designId?'d:'+t.designId:t.modelId?'m:'+t.modelId:'t:'+bbNorm(t.title);
const mwUrl=id=>`https://makerworld.com/models/${id}`;
function bmBuild(tasks){const g=new Map();
  for(const t of tasks.slice().sort((a,b)=>String(b.start).localeCompare(String(a.start)))){if(t.result==='running')continue;const k=bmKey(t);let x=g.get(k);
    if(!x){x={key:k,title:t.title,designId:t.designId,cover:'',tasks:[],plates:new Map(),ok:0,fail:0,last:t.start};g.set(k,x)}
    x.tasks.push(t);if(!x.cover&&t.cover)x.cover=t.cover;t.result==='ok'?x.ok++:x.fail++;
    const pk=t.plateIdx?'p'+t.plateIdx:t.plate?'n:'+t.plate.toLowerCase():'p1';let pl=x.plates.get(pk);if(!pl){pl={key:pk,name:t.plate||(t.plateIdx?'Plate '+t.plateIdx:_t('Стол 1')),tasks:[],best:null};x.plates.set(pk,pl)}
    pl.tasks.push(t);if(!pl.best||(pl.best.result!=='ok'&&t.result==='ok')||(pl.best.estimated&&!t.estimated&&t.result==='ok'))pl.best=t}
  return[...g.values()]}
const bmItem=x=>db.items.find(i=>i.bambuKey===x.key)||null;
const bmPrints=x=>{const ids=new Set(x.tasks.map(t=>'bambu:'+t.id));return db.prints.filter(p=>ids.has(p.src))};
function bmDefault(x){const ex=bmItem(x)||db.items.find(i=>i.id===bbMatchItem(x.tasks[0]));return{on:!bmItem(x),target:ex?ex.id:'new',links:true}}
function bmRender(){const show=$('bmShowDone').checked,rows=bmGroups.filter(x=>show||!bmItem(x));
  $('bmInfo').textContent=bmGroups.length?`${_t("Моделей в истории")}: ${bmGroups.length} (${_t("по последним")} ${bbTasks.length||100} ${_t("заданиям) · уже в каталоге")}: ${bmGroups.filter(bmItem).length}.`:'';
  $('bmList').innerHTML=rows.length?rows.map(x=>{const st=bmPick.get(x.key),linked=bmItem(x),pr=bmPrints(x),free=pr.filter(p=>!p.itemId).length,pls=[...x.plates.values()];
    return`<div class="bb-row${st.on?' on':''}" data-bm="${escape(x.key)}"><label class="bb-chk"><input type="checkbox" data-bmf="on"${st.on?' checked':''} aria-label="${_t("Выбрать")}"></label>
      <div class="thumb">${x.cover?`<img src="${escape(x.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:'◈'}</div>
      <div class="bb-main"><div class="bb-ttl"><b>${escape(x.title)}</b>${linked?`<span class="pill done">${_t("в каталоге")}</span>`:''}${x.designId?`<a class="lnk" href="${mwUrl(x.designId)}" target="_blank" rel="noopener" style="font-size:12px">MakerWorld ↗</a>`:''}</div>
        <div class="tl-meta"><span>${_t("печатей")}: ${x.tasks.length} (✓ ${x.ok}${x.fail?` · ✕ ${x.fail}`:''})</span><span>${_t("последняя")} ${x.last?escape(new Date(x.last).toLocaleDateString(I18N.loc)):'—'}</span><span>${pls.length>1?`${_t("столов")}: ${pls.length}`:_t('1 стол')}</span>${pr.length?`<span>${_t("в журнале")}: ${pr.length}${free?` · ${_t("без изделия")}: ${free}`:''}</span>`:''}</div>
        <div class="bm-plates">${pls.map(pl=>`<span class="pill sp-empty">${escape(pl.name)} · ${fmtH(pl.best.seconds/3600)} · ${fmt(pl.best.grams,0)} ${_t("г")}</span>`).join(' ')}</div>
        <label class="bb-it">${_t("Изделие")}<select data-bmf="target"><option value="new"${st.target==='new'?' selected':''}>＋ ${_t("Создать изделие")}${pls.length>1?` (${_t("сборка")}: ${pls.length} ${_t("влож. по столам")})`:''}</option>${db.items.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<option value="${escape(i.id)}"${i.id===st.target?' selected':''}>${_t("Связать с")}: ${escape(i.name)}</option>`).join('')}</select></label>
        ${pr.length?`<label class="check" style="margin-top:6px"><input type="checkbox" data-bmf="links"${st.links?' checked':''}> ${_t("привязать записи журнала")} (${pr.length}) ${_t("к изделию")}${pls.length>1?_t(' и элементам по столам'):''}</label>`:''}</div></div>`}).join(''):`<div class="empty" style="display:block">${bmGroups.length?_t('Все модели уже в каталоге.'):_t('В истории Bambu Cloud нет завершённых печатей.')}</div>`;
  const n=rows.filter(x=>bmPick.get(x.key).on).length;$('bmSelInfo').textContent=n?`${_t("Выбрано")}: ${n}`:_t('Ничего не выбрано');$('bmApply').disabled=!n}
async function bmLoad(){$('bmList').innerHTML=_t('<div class="empty" style="display:block">Загрузка истории из Bambu Cloud…</div>');$('bmApply').disabled=true;$('bmInfo').textContent='';
  try{bbTasks=await BB.tasks({limit:100});bmGroups=bmBuild(bbTasks);bmPick=new Map(bmGroups.map(x=>[x.key,bmDefault(x)]));bmRender()}
  catch(e){$('bmList').innerHTML=`<div class="empty" style="display:block">${escape(e.message)}</div>`;if(e.code==='auth')bbStateUi()}}
function bmOpen(){if(!BB.connected()){go('settings');setTimeout(()=>$('bambuPanel').scrollIntoView({block:'start',behavior:'smooth'}),80);setStatus(_t('Сначала подключите Bambu Lab Cloud'));return}$('bmDlg').showModal();bmLoad()}
function bmFils(t){const by=new Map();for(const f of t.filaments){const mid=bbMatchMat(f.type)||db.materials[0]?.id||'';by.set(mid,(by.get(mid)||0)+f.grams)}
  if(!by.size&&t.grams)by.set(db.materials[0]?.id||'',t.grams);return[...by].map(([materialId,g])=>({materialId,grams:Math.round(g*10)/10}))}
$('bmApply').onclick=async()=>{const sel=bmGroups.filter(x=>bmPick.get(x.key).on);if(!sel.length)return;let made=0,linkedN=0,printsN=0;const photos=[];
  for(const x of sel){const st=bmPick.get(x.key),pls=[...x.plates.values()];let it,partOf=()=>'';
    // несколько столов → сборка, каждый стол — вложенное изделие
    if(st.target==='new'){const prof=pl=>({id:shortId(),name:'',qty:1,hours:Math.round(pl.best.seconds/36)/100,filaments:bmFils(pl.best).length?bmFils(pl.best):[{materialId:db.materials[0]?.id||'',grams:0}]});
      it=normItem({name:cleanName(x.title),status:'done',coverUrl:x.cover,bambuKey:x.key,parts:pls.length>1?[{id:shortId(),name:'',qty:1,hours:0,filaments:[]}]:[prof(pls[0])],links:x.designId?[{title:'MakerWorld',url:mwUrl(x.designId)}]:[],notes:_t('Создано из истории Bambu Cloud')});
      it.updatedAt=it.createdAt;db.items.unshift(it);made++;if(x.cover)photos.push([it,x.cover]);
      if(pls.length>1){const map=new Map(pls.map(pl=>{const k=normItem({name:cleanName(pl.name),status:'done',printerId:it.printerId,parentId:it.id,parts:[prof(pl)]});k.updatedAt=k.createdAt;db.items.push(k);return[pl.key,k]}));partOf=t=>map.get(pls.find(pl=>pl.tasks.includes(t))?.key)||null}}
    else{it=db.items.find(i=>i.id===st.target);if(!it)continue;it.bambuKey=x.key;if(!it.coverUrl&&x.cover)it.coverUrl=x.cover;if(!it.cover&&x.cover)photos.push([it,x.cover]);linkedN++;
      partOf=t=>{const pl=pls.find(q=>q.tasks.includes(t));return pl&&pls.length>1?descendants(it).find(k=>ieq(k.name,pl.name)||ieq(k.name,cleanName(pl.name)))||null:null}}
    if(st.links)for(const p of bmPrints(x)){if(p.itemId&&p.itemId!==it.id)continue;const t=x.tasks.find(t=>'bambu:'+t.id===p.src);applyLink(p,partOf(t)||it);printsN++}}
  persist();renderList();$('bmDlg').close();setStatus([made&&`${_t("Создано изделий")}: ${made}`,linkedN&&`${_t("связано")}: ${linkedN}`,printsN&&`${_t("привязано печатей")}: ${printsN}`].filter(Boolean).join(' · ')||_t('Готово'));
  for(const [it,url] of photos)await savePhotoFromUrl(it,url)};
$('bmOpen').onclick=bmOpen;$('bmClose').onclick=()=>$('bmDlg').close();$('bmDlg').addEventListener('click',e=>{if(e.target===$('bmDlg'))$('bmDlg').close()});
$('bmReload').onclick=bmLoad;$('bmShowDone').onchange=bmRender;
$('bmList').addEventListener('change',e=>{const row=e.target.closest('[data-bm]');if(!row)return;const st=bmPick.get(row.dataset.bm),f=e.target.dataset.bmf;if(!st)return;
  if(f==='on'){st.on=e.target.checked;bmRender()}else if(f==='target')st.target=e.target.value;else if(f==='links')st.links=e.target.checked});

/* ================= Принтер: наработка, обслуживание, Bambu Cloud ================= */
// Регламент Bambu Lab для P2S (wiki.bambulab.com/en/p2s, раздел Maintenance).
const WIKI='https://wiki.bambulab.com/en/p2s/maintenance/';
const MAINT=[
  {id:'xy',name:_t('Очистка и смазка осей X и Y'),kind:'days',tier:[30,60,90],how:_t('Протереть валы, по 1–2 капли масла на каждые 5 см (не смазку!), медленно прогнать голову 3–5 раз. Затем полная калибровка.'),url:WIKI+'lubricate-x-y-z-axis'},
  {id:'z',name:_t('Очистка и смазка оси Z'),kind:'days',tier:[90,120,150],how:_t('Очистить ходовые винты и направляющие спиртом; винты — смазка, направляющие — масло; прогнать стол 3–5 раз. Затем полная калибровка.'),url:WIKI+'lubricate-x-y-z-axis'},
  {id:'idler',name:_t('Смазка натяжных роликов XY'),kind:'days',every:90,how:_t('По 1–2 капли масла в стык оси и подшипника. Bambu Lab рекомендует раз в 3–6 месяцев. Затем полная калибровка.'),url:WIKI+'idler-pulley-lubrication'},
  {id:'filter',name:_t('Замена воздушного (угольного) фильтра'),kind:'hours',every:1440,how:_t('Примерно через 1440 ч печати или раньше при сильном загрязнении.'),url:WIKI+'replace-air-filter'},
  {id:'cutter',name:_t('Проверка ножа филамента'),kind:'kg',every:8,abrasive:4,how:_t('Каждые 8–12 катушек; для абразивных (PA-CF, PA-GF, PPA-CF) — каждые 4–10. Заменить лезвие, если затупилось.'),url:WIKI+'period-maintenance'},
  {id:'camera',name:_t('Очистка камеры'),kind:'days',every:180,how:_t('Протереть объектив от налёта — иначе картинка мутнеет.'),url:WIKI+'period-maintenance'},
  {id:'nozzle',name:_t('Очистка сопла и нагревательного блока'),kind:'cond',how:_t('Нагреть до 250 °C, снять и протереть сопло, затем блок. В термоперчатках.'),url:WIKI+'period-maintenance'},
  {id:'fans',name:_t('Очистка вентиляторов головы'),kind:'cond',how:_t('Обдув модели и вентилятор хотэнда — при падении оборотов или шуме.'),url:WIKI+'period-maintenance'},
  {id:'extruder',name:_t('Очистка и смазка шестерён экструдера'),kind:'cond',how:_t('При проскальзывании или засоре. Немного смазки на шестерни — без излишков.'),url:WIKI+'period-maintenance'},
  {id:'pad',name:_t('Замена протирочной площадки сопла'),kind:'cond',how:_t('При повреждении или деформации.'),url:WIKI+'period-maintenance'},
  {id:'buffer',name:_t('Очистка буфера филамента'),kind:'cond',how:_t('При частых ошибках буфера во время печати.'),url:WIKI+'p2s-buffer-cleaning'},
  {id:'belts',name:_t('Натяжение ремней'),kind:'cond',how:_t('Принтер сам контролирует натяжение и напомнит, когда подтянуть.'),url:WIKI+'belt-tension'},
];
const ABRASIVE=/(^|[^a-z])(cf|gf)([^a-z]|$)|carbon|glass|абраз/i;
const dayMs=864e5,dDiff=(a,b)=>Math.round((Date.parse(a+'T12:00:00')-Date.parse(b+'T12:00:00'))/dayMs);
const addDays=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')};
const ruDate=d=>{const x=new Date(d+'T12:00:00');return isNaN(x)?d:x.toLocaleDateString(I18N.loc,{day:'numeric',month:'short',year:'numeric'})};
// Печати и прототипы по принтеру: дата, часы, граммы, абразив
function printerUsage(P){const ev=[];let ok=0,fail=0,failCost=0,cost=0;
  for(const p of db.prints){const it=db.items.find(i=>i.id===p.itemId);if(getPrinter(p.printerId||it?.printerId).id!==P.id)continue;const c=printCalc(p);
    ev.push({date:p.date,hours:c.hours,grams:c.grams,abr:p.usage.some(u=>ABRASIVE.test(getMat(u.materialId||getSpool(u.spoolId)?.materialId).name)),print:true,fail:p.result==='fail'});
    cost+=c.total;if(p.result==='fail'){fail++;failCost+=c.total}else ok++}
  for(const it of db.items){if(getPrinter(it.printerId).id!==P.id)continue;for(const pr of it.prototypes)if(pr.date&&(number(pr.hours)||number(pr.grams)))ev.push({date:pr.date,hours:number(pr.hours),grams:number(pr.grams),abr:ABRASIVE.test(getMat(pr.materialId).name)})}
  ev.sort((a,b)=>a.date.localeCompare(b.date));
  const logged=ev.reduce((a,e)=>a+e.hours,0),grams=ev.reduce((a,e)=>a+e.grams,0),first=P.since||ev[0]?.date||'';
  const t=today(),from=addDays(t,-60),span=Math.max(14,Math.min(60,first?dDiff(t,first)+1:60)),recent=ev.filter(e=>e.date>=from).reduce((a,e)=>a+e.hours,0);
  const perDay=recent/span,tier=perDay>=5?0:perDay>=1?1:2;
  return{ev,logged,hours:number(P.baseHours)+logged,grams,first,perDay,tier,ok,fail,failCost,cost,prints:ok+fail}}
const maintLog=(P,id)=>Array.isArray(P.maint?.[id])?P.maint[id]:[];
const maintCfg=(P,id)=>P.maintCfg?.[id]||{};
function maintEvery(P,T,U){const c=maintCfg(P,T.id);if(number(c.every))return number(c.every);if(T.tier)return T.tier[U.tier];if(T.kind==='kg'){const last=maintLog(P,T.id).at(-1)?.date||'';return U.ev.some(e=>e.abr&&e.date>=last)?T.abrasive:T.every}return T.every}
function maintState(P,T,U){const last=maintLog(P,T.id).at(-1),cfg=maintCfg(P,T.id),t=today();
  if(cfg.off)return{T,last,off:true,st:'off'};if(T.kind==='cond')return{T,last,st:'cond'};
  const every=maintEvery(P,T,U),refDate=last?.date||U.first||t;let used,unit,left,due='';
  if(T.kind==='days'){used=Math.max(0,dDiff(t,refDate));unit=_t('дн.');left=every-used;due=addDays(refDate,every)}
  else if(T.kind==='hours'){used=Math.max(0,U.hours-(last?number(last.hours):0));unit=_t('ч');left=every-used}
  else{used=Math.max(0,U.grams-(last?number(last.grams):0))/1000;unit=_t('кг');left=every-used}
  const r=every?used/every:0;return{T,last,every,used,unit,left,due,r,st:r>=1?'over':r>=.8?'soon':'ok'}}
const maintAll=(P,U=printerUsage(P))=>MAINT.map(T=>maintState(P,T,U));
const MST={over:[_t('Пора'),'fail'],soon:[_t('Скоро'),'wip'],ok:[_t('В норме'),'done'],cond:[_t('По состоянию'),'sp-empty'],off:[_t('Не отслеживается'),'sp-empty']};
function leftText(s){if(s.st==='cond'||s.st==='off')return'';const f=v=>s.unit===_t('кг')?fmt(v,1):fmt(v,0);
  if(s.left<0)return`${_t("просрочено на")} ${f(-s.left)} ${s.unit}`;return`${_t("осталось")} ${f(s.left)} ${s.unit}${s.due?` · ${_t("до")} ${ruDate(s.due)}`:''}`}
const usedText=s=>s.st==='cond'||s.st==='off'?'':`${s.unit===_t('кг')?fmt(s.used,1):fmt(s.used,0)} ${_t("из")} ${fmt(s.every,s.unit===_t('кг')?1:0)} ${s.unit}${s.unit===_t('кг')?_t(' (≈ катушек)'):''}`;
const TIER_TXT=[_t('≥ 5 ч в день'),_t('1–5 ч в день'),_t('< 1 ч в день')];

/* --- данные Bambu Cloud по принтерам (кэш в памяти) --- */
let cloud={at:0,busy:null,devices:[],print:[],ver:{},err:'',newTasks:null};
async function cloudRefresh(force){if(!BB.connected()||!BB.proxy())return cloud;if(cloud.busy)return cloud.busy;if(!force&&Date.now()-cloud.at<180e3)return cloud;
  cloud.busy=(async()=>{const linked=[...new Set(db.printers.map(P=>P.bambuDev).filter(Boolean))];
    const [dv,pr,tk]=await Promise.allSettled([BB.devices(),linked.length?BB.currentPrint():Promise.resolve([]),BB.tasks({limit:100})]);
    if(dv.status==='fulfilled')cloud.devices=dv.value;if(pr.status==='fulfilled')cloud.print=pr.value;
    if(tk.status==='fulfilled')cloud.newTasks=tk.value.filter(t=>t.result!=='running'&&!bbImported(t.id)).length;
    const vs=await Promise.allSettled(linked.map(id=>BB.deviceVersion(id)));linked.forEach((id,i)=>{if(vs[i].status==='fulfilled')cloud.ver[id]=vs[i].value});
    const bad=[dv,pr,tk,...vs].find(x=>x.status==='rejected');cloud.err=bad?bad.reason?.message||_t('Ошибка Bambu Cloud'):'';cloud.at=Date.now();return cloud})().finally(()=>{cloud.busy=null});
  return cloud.busy}
const cloudDev=P=>P.bambuDev?cloud.devices.find(d=>d.id===P.bambuDev):null;
const cloudPrint=P=>P.bambuDev?cloud.print.find(d=>d.id===P.bambuDev):null;
function cloudLine(P){const d=cloudDev(P),p=cloudPrint(P),v=cloud.ver[P.bambuDev];if(!P.bambuDev||!cloud.at)return'';const parts=[];
  if(d)parts.push(d.online?_t('<span class="dot on"></span>в сети'):_t('<span class="dot"></span>не в сети'));
  if(p&&p.task&&p.progress!=null&&p.progress<100&&!/finish|fail|idle/i.test(p.status))parts.push(`${_t("печатает")} «${escape(p.task)}» · ${fmt(p.progress,0)}%${p.remaining?` · ${_t("осталось")} ${fmtH(p.remaining/3600)}`:''}`);
  if(v?.update)parts.push(`<span class="pill wip">${_t("прошивка")} ${escape(v.update.version)}${v.update.force?_t(' — обязательная'):''}</span>`);
  return parts.join(' · ')}

/* --- страница «Принтер» --- */
const PR_TABS=['state','maint','stats'];let prId='',prTab='state';
const curPrinter=()=>db.printers.find(p=>p.id===prId)||getPrinter('');
function setPrTab(t,push=true){prTab=PR_TABS.includes(t)?t:'state';document.querySelectorAll('#page-printer [data-prpane]').forEach(p=>p.hidden=p.dataset.prpane!==prTab);document.querySelectorAll('#prTabs [data-tab]').forEach(b=>{b.classList.toggle('on',b.dataset.tab===prTab);b.setAttribute('aria-selected',b.dataset.tab===prTab)});if(push)history.replaceState(null,'','#printer/'+curPrinter().id+(prTab==='state'?'':'/'+prTab))}
function renderPrinterPage(){const P=curPrinter();prId=P.id;const U=printerUsage(P),M=maintAll(P,U),d=cloudDev(P);
  $('prSel').innerHTML=db.printers.map(x=>`<option value="${escape(x.id)}"${x.id===P.id?' selected':''}>${escape(x.name)}</option>`).join('');$('prSel').hidden=db.printers.length<2;
  $('prTitle').textContent=P.name;$('prMeta').innerHTML=[d?escape(d.model||d.name):'',d?.nozzle?`${_t("сопло")} ${escape(d.nozzle)} ${_t("мм")}`:'',`${_t("наработка")} ${fmtH(U.hours)}`,cloudLine(P)].filter(Boolean).join(' · ');
  const over=M.filter(s=>s.st==='over').length,soon=M.filter(s=>s.st==='soon').length;$('prTabMaintN').textContent=over||soon||'';$('prTabMaintN').className='tabn'+(over?' bad':soon?' warn':'');
  // Состояние
  const life=number(P.years)*number(P.annualHours),v=cloud.ver[P.bambuDev],cp=cloudPrint(P);
  const tiles=[[_t('Наработка'),fmtH(U.hours),number(P.baseHours)?`${fmtH(U.logged)} ${_t("по журналу")} + ${fmtH(number(P.baseHours))} ${_t("до учёта")}`:_t('по журналу печати и прототипам')],
    [_t('Загрузка'),`${fmt(U.perDay,1)} ${_t("ч/день")}`,`${_t("за последние 60 дней")} · ${TIER_TXT[U.tier]}`],[_t('Печатей'),fmt(U.prints,0),U.prints?`✓ ${U.ok} · ✕ ${U.fail} · ${_t("успешных")} ${Math.round(U.ok/U.prints*100)}%`:''],
    [_t('Ресурс амортизации'),life?fmt(U.hours/life*100,1)+'%':'—',life?`${fmt(U.hours,0)} ${_t("из")} ${fmt(life,0)} ${_t("ч")}`:''],[_t('Филамент'),U.grams>=1000?fmt(U.grams/1000,2)+_t(' кг'):fmt(U.grams,0)+_t(' г'),U.hours?`${fmt(U.grams/U.hours,1)} ${_t("г/ч")}`:''],[_t('В работе с'),U.first?ruDate(U.first):'—',U.first?`${fmt(dDiff(today(),U.first),0)} ${_t("дн")}.`:'']];
  $('prTiles').innerHTML=tiles.map(([l,v,s])=>`<div class="stat"><span class="muted">${l}</span><strong>${v}</strong>${s?`<small>${s}</small>`:''}</div>`).join('');
  let cl='';if(!BB.connected())cl=`<p class="muted" style="margin:0">${_t("Подключите Bambu Lab Cloud в")} <a class="lnk" href="#settings">${_t("настройках")}</a>, ${_t("чтобы видеть статус, текущую печать и обновления прошивки")}.</p>`;
  else if(!P.bambuDev){const free=cloud.devices.filter(x=>!db.printers.some(y=>y.bambuDev===x.id));cl=`<p class="muted" style="margin:0 0 10px">${_t("Принтер не связан с Bambu Cloud")}.</p>${free.length?`<div class="buttons" style="margin:0">${free.map(x=>`<button class="secondary" data-prlink="${escape(x.id)}">${_t("Связать с")} «${escape(x.name||x.model)}»${x.model&&x.name!==x.model?' · '+escape(x.model):''}</button>`).join('')}</div>`:cloud.at?_t('<p class="muted">Свободных принтеров в аккаунте нет.</p>'):_t('<p class="muted">Загрузка списка принтеров…</p>')}`}
  else{const rows=[[_t('Принтер'),d?`${escape(d.name)} · ${escape(d.model)}`:_t('не найден в аккаунте')],[_t('Статус'),d?(d.online?_t('<span class="dot on"></span>в сети'):_t('<span class="dot"></span>не в сети'))+(d.printStatus?` · ${escape(d.printStatus)}`:''):'—'],[_t('Сопло'),d?.nozzle?escape(d.nozzle)+_t(' мм'):'—'],
      [_t('Текущая печать'),cp&&cp.task?`${escape(cp.task)}${cp.progress!=null?` · ${fmt(cp.progress,0)}%`:''}${cp.remaining?` · ${_t("осталось")} ${fmtH(cp.remaining/3600)}`:''}`:_t('нет')],
      [_t('Прошивка'),v?`${escape(v.version||'—')}${v.update?` → <b>${_t("доступна")} ${escape(v.update.version)}</b>${v.update.force?_t(' (обязательная)'):''}`:_t(' · последняя')}`:'—'],
      [_t('Новых заданий в облаке'),cloud.newTasks==null?'—':cloud.newTasks?`${cloud.newTasks} · <a class="lnk" href="#log" data-bbopen>${_t("импортировать →")}</a>`:_t('нет')]];
    cl=`<div class="breakdown" style="margin-top:0">${rows.map(([a,b])=>`<div class="line"><span>${a}</span><span style="text-align:right">${b}</span></div>`).join('')}</div>${v?.update?.description?`<details class="more"><summary>${_t("Что нового в")} ${escape(v.update.version)}</summary><div class="muted" style="white-space:pre-wrap">${escape(v.update.description.replace(/<[^>]+>/g,'')).slice(0,3000)}</div></details>`:''}${cp?.thumb?`<img class="prthumb" src="${escape(cp.thumb)}" alt="" referrerpolicy="no-referrer">`:''}`}
  $('prCloud').innerHTML=(cloud.err&&BB.connected()?`<div class="notice" style="margin-bottom:10px">${escape(cloud.err)}</div>`:'')+cl;
  const next=M.filter(s=>s.st==='over'||s.st==='soon').sort((a,b)=>b.r-a.r);
  $('prNext').innerHTML=next.length?next.map(maintRowMini).join(''):_t('<p class="muted" style="margin:0">Все регламентные работы в норме.</p>');
  // Обслуживание
  $('prMaintSub').textContent=`${_t("Интервалы смазки подобраны по загрузке")}: ${fmt(U.perDay,1)} ${_t("ч/день")} (${TIER_TXT[U.tier]}). ${_t("Наработка")} ${fmtH(U.hours)}.${M.some(x=>!x.last&&x.st!=='cond'&&x.st!=='off')?` ${_t("Для работ без отметок отсчёт идёт от")} ${U.first?ruDate(U.first):_t('сегодня')} (${_t("поле «В работе с» в настройках принтера) — отметьте, когда вы их делали в последний раз: «История и настройка» → дата")}.`:''}`;
  $('prMaint').innerHTML=M.map(s=>maintRow(P,s)).join('');updNavPrinter();
  // Статистика
  const by=new Map();for(const e of U.ev){const k=e.date.slice(0,7),m=by.get(k)||{hours:0,grams:0,n:0,fail:0};m.hours+=e.hours;m.grams+=e.grams;if(e.print){m.n++;if(e.fail)m.fail++}by.set(k,m)}
  const ms=[...by.entries()].sort((a,b)=>b[0].localeCompare(a[0])).slice(0,12),mx=Math.max(0,...ms.map(([,m])=>m.hours));
  $('prMonths').innerHTML=ms.length?ms.map(([k,m])=>`<tr><td>${MONTHS[+k.slice(5,7)-1]} ${k.slice(0,4)}</td><td class="num">${fmtH(m.hours)}</td><td class="num">${m.n}</td><td class="num">${m.n?Math.round((m.n-m.fail)/m.n*100)+'%':'—'}</td><td class="num">${fmt(m.grams,0)} ${_t("г")}</td><td style="width:30%"><div class="minibar"><div style="width:${mx?m.hours/mx*100:0}%"></div></div></td></tr>`).join(''):_t('<tr><td colspan="6" class="muted">Печатей на этом принтере пока нет.</td></tr>');
  $('prStatTiles').innerHTML=[[_t('Средняя печать'),U.prints?fmtH(U.ev.filter(e=>e.print).reduce((a,e)=>a+e.hours,0)/U.prints):'—'],[_t('Себестоимость печатей'),money(U.cost)],[_t('Потери на неудачных'),money(U.failCost)],[_t('Электроэнергия'),fmt(U.logged*number(P.watts)/1000,1)+_t(' кВт·ч')]].map(([l,v])=>`<div class="stat"><span class="muted">${l}</span><strong>${v}</strong></div>`).join('')}
const maintBar=s=>s.st==='cond'||s.st==='off'?'':`<div class="minibar mbar ${s.st}"><div style="width:${Math.min(100,s.r*100)}%"></div></div>`;
const maintRowMini=s=>`<div class="mt-row mini"><span class="pill ${MST[s.st][1]}">${MST[s.st][0]}</span><div><b>${escape(s.T.name)}</b><div class="muted" style="font-size:12px">${leftText(s)}</div></div></div>`;
function maintRow(P,s){const T=s.T,log=maintLog(P,T.id),cfg=maintCfg(P,T.id);
  return`<div class="mt-row" data-mt="${T.id}"><div class="mhead"><span class="pill ${MST[s.st][1]}">${MST[s.st][0]}</span><div class="mmain"><b>${escape(T.name)}</b><div class="muted" style="font-size:12.5px">${escape(T.how)} <a class="lnk" href="${T.url}" target="_blank" rel="noopener">${_t("Инструкция ↗")}</a></div>
    <div class="tl-meta">${s.last?`<span>${_t("последний раз")} ${ruDate(s.last.date)}${T.kind==='hours'?` · ${_t("на")} ${fmt(number(s.last.hours),0)} ${_t("ч")}`:''}</span>`:_t('<span>ещё не отмечалось</span>')}${usedText(s)?`<span>${usedText(s)}</span>`:''}${leftText(s)?`<span><b>${leftText(s)}</b></span>`:''}</div>${maintBar(s)}</div>
    <button type="button" class="secondary small" data-mdone>${_t("✓ Выполнено")}</button></div>
    <details class="more mset"><summary>${_t("История и настройка")}</summary>
      ${log.length?`<div class="breakdown" style="margin-top:0">${log.slice().reverse().map((e,i)=>`<div class="line"><span>${ruDate(e.date)}</span><span>${fmt(number(e.hours),0)} ${_t("ч")} <button type="button" class="iconbtn danger" data-mdel="${log.length-1-i}" title="${_t("Удалить запись")}">×</button></span></div>`).join('')}</div>`:_t('<p class="muted" style="margin:0">Записей нет.</p>')}
      <div class="fields" style="margin-top:8px"><label>${_t("Выполнено (дата")})<input type="date" data-mdate value="${today()}"></label>${T.kind==='cond'?'':`<label>${_t("Интервал")}, ${T.kind==='days'?_t('дней'):T.kind==='hours'?_t('часов'):_t('кг (катушек)')}<input type="number" min="0" step="${T.kind==='kg'?'0.5':'1'}" data-mevery value="${number(cfg.every)||''}" placeholder="${T.tier?_t('авто: ')+T.tier.join(' / '):T.every}"></label>`}</div>
      <div class="buttons"><button type="button" class="secondary small" data-madd>+ ${_t("Отметить выполнение этой датой")}</button><label class="check" style="margin:0"><input type="checkbox" data-moff${cfg.off?' checked':''}> ${_t("Не отслеживать")}</label></div></details></div>`}
function maintDone(P,id,date){const U=printerUsage(P),before=U.ev.filter(e=>e.date<=date);P.maint??={};const l=(P.maint[id]??=[]);
  l.push({date,hours:Math.round((number(P.baseHours)+before.reduce((a,e)=>a+e.hours,0))*100)/100,grams:Math.round(before.reduce((a,e)=>a+e.grams,0))});l.sort((a,b)=>a.date.localeCompare(b.date));if(l.length>30)l.splice(0,l.length-30);
  persist();renderPrinterPage();if(currentPage==='home')renderDash();setStatus(_t('Обслуживание отмечено'))}
$('prMaint').addEventListener('click',e=>{const row=e.target.closest('[data-mt]');if(!row)return;const P=curPrinter(),id=row.dataset.mt;
  if(e.target.closest('[data-mdone]'))maintDone(P,id,today());
  else if(e.target.closest('[data-madd]')){const d=row.querySelector('[data-mdate]').value;if(!d)return;if(d>today()){alert(_t('Дата не может быть в будущем'));return}maintDone(P,id,d);setTimeout(()=>{const r=$('prMaint').querySelector(`[data-mt="${id}"] details`);if(r)r.open=true},0)}
  else{const del=e.target.closest('[data-mdel]');if(del&&confirm(_t('Удалить запись об обслуживании?'))){maintLog(P,id).splice(+del.dataset.mdel,1);persist();renderPrinterPage();setTimeout(()=>{const r=$('prMaint').querySelector(`[data-mt="${id}"] details`);if(r)r.open=true},0)}}});
$('prMaint').addEventListener('change',e=>{const row=e.target.closest('[data-mt]');if(!row)return;const P=curPrinter(),id=row.dataset.mt;P.maintCfg??={};const c=(P.maintCfg[id]??={});
  if(e.target.matches('[data-mevery]'))c.every=number(e.target.value)||undefined;else if(e.target.matches('[data-moff]'))c.off=e.target.checked||undefined;else return;
  if(!c.every&&!c.off)delete P.maintCfg[id];persist();renderPrinterPage();setTimeout(()=>{const r=$('prMaint').querySelector(`[data-mt="${id}"] details`);if(r)r.open=true},0)});
$('prTabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)setPrTab(b.dataset.tab)};
$('prSel').onchange=()=>{prId=$('prSel').value;go('printer/'+prId+(prTab==='state'?'':'/'+prTab))};
$('prRefresh').onclick=async()=>{if(!BB.connected()){go('settings');return}$('prRefresh').disabled=true;try{await cloudRefresh(true)}finally{$('prRefresh').disabled=false}renderPrinterPage();if(cloud.err)setStatus(cloud.err)};
$('page-printer').addEventListener('click',e=>{const l=e.target.closest('[data-prlink]');if(l){const P=curPrinter();P.bambuDev=l.dataset.prlink;persist();cloud.at=0;cloudRefresh(true).then(renderPrinterPage);renderPrinterPage();setStatus(_t('Принтер связан с Bambu Cloud'))}
  if(e.target.closest('[data-bbopen]')){e.preventDefault();bbOpen()}
  const tg=e.target.closest('[data-tabgo]');if(tg)setPrTab(tg.dataset.tabgo)});
function openPrinterPage(rest){const [id,tab]=String(rest||'').split('/');prId=db.printers.some(p=>p.id===id)?id:getPrinter('').id;show('printer');setPrTab(tab||'state',false);renderPrinterPage();
  cloudRefresh().then(()=>{if(currentPage==='printer')renderPrinterPage()}).catch(()=>{})}

/* --- карточка принтера на главной --- */
function renderDashPrinter(){const list=db.printers.filter(P=>P.id===getPrinter('').id||printerUsage(P).ev.length);
  $('dPrinter').innerHTML=list.map(P=>{const U=printerUsage(P),M=maintAll(P,U),next=M.filter(s=>s.st==='over'||s.st==='soon').sort((a,b)=>b.r-a.r),line=cloudLine(P);
    return`<div class="dpr"><div class="dpr-head"><div><a href="#printer/${escape(P.id)}" class="lnk"><b>${escape(P.name)}</b></a><div class="muted" style="font-size:12.5px">${line||_t('наработка по журналу печати')}</div></div><div class="dpr-h"><strong>${fmtH(U.hours)}</strong><small class="muted">${_t("наработка")} · ${fmt(U.perDay,1)} ${_t("ч/день")}</small></div></div>
      ${next.length?next.slice(0,3).map(maintRowMini).join(''):_t('<p class="muted" style="margin:6px 0 0">✓ Регламентные работы в норме</p>')}
      <div class="dpr-foot"><a href="#printer/${escape(P.id)}/maint" class="lnk">${_t("Обслуживание →")}</a>${cloud.newTasks?`<a href="#log" class="lnk" data-bbopen>${_t("В Bambu Cloud новых заданий")}: ${cloud.newTasks} →</a>`:''}</div></div>`}).join('')}
$('dPrinter').addEventListener('click',e=>{if(e.target.closest('[data-bbopen]')){e.preventDefault();bbOpen()}});

/* --- таблица принтеров в статистике --- */
function renderStatPrinters(){const rows=db.printers.map(P=>{const U=printerUsage(P),life=number(P.years)*number(P.annualHours),M=maintAll(P,U),over=M.filter(s=>s.st==='over').length,soon=M.filter(s=>s.st==='soon').length;
    return`<tr class="click" data-goprinter="${escape(P.id)}"><td><b>${escape(P.name)}</b></td><td class="num">${fmtH(U.hours)}</td><td class="num">${fmt(U.perDay,1)} ${_t("ч")}</td><td class="num">${U.prints}</td><td class="num">${U.prints?Math.round(U.ok/U.prints*100)+'%':'—'}</td><td class="num">${U.grams>=1000?fmt(U.grams/1000,2)+_t(' кг'):fmt(U.grams,0)+_t(' г')}</td><td class="num">${money(U.failCost)}</td><td class="num">${life?fmt(U.hours/life*100,1)+'%':'—'}</td><td>${over?`<span class="pill fail">${_t("пора")}: ${over}</span>`:soon?`<span class="pill wip">${_t("скоро")}: ${soon}</span>`:_t('<span class="pill done">в норме</span>')}</td></tr>`}).join('');
  $('statPrinters').innerHTML=rows;
  updNavPrinter()}
function updNavPrinter(){$('navPrinter').textContent=db.printers.reduce((n,P)=>n+maintAll(P).filter(s=>s.st==='over').length,0)||''}
$('statPrinters').addEventListener('click',e=>{const r=e.target.closest('[data-goprinter]');if(r)go('printer/'+r.dataset.goprinter)});

function bambuDevOptions(sel){const ds=cloud.devices;return _t('<option value="">— не связан —</option>')+ds.map(d=>`<option value="${escape(d.id)}"${d.id===sel?' selected':''}>${escape(d.name||d.id)}${d.model?' · '+escape(d.model):''}</option>`).join('')+(sel&&!ds.some(d=>d.id===sel)?`<option value="${escape(sel)}" selected>${escape(sel)}</option>`:'')+(ds.length?'':_t('<option value="" disabled>подключите Bambu Cloud, чтобы выбрать</option>'))}

/* ================= Запуск ================= */
(async()=>{
  let stored=null;try{stored=await idbGet('kv','db')}catch{}
  if(!stored)try{stored=JSON.parse(localStorage.getItem(LS2_KEY))}catch{}
  const split=needSplit(stored);if(split)await snapshotLocal(_t('перед переносом элементов во вложенные изделия'),stored);
  try{db=valid(stored);if(split)saveLocal()}catch{try{db=valid(JSON.parse(localStorage.getItem(LS_KEY)))}catch{db=valid({materials:baseMaterials,items:[]})}saveLocal()}
  try{const h=await idbGet('handles','file');if(h)legacyFileName=h.name}catch{}
  getSnaps().then(l=>{if(!l[0]||Date.now()-Date.parse(l[0].at)>20*3600e3)snapshotLocal(_t('ежедневный снимок'));else renderSnaps()});
  fillSettings();renderMaterials();renderPrinters();renderLibs();renderCalcProtos();renderCalc();renderList();route();updateStoreUi();
  let kind=null;try{kind=localStorage.getItem(STORE_KEY)}catch{}
  let st=null;
  if(kind==='gdrive'&&window.GDrive.configured()){st=gdStore();window.GDrive.preload().catch(()=>{})}
  else if(fsOK&&kind!=='gdrive'){let d=null;try{d=await idbGet('handles','dir')}catch{}if(d)st=folderStore(d)}
  if(st){store=st;updateStoreUi();try{if(await st.ensure(false))await connect(st,'restore')}catch(e){stError=e?.message||String(e);stReady=false;updateStoreUi()}}
})();
})();
