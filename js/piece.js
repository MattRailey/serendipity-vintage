/* Serendipity Vintage — piece.js
   The piece sheet: photos by shot, dictated measurements, Claude's listing drafts (Etsy + Vinted),
   where it's listed, cost and sale. Every edit saves as you go.
   See DEVELOPER.md. */
'use strict';

const SHOTS = [ ['front','Front'], ['back','Back'], ['tag','Brand tag'], ['care','Care tag'], ['detail','Detail'], ['flaw','Flaw'], ['worn','On body'], ['other','More'] ];
const SHOT_LABEL = Object.fromEntries(SHOTS);
const MUST_SHOTS = ['front','back','tag','care'];
const CAM_SVG = '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
let curId=null, _shotKind='front';
const cur=()=>curId && getRec('items', curId);

function lockPage(){ document.body.classList.add('locked'); }
function unlockPage(){ if(!document.querySelector('.sheet.open')) document.body.classList.remove('locked'); }

function openPiece(id){
  curId=id; const it=cur(); if(!it) return;
  $('piece-sheet').classList.add('open'); lockPage();
  $('piece-sheet').querySelector('.sheet-body').scrollTop=0;
  _done=it.dictation||''; _target=null; _heard=null; _unplaced=[]; renderHeard();
  fillPiece(true);
}
function closePiece(){ flushPiece(); stopMicIfOn(); Cam.release(); $('piece-sheet').classList.remove('open'); curId=null; unlockPage(); renderPieces(); }
$('pc-close').onclick=closePiece;

/* ---- fill the form from the record (full=true on open; later only fields not being edited) ---- */
function setVal(id, v){ const el=$(id); if(el && document.activeElement!==el) el.value = v==null ? '' : v; }
function fillPiece(full){
  const it=cur(); if(!it){ if($('piece-sheet').classList.contains('open')) closePiece(); return; }
  $('pc-code').textContent=it.code;
  $('pc-status').innerHTML=STATUSES.map(([k,l])=>'<option value="'+k+'"'+(k===it.status?' selected':'')+'>'+l+'</option>').join('');
  $('pc-status').className='pill-select st-'+it.status;
  setVal('pc-title', it.title); setVal('pc-size', it.size); setVal('pc-era', it.era);
  setVal('pc-cond', it.condition); setVal('pc-notes', it.notes);
  if(full) $('pc-dict').value=it.dictation||'';
  setVal('pc-cost', it.cost!=null?it.cost:'');
  setVal('pc-soldVia', it.soldVia||''); setVal('pc-soldAt', it.soldAt||''); setVal('pc-soldPrice', it.soldPrice??''); setVal('pc-fees', it.fees??''); setVal('pc-shipCost', it.shipCost??'');
  $('pc-types').innerHTML=Object.entries(TYPES).map(([k,t])=>'<button class="chip'+(it.type===k?' on':'')+'" data-type="'+k+'">'+esc(t.label)+'</button>').join('');
  const hauls=liveOf('hauls').sort((a,b)=>natCmp(b.date,a.date));
  $('pc-haul').innerHTML='<option value="">— none —</option>'+hauls.map(h=>'<option value="'+h.id+'"'+(h.id===it.haulId?' selected':'')+'>'+esc(fmtDate(h.date)+' · '+(h.store||'Store'))+'</option>').join('');
  renderShots(); renderPhotos(); renderMeas(false); if(full || !_share) resetSaveBtn(); renderListing(); renderVenues(); renderProfit();
  $('pc-ready').classList.toggle('hide', it.status!=='new');
  updateReadyBtn();
}
let _rbTok=0;
function updateReadyBtn(){
  const it=cur(); if(!it) return;
  const kinds=new Set((it.photos||[]).map(p=>p.kind)); const missing=MUST_SHOTS.filter(k=>!kinds.has(k)).map(k=>SHOT_LABEL[k].toLowerCase());
  const hasMeas=Object.keys(it.measurements||{}).length>0;
  $('pc-ready').textContent = 'Ready for Claude' + (missing.length||!hasMeas ? ' — still missing '+[...missing, ...(hasMeas?[]:['measurements'])].join(', ') : ' ✓');
  $('pc-ready').classList.toggle('sage', !missing.length && hasMeas);
  const id=it.id, tok=++_rbTok; pendingPhotos(it).then(n=>{ const x=cur(); if(!x || x.id!==id || !n || tok!==_rbTok) return; $('pc-ready').textContent+=' · '+n+' photo'+(n===1?'':'s')+' still uploading'; });
}

