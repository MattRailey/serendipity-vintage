/* Serendipity Vintage — speech.js
   Turns spoken measurements ("pit to pit eighteen and a half, length twenty seven,
   small pinhole left cuff") into fields, and runs the microphone.
   parseDictation() is pure (no page needed) so it can be tested in Node: see tests/parse.check.js. */
'use strict';

const MEAS = [
  // key, label, spoken names (longest first wins)
  ['pit',      'Pit to pit',  ['pit to pit','pit-to-pit','armpit to armpit','underarm to underarm','p2p','ptp','pits','pit','chest','bust']],
  ['shoulder', 'Shoulders',   ['shoulder to shoulder','shoulder seam to shoulder seam','shoulders','shoulder']],
  ['sleeve',   'Sleeve',      ['sleeve length','sleeves','sleeve','arm length']],
  ['waist',    'Waist',       ['waistband','waist']],
  ['hips',     'Hips',        ['hips','hip']],
  ['backRise', 'Back rise',   ['back rise']],
  ['rise',     'Rise',        ['front rise','rise']],
  ['inseam',   'Inseam',      ['inseam','inside leg']],
  ['outseam',  'Outseam',     ['outseam','outside leg']],
  ['thigh',    'Thigh',       ['thighs','thigh']],
  ['leg',      'Leg opening', ['leg opening','leg openings','ankle opening','hem opening','ankle','leg']],
  ['hem',      'Hem / sweep', ['hem width','hem sweep','sweep','hem']],
  ['length',   'Length',      ['total length','overall length','body length','back length','waist to hem','shoulder to hem','top to bottom','length','long']],
  ['width',    'Width',       ['width','wide']],
  ['height',   'Height',      ['height','tall']],
  ['depth',    'Depth',       ['depth','deep','gusset']],
  ['drop',     'Strap drop',  ['strap drop','handle drop','drop']],
];
const MEAS_LABEL = Object.fromEntries(MEAS.map(m=>[m[0], m[1]]));
const TYPES = {
  top:      { label:'Top / shirt',  fields:['pit','length','shoulder','sleeve'] },
  sweater:  { label:'Sweater',      fields:['pit','length','shoulder','sleeve'] },
  jacket:   { label:'Jacket / coat',fields:['pit','length','shoulder','sleeve','waist'] },
  dress:    { label:'Dress',        fields:['pit','waist','hips','length','shoulder','sleeve'] },
  jumpsuit: { label:'Jumpsuit',     fields:['pit','waist','hips','rise','inseam','length'] },
  pants:    { label:'Pants / jeans',fields:['waist','hips','rise','inseam','thigh','leg'] },
  shorts:   { label:'Shorts',       fields:['waist','hips','rise','inseam','thigh','leg'] },
  skirt:    { label:'Skirt',        fields:['waist','hips','length','hem'] },
  bag:      { label:'Bag / accessory', fields:['width','height','depth','drop'] },
  other:    { label:'Other',        fields:['length','width'] },
};

const ONES = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12, thirteen:13,
  fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
