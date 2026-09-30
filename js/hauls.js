/* Vintage Shop — hauls.js
   Hauls (one receipt: store, total, how many pieces → pieces with codes and split cost, trip miles),
   expenses (supplies, mailers, fees), and the store list with round-trip miles.
   See DEVELOPER.md. */
'use strict';

const EXP_CATS = [
  ['supplies','Cleaning & repair supplies'], ['shipsup','Shipping supplies'], ['postage','Postage & labels'],
  ['etsyfees','Etsy fees'], ['ads','Advertising (Etsy Ads, bumps)'], ['consignfees','Consignment fees'],
  ['equipment','Equipment (steamer, rack, lights)'], ['other','Other'],
];
const EXP_LABEL=Object.fromEntries(EXP_CATS);
function slug(s){ return String(s||'').replace(/[^\w]+/g,'-').replace(/^-|-$/g,'').slice(0,30); }
function storeName(h){ const s=h.storeId&&getRec('stores',h.storeId); return s ? s.name+(s.town?' '+s.town:'') : (h.store||''); }
function haulPieces(h){ return pieces().filter(it=>it.haulId===h.id).sort((a,b)=>natCmp(a.code,b.code)); }
// split a total into cents so the pieces add up exactly to the receipt
function splitCents(total, n){ const c=Math.round((num(total)||0)*100); const base=Math.floor(c/n), extra=c-base*n; return Array.from({length:n},(_,i)=>(base+(i<extra?1:0))/100); }

/* ---- list ---- */
function renderHauls(){
  const hs=liveOf('hauls').sort((a,b)=>natCmp(b.date,a.date)||(b.updatedAt-a.updatedAt));
  $('haul-list').innerHTML = hs.length ? hs.map(h=>{
    const ps=haulPieces(h), sold=ps.filter(p=>p.status==='sold').length;
    const flags=[!h.receipt?'no receipt photo':'', h.miles==null?'no miles':''].filter(Boolean);
    return '<div class="row" data-haul="'+h.id+'">'+(h.receipt?thumbImg(h.receipt,'thumb'):'<div class="thumb"></div>')+
      '<div class="grow"><b>'+esc(storeName(h)||'Store')+'</b><span>'+fmtDate(h.date)+' · '+ps.length+' piece'+(ps.length===1?'':'s')+(sold?' · '+sold+' sold':'')+(h.miles?' · '+h.miles+' mi':'')+'</span>'+
      (flags.length?'<div class="flag">'+flags.join(' · ')+'</div>':'')+'</div><div class="amt">'+money(h.total)+'</div></div>';
  }).join('') : '<div class="empty" style="padding:24px">No hauls yet. After a trip, tap <b>+</b> → <b>New haul</b>.</div>';
  const ex=liveOf('expenses').sort((a,b)=>natCmp(b.date,a.date));
  $('expense-list').innerHTML = ex.slice(0,60).map(x=>'<div class="row" data-exp="'+x.id+'">'+(x.receipt?thumbImg(x.receipt,'thumb'):'<div class="thumb"></div>')+
    '<div class="grow"><b>'+esc(x.vendor||EXP_LABEL[x.category]||'Expense')+'</b><span>'+fmtDate(x.date)+' · '+esc(EXP_LABEL[x.category]||'')+'</span></div><div class="amt">'+money(x.amount)+'</div></div>').join('');
}
$('haul-list').onclick=e=>{ const r=e.target.closest('[data-haul]'); if(r) openHaul(r.dataset.haul); };
$('expense-list').onclick=e=>{ const r=e.target.closest('[data-exp]'); if(r) openExpense(r.dataset.exp); };
$('btn-add-expense').onclick=()=>openExpense(null);

