/* Serendipity Vintage — speech.js
   Turns spoken measurements ("pit to pit eighteen and a half, length twenty seven,
   small pinhole left cuff") into fields, and runs the microphone.
   parseDictation() is pure (no page needed) so it can be tested in Node: see tests/parse.check.js. */
'use strict';

const MEAS = [
  // key, label, spoken names (longest first wins). Includes what the iPhone commonly hears instead ("pit the pit", "waste").
  ['pit',      'Pit to pit',  ['pit to pit','pit 2 pit','pit the pit','pit a pit','pit of pit','pit too pit','pits to pits','armpit to armpit','arm pit to arm pit','underarm to underarm','p2p','ptp','armpits','armpit','pits','pit','chest','bust']],
  ['shoulder', 'Shoulders',   ['shoulder to shoulder','shoulder seam to shoulder seam','shoulders','shoulder']],
  ['sleeve',   'Sleeve',      ['sleeve length','sleeves','sleeve','arm length']],
  ['waist',    'Waist',       ['waistband','waist','waste']],
  ['hips',     'Hips',        ['hips','hip']],
  ['backRise', 'Back rise',   ['back rise']],
  ['rise',     'Rise',        ['front rise','rise']],
  ['inseam',   'Inseam',      ['inseam','in seam','inside leg']],
  ['outseam',  'Outseam',     ['outseam','out seam','outside leg']],
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

// "eighteen and a half" → "18.5", "twenty seven" → "27", "18 1/2" → "18.5", "18 point 25" → "18.25".
// Keeps her capitals ("Pendleton", "USA") so notes read the way she said them.
function wordsToNumbers(text){
  let s=' '+String(text||'')
    .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
    .replace(/½/g,' 1/2').replace(/¼/g,' 1/4').replace(/¾/g,' 3/4').replace(/⅛/g,' 1/8')
    .replace(/(\d),(\d)/g,'$1.$2')                  // some dictation writes 18,5
    .replace(/-/g,' ').replace(/\bone\s+size\b/gi,'onesize')+' ';
  const lc=o=>o.toLowerCase();
  s=s.replace(new RegExp('\\b('+Object.keys(TENS).join('|')+')\\s+('+Object.keys(ONES).filter(k=>ONES[k]>0&&ONES[k]<10).join('|')+')\\b','gi'), (m,t,o)=>' '+(TENS[lc(t)]+ONES[lc(o)])+' ');
  s=s.replace(new RegExp('\\b('+Object.keys(TENS).join('|')+')\\b','gi'), (m,t)=>' '+TENS[lc(t)]+' ');
  s=s.replace(new RegExp('\\b('+Object.keys(ONES).join('|')+')\\b','gi'), (m,o)=>' '+ONES[lc(o)]+' ');
  s=s.replace(/(\d+)\s+(?:point|dot)\s+(\d+)(?:\s+(\d+))?/gi, (m,a,b,c)=>a+'.'+b+(c&&c.length===1?c:'')+(c&&c.length!==1?' '+c:''));
  s=s.replace(/(\d+(?:\.\d+)?)\s+(?:and\s+)?(\d+)\s*\/\s*(\d+)/gi, (m,a,n,d)=>String(round3(Number(a)+Number(n)/Number(d))));
  s=s.replace(/(\d+)\s*\/\s*(\d+)/g, (m,n,d)=> Number(d)? String(round3(Number(n)/Number(d))) : m);
  for(const [re, v] of FRAC_WORDS){
    s=s.replace(new RegExp('(\\d+(?:\\.\\d+)?)\\s+'+re.source, 'gi'), (m,a)=>String(round3(Number(a)+v)));
  }
  return s.replace(/\s+/g,' ').trim();
}
function round3(n){ return Math.round(n*1000)/1000; }

const _aliases = MEAS.flatMap(([key,,names])=>names.map(n=>({key, n}))).sort((a,b)=>b.n.length-a.n.length);
const _aliasSrc = _aliases.map(a=>a.n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+')).join('|');
const _aliasRe = new RegExp('\\b('+_aliasSrc+')\\b','gi');
const aliasKey = name=>{ const n=name.toLowerCase().replace(/\s+/g,' '); return (_aliases.find(a=>a.n===n)||{}).key; };
const COND_WORDS = /\b(condition|flaw|flaws|stain|stains|stained|hole|holes|pinhole|pinholes|moth|nip|nips|tear|torn|rip|ripped|snag|snags|pull|pulls|pilling|pill|fad(e|ed|ing)|discolor\w*|yellow\w*|spot|spots|mark|marks|missing|repair\w*|mend\w*|wear|worn|distress\w*|thin|loose|broken|split|odor|smell|as is|excellent|mint|deadstock|nwt)\b/i;
const UNIT_RE = /^\s*(?:inches|inch|in\b|"|'')?\.?(?:\s*(?:across|laid flat|lying flat|laying flat|flat)\b)?/i;
const FILLER = /^(?:(?:and|also|plus|um+|uh+|okay|ok|so|now|then|the|my|next|no wait|wait|sorry|actually)\s+)+/i;
// A spoken correction right after a number: "length 27 no wait 28", "scratch that, 28", "I mean 28"
const CORRECTION = /^\s*[,;.]?\s*(?:no\s+wait|no\s+no|no|wait|scratch\s+that|sorry|i\s+mean|actually|make\s+(?:that|it)|correction)\s*[,;.]?\s*(?:it'?s\s+|is\s+)?(\d+(?:\.\d+)?)/i;
// Whole-phrase voice commands
const COMMANDS = [
  ['next',  /^(?:next|skip|pass|next one|next box|skip it|skip that)$/i],
  ['undo',  /^(?:undo|undo that|scratch that|delete that|never ?mind|take that back|oops)$/i],
  ['stop',  /^(?:stop|stop listening|i'?m done|done|all done|that'?s it|that'?s all)$/i],
  ['walk',  /^(?:walk me through(?: (?:each|every|the) (?:box|boxes|measurement|measurements)| it)?|walk through(?: (?:each|every|the) (?:box|boxes|measurement|measurements))?|go through (?:each|every|the) (?:box|boxes)|measurements)$/i],
];
// "notes …" / "flaw …" at the start of a thought sends it to that box (and keeps sending there)
const TO_NOTES = /^(?:notes?|notes? for claude|add (?:a )?note|add to notes|note to claude)\b\s*(?:is|are|:)?\s*/i;
const TO_COND  = /^(?:condition|conditions|flaws?|condition notes?|add (?:a )?flaw)\b\s*(?:is|are|:)?\s*/i;
// Sizes: "tag size medium", "tax size small" (how the phone often hears "tag"), "it's a medium", "men's large", "she's a size 6"
const SIZE_TOKEN = '((?:\\d{1,2}\\s*(?:x|by)\\s*\\d{1,2})|(?:extra\\s+)+(?:small|large)|x{1,3}\\s*(?:small|large)|(?:\\d?x{1,3}[sl])|small|medium|large|petite|onesize|os|\\d{1,2}(?:\\.\\d)?\\s*(?:w|l|r|t|p|petite|tall|long|short|regular|reg)?|[sml])';
const SIZE_END = '(?=\\s*(?:$|[;,.!?]|and\\b|but\\b|fits?\\b|tag\\b|so\\b|'+_aliasSrc+'|\\d))';
const SIZE_RES = [
  new RegExp('\\b(?:it\'?s|it\\s+is|its|she\'?s|he\'?s|this\\s+is|this\\s+one\'?s|this\\s+one\\s+is)\\s+(?:an?\\s+)?size\\s+(?:is\\s+)?'+SIZE_TOKEN+'\\b','i'),
  new RegExp('\\b(?:ta(?:g|gs|x|ck)\\s+size\\s+|tag(?:ged)?\\s+(?:size\\s+)?|marked\\s+(?:size\\s+)?|label(?:ed)?\\s+size\\s+|size\\s+)(?:is\\s+|says\\s+|reads\\s+)?'+SIZE_TOKEN+'\\b','i'),
  new RegExp('\\b(?:it\'?s|it\\s+is|its|she\'?s|he\'?s|this\\s+is|this\\s+one\'?s|this\\s+one\\s+is)\\s+(?:an?\\s+)?((?:(?:extra\\s+)+(?:small|large)|x{1,3}\\s*(?:small|large)|\\d?x{1,3}[sl]|small|medium|large))\\b'+SIZE_END,'i'),
];
const SIZE_WHO = new RegExp("\\b(men'?s|mens|women'?s|womens|ladies'?|boys'?|girls'?|kids'?)\\s+(?:size\\s+)?((?:(?:extra\\s+)+(?:small|large)|x{1,3}\\s*(?:small|large)|\\d?x{1,3}[sl]|small|medium|large|\\d{1,2}(?:\\.\\d)?))\\b"+SIZE_END,'i');
const WHO = { mens:"Men's", womens:"Women's", ladies:"Women's", boys:"Boys'", girls:"Girls'", kids:"Kids'" };

/** Parse one phrase.
    textTarget: 'notes' | 'condition' | null — where free words go when she has picked a text box.
    Returns { m:{key:number}, size, condition:[], notes:[], loose:[number], text:[{text,hint}], target, cmd }
      m        measurements said with their name
      loose    numbers said with no name (go to the box she's on, or wait for her to pick one)
      text     other words she said that aren't going anywhere yet (hint: 'cond' | 'note') — never filed automatically
      target   a box she named without a number ("length" … "twenty seven"), or 'notes' / 'condition'
      cmd      'next' | 'undo' | 'stop' | 'walk' when the whole phrase was a command */
function parseDictation(text, textTarget){
  const out={ m:{}, size:'', condition:[], notes:[], loose:[], text:[], target:null, cmd:null };
  const bare=String(text||'').trim().replace(/[.!?,;:]+$/,'').trim();
  for(const [c, re] of COMMANDS) if(re.test(bare)){ out.cmd=c; return out; }
  let s=wordsToNumbers(text);
  // size
  const who=s.match(SIZE_WHO);
  if(who){ out.size=(WHO[who[1].toLowerCase().replace(/'/g,'')]||'')+' '+tidySize(who[2].toLowerCase()); out.size=out.size.trim(); s=s.replace(who[0],' ; '); }
  for(const re of SIZE_RES){ if(out.size) break; s=s.replace(re, (m,v)=>{ out.size=tidySize(v.toLowerCase()); return ' ; '; }); }
  s=s.replace(/\bonesize\b/i, ()=>{ if(!out.size) out.size='One size'; return ' ; '; });
  // measurements: "<name> [is|of|=|:] <number> [inches]"  or  "<number> [inches] <name>"
  const hits=[];
  let mm; _aliasRe.lastIndex=0;
  while((mm=_aliasRe.exec(s))){
    const key=aliasKey(mm[1]);
    const after=s.slice(mm.index+mm[0].length);
    const f=after.match(/^\s*[,:;]?\s*(?:is|are|of|at|=|:|measures|measuring|about|approx(?:imately)?|around|roughly)?\s*[,:]?\s*(?:is\s+)?(\d+(?:\.\d+)?)/i);
    if(f){
      let v=Number(f[1]), end=mm.index+mm[0].length+f[0].length, c;
      const u=s.slice(end).match(UNIT_RE); if(u) end+=u[0].length;
      while((c=s.slice(end).match(CORRECTION))){ v=Number(c[1]); end+=c[0].length; const u2=s.slice(end).match(UNIT_RE); if(u2) end+=u2[0].length; }
      hits.push({key, v, start:mm.index, end}); _aliasRe.lastIndex=end; continue;
    }
    const before=s.slice(0, mm.index).match(/(\d+(?:\.\d+)?)\s*(?:inches|inch|in|")?\s*(?:of\s+)?$/i);
    if(before && !hits.some(h=>h.end>mm.index-before[0].length)){ hits.push({key, v:Number(before[1]), start:mm.index-before[0].length, end:mm.index+mm[0].length}); }
  }
  // cut the matched pieces out; what's left is either a box she named, a stray number, or words for her to place
  let rest='', pos=0;
  for(const h of hits.sort((a,b)=>a.start-b.start)){
    if(h.start<pos) continue;
    out.m[h.key]=h.v;     // a later mention corrects an earlier one
    rest+=s.slice(pos, h.start)+' ; ';
    pos=h.end; const u=s.slice(pos).match(UNIT_RE); if(u) pos+=u[0].length;
  }
  rest+=s.slice(pos);
  let to=textTarget||null;
  // a decimal point isn't a sentence break: "18.5" must stay one number
  for(let seg of rest.replace(/(\d)\.(\d)/g,'$1\u0001$2').split(/\s*(?:[;,.!?\n]|\band then\b|\bnext\b|\bthen\b)\s*/i).map(x=>x.replace(/\u0001/g,'.'))){
    seg=seg.replace(FILLER,'').replace(/\s+(?:and|also)$/i,'').trim();
    if(!seg) continue;
    if(/^[\d.\s]+$/.test(seg)){ for(const n of seg.match(/\d+(?:\.\d+)?/g)||[]) out.loose.push(Number(n)); continue; }
    if(/^(?:and|also|inches|inch|in|the|a|measured flat|flat|laying flat|lying flat|no wait|wait|sorry|actually|oops|scratch that|never ?mind|let me see|let'?s see|hold on|um+|uh+|okay|ok|and then|next)$/i.test(seg)) continue;
    // a box named with no number: "length" … (she reads the tape) … "twenty seven"
    const nm=seg.match(new RegExp('^('+_aliasSrc+')(?:\\s+(?:is|are|measures|next))?$','i'));
    if(nm){ out.target=aliasKey(nm[1]); to=null; continue; }
    const n=seg.match(TO_NOTES), c=!n && seg.match(TO_COND);
    if(n||c){ to = n ? 'notes' : 'condition'; out.target=to; seg=seg.slice((n||c)[0].length).trim(); if(!seg) continue; }
    // "correction 28" / "scratch that 28" with nothing before it
    const cf=seg.match(/^(?:scratch that|no wait|i mean|make (?:that|it))\s+(\d+(?:\.\d+)?)$/i); if(cf){ out.loose.push(Number(cf[1])); continue; }
    seg=seg.charAt(0).toUpperCase()+seg.slice(1);
    if(to==='notes') out.notes.push(seg);
    else if(to==='condition') out.condition.push(seg);
    else out.text.push({ text:seg, hint: COND_WORDS.test(seg) ? 'cond' : 'note' });
  }
  return out;
}
function tidySize(v){
  v=String(v).trim().replace(/\s+/g,' ').toLowerCase();
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
let _rec=null, _want=false, _restartT=null, _pending=false, _stateCb=null, _micDenied=false, _flushCb=null;
const MIC_IDLE_MS = 2*60*1000;    // nothing heard for this long → pause, so it doesn't listen all afternoon (measuring takes a while)
const MIC_MAX_EMPTY = 40;         // restarts in a row that heard nothing at all → something's wrong; stop
function micSupported(){ return !!SR && !_micDenied; }
function micOn(){ return _want; }
function startMic(onPhrase, onInterim, onState){
  if(!SR || _micDenied) return false;
  _want=true; _stateCb=onState; let quiet=0, first=true, lastHeard=Date.now();
  const begin=()=>{
    let sent=''; const rec=_rec=new SR();
    rec.lang='en-US'; rec.continuous=true; rec.interimResults=true;
    rec.onresult=e=>{
      // Rebuild from every result each time: some phones repeat earlier phrases in later events, so adding
      // up event by event would say things twice. Only what's new since last time is handed on.
      let fin='', interim='';
      for(let i=0;i<e.results.length;i++){ const r=e.results[i]; if(r.isFinal) fin+=r[0].transcript+' '; else interim+=r[0].transcript; }
      fin=fin.replace(/\s+/g,' ').trim(); quiet=0; lastHeard=Date.now();
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
      const fcb=_flushCb; _flushCb=null; if(fcb){ quiet=0; lastHeard=Date.now(); fcb(); }      // a flush is not silence
      if(_want){
        if(++quiet>MIC_MAX_EMPTY || Date.now()-lastHeard>MIC_IDLE_MS){ _want=false; onInterim(''); onState('idle'); return; }
        _pending=true; _restartT=setTimeout(()=>{ _pending=false; if(_want){ try{ begin(); }catch(err){ _want=false; onState('end'); } } }, 250);
      } else { onInterim(''); onState('end'); }
    };
    rec.start();
    if(first){ first=false; onState('start'); }
  };
  try{ begin(); return true; }catch(e){ _want=false; return false; }
}
// Finish whatever is being said right now (the phone only closes a phrase after a pause), then call cb.
// Used when she taps a different box: the words just spoken still go to the box she was on.
function micFlush(cb){
  if(!_want || !_rec || _pending){ cb(); return; }
  _flushCb=cb;
  setTimeout(()=>{ if(_flushCb===cb){ _flushCb=null; cb(); } }, 1500);
  try{ _rec.stop(); }catch(e){ _flushCb=null; cb(); }
}
function stopMic(){ _want=false; clearTimeout(_restartT); if(_pending){ _pending=false; _stateCb&&_stateCb('end'); } try{ _rec && _rec.stop(); }catch(e){} }
if(typeof document!=='undefined') document.addEventListener('visibilitychange', ()=>{ if(document.hidden && _want) stopMic(); });
