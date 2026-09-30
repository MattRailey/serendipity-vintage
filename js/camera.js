/* Serendipity Vintage — camera.js
   An in-app camera so there is no "Use Photo" step: tap the shutter and the photo is saved, ready for the next.
   Cam.supported()  → true when this browser can run a live camera (needs https, or localhost)
   Cam.open({ title, shots:[[key,label]…], kind, single, next(kind,taken)→kind, onShot(file,kind) })
   If the camera can't start (permission declined, no camera), the screen says so and offers the phone's own
   camera through opts.fallback(), which must click a <input type=file capture> from inside a tap. */
'use strict';
const Cam = (function(){
  let stream=null, root=null, opts=null, kind=null, taken=0, chain=Promise.resolve(), closing=false;

  function supported(){ return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  function stop(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
  function close(){
    if(!root) return; closing=true; stop();
    const r=root; root=null; r.remove(); document.removeEventListener('visibilitychange', onVis);
    const done=opts&&opts.onClose; const c=chain; opts=null; closing=false; if(done) c.then(done);
  }
  function onVis(){ if(document.hidden && root) close(); }   // don't leave the camera running in the background

  function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }
  function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function drawChips(){
    if(!opts.shots || opts.single) return;
    const box=root.querySelector('.cam-chips');
    box.innerHTML=opts.shots.map(([k,l])=>'<button type="button" data-k="'+k+'" class="'+(k===kind?'on':'')+'">'+esc(l)+'</button>').join('');
    const on=box.querySelector('.on'); if(on && on.scrollIntoView) on.scrollIntoView({ inline:'center', block:'nearest' });
  }
  function drawCount(){ root.querySelector('.cam-count').textContent= taken ? taken+(taken===1?' photo':' photos')+' saved' : ''; }

  async function open(o){
    if(root) return; opts=o; kind=o.kind||(o.shots&&o.shots[0][0]); taken=0; chain=Promise.resolve();
    root=el('<div class="cam" role="dialog" aria-modal="true" aria-label="Camera">'
      +'<video class="cam-video" playsinline muted autoplay></video>'
      +'<div class="cam-top"><div class="cam-title">'+esc(o.title||'')+'</div><div class="cam-chips"></div>'
      +'<button type="button" class="cam-done">Done</button></div>'
      +'<div class="cam-msg hide"></div><div class="cam-flash"></div>'
      +'<div class="cam-bottom"><div class="cam-count"></div><button type="button" class="cam-shutter" aria-label="Take photo"></button><div class="cam-count-r"></div></div></div>');
    document.body.appendChild(root);
    document.addEventListener('visibilitychange', onVis);
    drawChips();
    root.querySelector('.cam-done').onclick=close;
    root.querySelector('.cam-chips').onclick=e=>{ const b=e.target.closest('[data-k]'); if(b){ kind=b.dataset.k; drawChips(); } };
    root.querySelector('.cam-shutter').onclick=shoot;
    const v=root.querySelector('video');
    try{
      stream=await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:{ ideal:'environment' }, width:{ ideal:4032 }, height:{ ideal:3024 } } });
      if(!root){ stop(); return; }                 // closed while the permission prompt was up
      v.srcObject=stream; await v.play().catch(()=>{});
    }catch(err){
      if(!root) return;
      const m=root.querySelector('.cam-msg'); m.classList.remove('hide');
      m.innerHTML='<p>'+(err&&err.name==='NotAllowedError' ? 'The camera is turned off for this app.' : 'The camera couldn’t start.')+'</p>'
        +(o.fallback?'<button type="button" class="btn cam-fb">Use the phone’s camera instead</button>':'')
        +'<button type="button" class="btn ghost cam-x">Close</button>';
      const fb=m.querySelector('.cam-fb'); if(fb) fb.onclick=()=>{ const f=o.fallback; const k=kind; close(); f(k); };
      m.querySelector('.cam-x').onclick=close;
      root.querySelector('.cam-shutter').disabled=true;
    }
  }

  function shoot(){
    const v=root&&root.querySelector('video'); if(!v || !v.videoWidth || !stream) return;
    const w=v.videoWidth, h=v.videoHeight, c=document.createElement('canvas'); c.width=w; c.height=h;
    c.getContext('2d').drawImage(v,0,0,w,h);
    const shotKind=kind, o=opts;
    const fl=root.querySelector('.cam-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    try{ if(navigator.vibrate) navigator.vibrate(15); }catch(e){}
    taken++; drawCount();
    if(o.single) stop();                                    // one photo, then the camera shuts
    c.toBlob(blob=>{
      if(!blob){ return; }
      const file=new File([blob], 'photo.jpg', { type:'image/jpeg' });
      chain=chain.then(()=>o.onShot(file, shotKind)).catch(()=>{});
      if(o.single){ close(); return; }
      if(o.next){ const n=o.next(shotKind, taken); if(n && n!==kind){ kind=n; drawChips(); } }
    }, 'image/jpeg', 0.92);
  }

  return { supported, open, close };
})();
