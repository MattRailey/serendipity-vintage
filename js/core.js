/* Vintage Shop — core.js
   Shared helpers, the on-device store (IndexedDB), and record-by-record merging.
   Classic script in a shared global scope, loaded with defer in a fixed order: see DEVELOPER.md. */
'use strict';

/* ============================================================
   Storage model
   ------------------------------------------------------------
   One JSON store, vintage-shop.json:
     { format, version, updatedAt, items:[], hauls:[], expenses:[], stores:[], settings }
   Every record carries its own `updatedAt` (ms) and `ft` (per-field change times).
   Deleting leaves a tombstone { id, deleted:true, updatedAt } so the delete reaches
   other devices instead of the record coming back.
   ============================================================ */
const COLS = ['items', 'hauls', 'expenses', 'stores'];
const FOLDER_KEY = 'tamarack_vintage_folder';
(function(){ // set-up link: ?folder=/Vintage Shop&appkey=abc123 prepares a phone in one tap
  const q=new URLSearchParams(location.search); if(q.has('code') || !q.has('folder')) return;
  let f=q.get('folder').trim(); if(!f.startsWith('/')) f='/'+f; f=f.replace(/\/+$/,'');
  try{ localStorage.setItem(FOLDER_KEY, f); if(q.has('appkey')) localStorage.setItem('tamarack_vintage_dropbox_appkey', q.get('appkey').trim()); }catch(e){}
  q.delete('folder'); q.delete('appkey'); history.replaceState(null,'', location.pathname+(q.toString()?'?'+q:'')+location.hash);
  window.__setupLink=f;
})();
const STORE_KEY  = 'tamarack_vintage_store_v1';
const PREV_KEY   = 'tamarack_vintage_store_prev';
const UI_KEY     = 'tamarack_vintage_ui';
const SYNCED_KEY = 'tamarack_vintage_synced_sig';
const DEFAULT_DBX_APP_KEY = '';
const DBX_APPKEY_KEY   = 'tamarack_vintage_dropbox_appkey';
const DBX_TOKENS_KEY   = 'tamarack_vintage_dropbox_tokens';
const DBX_VERIFIER_KEY = 'tamarack_vintage_dropbox_pkce';
function dbxFolder(){ let f=String(lsGet(FOLDER_KEY)||'/Vintage Shop').trim().replace(/\\/g,'/').replace(/\/+$/,''); if(!f.startsWith('/')) f='/'+f; return f||'/Vintage Shop'; }
function dbxArg(o){ return JSON.stringify(o).replace(/[\u007f-￿]/g,c=>'\\u'+('000'+c.charCodeAt(0).toString(16)).slice(-4)); }
function dbxPath(){ return dbxFolder()+'/vintage-shop.json'; }
function dbxAppKey(){ return (lsGet(DBX_APPKEY_KEY) || DEFAULT_DBX_APP_KEY || '').trim(); }
function redirectUri(){ return location.origin + location.pathname.replace(/\.html$/,''); }

