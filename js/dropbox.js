/* Serendipity Vintage — dropbox.js
   Dropbox sign-in (OAuth PKCE), revision-checked download/upload of vintage-shop.json,
   the sync loop, the photo upload queue (works offline), and photo thumbnails.
   See DEVELOPER.md. */
'use strict';

function dbxTokens(){ try{ const r=lsGet(DBX_TOKENS_KEY); return r?JSON.parse(r):null; }catch(e){ return null; } }
async function dbxToken(){
  const t=dbxTokens();
  if(!t || !t.refresh_token && !t.access_token) return null;
  if(t.expires_at && t.expires_at-60000 > Date.now()) return t;
  if(!t.refresh_token) return t;
  try{
    const r=await fetch('https://api.dropboxapi.com/oauth2/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({ grant_type:'refresh_token', refresh_token:t.refresh_token, client_id:dbxAppKey() }) });
    const j=await r.json();
    if(!j.access_token) return null;
    t.access_token=j.access_token; t.expires_at=Date.now()+j.expires_in*1000;
    lsSet(DBX_TOKENS_KEY, JSON.stringify(t));
    return t;
  }catch(e){ return null; }
}
async function dbxDownload(){
  const t=await dbxToken();
  if(!t) return { connected:false };
  const r=await fetch('https://content.dropboxapi.com/2/files/download', { method:'POST',
    headers:{ 'Authorization':'Bearer '+t.access_token, 'Dropbox-API-Arg':dbxArg({path:dbxPath()}) } });
  if(r.status===409) return { connected:true, data:null, rev:null };
  if(r.status===401) return { connected:false, expired:true };
  if(!r.ok) throw new Error('download failed (HTTP '+r.status+')');
  let rev=null; try{ rev=JSON.parse(r.headers.get('Dropbox-API-Result')||'{}').rev||null; }catch(e){}
  const data=JSON.parse(await r.text());
  if(!validStore(data)) throw new Error('the Dropbox file isn\'t a Serendipity Vintage file — not touching it');
  return { connected:true, data:fixStore(data), rev };
}
// Written indented, with the important fields first, so it reads well when opened in Dropbox.
const KEY_ORDER=['id','code','title','status','type','size','era','brand','measurements','condition','notes','dictation','cost','haulId',
  'price','channel','listedAt','soldAt','soldPrice','fees','shipCost','photos','listing',
  'date','store','storeId','total','count','miles','receipt','category','vendor','amount','name','town','roundTrip'];
function readableJSON(s){
  const tidy=r=>{ if(r.deleted) return r; const o={}; for(const k of KEY_ORDER) if(k in r) o[k]=r[k]; for(const k in r) if(!(k in o)) o[k]=r[k]; return o; };
  const out={ format:s.format, version:s.version, updatedAt:s.updatedAt, settings:s.settings };
  for(const c of COLS) out[c]=(s[c]||[]).map(tidy);
  return JSON.stringify(out, null, 2);
}
async function dbxUpload(s, rev){
  const t=await dbxToken();
  if(!t) return { ok:false };
  const mode=rev ? { '.tag':'update', update:rev } : 'add';
  const r=await fetch('https://content.dropboxapi.com/2/files/upload', { method:'POST',
    headers:{ 'Authorization':'Bearer '+t.access_token, 'Content-Type':'application/octet-stream',
      'Dropbox-API-Arg':dbxArg({ path:dbxPath(), mode, autorename:false, mute:true }) },
    body:readableJSON(s) });
  if(r.ok) return { ok:true };
  if(r.status===409) return { ok:false, conflict:true };
  throw new Error('upload failed (HTTP '+r.status+')');
}

function b64url(bytes){ return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
async function dbxConnect(){
  const key=dbxAppKey();
  if(!key){ toast('Paste the Dropbox app key first'); $('dbx-appkey').focus(); return; }
  const verifier=b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge=b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  lsSet(DBX_VERIFIER_KEY, verifier);
  location.href='https://www.dropbox.com/oauth2/authorize?'+new URLSearchParams({ client_id:key, response_type:'code',
    code_challenge:challenge, code_challenge_method:'S256', token_access_type:'offline', redirect_uri:redirectUri() });
}
async function dbxHandleRedirect(){
  const q=new URLSearchParams(location.search);
  if(!q.has('code') && !q.has('error')) return;
  history.replaceState(null,'', location.pathname+location.hash);
  if(q.has('error')){ toast('Dropbox connection cancelled'); return; }
  const verifier=lsGet(DBX_VERIFIER_KEY);
  if(!verifier){ toast('Dropbox sign-in expired — tap Connect again'); return; }
  try{
    const r=await fetch('https://api.dropboxapi.com/oauth2/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({ grant_type:'authorization_code', code:q.get('code'), client_id:dbxAppKey(), code_verifier:verifier, redirect_uri:redirectUri() }) });
    const j=await r.json();
    if(!j.access_token) throw new Error(j.error_description||j.error||'no token');
    lsSet(DBX_TOKENS_KEY, JSON.stringify({ access_token:j.access_token, refresh_token:j.refresh_token, expires_at:Date.now()+j.expires_in*1000 }));
    try{ localStorage.removeItem(DBX_VERIFIER_KEY); }catch(e){}
    toast('Dropbox connected');
  }catch(e){ toast('Dropbox connection failed: '+e.message); }
}
function dbxDisconnect(){
  if(!confirm('Disconnect Dropbox on this device? Everything stays saved here and in Dropbox.')) return;
  try{ localStorage.removeItem(DBX_TOKENS_KEY); }catch(e){}
  lastSyncAt=0; setSync('', 'Not connected to Dropbox'); renderSettings();
}

let syncing=false, syncAgain=false, pushTimer=null, lastSyncAt=0, lastSyncedSig=lsGet(SYNCED_KEY)||'';
function markDirty(){ if(dbxTokens()) setSync('warn','Saving…'); }
function setSync(kind, text){
  const d=$('sync-dot'); if(d) d.className='sync-dot'+(kind?' '+kind:'');
  const s=$('sync-text'); if(s) s.textContent=text;
}
function schedulePush(){ if(!dbxTokens()) return; clearTimeout(pushTimer); pushTimer=setTimeout(syncNow, 1200); }
async function syncNow(){
  if(!dbxTokens()){ setSync('err','Not connected to Dropbox — see Settings'); return; }
  if(syncing){ syncAgain=true; return; }
  syncing=true; setSync('warn','Syncing…');
  try{
    let done=false;
    for(let attempt=0; attempt<4 && !done; attempt++){
      const remote=await dbxDownload();
      if(!remote.connected){ setSync('err', remote.expired ? 'Dropbox sign-in expired — reconnect in Settings' : 'Not connected to Dropbox'); return; }
      const merged=remote.data ? mergeStores(store, remote.data) : store;
      if(sig(merged)!==sig(store)){ stampFields(); store=merged; snapAll(); writeLocal(); refreshAll(); }
      if(remote.data && sig(merged)===sig(remote.data)){ done=true; break; }
      const up=await dbxUpload(merged, remote.rev);
      if(up.ok){ done=true; break; }
      if(!up.conflict) throw new Error('upload failed');
    }
    if(done){
      lastSyncAt=Date.now(); lastSyncedSig=sig(store); lsSet(SYNCED_KEY, lastSyncedSig);
      setSync('ok','Synced '+new Date(lastSyncAt).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}));
    } else setSync('err','Sync kept conflicting — try again');
  }catch(e){ if(navigator.onLine===false) setSync('warn','Offline — saved on this device, will sync later'); else setSync('err','Sync failed: '+e.message); }
  finally{
    syncing=false;
    if(syncAgain){ syncAgain=false; syncNow(); } else processQueue();
  }
}
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && Date.now()-lastSyncAt>15000) syncNow(); });

