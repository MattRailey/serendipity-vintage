/* Serendipity Vintage — money.js
   The year at a glance for taxes (Schedule C style): sales, fees, cost of goods sold, expenses,
   mileage, inventory on hand, a to-do list of missing records, and CSV exports.
   Not tax advice; it organizes the numbers for whoever prepares the return. See DEVELOPER.md. */
'use strict';

function yearOf(s){ return s ? Number(String(s).slice(0,4)) : null; }
function yearsWithData(){
  const ys=new Set([new Date().getFullYear()]);
  for(const it of pieces()){ if(it.acquired) ys.add(yearOf(it.acquired)); if(it.soldAt) ys.add(yearOf(it.soldAt)); }
  for(const h of liveOf('hauls')) ys.add(yearOf(h.date));
  for(const x of liveOf('expenses')) ys.add(yearOf(x.date));
  return [...ys].filter(Boolean).sort((a,b)=>b-a);
}
function yearNumbers(Y){
  const end=Y+'-12-31';
  const sold=pieces().filter(it=>it.status==='sold' && yearOf(it.soldAt)===Y);
  const byVia={}; for(const it of sold){ const k=it.soldVia||'other'; byVia[k]=(byVia[k]||0)+(num(it.soldPrice)||0); }
  const gross=sold.reduce((a,it)=>a+(num(it.soldPrice)||0),0);
  const pieceFees=sold.reduce((a,it)=>a+(num(it.fees)||0),0);
  const ship=sold.reduce((a,it)=>a+(num(it.shipCost)||0),0);
  const cogs=sold.reduce((a,it)=>a+(num(it.cost)||0),0);
  const exp=liveOf('expenses').filter(x=>yearOf(x.date)===Y);
  const expBy={}; for(const x of exp){ expBy[x.category||'other']=(expBy[x.category||'other']||0)+(num(x.amount)||0); }
  const expTotal=exp.reduce((a,x)=>a+(num(x.amount)||0),0);
  const hauls=liveOf('hauls').filter(h=>yearOf(h.date)===Y);
  const miles=hauls.reduce((a,h)=>a+(num(h.miles)||0),0), rate=mileageRate(Y), mileDed=round2(miles*rate);
  const purchases=hauls.reduce((a,h)=>a+(num(h.total)||0),0) + pieces().filter(it=>!it.haulId && yearOf(it.acquired)===Y).reduce((a,it)=>a+(num(it.cost)||0),0);
  // still on hand at year end: acquired by Dec 31 and not sold (or sold after) and not pulled
  const onHand=pieces().filter(it=>(it.acquired||'')<=end && it.status!=='pulled' && !(it.status==='sold' && (it.soldAt||'')<=end));
  const inventory=onHand.reduce((a,it)=>a+(num(it.cost)||0),0);
  const profit=gross-pieceFees-ship-cogs-expTotal-mileDed;
  return { sold, byVia, gross, pieceFees, ship, cogs, expBy, expTotal, miles, rate, mileDed, purchases, onHand, inventory, profit, hauls, exp };
}
function renderMoney(){
  const ys=yearsWithData(); const Y=Number($('money-year').value)||ys[0];
  $('money-year').innerHTML=ys.map(y=>'<option'+(y===Y?' selected':'')+'>'+y+'</option>').join('');
  const n=yearNumbers(Y);
  const todo=[];
  const noCost=n.sold.filter(it=>num(it.cost)==null); if(noCost.length) todo.push(noCost.length+' sold piece'+(noCost.length===1?' has':'s have')+' no cost: '+noCost.slice(0,6).map(it=>it.code).join(', '));
  const noRcpt=n.hauls.filter(h=>!h.receipt); if(noRcpt.length) todo.push(noRcpt.length+' haul'+(noRcpt.length===1?' has':'s have')+' no receipt photo');
  const noMiles=n.hauls.filter(h=>h.miles==null); if(noMiles.length) todo.push(noMiles.length+' haul'+(noMiles.length===1?' has':'s have')+' no miles');
  const noDate=n.sold.filter(it=>!it.soldVia); if(noDate.length) todo.push(noDate.length+' sale'+(noDate.length===1?' doesn’t':'s don’t')+' say where it sold');
  const stale=pieces().filter(it=>staleVenues(it).length); if(stale.length) todo.push(stale.length+' sold piece'+(stale.length===1?' is':'s are')+' still listed elsewhere: '+stale.map(it=>it.code).join(', '));
  const ready=pieces().filter(it=>it.status==='ready').length; if(ready) todo.push(ready+' piece'+(ready===1?' is':'s are')+' waiting for Claude');
  const row=(l,v,cls)=>'<tr'+(cls?' class="'+cls+'"':'')+'><td>'+l+'</td><td>'+v+'</td></tr>';
  let h='<div class="kpis">'+
    '<div class="kpi hero"><span>Estimated profit '+Y+'</span><b>'+money(n.profit)+'</b><em>'+n.sold.length+' sold · after cost of pieces, fees, expenses and mileage</em></div>'+
    '<div class="kpi"><span>Sales</span><b>'+money(n.gross)+'</b><em>'+Object.entries(n.byVia).map(([k,v])=>VENUE_LABEL[k]+' '+money(v)).join(' · ')+'</em></div>'+
    '<div class="kpi"><span>Cost of pieces sold</span><b>'+money(n.cogs)+'</b><em>what you paid for them</em></div>'+
    '<div class="kpi"><span>Mileage</span><b>'+Math.round(n.miles)+' mi</b><em>'+money(n.mileDed)+' at '+(n.rate*100).toFixed(1).replace(/\.0$/,'')+'¢</em></div>'+
    '<div class="kpi"><span>Inventory on hand</span><b>'+money(n.inventory)+'</b><em>'+n.onHand.length+' pieces at cost, Dec 31</em></div>'+
  '</div>';
  if(todo.length) h+='<div class="card"><h3>To tidy up</h3><ul class="todo">'+todo.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></div>';
  h+='<div class="card"><h3>For the tax preparer</h3><table class="ledger">'+
    row('Gross sales', money(n.gross,true))+
    row('Fees & consignment cut (per piece)', money(-n.pieceFees,true),'sub')+
    row('Shipping labels', money(-n.ship,true),'sub')+
    row('Cost of goods sold', money(-n.cogs,true))+
    Object.entries(n.expBy).map(([k,v])=>row(EXP_LABEL[k]||k, money(-v,true),'sub')).join('')+
    row('Car: '+Math.round(n.miles)+' business miles', money(-n.mileDed,true),'sub')+
    row('Estimated net profit', money(n.profit,true),'total')+
    '</table><p class="small muted">Also useful: purchases this year '+money(n.purchases,true)+'; ending inventory '+money(n.inventory,true)+'. Etsy’s own fees come from the monthly statement (Claude posts them as expenses). This is a summary to hand over, not tax advice.</p>'+
    '<div class="btn-row"><button class="btn" id="exp-summary">Download summary</button><button class="btn ghost" id="exp-csv">Download all records (CSV)</button></div></div>';
  $('money-body').innerHTML=h;
  $('exp-summary').onclick=()=>downloadSummary(Y, n);
  $('exp-csv').onclick=()=>downloadCsvs(Y);
}
$('money-year').onchange=renderMoney;