/* ---- haul sheet ---- */
let haulId=null, haulDraft=null;   // a new haul lives in haulDraft until saved
function openHaul(id){
  haulId=id; const h=id?getRec('hauls',id):null;
  haulDraft = h ? null : { id:uid('h'), date:todayLocal() };
  const d=h||haulDraft;
  $('hl-title').textContent = h ? 'Haul' : 'New haul';
  $('hl-date').value=d.date||todayLocal(); $('hl-total').value=d.total??''; $('hl-count').value=h?haulPieces(h).length:''; $('hl-count').disabled=!!h;
  $('hl-notes').value=d.notes||''; $('hl-miles').value=d.miles??'';
  fillStoreSelect(d.storeId);
  if(!h) autoMiles();
  renderReceipt('hl', d.receipt);
  $('hl-save').textContent = h ? 'Save changes' : 'Save haul';
  $('hl-delete').classList.toggle('hide', !h);
  renderHaulPieces();
  $('haul-sheet').classList.add('open'); lockPage();
}
function closeHaul(){ $('haul-sheet').classList.remove('open'); haulId=null; haulDraft=null; unlockPage(); }
$('hl-close').onclick=closeHaul;
function fillStoreSelect(sel){
  const st=liveOf('stores').sort((a,b)=>natCmp(a.name+a.town,b.name+b.town));
  $('hl-store').innerHTML='<option value="">— pick a store —</option>'+st.map(s=>'<option value="'+s.id+'"'+(s.id===sel?' selected':'')+'>'+esc(s.name+(s.town?' · '+s.town:''))+'</option>').join('')+'<option value="__new">+ New store…</option>';
}
function autoMiles(){
  const s=getRec('stores', $('hl-store').value); const date=$('hl-date').value;
  const others=liveOf('hauls').filter(h=>h.date===date && h.id!==haulId && (h.miles||0)>0);
  if(others.length){ $('hl-miles').value=0; $('hl-miles-hint').textContent='Already counted '+others.reduce((a,h)=>a+h.miles,0)+' mi on '+storeName(others[0])+' that day. Add only extra miles for this stop.'; }
  else if(s && s.roundTrip!=null){ $('hl-miles').value=s.roundTrip; $('hl-miles-hint').textContent='Round trip to '+s.name+' from Settings.'; }
  else $('hl-miles-hint').textContent= s ? 'Add this store’s round-trip miles in Settings to fill this automatically.' : '';
}
$('hl-store').onchange=async e=>{
  if(e.target.value==='__new'){ const s=await editStore(null); fillStoreSelect(s?s.id:''); }
  if(!haulId) autoMiles();
};
$('hl-date').onchange=()=>{ if(!haulId) autoMiles(); };
function renderReceipt(pre, path){
  $(pre+'-receipt-btn').classList.toggle('has', !!path);
  $(pre+'-receipt-img').innerHTML = path ? thumbImg(path) : '';
  $(pre+'-receipt-label').textContent = path ? 'Receipt saved — tap to retake' : 'Snap the receipt';
}
$('hl-receipt-btn').onclick=()=>$('hl-cam').click();
$('hl-cam').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  const d=haulId?getRec('hauls',haulId):haulDraft;
  const date=$('hl-date').value||todayLocal(), s=getRec('stores',$('hl-store').value);
  const path=dbxFolder()+'/receipts/'+date+' '+(slug(s&&s.name)||'haul')+' '+d.id.slice(-5)+'-'+Date.now().toString(36).slice(-4)+'.jpg';
  await queuePhoto(f, path, 'receipt');
  if(haulId){ const h=getRec('hauls',haulId); h.receipt=path; touch(h); commit(); } else haulDraft.receipt=path;
  renderReceipt('hl', path);
};
$('hl-save').onclick=()=>{
  const total=num($('hl-total').value), count=parseInt($('hl-count').value,10)||0;
  const storeId=$('hl-store').value && $('hl-store').value!=='__new' ? $('hl-store').value : undefined;
  const fields={ date:$('hl-date').value||todayLocal(), storeId, total, miles:num($('hl-miles').value), notes:$('hl-notes').value.trim()||undefined };
  if(total==null){ toast('Add the receipt total'); $('hl-total').focus(); return; }
  if(!haulId){
    if(count<1){ toast('How many pieces are for resale?'); $('hl-count').focus(); return; }
    const h=Object.assign(haulDraft, fields); const s=storeId&&getRec('stores',storeId); if(s) h.store=s.name+(s.town?' '+s.town:'');
    for(const k of Object.keys(h)) if(h[k]===undefined) delete h[k];
    touch(h); store.hauls.push(h);
    const costs=splitCents(total, count), codes=nextCodes(count, h.date);
    codes.forEach((code,i)=>newPiece({ code, haulId:h.id, cost:costs[i], costAuto:true, acquired:h.date }));
    commit();
    haulId=h.id; haulDraft=null;
    $('hl-title').textContent='Haul'; $('hl-save').textContent='Save changes'; $('hl-count').disabled=true; $('hl-delete').classList.remove('hide');
    renderHaulPieces();
    toast('Saved. Write each code on masking tape.', 3200);
    $('hl-pieces').scrollIntoView({behavior:'smooth', block:'start'});
    return;
  }
  const h=getRec('hauls',haulId); const oldTotal=h.total;
  Object.assign(h, fields); for(const k of Object.keys(h)) if(h[k]===undefined) delete h[k];
  const s=storeId&&getRec('stores',storeId); if(s) h.store=s.name+(s.town?' '+s.town:'');
  touch(h);
  const ps=haulPieces(h);
  if(oldTotal!==total && ps.length && ps.every(p=>p.costAuto)){ splitCents(total, ps.length).forEach((c,i)=>{ ps[i].cost=c; touch(ps[i]); }); }
  commit(); toast('Saved'); renderHaulPieces();
};
function renderHaulPieces(){
  const h=haulId&&getRec('hauls',haulId);
  if(!h){ $('hl-pieces').innerHTML=''; return; }
  const ps=haulPieces(h); const sum=round2(ps.reduce((a,p)=>a+(num(p.cost)||0),0));
  $('hl-pieces').innerHTML='<h3 class="sec">Pieces from this haul <small>tap to open</small></h3><div class="tape">'+
    ps.map(p=>'<button data-open="'+p.id+'">'+esc(p.code)+'<small>'+esc(p.title?p.title.slice(0,18):money(p.cost,true))+'</small></button>').join('')+'</div>'+
    (Math.abs(sum-(num(h.total)||0))>0.009 ? '<p class="small flag">Piece costs add up to '+money(sum,true)+', receipt is '+money(h.total,true)+'. <button class="linkish" id="hl-resplit">Split evenly</button></p>' : '<p class="small muted">Costs split evenly: '+ps.length+' × about '+money((num(h.total)||0)/Math.max(1,ps.length),true)+'. Change any piece’s cost if one was the prize.</p>')+
    '<button class="btn ghost wide" id="hl-addpiece">+ Add another piece to this haul</button>';
  $('hl-addpiece').onclick=()=>{ const p=newPiece({ haulId:h.id, acquired:h.date, cost:0, costAuto:true }); const all=haulPieces(h); if(all.every(x=>x.costAuto)) splitCents(h.total, all.length).forEach((c,i)=>{ all[i].cost=c; touch(all[i]); }); commit(); renderHaulPieces(); toast('Added '+p.code); };
  const rs=$('hl-resplit'); if(rs) rs.onclick=()=>{ splitCents(h.total, ps.length).forEach((c,i)=>{ ps[i].cost=c; ps[i].costAuto=true; touch(ps[i]); }); commit(); renderHaulPieces(); };
}
$('hl-pieces').addEventListener('click', e=>{ const b=e.target.closest('[data-open]'); if(b) openPiece(b.dataset.open); });
$('hl-delete').onclick=()=>{
  const h=getRec('hauls',haulId); if(!h) return; const ps=haulPieces(h);
  if(!confirm('Delete this haul?'+(ps.length?' Its '+ps.length+' pieces stay, but lose their link to the receipt.':''))) return;
  for(const p of ps){ delete p.haulId; touch(p); }
  removeRec('hauls', h.id); commit(); closeHaul();
};