/* ============================================================
   Photos
   ------------------------------------------------------------
   A photo is recorded on its piece (or haul/expense) the moment it's taken, with the
   Dropbox path it will live at. The file itself waits in an on-device queue ('q:<path>')
   and uploads when there's a connection, so nothing is lost at a store with no signal.
   A small preview is kept on the device ('th:<path>'); other devices fetch Dropbox thumbnails.
   ============================================================ */
const thumbUrls=new Map(), thumbLoading=new Set();
async function shrinkImage(file, maxSide, quality){
  const bmp=await (window.createImageBitmap ? createImageBitmap(file, {imageOrientation:'from-image'}).catch(()=>null) : null);
  let w, h, src=bmp;
  if(!src){ src=await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=URL.createObjectURL(file); }); }
  w=src.width; h=src.height;
  const k=Math.min(1, maxSide/Math.max(w,h));
  const c=document.createElement('canvas'); c.width=Math.round(w*k); c.height=Math.round(h*k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return await new Promise(res=>c.toBlob(res, 'image/jpeg', quality||0.9));
}
// Listing photos keep full quality (Etsy wants 2000px+); receipts are shrunk.
async function prepPhoto(file, kind){
  if(kind==='receipt') return shrinkImage(file, 2200, 0.85);
  if(/jpe?g/i.test(file.type) && file.size < 14e6) return file;
  return shrinkImage(file, 3600, 0.92);
}
async function queuePhoto(file, path, kind){
  const blob=await prepPhoto(file, kind);
  const th=await shrinkImage(blob, 480, 0.8);
  try{ await idbPut('th:'+path, th); }catch(e){}
  thumbUrls.set(path, URL.createObjectURL(th));
  await idbPut('q:'+path, { path, blob, at:Date.now() });
  updateQueueBadge();
  processQueue();
}
let _qBusy=false;
async function processQueue(){
  if(_qBusy) return; _qBusy=true;
  try{
    const keys=await idbKeys('q:');
    if(!keys.length) return;
    const t=await dbxToken(); if(!t) return;
    for(const k of keys){
      const q=await idbGet(k); if(!q) continue;
      let r;
      try{
        r=await fetch('https://content.dropboxapi.com/2/files/upload', { method:'POST', headers:{ 'Authorization':'Bearer '+t.access_token,
          'Content-Type':'application/octet-stream', 'Dropbox-API-Arg':dbxArg({ path:q.path, mode:'overwrite', autorename:false, mute:true }) }, body:q.blob });
      }catch(e){ break; }            // offline: try again later
      if(r.ok){ await idbDel(k); updateQueueBadge(); }
      else if(r.status===401) break;
    }
  }catch(e){}
  finally{ _qBusy=false; updateQueueBadge(); }
}
async function updateQueueBadge(){
  let n=0; try{ n=(await idbKeys('q:')).length; }catch(e){}
  if(typeof updateReadyBtn==='function' && typeof curId!=='undefined' && curId) updateReadyBtn();
  const b=$('queue-note'); if(!b) return;
  b.classList.toggle('hide', !n);
  b.textContent = n+' photo'+(n===1?'':'s')+' waiting to upload'+(navigator.onLine===false?' (offline)':'');
}
function photoUrl(path){ return thumbUrls.get(path) || ''; }
async function loadThumb(path){
  if(thumbUrls.has(path) || thumbLoading.has(path)) return;
  thumbLoading.add(path);
  try{
    let blob=null; try{ blob=await idbGet('th:'+path); }catch(e){}
    if(!blob){
      const t=await dbxToken();
      if(t){
        const r=await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', { method:'POST', headers:{ 'Authorization':'Bearer '+t.access_token,
          'Dropbox-API-Arg':dbxArg({ resource:{'.tag':'path', path}, format:'jpeg', size:'w480h320', mode:'fitone_bestfit' }) } });
        if(r.ok){ blob=await r.blob(); try{ await idbPut('th:'+path, blob); }catch(e){} }
      }
    }
    if(blob){ const u=URL.createObjectURL(blob); thumbUrls.set(path,u); document.querySelectorAll('img[data-path]').forEach(im=>{ if(im.dataset.path===path) im.src=u; }); }
  }catch(e){}
  finally{ thumbLoading.delete(path); }
}
function thumbImg(path, cls){
  const u=photoUrl(path); if(!u) setTimeout(()=>loadThumb(path), 0);
  return '<img class="'+(cls||'')+'" data-path="'+esc(path)+'" src="'+esc(u)+'" alt="" loading="lazy">';
}
// The full photo, for saving to the phone: from the upload queue if it hasn't gone up yet, otherwise from Dropbox.
async function photoBlob(path){
  try{ const q=await idbGet('q:'+path); if(q && q.blob) return q.blob; }catch(e){}
  const t=await dbxToken(); if(!t) throw new Error('not connected to Dropbox');
  const r=await fetch('https://content.dropboxapi.com/2/files/download', { method:'POST', headers:{ 'Authorization':'Bearer '+t.access_token, 'Dropbox-API-Arg':dbxArg({path}) } });
  if(!r.ok) throw new Error('HTTP '+r.status);
  return await r.blob();
}
// Photos of a piece still waiting on this phone to upload
async function pendingPhotos(it){ let keys=[]; try{ keys=await idbKeys('q:'); }catch(e){} const w=new Set(keys.map(k=>k.slice(2))); return (it.photos||[]).filter(p=>w.has(p.path)).length; }
async function openFullPhoto(path){
  let url='';
  try{ const q=await idbGet('q:'+path); if(q) url=URL.createObjectURL(q.blob); }catch(e){}
  if(!url){
    const t=await dbxToken();
    if(t){ try{ const r=await fetch('https://api.dropboxapi.com/2/files/get_temporary_link',{ method:'POST', headers:{'Authorization':'Bearer '+t.access_token,'Content-Type':'application/json'}, body:JSON.stringify({path}) });
      if(r.ok) url=(await r.json()).link; }catch(e){} }
  }
  if(!url) url=photoUrl(path);
  if(!url){ toast('Photo not available offline'); return; }
  $('viewer-img').src=url; $('viewer').classList.add('open');
}
