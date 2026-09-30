/* Vintage Shop — settings.js
   Shop name, stores, mileage rates, Dropbox connection, set-up link, backup and restore. See DEVELOPER.md. */
'use strict';

function renderSettings(){
  setVal('set-name', setting('shopName',''));
  setVal('set-measnote', setting('measNote',''));
  setVal('set-folder', dbxFolder());
  const st=liveOf('stores').sort((a,b)=>natCmp(a.name,b.name));
  $('store-list').innerHTML=st.map(s=>'<div class="row" data-store="'+s.id+'"><div class="grow"><b>'+esc(s.name)+'</b><span>'+esc(s.town||'')+'</span></div><div class="amt">'+(s.roundTrip!=null?s.roundTrip+' mi':'<span class="flag">add miles</span>')+'</div></div>').join('') || '<p class="muted small">No stores yet.</p>';
  const Y=new Date().getFullYear(); const years=[...new Set([...Object.keys(IRS_MILEAGE).map(Number), Y, ...yearsWithData()])].sort((a,b)=>b-a).slice(0,4);
  $('rate-list').innerHTML=years.map(y=>'<label class="fld"><span>'+y+'</span><input data-rate="'+y+'" inputmode="decimal" value="'+mileageRate(y)+'"></label>').join('');
  const on=!!dbxTokens();
  $('dbx-status').innerHTML = on ? '<b>Connected.</b> Everything saves to <code>'+esc(dbxFolder())+'</code> in Dropbox.' : '<b>Not connected on this device.</b> Work is saved on this device only until Dropbox is connected.';
  $('dbx-appkey').value=dbxAppKey();
  $('dbx-appkey-row').classList.toggle('hide', on || !!DEFAULT_DBX_APP_KEY);
  $('dbx-redirect').textContent=redirectUri();
  $('btn-connect').classList.toggle('hide', on); $('btn-disconnect').classList.toggle('hide', !on); $('btn-sync').classList.toggle('hide', !on);
  $('version-line').textContent='Vintage Shop · '+pieces().length+' pieces · '+liveOf('hauls').length+' hauls';
}
$('set-name').onchange=e=>{ setSetting('shopName', e.target.value.trim()); commit(); };
$('set-measnote').onchange=e=>{ setSetting('measNote', e.target.value.trim()); commit(); };
$('rate-list').addEventListener('change', e=>{ const i=e.target.closest('[data-rate]'); if(!i) return; const r=Object.assign({}, setting('mileageRates',{})); r[i.dataset.rate]=num(i.value); setSetting('mileageRates', r); commit(); });
$('store-list').onclick=e=>{ const r=e.target.closest('[data-store]'); if(r) editStore(r.dataset.store); };
$('btn-add-store').onclick=()=>editStore(null);
$('set-folder').onchange=e=>{
  let f=e.target.value.trim()||'/Vintage Shop'; if(!f.startsWith('/')) f='/'+f; f=f.replace(/\/+$/,'');
  if(f===dbxFolder()) return;
  if(!confirm('Use '+f+' as the shop folder on this device? The app will reload and sync with that folder.')){ e.target.value=dbxFolder(); return; }
  lsSet(FOLDER_KEY, f); lsSet(SYNCED_KEY, ''); location.reload();
};
$('dbx-appkey').onchange=e=>lsSet(DBX_APPKEY_KEY, e.target.value.trim());
$('btn-connect').onclick=()=>{ lsSet(DBX_APPKEY_KEY, $('dbx-appkey').value.trim()); dbxConnect(); };
$('btn-disconnect').onclick=dbxDisconnect;
$('btn-sync').onclick=()=>{ syncNow(); processQueue(); };
$('btn-setuplink').onclick=async()=>{
  const key=dbxAppKey(); if(!key){ toast('Add the Dropbox app key first'); return; }
  const link=location.origin+location.pathname+'?'+new URLSearchParams({ folder:dbxFolder(), appkey:key });
  try{ await navigator.clipboard.writeText(link); toast('Link copied. Open it on her phone, then Connect Dropbox.', 3600); }catch(e){ prompt('Copy this link:', link); }
};
$('btn-backup').onclick=()=>download('vintage-shop-backup-'+todayLocal()+'.json', readableJSON(store), 'application/json');
$('restore-file').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  try{ const s=JSON.parse(await f.text()); if(!validStore(s)) throw new Error('not a Vintage Shop backup');
    if(!confirm('Merge this backup in? Nothing already here is deleted; newer edits win.')) return;
    store=mergeStores(store, fixStore(s)); snapAll(); store.updatedAt=Date.now(); writeLocal(); markDirty(); schedulePush(); refreshAll(); toast('Backup merged');
  }catch(err){ toast('Couldn’t restore: '+err.message, 3500); }
};