/* ---- saving ---- */
function edit(fn){ const it=cur(); if(!it) return; fn(it); touch(it); commit(); }
const TEXT_FIELDS={ 'pc-title':'title', 'pc-size':'size', 'pc-era':'era', 'pc-cond':'condition', 'pc-notes':'notes', 'pc-dict':'dictation' };
const NUM_FIELDS={ 'pc-cost':'cost', 'pc-soldPrice':'soldPrice', 'pc-fees':'fees', 'pc-shipCost':'shipCost' };
let _pend={}, _pT=null;
function queueField(id, key, val){ _pend[key]=val; clearTimeout(_pT); _pT=setTimeout(flushPiece, 500); }
function flushPiece(){
  clearTimeout(_pT); const keys=Object.keys(_pend); if(!keys.length) return;
  const it=cur(); const p=_pend; _pend={};
  if(!it) return;
  let changed=false; for(const k of keys){ if(!sameVal(it[k], p[k])){ if(p[k]===''||p[k]==null) delete it[k]; else it[k]=p[k]; changed=true; } }
  if(p.cost!==undefined) it.costAuto=false;
  if(changed){ touch(it); commit(); }
}
for(const [id,key] of Object.entries(TEXT_FIELDS)) $(id).addEventListener('input', e=>queueField(id, key, e.target.value.trim() ? e.target.value : ''));
for(const [id,key] of Object.entries(NUM_FIELDS)) $(id).addEventListener('input', e=>queueField(id, key, num(e.target.value)));
$('pc-soldPrice').addEventListener('change', ()=>{ flushPiece(); const it=cur(); if(it && num(it.soldPrice)!=null && it.status!=='sold') markSold(it); });
$('pc-status').onchange=e=>edit(it=>{ it.status=e.target.value; if(it.status==='sold' && !it.soldAt) it.soldAt=todayLocal(); });
$('pc-haul').onchange=e=>edit(it=>{ it.haulId=e.target.value||undefined; if(!it.haulId) delete it.haulId; });
$('pc-soldVia').onchange=e=>edit(it=>{ it.soldVia=e.target.value||undefined; if(it.soldVia){ if(it.status!=='sold'){ it.status='sold'; } if(!it.soldAt) it.soldAt=todayLocal(); } else { delete it.soldVia; if(it.status==='sold') it.status=liveVenues(it).length?'listed':'draft'; } });
$('pc-soldAt').onchange=e=>edit(it=>{ it.soldAt=e.target.value||undefined; if(!it.soldAt) delete it.soldAt; });
function markSold(it){ edit(x=>{ x.status='sold'; if(!x.soldAt) x.soldAt=todayLocal(); if(!x.soldVia){ const v=liveVenues(x); if(v.length===1) x.soldVia=v[0]; } }); }
$('pc-types').onclick=e=>{ const b=e.target.closest('[data-type]'); if(!b) return; edit(it=>{ it.type = it.type===b.dataset.type ? undefined : b.dataset.type; if(!it.type) delete it.type; }); };
$('pc-ready').onclick=async()=>{ flushPiece(); const n=await pendingPhotos(cur()); edit(it=>{ it.status='ready'; it.readyAt=Date.now(); });
  toast(n ? 'Marked ready. '+n+' photo'+(n===1?' is':'s are')+' still uploading and will go up when there’s signal — Claude waits for them.' : 'Marked ready for Claude.', 4200); };
$('pc-delete').onclick=async()=>{
  const it=cur(); if(!it || !confirm('Delete '+it.code+'? Its photos stay in Dropbox.')) return;
  removeRec('items', it.id); commit(); closePiece(); toast('Deleted '+it.code);
};

/* ---- photos ---- */
function renderShots(){
  const it=cur(); const have={}; for(const p of it.photos||[]) have[p.kind]=(have[p.kind]||0)+1;
  const next=MUST_SHOTS.find(k=>!have[k]);
  $('pc-shots').innerHTML=SHOTS.map(([k,l])=>'<button class="shot'+(have[k]?' done':'')+(k===next?' next':'')+'" data-shot="'+k+'">'+CAM_SVG+l+(have[k]?'<span class="n">'+(have[k]>1?have[k]:'✓')+'</span>':'')+'</button>').join('')
    +'';
}
function renderPhotos(){
  const it=cur(); const ph=it.photos||[];
  const fp=firstPhoto(it);
  $('pc-photos').innerHTML=ph.map((p,i)=>'<figure'+(p.path===fp?' class="first"':'')+'>'+thumbImg(p.path)+'<figcaption>'+esc(SHOT_LABEL[p.kind]||p.kind)+'</figcaption><button class="x" data-rm="'+i+'" aria-label="Remove">✕</button>'+(p.pending?'':'')+'</figure>').join('')
    +'<figure style="display:grid;place-items:center;background:var(--card);border:1.5px dashed var(--line2)"><button class="linkish" id="pc-fromlib" style="padding:8px">+ from<br>camera roll</button></figure>';
  $('pc-fromlib').onclick=()=>{ _shotKind='other'; $('pc-lib').click(); };
  markWaiting();
}
async function markWaiting(){ let keys=[]; try{ keys=await idbKeys('q:'); }catch(e){} const w=new Set(keys.map(k=>k.slice(2)));
  $('pc-photos').querySelectorAll('figure').forEach(f=>{ const im=f.querySelector('img'); if(im && w.has(im.dataset.path) && !f.querySelector('.wait')) f.insertAdjacentHTML('beforeend','<span class="wait">waiting</span>'); }); }
