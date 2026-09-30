/* Vintage Shop — piece.js
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
  fillPiece(true);
}
function closePiece(){ flushPiece(); stopMicIfOn(); $('piece-sheet').classList.remove('open'); curId=null; unlockPage(); renderPieces(); }
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
  renderShots(); renderPhotos(); renderMeas(false); renderListing(); renderVenues(); renderProfit();
  $('pc-ready').classList.toggle('hide', it.status!=='new');
  updateReadyBtn();
}
function updateReadyBtn(){
  const it=cur(); if(!it) return;
  const kinds=new Set((it.photos||[]).map(p=>p.kind)); const missing=MUST_SHOTS.filter(k=>!kinds.has(k)).map(k=>SHOT_LABEL[k].toLowerCase());
  const hasMeas=Object.keys(it.measurements||{}).length>0;
  $('pc-ready').textContent = 'Ready for Claude' + (missing.length||!hasMeas ? ' — still missing '+[...missing, ...(hasMeas?[]:['measurements'])].join(', ') : ' ✓');
  $('pc-ready').classList.toggle('sage', !missing.length && hasMeas);
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
$('pc-ready').onclick=()=>{ flushPiece(); edit(it=>{ it.status='ready'; it.readyAt=Date.now(); }); toast('Marked ready. Claude will pick it up next time you ask it to check the shop folder.', 3600); };
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
$('pc-shots').onclick=async e=>{ const b=e.target.closest('[data-shot]'); if(!b) return; _shotKind=b.dataset.shot; $('pc-cam').click(); };
$('pc-photos').addEventListener('click', e=>{
  const x=e.target.closest('[data-rm]');
  if(x){ const i=+x.dataset.rm; const it=cur(); const p=it.photos[i]; if(!confirm('Remove this '+(SHOT_LABEL[p.kind]||'')+' photo from the piece?')) return;
    edit(it=>{ it.photos=it.photos.filter((_,j)=>j!==i); }); idbDel('q:'+p.path).catch(()=>{}); updateQueueBadge(); return; }
  const im=e.target.closest('img[data-path]'); if(im) openFullPhoto(im.dataset.path);
});
async function addPhotos(files, kind){
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
  if(next && MUST_SHOTS.includes(kind)) toast('Next: '+SHOT_LABEL[next]);
}
$('pc-cam').onchange=e=>{ const f=[...e.target.files]; e.target.value=''; addPhotos(f, _shotKind); };
$('pc-lib').onchange=e=>{ const f=[...e.target.files]; e.target.value=''; addPhotos(f, _shotKind||'other'); };

/* ---- measurements ---- */
function measKeys(it){ const t=TYPES[it.type]; const base=t?t.fields.slice():['pit','length','shoulder','sleeve','waist']; for(const k of Object.keys(it.measurements||{})) if(!base.includes(k)) base.push(k); for(const k of (it.extraMeas||[])) if(!base.includes(k)) base.push(k); return base; }
function renderMeas(flashKeys){
  const it=cur(); const m=it.measurements||{};
  const keys=measKeys(it);
  $('pc-meas').innerHTML=keys.map(k=>'<label class="meas'+(m[k]!=null?' filled':'')+(flashKeys&&flashKeys.includes(k)?' flash':'')+'"><span>'+esc(MEAS_LABEL[k]||k)+'</span><input data-m="'+k+'" inputmode="decimal" value="'+esc(m[k]!=null?fmtIn(m[k])+'"':'')+'" placeholder="—"></label>').join('');
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

/* ---- dictation ---- */
function applyDictation(final){
  const it=cur(); if(!it) return;
  const r=parseDictation($('pc-dict').value);
  const changed=[];
  const m=Object.assign({}, it.measurements);
  for(const [k,v] of Object.entries(r.m)) if(m[k]!==v){ m[k]=v; changed.push(k); }
  let dirty=changed.length>0;
  if(dirty) it.measurements=m;
  if(r.size && r.size!==it.size){ it.size=r.size; dirty=true; setVal('pc-size', r.size); }
  if(final){
    const addTo=(field, lines)=>{ const curTxt=it[field]||''; const add=lines.filter(l=>!norm(curTxt).includes(norm(l))); if(add.length){ it[field]=(curTxt?curTxt.replace(/\s+$/,'')+'\n':'')+add.join('\n'); dirty=true; } };
    addTo('condition', r.condition); addTo('notes', r.notes);
    const d=$('pc-dict').value.trim(); if(d!==(it.dictation||'')){ it.dictation=d; dirty=true; }
  }
  if(dirty){ touch(it); commit(); renderMeas(changed); setVal('pc-cond', it.condition); setVal('pc-notes', it.notes); updateReadyBtn(); }
}
let _dT=null;
$('pc-dict').addEventListener('input', ()=>{ clearTimeout(_dT); _dT=setTimeout(()=>applyDictation(false), 350); });
$('pc-dict').addEventListener('change', ()=>applyDictation(true));
let _micBase='';
function stopMicIfOn(){ if($('pc-mic').classList.contains('on')) stopMic(); }
$('pc-mic').onclick=()=>{
  if($('pc-mic').classList.contains('on')){ stopMic(); return; }
  if(!micSupported()){ $('pc-dict').focus(); toast('Tap the microphone on the keyboard and talk', 3200); return; }
  _micBase=$('pc-dict').value.trim(); if(_micBase && !/[,.;]$/.test(_micBase)) _micBase+=',';
  const ok=startMic((finalText, interim)=>{
    $('pc-dict').value=(_micBase?_micBase+' ':'')+finalText.replace(/,\s*$/,'');
    $('pc-interim').textContent=interim;
    applyDictation(false);
  }, (state, err)=>{
    const on=state==='start';
    $('pc-mic').classList.toggle('on', on);
    $('pc-mic-label').textContent= on ? 'Listening… tap to stop' : 'Tap and talk';
    if(state==='end'){ $('pc-interim').textContent=''; applyDictation(true); }
    if(state==='error' && err!=='no-speech' && err!=='aborted'){ toast(err==='not-allowed' ? 'Microphone not allowed. Use the mic on the keyboard instead.' : 'Mic stopped ('+err+')', 3500); if(err==='not-allowed'){ $('pc-dict').focus(); } }
  });
  if(!ok){ $('pc-dict').focus(); toast('Tap the microphone on the keyboard and talk', 3200); }
};

/* ---- Claude's listing drafts ---- */
let _lstTab='etsy';
function copyBtn(text, label){ return '<button class="copy" data-copy="'+esc(text)+'">'+(label||'Copy')+'</button>'; }
function renderListing(){
  const it=cur(); const L=it.listing;
  if(!L){ $('pc-listing').innerHTML = it.status==='ready' ? '<div class="listing"><p class="small muted" style="margin:0">Waiting for Claude. Ask Claude to <i>“check the shop folder”</i> and the Etsy and Vinted drafts will appear here.</p></div>' : ''; return; }
  const E=L.etsy||{}, V=L.vinted||{}, P=L.price||{}, R=L.research||{};
  const tab = _lstTab==='vinted' && !L.vinted ? 'etsy' : _lstTab;
  let h='<div class="listing"><div class="row-between"><h3>Claude’s draft</h3><div class="seg"><button data-lt="etsy" class="'+(tab==='etsy'?'on':'')+'">Etsy</button>'+(L.vinted?'<button data-lt="vinted" class="'+(tab==='vinted'?'on':'')+'">Vinted</button>':'')+'</div></div>';
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
