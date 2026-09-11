/* PLAY7 — One Swipe Per Box, Game Rules Followed */
(function(){
  if(window.PLAY7 && window.PLAY7.__live){
    try{ PLAY7.stop(); }catch(_){}
  }
  try{ window.PLAY6 && PLAY6.stop && PLAY6.stop(); }catch(_){}
  try{ window.PLAY5 && PLAY5.stop && PLAY5.stop(); }catch(_){}
  try{ window.PLAY4 && PLAY4.stop && PLAY4.stop(); }catch(_){}

  const CFG = {
    reactionMin: 0,          // instant
    reactionMax: 25,         // halka jitter
    jitterPx: 5,
    distMin: 0.36,
    distMax: 0.46,
    evGapMin: 4,
    evGapMax: 10,
    boxGoneMs: 80,           // 80ms tak sprite na draw ho = box gone (naya box aa gaya)
    postSwipeGraceMs: 60     // gesture ke baad extra wait before accepting next box
  };

  const rnd=(a,b)=>a+Math.random()*(b-a);
  const rndi=(a,b)=>Math.floor(rnd(a,b+1));

  const S = {
    __live:true,
    box:null,
    swiped:false,
    swipeInProgress:false,   // ← LOCK: ek waqt me sirf ek swipe
    boxIdCounter:0,
    lastSwipedBoxId:-1,
    count:0,
    stats:{up:0,down:0,left:0,right:0,trap:0,life:0,arrow:0},
    log:[],
    lastAngle:null,
    swipeAt:0,
    lastBoxName:null,
    busyUntil:0
  };

  const P='%c[P7]%c ', S1='background:#f59e0b;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold';
  const L=(m,c)=>console.log(P,S1,'color:'+(c||'#fcd34d'),m);

  const frame=()=>[...document.querySelectorAll('iframe')].find(f=>(f.getAttribute('src')||'').includes('/game'));
  const win=()=>{try{return frame()?.contentWindow||null}catch(_){return null}};
  const cv =()=>{try{return frame()?.contentDocument?.querySelector('canvas')||null}catch(_){return null}};

  function angleToDir(a){
    const t=Math.PI*2;
    a = a - t*Math.floor((a+Math.PI)/t);
    const d = a*180/Math.PI;
    if(d>=-45 && d<45)   return 'right';
    if(d>=45  && d<135)  return 'down';
    if(d>=135 || d<-135) return 'left';
    return 'up';
  }

  // ✅ GAME RULES mapping
  const BOX_RE = /box-(thunder|gully|firefox|heart|trap)/i;
  function boxKind(nm){
    if(/trap/i.test(nm))     return 'trap';   // ulta direction
    if(/heart/i.test(nm))    return 'life';   // correct direction, +1 life
    if(/thunder/i.test(nm))  return 'arrow';  // +15 pts
    if(/gully/i.test(nm))    return 'arrow';  // +50 pts
    if(/firefox/i.test(nm))  return 'arrow';  // +50 pts
    return 'arrow';
  }

  function hook(w){
    if(!w || w.__P7__) return false;
    w.__P7__=true;
    const proto = w.CanvasRenderingContext2D.prototype;

    const oDI = proto.drawImage;
    proto.drawImage = function(img, ...a){
      const r = oDI.apply(this,[img,...a]);
      try{
        let dw,dh;
        if(a.length>=8){ dw=a[6]; dh=a[7]; }
        else if(a.length>=4){ dw=a[2]; dh=a[3]; }
        else return r;
        if(dw<60||dh<60||dw>260||dh>260) return r;

        const nm=(img&&(img.currentSrc||img.src)||'').split('/').pop().split('?')[0];
        if(!nm || !BOX_RE.test(nm)) return r;

        const now = performance.now();

        // Agar wahi sprite abhi bhi draw ho raha hai → sirf timer refresh
        const sameName   = S.box && S.box.name === nm;
        const stillAlive = S.box && (now - S.box.t) < CFG.boxGoneMs;

        if(sameName && stillAlive){
          S.box.t = now;
          return r;
        }

        // NAYA BOX (name change OR box gone tha)
        S.boxIdCounter++;
        S.box = {
          id: S.boxIdCounter,          // unique ID per box instance
          name: nm,
          kind: boxKind(nm),           // 'arrow' | 'trap' | 'life'
          t: now,
          first: now,
          readyAt: now + rnd(CFG.reactionMin, CFG.reactionMax)
        };
        S.swiped = false;
        S.lastAngle = null;
      }catch(_){}
      return r;
    };

    const oF = proto.fill;
    proto.fill = function(...args){
      try{
        const t = this.getTransform();
        if(Math.hypot(t.a,t.b) > 0.3){
          S.lastAngle = { angle: Math.atan2(t.b,t.a), t: performance.now() };
        }
      }catch(_){}
      return oF.apply(this,args);
    };
    return true;
  }

  function swipe(dir){
    const c=cv(), w=win(); if(!c||!w) return false;
    const dist = Math.min(c.width,c.height) * rnd(CFG.distMin, CFG.distMax);
    const rect = c.getBoundingClientRect();
    const cx = rect.left + rect.width/2  + rnd(-CFG.jitterPx,CFG.jitterPx);
    const cy = rect.top  + rect.height/2 + rnd(-CFG.jitterPx,CFG.jitterPx);

    let dx=0,dy=0;
    if(dir==='up')    dy=-dist;
    if(dir==='down')  dy= dist;
    if(dir==='left')  dx=-dist;
    if(dir==='right') dx= dist;

    const mx1=cx+dx*0.35+rnd(-2,2), my1=cy+dy*0.35+rnd(-2,2);
    const mx2=cx+dx*0.75+rnd(-2,2), my2=cy+dy*0.75+rnd(-2,2);
    const ex =cx+dx+rnd(-3,3),      ey =cy+dy+rnd(-3,3);

    const fire=(t,x,y)=>{
      const o={bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y};
      try{ c.dispatchEvent(new w.PointerEvent(t,{...o,pointerId:1,pointerType:'touch',isPrimary:true,button:0})); }catch(_){}
      try{ c.dispatchEvent(new w.MouseEvent(t.replace('pointer','mouse'),{...o,button:0})); }catch(_){}
    };

    const g1=rndi(CFG.evGapMin,CFG.evGapMax);
    const g2=rndi(CFG.evGapMin,CFG.evGapMax);
    const g3=rndi(CFG.evGapMin,CFG.evGapMax);

    fire('pointerdown',cx,cy);
    setTimeout(()=>{
      fire('pointermove',mx1,my1);
      setTimeout(()=>{
        fire('pointermove',mx2,my2);
        setTimeout(()=>fire('pointerup',ex,ey), g3);
      }, g2);
    }, g1);

    S.busyUntil = performance.now() + g1+g2+g3 + CFG.postSwipeGraceMs;
    return true;
  }

  const opp=d=>d==='up'?'down':d==='down'?'up':d==='left'?'right':'left';

  let running = true;
  function tick(){
    if(!running) return;
    const now = performance.now();

    // 🔓 Lock release — gesture complete hone par
    if(S.swipeInProgress && now >= S.busyUntil){
      S.swipeInProgress = false;
    }

    // 🔒 Ek waqt me sirf ek swipe
    if(S.swipeInProgress){ requestAnimationFrame(tick); return; }
    if(now < S.busyUntil){ requestAnimationFrame(tick); return; }

    // Already swiped this box → wait for new box
    if(S.swiped){ requestAnimationFrame(tick); return; }

    // Extra safety: same box instance ko dobara kabhi mat swipe karo
    if(!S.box || S.box.id === S.lastSwipedBoxId){
      requestAnimationFrame(tick); return;
    }

    if(!S.lastAngle){ requestAnimationFrame(tick); return; }
    if(now < S.box.readyAt){ requestAnimationFrame(tick); return; }
    if(S.lastAngle.t < S.box.first){ requestAnimationFrame(tick); return; }
    if((now - S.box.first) > 1500){ requestAnimationFrame(tick); return; } // stale

    // ✅ RULES: trap → ulta direction, arrow/life → correct direction
    const rawDir   = angleToDir(S.lastAngle.angle);
    const swipeDir = (S.box.kind === 'trap') ? opp(rawDir) : rawDir;

    // 🔒 Lock set karo BEFORE firing swipe
    S.swiped = true;
    S.swipeInProgress = true;
    S.lastSwipedBoxId = S.box.id;
    S.count++;
    S.stats[swipeDir]++;
    S.stats[S.box.kind]++;

    if(S.log.length>80) S.log.shift();
    S.log.push({
      id: S.box.id,
      name: S.box.name,
      kind: S.box.kind,
      angle: (S.lastAngle.angle*180/Math.PI).toFixed(0),
      raw: rawDir,
      swipe: swipeDir,
      delay: Math.round(now - S.box.first)
    });

    const tag = S.box.kind === 'trap' ? '[TRAP→OPP]'
              : S.box.kind === 'life' ? '[LIFE]'
              : '[ARROW]';
    const col = S.box.kind === 'trap' ? '#f59e0b'
              : S.box.kind === 'life' ? '#ef4444'
              : '#22d3ee';

    L(`→ ${swipeDir.toUpperCase()} #${S.count} ${tag} ${S.box.name} raw=${rawDir} delay=${Math.round(now-S.box.first)}ms`, col);

    swipe(swipeDir);
    S.swipeAt = performance.now();
    S.lastBoxName = S.box.name;

    requestAnimationFrame(tick);
  }

  if(!hook(win())){
    const mo = new MutationObserver(()=>{ if(hook(win())) mo.disconnect(); });
    mo.observe(document.body,{childList:true,subtree:true});
  }

  let tries=0;
  const boot=setInterval(()=>{
    const c=cv();
    if(c){
      clearInterval(boot);
      L(`✓ canvas ${c.width}x${c.height} — one-swipe-per-box loop started`,'#22c55e');
      requestAnimationFrame(tick);
    }
    else if(++tries>100){ clearInterval(boot); L('canvas nahi mila — "Play" dabao','#f59e0b'); }
  },200);

  window.PLAY7 = {
    __live:true,
    stop(){ running=false; L('stopped. swipes='+S.count); console.table(S.stats); },
    stats(){ console.table(S.stats); console.table(S.log); },
    box(){return S.box;},
    angle(){return S.lastAngle;},
    cfg(){return {...CFG};},
    setCfg(k,v){ if(k in CFG){ CFG[k]=v; L('cfg.'+k+' = '+v); } },
    fast(){ CFG.reactionMin=0; CFG.reactionMax=10; CFG.evGapMin=3; CFG.evGapMax=7; CFG.boxGoneMs=60; L('FAST mode'); },
    safe(){ CFG.reactionMin=20; CFG.reactionMax=50; CFG.evGapMin=5; CFG.evGapMax=12; CFG.boxGoneMs=120; L('SAFE mode'); }
  };
  L('PLAY7 ready. One swipe per box. Rules: Thunder/Gully/Firefox/Heart = same dir, Trap = opposite.','#22c55e');
})();