$('pc-shots').onclick=e=>{ const b=e.target.closest('[data-shot]'); if(!b) return; _shotKind=b.dataset.shot;
  if(Cam.supported()) openPieceCamera(_shotKind); else $('pc-cam').click(); };
// In-app camera: no "Use Photo" step. After each must-have shot it moves to the next one that's missing.
function openPieceCamera(kind){
  const it=cur(); if(!it) return;
  const seen=new Set((it.photos||[]).map(p=>p.kind));
  Cam.open({ title:it.code, shots:SHOTS, kind,
    fallback:k=>{ _shotKind=k; $('pc-cam').click(); },
    onShot:(f,k)=>addPhotos([f], k, true),
    next:k=>{ seen.add(k); if(!MUST_SHOTS.includes(k)) return k; return MUST_SHOTS.find(x=>!seen.has(x)) || 'detail'; } });
}
$('pc-photos').addEventListener('click', e=>{
  const x=e.target.closest('[data-rm]');
  if(x){ const i=+x.dataset.rm; const it=cur(); const p=it.photos[i]; if(!confirm('Remove this '+(SHOT_LABEL[p.kind]||'')+' photo from the piece?')) return;
    edit(it=>{ it.photos=it.photos.filter((_,j)=>j!==i); }); idbDel('q:'+p.path).catch(()=>{}); updateQueueBadge(); return; }
  const im=e.target.closest('img[data-path]'); if(im) openFullPhoto(im.dataset.path);
});
async function addPhotos(files, kind, quiet){
  const it=cur(); if(!it || !files.length) return;
  const code=it.code;
  let n=Math.max(0, ...(it.photos||[]).map(p=>parseInt((p.path.match(/ (\d\d) [a-z]+\.jpg$/)||[])[1]||0,10)));
  const added=[];
  for(const f of files){
    n++; const k=kind;
    const path=dbxFolder()+'/pieces/'+code+'/'+code+' '+String(n).padStart(2,'0')+' '+k+'.jpg';
    try{ await queuePhoto(f, path, 'listing'); added.push({ path, kind:k, at:Date.now() }); }
    catch(e){ toast('Couldn’t read that photo'); }
  }
  if(added.length) edit(it=>{ it.photos=(it.photos||[]).concat(added); });
  // walk her through the must-have shots: after Front, offer Back, and so on
  const have=new Set((cur().photos||[]).map(p=>p.kind)); const next=MUST_SHOTS.find(k=>!have.has(k));
  if(next && MUST_SHOTS.includes(kind) && !quiet) toast('Next: '+SHOT_LABEL[next]);
}
$('pc-cam').onchange=e=>{ const f=[...e.target.files]; e.target.value=''; addPhotos(f, _shotKind); };
$('pc-lib').onchange=e=>{ const f=[...e.target.files]; e.target.value=''; addPhotos(f, _shotKind||'other'); };

/* ---- save photos to the phone (for listing in the Etsy / Vinted apps) ----
   First tap gathers the full-size photos; second tap opens the share sheet → "Save N Images".
   (iPhone only opens the share sheet straight from a tap, so the download can't happen in between.) */
const PHOTO_ORDER=['front','back','worn','detail','tag','care','flaw','other'];
let _share=null;
function listingPhotos(it){ return (it.photos||[]).slice().sort((a,b)=>(PHOTO_ORDER.indexOf(a.kind)-PHOTO_ORDER.indexOf(b.kind)) || natCmp(a.path,b.path)); }
function resetSaveBtn(){ _share=null; const b=$('pc-savephotos'); const it=cur(); b.disabled=false; b.textContent='Save this piece’s photos to the phone'; b.classList.toggle('hide', !it || !(it.photos||[]).length); }
$('pc-savephotos').onclick=async()=>{
  const it=cur(); if(!it) return; const b=$('pc-savephotos'); const ph=listingPhotos(it);
  const key=it.id+'|'+ph.map(p=>p.path).join('|');
  if(_share && _share.key===key){
    try{ await navigator.share({ files:_share.files }); }catch(e){ if(e && e.name!=='AbortError') toast('Couldn’t open the share sheet'); }
    return;
  }
  if(!navigator.share || !navigator.canShare){ toast('This browser can’t save photos. Open them in the Dropbox app instead.', 3600); return; }
  b.disabled=true; b.textContent='Getting '+ph.length+' photos…';
  try{
    const files=[]; for(const p of ph){ const blob=await photoBlob(p.path); files.push(new File([blob], p.path.split('/').pop(), { type:'image/jpeg' })); }
    if(!navigator.canShare({ files })) throw new Error('can’t share photos here');
    _share={ key, files }; b.disabled=false; b.textContent='Tap to save '+files.length+' photos (in listing order)';
  }catch(e){ resetSaveBtn(); toast('Couldn’t get the photos: '+e.message, 3600); }
};