const TENS = { twenty:20, thirty:30, forty:40, fourty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
const FRAC_WORDS = [ [/(?:and\s+)?(?:a|one|1)\s+half\b/, .5], [/(?:and\s+)?(?:three|3)\s+quarters?\b/, .75], [/(?:and\s+)?(?:a|one|1)\s+quarter\b/, .25],
  [/(?:and\s+)?(?:an|one|1)\s+eighth\b/, .125], [/(?:and\s+)?(?:three|3)\s+eighths\b/, .375], [/(?:and\s+)?(?:five|5)\s+eighths\b/, .625], [/(?:and\s+)?(?:seven|7)\s+eighths\b/, .875],
  [/(?:and\s+)?half\b/, .5] ];

// "eighteen and a half" → "18.5", "twenty seven" → "27", "18 1/2" → "18.5", "18 point 25" → "18.25"
function wordsToNumbers(text){
  let s=' '+String(text||'').toLowerCase()
    .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
    .replace(/½/g,' 1/2').replace(/¼/g,' 1/4').replace(/¾/g,' 3/4').replace(/⅛/g,' 1/8')
    .replace(/(\d),(\d)/g,'$1.$2')                  // some dictation writes 18,5
    .replace(/-/g,' ').replace(/\bone\s+size\b/g,'onesize')+' ';
  // compound tens: twenty seven → 27
  s=s.replace(new RegExp('\\b('+Object.keys(TENS).join('|')+')\\s+('+Object.keys(ONES).filter(k=>ONES[k]>0&&ONES[k]<10).join('|')+')\\b','g'), (m,t,o)=>' '+(TENS[t]+ONES[o])+' ');
  s=s.replace(new RegExp('\\b('+Object.keys(TENS).join('|')+')\\b','g'), (m,t)=>' '+TENS[t]+' ');
  s=s.replace(new RegExp('\\b('+Object.keys(ONES).join('|')+')\\b','g'), (m,o)=>' '+ONES[o]+' ');
  s=s.replace(/(\d+)\s+(?:point|dot)\s+(\d+)(?:\s+(\d+))?/g, (m,a,b,c)=>a+'.'+b+(c&&c.length===1?c:'')+(c&&c.length!==1?' '+c:''));
  s=s.replace(/(\d+(?:\.\d+)?)\s+(?:and\s+)?(\d+)\s*\/\s*(\d+)/g, (m,a,n,d)=>String(round3(Number(a)+Number(n)/Number(d))));
  s=s.replace(/(\d+)\s*\/\s*(\d+)/g, (m,n,d)=> Number(d)? String(round3(Number(n)/Number(d))) : m);
  for(const [re, v] of FRAC_WORDS){
    s=s.replace(new RegExp('(\\d+(?:\\.\\d+)?)\\s+'+re.source, 'g'), (m,a)=>String(round3(Number(a)+v)));
  }
  return s.replace(/\s+/g,' ').trim();
}
function round3(n){ return Math.round(n*1000)/1000; }

const _aliases = MEAS.flatMap(([key,,names])=>names.map(n=>({key, n}))).sort((a,b)=>b.n.length-a.n.length);
const _aliasRe = new RegExp('\\b('+_aliases.map(a=>a.n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+')).join('|')+')\\b','g');
const COND_WORDS = /\b(condition|flaw|flaws|stain|stains|stained|hole|holes|pinhole|pinholes|moth|nip|nips|tear|torn|rip|ripped|snag|snags|pull|pulls|pilling|pill|fad(e|ed|ing)|discolor\w*|yellow\w*|spot|spots|mark|marks|missing|repair\w*|mend\w*|wear|worn|distress\w*|thin|loose|broken|split|seam|odor|smell|underarm|as is|excellent|great|good|fair|mint|deadstock|nwt)\b/;
const UNIT_RE = /^\s*(?:inches|inch|in\b|"|'')\.?/;

/** Parse one dictation. Returns { m:{key:number}, size, condition:[], notes:[], loose:[number] }. */
function parseDictation(text){
  const out={ m:{}, size:'', condition:[], notes:[], loose:[] };   // loose = numbers said with no name, to place by hand
  let s=wordsToNumbers(text);
  // size: "tag size medium", "size 12 petite", "tagged 32 x 30", "marked large"
  s=s.replace(/\b(?:tag(?:ged)?\s+(?:size\s+)?|marked\s+(?:size\s+)?|label(?:ed)?\s+size\s+|size\s+)(?:is\s+|says\s+)?((?:\d{1,2}\s*(?:x|by)\s*\d{1,2})|(?:extra\s+)+(?:small|large)|x{1,3}\s*(?:small|large)|(?:\d?x{1,3}[sl])|small|medium|large|petite|onesize|os|\d{1,2}(?:\.\d)?\s*(?:w|l|r|t|p|petite|tall|long|short|regular|reg)?|[sml])\b/i,
    (m,v)=>{ out.size=tidySize(v); return ' ; '; });
  s=s.replace(/\bonesize\b/, ()=>{ if(!out.size) out.size='One size'; return ' ; '; });
  // measurements: "<name> [is|of|=|:] <number> [inches]"  or  "<number> [inches] <name>"
  const hits=[];
  let mm; _aliasRe.lastIndex=0;
  while((mm=_aliasRe.exec(s))){
    const name=mm[1].replace(/\s+/g,' '), key=_aliases.find(a=>a.n===name).key;
    const after=s.slice(mm.index+mm[0].length);
    const f=after.match(/^\s*(?:is|are|of|at|=|:|measures|measuring|about|approx(?:imately)?|around|roughly)?\s*(?:is\s+)?(\d+(?:\.\d+)?)/);
    if(f){ hits.push({key, v:Number(f[1]), start:mm.index, end:mm.index+mm[0].length+f[0].length}); _aliasRe.lastIndex=mm.index+mm[0].length+f[0].length; continue; }
    const before=s.slice(0, mm.index).match(/(\d+(?:\.\d+)?)\s*(?:inches|inch|in|")?\s*(?:of\s+)?$/);
    if(before && !hits.some(h=>h.end>mm.index-before[0].length)){ hits.push({key, v:Number(before[1]), start:mm.index-before[0].length, end:mm.index+mm[0].length}); }
  }
  // cut the matched pieces out; what's left is condition notes or general notes
  let rest='', pos=0;
  for(const h of hits.sort((a,b)=>a.start-b.start)){
    if(h.start<pos) continue;
    if(!(h.key in out.m) || true) out.m[h.key]=h.v;     // a later mention corrects an earlier one
    rest+=s.slice(pos, h.start)+' ; ';
    pos=h.end; const u=s.slice(pos).match(UNIT_RE); if(u) pos+=u[0].length;
  }
  rest+=s.slice(pos);
  // a decimal point isn't a sentence break: "18.5" must stay one number
  for(let seg of rest.replace(/(\d)\.(\d)/g,'$1\u0001$2').split(/\s*(?:[;,.!?\n]|\band then\b|\bnext\b|\bthen\b)\s*/).map(x=>x.replace(/\u0001/g,'.'))){
    seg=seg.replace(/^(?:(?:and|also|plus|um+|uh+|okay|ok|so|no wait|wait|sorry|actually)\s+)+/,'').replace(/\s+(?:and|also)$/,'').trim();
    if(/^[\d.\s]+$/.test(seg)){ for(const n of seg.match(/\d+(?:\.\d+)?/g)||[]) out.loose.push(Number(n)); continue; }
    if(!seg || /^(?:and|also|inches|inch|in|the|a|measured flat|flat|laying flat|lying flat|no wait|wait|sorry|actually|oops|scratch that|never ?mind|let me see|um+|uh+|okay|ok)$/.test(seg) || /^[\d.\s]+$/.test(seg)) continue;
    seg=seg.replace(/^(?:condition|conditions|flaws?|notes?)\s*(?:is|are|:)?\s*/,'');
    if(!seg) continue;
    (COND_WORDS.test(seg) ? out.condition : out.notes).push(seg.charAt(0).toUpperCase()+seg.slice(1));
  }
  return out;
}
function tidySize(v){
  v=String(v).trim().replace(/\s+/g,' ');
  const map={ 's':'S','m':'M','l':'L','small':'S','medium':'M','large':'L','extra small':'XS','extra large':'XL','extra extra large':'XXL','onesize':'One size','os':'One size','petite':'Petite' };
  if(map[v]) return map[v];
  v=v.replace(/^x{1,3}\s*(small|large)$/,(m,w)=>m.replace(/\s*(small|large)/,'').toUpperCase()+(w==='small'?'S':'L'));
  v=v.replace(/^(\d?x{1,3}[sl])$/,m=>m.toUpperCase());
  v=v.replace(/(\d{1,2})\s*(?:x|by)\s*(\d{1,2})/,'$1 × $2');
  return v.replace(/\b(\d+)\s*(petite|tall|long|short|regular|reg)\b/,(m,n,w)=>n+' '+w.charAt(0).toUpperCase()+w.slice(1)).replace(/\b(\d+)\s*([wlrtp])\b/,(m,n,w)=>n+w.toUpperCase());
}
function fmtIn(v){ if(v==null||v==='') return ''; const n=Number(v); const w=Math.floor(n), f=round3(n-w);
  const fr={0.25:'¼',0.5:'½',0.75:'¾',0.125:'⅛',0.375:'⅜',0.625:'⅝',0.875:'⅞'}[f]; return fr ? (w?w:'')+fr : String(n); }

if(typeof module!=='undefined') module.exports={ parseDictation, wordsToNumbers, tidySize, fmtIn, MEAS, TYPES };

/* ============================================================
   Microphone. One tap starts a listening session that keeps going (it restarts itself when the phone
   ends a recognition early) until she taps stop, closes the piece, or leaves the app — so the phone
   asks for the microphone once, not on every phrase.
   startMic(onPhrase, onInterim, onState)
     onPhrase(text)      each finished phrase, exactly once
     onInterim(text)     what's being said right now (preview only)
     onState(state, err) 'start' | 'end' | 'idle' (nobody spoke for a while) | 'error'
   iPhone Safari has built-in speech recognition; if it isn't available (or is refused), the box still
   takes the keyboard's own dictation mic.
   ============================================================ */
const SR = typeof window!=='undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
let _rec=null, _want=false, _restartT=null, _pending=false, _stateCb=null, _micDenied=false;
const MIC_IDLE_RESTARTS = 4;      // restarts in a row with nothing said → stop, so it doesn't listen all afternoon
function micSupported(){ return !!SR && !_micDenied; }
function micOn(){ return _want; }
function startMic(onPhrase, onInterim, onState){
  if(!SR || _micDenied) return false;
  _want=true; _stateCb=onState; let quiet=0, first=true;
  const begin=()=>{
    let sent=''; const rec=_rec=new SR();
    rec.lang='en-US'; rec.continuous=true; rec.interimResults=true;
    rec.onresult=e=>{
      // Rebuild from every result each time: some phones repeat earlier phrases in later events, so adding
      // up event by event would say things twice. Only what's new since last time is handed on.
      let fin='', interim='';
      for(let i=0;i<e.results.length;i++){ const r=e.results[i]; if(r.isFinal) fin+=r[0].transcript+' '; else interim+=r[0].transcript; }
      fin=fin.replace(/\s+/g,' ').trim(); quiet=0;
      if(fin.length>sent.length && fin.startsWith(sent)){ const add=fin.slice(sent.length).trim(); sent=fin; if(add) onPhrase(add); }
      else if(fin.length>sent.length) sent=fin;
      onInterim(interim.trim());
    };
    rec.onerror=e=>{
      if(e.error==='no-speech' || e.error==='aborted') return;            // normal; onend decides what happens next
      _want=false;
      if(e.error==='not-allowed' || e.error==='service-not-allowed') _micDenied=true;   // don't pester again this visit
      onState('error', e.error);
    };
    rec.onend=()=>{
      if(_rec!==rec) return;
      if(_want){
        if(++quiet>MIC_IDLE_RESTARTS){ _want=false; onInterim(''); onState('idle'); return; }
        _pending=true; _restartT=setTimeout(()=>{ _pending=false; if(_want){ try{ begin(); }catch(err){ _want=false; onState('end'); } } }, 250);
      } else { onInterim(''); onState('end'); }
    };
    rec.start();
    if(first){ first=false; onState('start'); }
  };
  try{ begin(); return true; }catch(e){ _want=false; return false; }
}
function stopMic(){ _want=false; clearTimeout(_restartT); if(_pending){ _pending=false; _stateCb&&_stateCb('end'); } try{ _rec && _rec.stop(); }catch(e){} }
if(typeof document!=='undefined') document.addEventListener('visibilitychange', ()=>{ if(document.hidden && _want) stopMic(); });
