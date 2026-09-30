/* Serendipity Vintage — pieces.js
   Piece statuses, the Pieces list (search + status chips), and small shared piece helpers.
   See DEVELOPER.md. */
'use strict';

const STATUSES = [
  ['new',    'Needs work'],
  ['ready',  'Ready for Claude'],
  ['draft',  'Listing drafted'],
  ['listed', 'Listed'],
  ['sold',   'Sold'],
  ['pulled', 'Pulled / kept'],
];
const STATUS_LABEL = Object.fromEntries(STATUSES);
const VENUES = [ ['etsy','Etsy'], ['vinted','Vinted'], ['consign','Consignment'], ['other','Other'] ];
const VENUE_LABEL = Object.fromEntries(VENUES);
const SHIRT_SVG = '<svg viewBox="0 0 24 24"><path d="M8 3l-4 3 2 4 2-1v12h8V9l2 1 2-4-4-3c-1 1.5-2.3 2-4 2S9 4.5 8 3z"/></svg>';

function pieces(){ return liveOf('items'); }
function liveVenues(it){ return Object.keys(it.live||{}).filter(k=>it.live[k]); }
// A sold piece still showing as live somewhere else needs pulling down there.
function staleVenues(it){ return it.status==='sold' ? liveVenues(it).filter(v=>v!==it.soldVia) : []; }
function firstPhoto(it){ const ph=(it.photos||[]); return (ph.find(p=>p.kind==='front')||ph[0]||{}).path; }
function pieceName(it){ return it.title || (it.listing&&it.listing.etsy&&it.listing.etsy.title) || TYPES[it.type]?.label || 'Untitled piece'; }
function pieceNet(it){ const sp=num(it.soldPrice); if(sp==null) return null; return round2(sp-(num(it.fees)||0)-(num(it.shipCost)||0)); }
function pieceProfit(it){ const n=pieceNet(it); return n==null ? null : round2(n-(num(it.cost)||0)); }
function newPiece(extra){
  const it=Object.assign({ id:uid('p'), code:nextCodes(1, extra&&extra.acquired)[0], status:'new', acquired:todayLocal(), addedAt:Date.now(), photos:[], measurements:{} }, extra||{});
  touch(it); store.items.push(it); return it;
}

/* ---- the list ---- */
let ui={}; try{ ui=JSON.parse(lsGet(UI_KEY)||'{}')||{}; }catch(e){ ui={}; }
function saveUi(){ lsSet(UI_KEY, JSON.stringify(ui)); }
const FILTERS = [ ['active','Active'], ...STATUSES, ['all','All'] ];
function matchFilter(it, f){
  if(f==='all') return true;
  if(f==='active') return it.status!=='sold' && it.status!=='pulled';
  return it.status===f;
}
function searchText(it){
  const L=it.listing||{}, E=L.etsy||{}, R=L.research||{};
  return norm([it.code, it.title, it.size, it.era, it.notes, it.condition, E.title, R.brand, R.era, (E.tags||[]).join(' '), liveVenues(it).map(v=>VENUE_LABEL[v]).join(' ')].join(' '));
}
function renderPieces(){
  const f=ui.filter||'active', q=norm($('q').value).trim();
  const all=pieces();
  $('status-chips').innerHTML=FILTERS.map(([k,l])=>{
    const n=all.filter(it=>matchFilter(it,k)).length;
    if(n===0 && !['active','all','new','ready'].includes(k) && k!==f) return '';
    return '<button class="chip'+(k===f?' on':'')+'" data-f="'+k+'">'+esc(l)+'<b>'+n+'</b></button>';
  }).join('');
  const words=q.split(/\s+/).filter(Boolean);
  const list=all.filter(it=>matchFilter(it,f) && (!words.length || words.every(w=>searchText(it).includes(w))))
    .sort((a,b)=>natCmp(b.code,a.code));
  if(!all.length){
    $('piece-list').innerHTML='<div class="empty"><h3>No pieces yet</h3><p>Tap <b>+</b> and choose <b>New haul</b> after a buying trip: snap the receipt, say how many pieces, and each one gets a code to write on masking tape.</p></div>';
    return;
  }
  if(!list.length){ $('piece-list').innerHTML='<div class="empty">Nothing matches.</div>'; return; }
  $('piece-list').innerHTML=list.map(it=>{
    const ph=firstPhoto(it), stale=staleVenues(it).length;
    const lp=liveVenues(it).map(v=>num(it.live[v].price)).find(v=>v!=null);
    const right = it.status==='sold' ? money(it.soldPrice) : lp!=null ? money(lp) : (num(it.cost)!=null ? '<span class="muted" title="what you paid">'+money(it.cost)+'</span>' : '');
    const venues = it.status==='listed' ? liveVenues(it).map(v=>VENUE_LABEL[v]).join(' · ') : STATUS_LABEL[it.status];
    return '<div class="pcard" data-id="'+it.id+'"><div class="ph">'+(ph?thumbImg(ph):SHIRT_SVG)+'<span class="code">'+esc(it.code)+'</span></div>'+
      '<div class="body"><div class="t">'+esc(pieceName(it))+'</div><div class="meta"><span class="pill st-'+it.status+'">'+esc(venues||STATUS_LABEL[it.status])+'</span><span>'+right+'</span></div>'+
      (stale?'<div class="flag">Still live on '+staleVenues(it).map(v=>VENUE_LABEL[v]).join(', ')+'</div>':'')+'</div></div>';
  }).join('');
}
$('status-chips').onclick=e=>{ const b=e.target.closest('[data-f]'); if(!b) return; ui.filter=b.dataset.f; saveUi(); renderPieces(); };
let _qT=null; $('q').oninput=()=>{ clearTimeout(_qT); _qT=setTimeout(renderPieces, 150); };
$('piece-list').onclick=e=>{ const c=e.target.closest('[data-id]'); if(c) openPiece(c.dataset.id); };