/* ---- measurements ---- */
function measKeys(it){ const t=TYPES[it.type]; const base=t?t.fields.slice():['pit','length','shoulder','sleeve','waist']; for(const k of Object.keys(it.measurements||{})) if(!base.includes(k)) base.push(k); for(const k of (it.extraMeas||[])) if(!base.includes(k)) base.push(k); return base; }
function renderMeas(flashKeys){
  const it=cur(); const m=it.measurements||{};
  const keys=measKeys(it);
  $('pc-meas').innerHTML=keys.map(k=>'<label class="meas'+(m[k]!=null?' filled':'')+(flashKeys&&flashKeys.includes(k)?' flash':'')+(k===_target?' target':'')+'"><span>'+esc(MEAS_LABEL[k]||k)+'</span><input data-m="'+k+'" inputmode="decimal" value="'+esc(m[k]!=null?fmtIn(m[k])+'"':'')+'" placeholder="—"></label>').join('');
}
$('pc-meas').addEventListener('focusin', e=>{ const i=e.target.closest('[data-m]'); if(i){ const v=(cur().measurements||{})[i.dataset.m]; i.value=v!=null?v:''; } });
$('pc-meas').addEventListener('change', e=>{ const i=e.target.closest('[data-m]'); if(!i) return;
  const raw=i.value.trim(); const v=raw ? num(wordsToNumbers(raw).replace(/[^\d.]/g,'')) : null;
  edit(it=>{ it.measurements=Object.assign({}, it.measurements); if(v==null) delete it.measurements[i.dataset.m]; else it.measurements[i.dataset.m]=v; }); });
$('pc-more-meas').onclick=()=>{
  const it=cur(); const have=new Set(measKeys(it));
  const opts=MEAS.filter(m=>!have.has(m[0]));
  const pick=prompt('Add which measurement?\n'+opts.map((m,i)=>(i+1)+'. '+m[1]).join('\n'));
  const o=opts[(parseInt(pick,10)||0)-1]; if(!o) return;
  edit(it=>{ it.extraMeas=(it.extraMeas||[]).concat(o[0]); });
};

/* ---- dictation ----
   Each phrase is read once, when it is finished, and never again. So a number she fixes by hand in the boxes
   isn't overwritten by something said a minute ago. What was heard is shown right under the box with where it
   went, and can be undone.
   Where things go:
     measurements said with their name → that box.  A box's name on its own ("length") → the next number goes there.
     a number with no name → the box she's on (tap a box, say its name, or "walk me through"), else it waits for her to pick.
     "tag size …", "it's a medium" → Tag size.
     "notes …" / "flaw …", or tapping those boxes with the mic on → words go into Notes / Condition until she moves on.
     anything else → NOT filed. It waits under "Not placed yet" for a tap (Notes / Condition / ✕), and stays in the transcript.
   Voice commands: "next"/"skip", "undo"/"scratch that", "stop"/"done", "walk me through". */
let _done='', _target=null, _heard=null, _unplaced=[], _uSeq=0;
const MEAS_NAME=k=>MEAS_LABEL[k]||k;
const TEXT_T={ notes:'Notes', condition:'Condition' };
const TARGET_NAME=k=>TEXT_T[k]||MEAS_NAME(k);
const nextEmpty=(it, m, from)=>{ const ks=measKeys(it), i=ks.indexOf(from); return [...ks.slice(i+1), ...ks.slice(0,Math.max(i,0))].find(k=>m[k]==null)||null; };
function markTarget(){
  document.querySelectorAll('#pc-meas [data-m]').forEach(i=>{ const t=i.dataset.m===_target; i.closest('.meas').classList.toggle('target', t); if(document.activeElement!==i) i.placeholder = t ? 'say it' : '—'; });
  $('pc-cond-fld').classList.toggle('target', _target==='condition'); $('pc-notes-fld').classList.toggle('target', _target==='notes');
  if($('pc-mic').classList.contains('on')) $('pc-mic-label').textContent = _target ? 'Listening for '+TARGET_NAME(_target)+'…' : 'Listening… tap to stop';
}
function setTarget(k){ _target=k||null; markTarget(); }