function csv(rows){ return rows.map(r=>r.map(v=>{ v=v==null?'':String(v); return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }).join(',')).join('\n'); }
function download(name, text, type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:type||'text/csv'})); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function downloadSummary(Y, n){
  const rows=[['Serendipity Vintage — '+Y+' summary', ''], ['',''], ['Gross sales', round2(n.gross)], ['Fees & consignment cut (per piece)', round2(n.pieceFees)], ['Shipping labels', round2(n.ship)], ['Cost of goods sold', round2(n.cogs)]];
  for(const [k,v] of Object.entries(n.expBy)) rows.push([EXP_LABEL[k]||k, round2(v)]);
  rows.push(['Business miles', Math.round(n.miles)], ['Mileage rate', n.rate], ['Mileage deduction', n.mileDed], ['Estimated net profit', round2(n.profit)], ['',''], ['Purchases during year', round2(n.purchases)], ['Ending inventory at cost', round2(n.inventory)], ['Pieces on hand at year end', n.onHand.length]);
  download('vintage-shop-'+Y+'-summary.csv', csv(rows));
}
function downloadCsvs(Y){
  const P=[['Code','Name','Status','Acquired','Haul date','Store','Cost','Sold on','Date sold','Sold for','Fees','Ship label','Net','Profit']];
  for(const it of pieces().sort((a,b)=>natCmp(a.code,b.code))){ if(yearOf(it.acquired)!==Y && yearOf(it.soldAt)!==Y) continue; const h=it.haulId&&getRec('hauls',it.haulId);
    P.push([it.code, pieceName(it), STATUS_LABEL[it.status], it.acquired, h?h.date:'', h?storeName(h):'', it.cost, VENUE_LABEL[it.soldVia]||'', it.soldAt, it.soldPrice, it.fees, it.shipCost, pieceNet(it), pieceProfit(it)]); }
  const H=[['Date','Store','Receipt total','Pieces','Miles','Receipt photo','Notes']];
  for(const h of liveOf('hauls').filter(h=>yearOf(h.date)===Y).sort((a,b)=>natCmp(a.date,b.date))) H.push([h.date, storeName(h), h.total, haulPieces(h).length, h.miles, h.receipt?h.receipt.split('/').pop():'', h.notes]);
  const E=[['Date','Category','Where / what','Amount','Receipt photo']];
  for(const x of liveOf('expenses').filter(x=>yearOf(x.date)===Y).sort((a,b)=>natCmp(a.date,b.date))) E.push([x.date, EXP_LABEL[x.category]||x.category, x.vendor, x.amount, x.receipt?x.receipt.split('/').pop():'']);
  download('vintage-shop-'+Y+'-pieces.csv', csv(P));
  setTimeout(()=>download('vintage-shop-'+Y+'-hauls-mileage.csv', csv(H)), 400);
  setTimeout(()=>download('vintage-shop-'+Y+'-expenses.csv', csv(E)), 800);
}