const $ = id => document.getElementById(id);
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function uid(p){ return (p||'r') + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function norm(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
function natCmp(a,b){ return String(a||'').localeCompare(String(b||''), undefined, {numeric:true, sensitivity:'base'}); }
// Dates are local calendar days ('YYYY-MM-DD'), never converted through UTC.
function ymd(d){ d=d||new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function todayLocal(){ return ymd(new Date()); }
function parseYmd(s){ const p=String(s||'').split('-').map(Number); return p.length===3&&p[0] ? new Date(p[0],p[1]-1,p[2]) : null; }
function fmtDate(s, withYear){ const d=parseYmd(s); if(!d) return s||''; const o={month:'short',day:'numeric'}; if(withYear||d.getFullYear()!==new Date().getFullYear()) o.year='numeric'; return d.toLocaleDateString(undefined,o); }
function num(v){ if(v===''||v==null) return null; const n=Number(String(v).replace(/[$,\s]/g,'')); return isFinite(n)?n:null; }
function money(n, cents){ const v=Number(n||0); return (v<0?'−':'')+'$'+Math.abs(v).toLocaleString(undefined,{minimumFractionDigits:cents?2:(v%1?2:0), maximumFractionDigits:2}); }
function round2(n){ return Math.round((Number(n)||0)*100)/100; }
function toast(msg, ms){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'), ms||2600); }

function emptyStore(){ const s={ format:'tamarack-vintage', version:1, updatedAt:0, settings:{} }; for(const c of COLS) s[c]=[]; return s; }
function validStore(s){ return s && typeof s==='object' && s.format==='tamarack-vintage' && Array.isArray(s.items); }
function fixStore(s){ for(const c of COLS) if(!Array.isArray(s[c])) s[c]=[]; if(!s.settings||typeof s.settings!=='object') s.settings={}; return s; }
function loadStore(){
  for(const k of [STORE_KEY, PREV_KEY]){ try{ const s=JSON.parse(lsGet(k)||''); if(validStore(s)) return fixStore(s); }catch(e){} }
  return emptyStore();
}
let store = loadStore();

/* On-device copy + photo cache + upload queue all live in IndexedDB. */
const IDB_NAME='tamarack_vintage', IDB_OS='kv';
let _idbP=null;
function idb(){
  if(!_idbP) _idbP=new Promise((res,rej)=>{
    try{ if(!window.indexedDB) return rej(new Error('no indexedDB'));
      const r=indexedDB.open(IDB_NAME,1);
      r.onupgradeneeded=()=>r.result.createObjectStore(IDB_OS);
      r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); r.onblocked=()=>rej(new Error('blocked'));
    }catch(e){ rej(e); }
  });
  return _idbP;
}
async function idbGet(k){ const db=await idb(); return new Promise((res,rej)=>{ const q=db.transaction(IDB_OS).objectStore(IDB_OS).get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); }
async function idbPut(k,v){ const db=await idb(); return new Promise((res,rej)=>{ const t=db.transaction(IDB_OS,'readwrite'); t.objectStore(IDB_OS).put(v,k); t.oncomplete=()=>res(true); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error||new Error('aborted')); }); }
async function idbDel(k){ const db=await idb(); return new Promise((res,rej)=>{ const t=db.transaction(IDB_OS,'readwrite'); t.objectStore(IDB_OS).delete(k); t.oncomplete=()=>res(true); t.onerror=()=>rej(t.error); }); }
async function idbKeys(prefix){ const db=await idb(); return new Promise((res,rej)=>{ const q=db.transaction(IDB_OS).objectStore(IDB_OS).getAllKeys(); q.onsuccess=()=>res(q.result.filter(k=>String(k).startsWith(prefix))); q.onerror=()=>rej(q.error); }); }

async function loadFromIdb(){
  try{
    let s=null;
    for(const k of [STORE_KEY, PREV_KEY]){ try{ const raw=await idbGet(k); if(raw){ const p=JSON.parse(raw); if(validStore(p)){ s=fixStore(p); break; } } }catch(e){} }
    if(!s) return;
    const merged=mergeStores(store, s);
    if(sig(merged)!==sig(store)){ store=merged; snapAll(); refreshAll(); }
  }catch(e){}
}
let _saveT=null, _lastSaved=null, _warned=false;
function writeLocal(){ clearTimeout(_saveT); _saveT=setTimeout(saveLocalNow, 300); }
async function saveLocalNow(){
  const json=JSON.stringify(store);
  try{
    if(_lastSaved) await idbPut(PREV_KEY, _lastSaved);
    await idbPut(STORE_KEY, json); _lastSaved=json;
    try{ localStorage.removeItem(STORE_KEY); localStorage.removeItem(PREV_KEY); }catch(e){}
    return;
  }catch(e){}
  if(lsSet(STORE_KEY, json)) return;
  if(_warned) return; _warned=true;
  toast('Could not save on this device — connect Dropbox in Settings so nothing is lost.');
}

/* Per-field change stamps: a price fixed on the phone and a listing written by Claude both survive. */
const _snap=new Map();
const FT_SKIP=new Set(['id','updatedAt','ft']);
const blankish=v=>v==null || v==='' || v===false || (Array.isArray(v)&&!v.length) || (typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).length);
const sameVal=(a,b)=>(blankish(a)&&blankish(b)) || JSON.stringify(a)===JSON.stringify(b);
const rkey=(c,id)=>c+':'+id;
function snapAll(){ _snap.clear(); for(const c of COLS) for(const r of store[c]) _snap.set(rkey(c,r.id),{u:r.updatedAt, v:JSON.parse(JSON.stringify(r))}); }
function stampFields(){
  for(const c of COLS) for(const r of store[c]){
    if(r.deleted) continue;
    const s=_snap.get(rkey(c,r.id));
    if(s && s.u!==r.updatedAt){
      const keys=new Set(Object.keys(r).concat(Object.keys(s.v)));
      for(const k of keys){ if(FT_SKIP.has(k)) continue;
        if(!sameVal(r[k], s.v[k])){ r.ft=Object.assign({}, r.ft); r.ft[k]=r.updatedAt||Date.now(); } }
    }
    if(!s || s.u!==r.updatedAt) _snap.set(rkey(c,r.id),{u:r.updatedAt, v:JSON.parse(JSON.stringify(r))});
  }
}
function commit(){
  stampFields();
  store.updatedAt=Date.now();
  writeLocal(); markDirty(); schedulePush(); refreshAll();
}
function touch(r){ r.updatedAt=Math.max(Date.now(), (r.updatedAt||0)+1); return r; }
function liveOf(c){ return store[c].filter(r=>!r.deleted); }
function getRec(c,id){ return store[c].find(r=>r.id===id && !r.deleted); }
function removeRec(c,id){ const i=store[c].findIndex(r=>r.id===id); if(i>=0) store[c][i]={ id, deleted:true, updatedAt:Date.now() }; }
function setting(k, dflt){ const v=(store.settings||{})[k]; return v==null||v==='' ? dflt : v; }
function setSetting(k, v){ store.settings=Object.assign({}, store.settings, {[k]:v, updatedAt:Date.now()}); }

function mergeRec(nw, old){
  if(nw.deleted || old.deleted || !old.ft) return nw;
  let out=null;
  for(const k in old.ft){
    if(old.ft[k] > ((nw.ft||{})[k]||0) && !sameVal(old[k], nw[k])){
      if(!out) out=Object.assign({}, nw, {ft:Object.assign({}, nw.ft), updatedAt:Math.max(nw.updatedAt||0, old.updatedAt||0)+1});
      if(old[k]===undefined) delete out[k]; else out[k]=old[k];
      out.ft[k]=old.ft[k];
    }
  }
  return out || nw;
}
function mergeList(a, b){
  const map=new Map();
  for(const r of a||[]) map.set(r.id, r);
  for(const r of b||[]){
    const cur=map.get(r.id);
    if(!cur){ map.set(r.id, r); continue; }
    if((r.updatedAt||0)===(cur.updatedAt||0)) continue;
    const [nw, old]=(r.updatedAt||0)>(cur.updatedAt||0) ? [r,cur] : [cur,r];
    map.set(r.id, mergeRec(nw, old));
  }
  return [...map.values()];
}
function mergeStores(a, b){
  const out={ format:'tamarack-vintage', version:1, updatedAt:Math.max(a.updatedAt||0, b.updatedAt||0) };
  for(const c of COLS) out[c]=mergeList(a[c], b[c]);
  out.settings=((b.settings||{}).updatedAt||0) > ((a.settings||{}).updatedAt||0) ? b.settings : (a.settings||b.settings||{});
  return out;
}
function sig(s){ return COLS.map(c=>(s[c]||[]).map(r=>r.id+':'+(r.updatedAt||0)+(r.deleted?'x':'')).sort().join('|')).join('#') + '#s' + ((s.settings||{}).updatedAt||0); }

/* ---- Piece codes: YYMM-### (e.g. 2609-014), numbered per month, written on masking tape. ---- */
function nextCodes(n, dateStr){
  const d=parseYmd(dateStr)||new Date();
  const pre=String(d.getFullYear()).slice(2)+String(d.getMonth()+1).padStart(2,'0')+'-';
  let max=0; for(const it of store.items){ if(it.code && it.code.startsWith(pre)){ const k=parseInt(it.code.slice(5),10); if(k>max) max=k; } }
  return Array.from({length:n}, (_,i)=>pre+String(max+i+1).padStart(3,'0'));
}

/* ---- Taxes: IRS business standard mileage rate by year (irs.gov). Editable in Settings. ---- */
const IRS_MILEAGE = { 2024:0.67, 2025:0.70, 2026:0.725 };
function mileageRate(year){ const s=(store.settings||{}).mileageRates||{}; return num(s[year]) ?? IRS_MILEAGE[year] ?? IRS_MILEAGE[Math.max(...Object.keys(IRS_MILEAGE).map(Number))]; }