function runCommand(cmd, it){
  if(cmd==='next'){ setTarget(MEAS_LABEL[_target] ? nextEmpty(it, it.measurements||{}, _target) : null); return; }
  if(cmd==='undo'){ if(_heard) undoHeard(); else toast('Nothing to undo'); return; }
  if(cmd==='stop'){ stopMic(); return; }
  if(cmd==='walk'){ setTarget(measKeys(it).find(k=>(it.measurements||{})[k]==null)||null); if(!_target) toast('Every box has a number'); }
}
function applyPhrase(text){
  const it=cur(); if(!it || !text.trim()) return;
  const r=parseDictation(text, TEXT_T[_target] ? _target : null);
  if(r.cmd){ runCommand(r.cmd, it); return; }
  const snap={ meas:Object.assign({}, it.measurements), size:it.size, cond:it.condition, notes:it.notes, target:_target };
  const m=Object.assign({}, it.measurements), changed=[], items=[], added=[];
  let dirty=false, tgt=_target;
  for(const [k,v] of Object.entries(r.m)){
    if(m[k]!==v){ m[k]=v; changed.push(k); dirty=true; } items.push({ kind:'m', text:MEAS_NAME(k)+' '+fmtIn(v)+'"' });
    if(k===tgt) tgt=nextEmpty(it, m, k);          // she named the box she was on: move along so the next bare number doesn't overwrite it
  }
  for(const v of r.loose){
    if(MEAS_LABEL[tgt]){ const k=tgt; m[k]=v; changed.push(k); dirty=true; items.push({ kind:'m', text:MEAS_NAME(k)+' '+fmtIn(v)+'"' }); tgt=nextEmpty(it, m, k); }
    else { const u={ id:++_uSeq, kind:'num', v }; _unplaced.push(u); added.push(u.id); }
  }
  if(r.target) tgt=r.target;
  if(r.size && r.size!==it.size){ it.size=r.size; dirty=true; setVal('pc-size', r.size); items.push({ kind:'size', text:'Size '+r.size }); }
  const addTo=(field, lines, kind)=>{ const curTxt=it[field]||''; const add=lines.filter(l=>!norm(curTxt).includes(norm(l)));
    if(add.length){ it[field]=(curTxt?curTxt.replace(/\s+$/,'')+'\n':'')+add.join('\n'); dirty=true; for(const l of add) items.push({ kind, text:l }); } };
  addTo('condition', r.condition, 'cond'); addTo('notes', r.notes, 'note');
  for(const t of r.text){ const u={ id:++_uSeq, kind:'text', text:t.text, hint:t.hint }; _unplaced.push(u); added.push(u.id); }
  if(dirty){ it.measurements=m; touch(it); commit(); renderMeas(changed); setVal('pc-cond', it.condition); setVal('pc-notes', it.notes); updateReadyBtn(); }
  setTarget(tgt);
  if(items.length || added.length) _heard={ said:text, items, added, snap };
  renderHeard();
}
function undoHeard(){
  const H=_heard, it=cur(); if(!H || !it) return;
  edit(x=>{ x.measurements=H.snap.meas; for(const [f,v] of [['size',H.snap.size],['condition',H.snap.cond],['notes',H.snap.notes]]){ if(v) x[f]=v; else delete x[f]; } });
  _unplaced=_unplaced.filter(u=>!H.added.includes(u.id));
  setVal('pc-size', it.size); setVal('pc-cond', it.condition); setVal('pc-notes', it.notes); renderMeas(false); updateReadyBtn();
  setTarget(H.snap.target); _heard=null; renderHeard(); toast('Undone');
}
function renderHeard(){
  const box=$('pc-heard'); const it=cur();
  if(!it || (!_heard && !_unplaced.length)){ box.innerHTML=''; return; }
  let h='<div class="heard">';
  if(_heard){
    h+='<div class="row-between"><b>Just heard</b><button class="linkish" data-undo>Undo</button></div><div class="hchips">';
    _heard.items.forEach((c,i)=>{
      if(c.kind==='cond'||c.kind==='note') h+='<span class="hchip '+c.kind+'"><i>'+(c.kind==='cond'?'Condition':'Notes')+'</i> '+esc(c.text)+' <button data-mv="'+i+'" aria-label="Move to '+(c.kind==='cond'?'notes':'condition')+'" title="Move to '+(c.kind==='cond'?'notes':'condition')+'">⇄</button></span>';
      else h+='<span class="hchip '+c.kind+'">'+esc(c.text)+'</span>';
    });
    if(!_heard.items.length) h+='<span class="muted small">Nothing filed — see below</span>';
    h+='</div>';
  }
  if(_unplaced.length){
    h+='<div class="unplaced"><b>Not placed yet</b> <span class="muted small">Tap where it goes. It’s kept in what you said either way.</span>';
    const free=measKeys(it).filter(k=>(it.measurements||{})[k]==null);
    for(const u of _unplaced){
      if(u.kind==='num') h+='<div class="hloose" data-uid="'+u.id+'"><b>'+fmtIn(u.v)+'"</b> — which one?<div class="hpick">'+(free.length?free:measKeys(it)).map(k=>'<button data-u="'+u.id+'" data-k="'+k+'">'+esc(MEAS_NAME(k))+'</button>').join('')+'<button data-u="'+u.id+'" data-to="drop" class="drop">Not a measurement</button></div></div>';
      else h+='<div class="utext" data-uid="'+u.id+'"><span>“'+esc(u.text)+'”</span><div class="hpick"><button data-u="'+u.id+'" data-to="notes"'+(u.hint==='note'?' class="sug"':'')+'>Notes</button><button data-u="'+u.id+'" data-to="condition"'+(u.hint==='cond'?' class="sug"':'')+'>Condition</button><button data-u="'+u.id+'" data-to="drop" class="drop" aria-label="Leave it out">✕</button></div></div>';
    }
    h+='</div>';
  }
  box.innerHTML=h+'</div>';
}
$('pc-heard').addEventListener('click', e=>{
  const it=cur(); if(!it) return;
  if(e.target.closest('[data-undo]')){ undoHeard(); return; }
  const mv=e.target.closest('[data-mv]');
  if(mv && _heard){ const c=_heard.items[+mv.dataset.mv]; const from=c.kind==='cond'?'condition':'notes', to=c.kind==='cond'?'notes':'condition';
    edit(x=>{ x[from]=(x[from]||'').split('\n').filter(l=>l.trim()!==c.text).join('\n'); if(!x[from]) delete x[from]; x[to]=(x[to]?x[to].replace(/\s+$/,'')+'\n':'')+c.text; });
    c.kind = c.kind==='cond' ? 'note' : 'cond'; setVal('pc-cond', it.condition); setVal('pc-notes', it.notes); renderHeard(); return; }
  const b=e.target.closest('[data-u]'); if(!b) return;
  const u=_unplaced.find(x=>x.id===+b.dataset.u); if(!u) return;
  _unplaced=_unplaced.filter(x=>x!==u);
  if(b.dataset.k){ const k=b.dataset.k; edit(x=>{ x.measurements=Object.assign({}, x.measurements); x.measurements[k]=u.v; }); renderMeas([k]); updateReadyBtn(); }
  else if(b.dataset.to==='notes'||b.dataset.to==='condition'){ const f=b.dataset.to;
    edit(x=>{ if(!norm(x[f]||'').includes(norm(u.text))) x[f]=(x[f]?x[f].replace(/\s+$/,'')+'\n':'')+u.text; });
    setVal('pc-cond', it.condition); setVal('pc-notes', it.notes); }
  renderHeard();
});
// typed or pasted text is read when she's done with the box
$('pc-dict').addEventListener('change', ()=>{
  const v=$('pc-dict').value;
  if(v.startsWith(_done)){ const tail=v.slice(_done.length).replace(/^[\s,]+/,''); _done=v; if(tail) applyPhrase(tail); } else _done=v;   // editing earlier text doesn't re-apply it
});
// while the mic is on, tapping a box means "what I say next is for this one" (no keyboard pops up)
$('pc-meas').addEventListener('mousedown', e=>{ if(micOn() && e.target.closest('.meas')) e.preventDefault(); });
$('pc-meas').addEventListener('click', e=>{ const l=e.target.closest('.meas'); if(!l || !micOn()) return; e.preventDefault(); const k=l.querySelector('[data-m]').dataset.m, nt=_target===k?null:k; micFlush(()=>setTarget(nt)); });
for(const [fid, t] of [['pc-cond-fld','condition'], ['pc-notes-fld','notes']]){
  $(fid).addEventListener('mousedown', e=>{ if(micOn()) e.preventDefault(); });
  $(fid).addEventListener('click', e=>{ if(!micOn()) return; e.preventDefault(); const nt=_target===t?null:t; micFlush(()=>setTarget(nt)); });
}

