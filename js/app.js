/* Serendipity Vintage — app.js
   Tabs, the + menu, refreshing after changes, and start-up. Loads last. See DEVELOPER.md. */
'use strict';

function showPanel(p){
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active', b.dataset.panel===p));
  document.querySelectorAll('.panel').forEach(s=>s.classList.toggle('active', s.id==='p-'+p));
  ui.panel=p; saveUi(); refreshPanel(); window.scrollTo(0,0);
}
function refreshPanel(){
  const p=ui.panel||'pieces';
  if(p==='pieces') renderPieces(); else if(p==='hauls') renderHauls(); else if(p==='money') renderMoney(); else if(p==='settings') renderSettings();
}
function refreshAll(){
  $('shop-name').textContent=setting('shopName','Serendipity Vintage');
  document.title=setting('shopName','Serendipity Vintage');
  refreshPanel();
  if(curId && $('piece-sheet').classList.contains('open')) fillPiece(false);
  if(haulId && $('haul-sheet').classList.contains('open')) renderHaulPieces();
}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>showPanel(b.dataset.panel));

// + menu
function toggleFab(open){ $('fab').classList.toggle('open', open); $('fab-menu').classList.toggle('open', open);
  let s=document.querySelector('.scrim'); if(open && !s){ s=document.createElement('div'); s.className='scrim'; s.onclick=()=>toggleFab(false); document.body.appendChild(s); } else if(!open && s) s.remove(); }
$('fab').onclick=()=>toggleFab(!$('fab').classList.contains('open'));
$('fab-menu').onclick=e=>{
  const b=e.target.closest('[data-add]'); if(!b) return; toggleFab(false);
  if(b.dataset.add==='haul') openHaul(null);
  else if(b.dataset.add==='expense') openExpense(null);
  else { const it=newPiece(); commit(); openPiece(it.id); }
};
$('viewer').onclick=()=>{ $('viewer').classList.remove('open'); $('viewer-img').src=''; };

// start
snapAll();
showPanel(ui.panel||'pieces');
refreshAll();
updateQueueBadge();
loadFromIdb().then(()=>dbxHandleRedirect()).then(()=>{
  writeLocal(); renderSettings(); refreshAll();
  if(window.__setupLink && !dbxTokens()){ showPanel('settings'); toast('Set up for '+window.__setupLink+'. Tap Connect Dropbox.', 4000); }
  setSync('', dbxTokens()?'Connecting…':'Not connected to Dropbox — see Settings'); syncNow();
});
window.addEventListener('online', ()=>{ syncNow(); processQueue(); });
window.addEventListener('offline', ()=>{ updateQueueBadge(); if(dbxTokens()) setSync('warn','Offline — saved on this device, will sync later'); });
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')) navigator.serviceWorker.register('sw.js').catch(()=>{});
window.addEventListener('beforeunload', e=>{ flushPiece(); if(pushTimer && dbxTokens() && sig(store)!==lastSyncedSig){ e.preventDefault(); e.returnValue=''; } });
setInterval(()=>{ processQueue(); }, 60000);