/* ---- expenses ---- */
let expId=null, expDraft=null;
function openExpense(id){
  expId=id; const x=id?getRec('expenses',id):null; expDraft=x?null:{ id:uid('e'), date:todayLocal() };
  const d=x||expDraft;
  $('ex-cat').innerHTML=EXP_CATS.map(([k,l])=>'<option value="'+k+'"'+(k===(d.category||'supplies')?' selected':'')+'>'+l+'</option>').join('');
  $('ex-date').value=d.date; $('ex-amount').value=d.amount??''; $('ex-vendor').value=d.vendor||'';
  renderReceipt('ex', d.receipt); $('ex-delete').classList.toggle('hide', !x);
  $('exp-sheet').classList.add('open'); lockPage();
}
function closeExpense(){ $('exp-sheet').classList.remove('open'); expId=null; expDraft=null; unlockPage(); }
$('ex-close').onclick=closeExpense;
$('ex-receipt-btn').onclick=()=>$('ex-cam').click();
$('ex-cam').onchange=async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  const d=expId?getRec('expenses',expId):expDraft;
  const path=dbxFolder()+'/receipts/'+($('ex-date').value||todayLocal())+' expense '+slug($('ex-cat').value)+' '+d.id.slice(-5)+'-'+Date.now().toString(36).slice(-4)+'.jpg';
  await queuePhoto(f, path, 'receipt');
  if(expId){ const x=getRec('expenses',expId); x.receipt=path; touch(x); commit(); } else expDraft.receipt=path;
  renderReceipt('ex', path);
};
$('ex-save').onclick=()=>{
  const amount=num($('ex-amount').value); if(amount==null){ toast('Add the amount'); $('ex-amount').focus(); return; }
  const x=expId?getRec('expenses',expId):expDraft;
  Object.assign(x, { date:$('ex-date').value||todayLocal(), amount, category:$('ex-cat').value, vendor:$('ex-vendor').value.trim()||undefined });
  if(!x.vendor) delete x.vendor;
  touch(x); if(!expId) store.expenses.push(x);
  commit(); closeExpense(); toast('Expense saved');
};
$('ex-delete').onclick=()=>{ if(!confirm('Delete this expense?')) return; removeRec('expenses', expId); commit(); closeExpense(); };