function stopMicIfOn(){ if(micOn()) stopMic(); }
function startListening(){
  if(!micSupported()){ $('pc-dict').focus(); toast('Tap the microphone on the keyboard and talk', 3200); return false; }
  const ok=startMic(phrase=>{
    const d=$('pc-dict'), t=d.value.replace(/\s+$/,''); d.value=(t?t+', ':'')+phrase; _done=d.value; queueField('pc-dict','dictation', d.value);
    applyPhrase(phrase);
  }, interim=>{ $('pc-interim').textContent=interim; },
  (state, err)=>{
    const on=state==='start'; $('pc-mic').classList.toggle('on', on);
    if(on) markTarget(); else $('pc-mic-label').textContent='Tap and talk';
    if(state==='end'||state==='idle'||state==='error'){ setTarget(null); flushPiece(); }
    if(state==='idle') toast('Mic paused — tap it to keep going', 3000);
    if(state==='error' && err!=='no-speech' && err!=='aborted'){ toast(err==='not-allowed'||err==='service-not-allowed' ? 'Microphone is off for this app. Use the mic on the keyboard instead.' : 'Mic stopped ('+err+')', 3800); if(_micDenied) $('pc-dict').focus(); }
  });
  if(!ok){ $('pc-dict').focus(); toast('Tap the microphone on the keyboard and talk', 3200); }
  return ok;
}
$('pc-mic').onclick=()=>{ if(micOn()) stopMic(); else startListening(); };
$('pc-walk').onclick=()=>{ const it=cur(); if(!it) return; if(!micOn() && !startListening()) return; runCommand('walk', it); };

/* ---- Claude's listing drafts ---- */
let _lstTab='etsy';
function copyBtn(text, label){ return '<button class="copy" data-copy="'+esc(text)+'">'+(label||'Copy')+'</button>'; }
function renderListing(){
  const it=cur(); const L=it.listing;
  if(!L){ $('pc-listing').innerHTML = it.status==='ready' ? '<div class="listing"><p class="small muted" style="margin:0">Waiting for Claude. Ask Claude to <i>“check the shop folder”</i> and the Etsy and Vinted drafts will appear here.</p></div>' : ''; return; }
  const E=L.etsy||{}, V=L.vinted||{}, P=L.price||{}, R=L.research||{};
  const tab = _lstTab==='vinted' && !L.vinted ? 'etsy' : _lstTab;
  let h='<div class="listing"><div class="row-between"><h3>Claude’s draft</h3><div class="seg"><button data-lt="etsy" class="'+(tab==='etsy'?'on':'')+'">Etsy</button>'+(L.vinted?'<button data-lt="vinted" class="'+(tab==='vinted'?'on':'')+'">Vinted</button>':'')+'</div></div>';
  h+='<p class="small" style="margin:6px 0 0">SKU <b>'+esc(it.code)+'</b> '+copyBtn(it.code)+' <span class="muted">— paste into Etsy’s SKU box so sales match up</span></p>';
  if((L.questions||[]).length) h+='<h4>Claude’s questions</h4><ul class="small" style="margin:4px 0 0; padding-left:18px">'+L.questions.map(q=>'<li>'+esc(q)+'</li>').join('')+'</ul>';
  if(R.summary||R.era||R.brand) h+='<h4>Research</h4><p class="small" style="margin:0">'+esc([R.era, R.brand].filter(Boolean).join(' · '))+(R.summary?(R.era||R.brand?' — ':'')+esc(R.summary):'')+'</p>';
  if(P.suggested!=null||P.low!=null) h+='<h4>Price</h4><p style="margin:0"><b>'+(P.suggested!=null?money(P.suggested):'')+'</b>'+(P.low!=null?' <span class="muted small">range '+money(P.low)+'–'+money(P.high)+'</span>':'')+(P.vinted!=null?' <span class="muted small">· Vinted '+money(P.vinted)+'</span>':'')+'</p>'+(P.note?'<p class="small muted" style="margin:4px 0 0">'+esc(P.note)+'</p>':'');
  if(tab==='etsy'){
    const title=E.title||'', words=title.split(/\s+/).filter(Boolean).length, tags=E.tags||[];
    const longTags=tags.filter(t=>t.length>20);
    h+='<h4>Title '+copyBtn(title)+'</h4><div class="ttl">'+esc(title)+'</div>';
    h+='<h4>Tags ('+tags.length+'/13) '+copyBtn(tags.join(', '))+'</h4><div class="tagchips">'+tags.map(t=>'<span'+(t.length>20?' class="bad"':'')+'>'+esc(t)+'</span>').join('')+'</div>';
    h+='<div class="checks"><span class="'+(words<=15?'ok':'no')+'">'+(words<=15?'✓':'✕')+' title '+words+' words</span><span class="'+(tags.length===13?'ok':'no')+'">'+(tags.length===13?'✓':'✕')+' 13 tags</span><span class="'+(longTags.length?'no':'ok')+'">'+(longTags.length?'✕ '+longTags.length+' tag over 20 characters':'✓ tags ≤20 characters')+'</span></div>';
    if(E.category) h+='<h4>Category</h4><div class="small">'+esc(E.category)+'</div>';
    const A=E.attributes||{}; if(Object.keys(A).length) h+='<h4>Attributes</h4><dl class="attr">'+Object.entries(A).map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(Array.isArray(v)?v.join(', '):v)+'</dd>').join('')+'</dl>';
    h+='<h4>Description '+copyBtn(E.description||'')+'</h4><div class="desc">'+esc(E.description||'')+'</div>';
  } else {
    h+='<h4>Title '+copyBtn(V.title||'')+'</h4><div class="ttl">'+esc(V.title||'')+'</div>';
    const A={ Category:V.category, Brand:V.brand, Size:V.size, Condition:V.condition, Color:V.colors, Material:V.material };
    h+='<h4>Fields</h4><dl class="attr">'+Object.entries(A).filter(([,v])=>v).map(([k,v])=>'<dt>'+k+'</dt><dd>'+esc(Array.isArray(v)?v.join(', '):v)+'</dd>').join('')+'</dl>';
    h+='<h4>Description '+copyBtn(V.description||'')+'</h4><div class="desc">'+esc(V.description||'')+'</div>';
  }
  if((R.comps||[]).length) h+='<h4>Comparable pieces</h4><div class="small">'+R.comps.map(c=>(c.url?'<a href="'+esc(c.url)+'" target="_blank" rel="noopener">':'')+esc(c.title||'')+(c.url?'</a>':'')+' — '+money(c.price)+(c.where?' <span class="muted">('+esc(c.where)+(c.sold?', sold':'')+')</span>':'')).join('<br>')+'</div>';
  h+='</div>';
  $('pc-listing').innerHTML=h;
}
$('pc-listing').addEventListener('click', async e=>{
  const t=e.target.closest('[data-lt]'); if(t){ _lstTab=t.dataset.lt; renderListing(); return; }
  const c=e.target.closest('[data-copy]'); if(c){ try{ await navigator.clipboard.writeText(c.dataset.copy); toast('Copied'); }catch(err){ toast('Couldn’t copy'); } }
});