/* ---- stores ---- */
function editStore(id){
  return new Promise(res=>{
    const s=id?getRec('stores',id):null;
    $('st-title').textContent=s?'Store':'New store';
    $('st-name').value=s?s.name:''; $('st-town').value=s?(s.town||''):''; $('st-miles').value=s&&s.roundTrip!=null?s.roundTrip:'';
    $('st-delete').classList.toggle('hide', !s);
    $('store-sheet').classList.add('open'); setTimeout(()=>$('st-name').focus(), 50);
    const done=v=>{ $('store-sheet').classList.remove('open'); res(v); };
    $('st-cancel').onclick=()=>done(null);
    $('st-save').onclick=()=>{
      const name=$('st-name').value.trim(); if(!name){ $('st-name').focus(); return; }
      const r=s||{ id:uid('s') }; r.name=name; r.town=$('st-town').value.trim()||undefined; r.roundTrip=num($('st-miles').value);
      if(!r.town) delete r.town; if(r.roundTrip==null) delete r.roundTrip;
      touch(r); if(!s) store.stores.push(r); commit(); done(r);
    };
    $('st-delete').onclick=()=>{ if(!confirm('Delete '+s.name+'? Hauls keep the store name.')) return; removeRec('stores', s.id); commit(); done(null); };
  });
}