/* ---- where it's listed ---- */
function renderVenues(){
  const it=cur(); const live=it.live||{}; const P=(it.listing||{}).price||{};
  $('pc-venues').innerHTML=VENUES.map(([k,l])=>{
    const v=live[k];
    const sub = v ? (v.price!=null?money(v.price):'no price')+' · since '+fmtDate(v.at) : (k==='etsy'&&P.suggested!=null?'Suggested '+money(P.suggested):k==='vinted'&&P.vinted!=null?'Suggested '+money(P.vinted):'');
    return '<div class="venue'+(v?' on':'')+'" data-v="'+k+'"><button class="tog" data-tog="'+k+'" aria-label="'+l+'"></button><div><b>'+l+'</b><div class="sub">'+esc(sub)+'</div></div>'+
      (v?'<div class="vf"><label class="fld"><span>Price</span><input data-vp="'+k+'" inputmode="decimal" value="'+esc(v.price??'')+'"></label>'+
        (k==='consign'||k==='other'?'<label class="fld"><span>Where</span><input data-vw="'+k+'" value="'+esc(v.where||'')+'" placeholder="Shop name"></label>':'<label class="fld"><span>Listed</span><input data-vd="'+k+'" type="date" value="'+esc(v.at||'')+'"></label>')+'</div>':'')+'</div>';
  }).join('');
  const stale=staleVenues(it);
  $('pc-stale').classList.toggle('hide', !stale.length);
  if(stale.length) $('pc-stale').innerHTML='<span>Sold on '+esc(VENUE_LABEL[it.soldVia]||'another site')+' — take it down on '+stale.map(v=>VENUE_LABEL[v]).join(' and ')+'</span><button id="pc-unlist">Done</button>';
}
$('pc-venues').addEventListener('click', e=>{
  const t=e.target.closest('[data-tog]'); if(!t) return;
  const k=t.dataset.tog;
  edit(it=>{
    it.live=Object.assign({}, it.live);
    if(it.live[k]) delete it.live[k];
    else { const P=(it.listing||{}).price||{}; it.live[k]={ at:todayLocal(), price: k==='vinted' ? (P.vinted??P.suggested??null) : (P.suggested??null) }; }
    if(it.status!=='sold' && it.status!=='pulled') it.status = liveVenues(it).length ? 'listed' : (it.listing ? 'draft' : (it.status==='listed'?'new':it.status));
  });
});
$('pc-venues').addEventListener('change', e=>{
  const p=e.target.closest('[data-vp],[data-vd],[data-vw]'); if(!p) return;
  const k=p.dataset.vp||p.dataset.vd||p.dataset.vw;
  edit(it=>{ it.live=Object.assign({}, it.live); const v=Object.assign({}, it.live[k]);
    if(p.dataset.vp) v.price=num(p.value); else if(p.dataset.vd) v.at=p.value; else v.where=p.value.trim();
    it.live[k]=v; });
});
$('pc-stale').addEventListener('click', e=>{ if(e.target.id!=='pc-unlist') return; edit(it=>{ const keep={}; if(it.soldVia && it.live && it.live[it.soldVia]) keep[it.soldVia]=it.live[it.soldVia]; it.live=keep; }); });

function renderProfit(){
  const it=cur(); const net=pieceNet(it), pr=pieceProfit(it);
  $('pc-profit').innerHTML = net==null ? '' : 'You keep '+money(net,true)+(num(it.cost)!=null?' · profit <span style="color:'+(pr>=0?'var(--sage)':'var(--red)')+'">'+money(pr,true)+'</span>':' · add the cost to see profit');
}
