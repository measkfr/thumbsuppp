/* PLAY6 — Strict Sequential v4 (locked snapshot, 10–30ms) */
(function(){
  if(window.PLAY6 && window.PLAY6.__live){
    try{ PLAY6.stop(); }catch(_){}
  }

  const CFG = {
    reactionMin: 10,
    reactionMax: 30,
    evGapMin: 4,
    evGapMax: 8,
    postSwipeMs: 15,
    gapThresholdMs: 90,
    sameBoxCooldown: 250,
    minFrameWaitMs: 16,
    flickerWindowMs: 45,
    jitterPx: 5,
    distMin: 0.34,
    distMax: 0.44
  };

  function rnd(a,b){ return a + Math.random()*(b-a); }
  function rndi(a,b){ return Math.floor(rnd(a,b+1)); }

  const S = {
    __live: true,
    running: true,
    state: 'idle',          // idle | ready | swiping
    activeBox: null,
    lastDrawnName: null,
    lastDrawnAt: 0,
    swipedName: null,
    swipedAt: 0,
    lastAngle: null,
    count: 0,
    misses: 0,
    wrongGuards: 0,
    stats: {up:0, down:0, left:0, right:0},
    log: []
  };

  const P='%c[P6]%c ', S1='background:#8b5cf6;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold';
  const L=(m,c)=>console.log(P,S1,'color:'+(c||'#c4b5fd'),m);

  const frame=()=>[...document.querySelectorAll('iframe')].find(f=>(f.getAttribute('src')||'').includes('/game'));
  const win=()=>{try{return frame()?.contentWindow||null}catch(_){return null}};
  const cv =()=>{try{return frame()?.contentDocument?.querySelector('canvas')||null}catch(_){return null}};

  function angleToDir(a){
    const t = Math.PI*2;
    a = a - t*Math.floor((a+Math.PI)/t);
    const d = a*180/Math.PI;
    if(d>=-45 && d<45)   return 'right';
    if(d>=45  && d<135)  return 'down';
    if(d>=135 || d<-135) return 'left';
    return 'up';
  }
  const opp = d => d==='up'?'down':d==='down'?'up':d==='left'?'right':'left';

  const BOX_RE = /box-(thunder|gully|firefox|heart|trap)/i;

  /* ---------- box build ---------- */
  function buildActiveBox(nm, now){
    const reaction = rnd(CFG.reactionMin, CFG.reactionMax);
    S.activeBox = {
      name: nm,
      firstSeen: now,
      lastSeen: now,
      readyAt: now + reaction,
      trap: /trap/i.test(nm),
      _fired: false                // ONE-SHOT GUARD
    };
    S.state = 'ready';
    L(`◆ box ${nm} ${S.activeBox.trap?'[TRAP]':'[ARROW]'} reaction=${Math.round(reaction)}ms`, '#a78bfa');
  }

  function onBoxDraw(nm, now){
    const prevName = S.lastDrawnName;
    const prevAt   = S.lastDrawnAt;
    S.lastDrawnName = nm;
    S.lastDrawnAt   = now;

    if (S.state === 'swiping') return;

    // same as active → refresh only
    if (S.state === 'ready' && S.activeBox && S.activeBox.name === nm){
      S.activeBox.lastSeen = now;
      return;
    }

    // recently swiped sprite still animating out → ignore
    if (S.swipedName === nm && (now - S.swipedAt) < CFG.sameBoxCooldown){
      return;
    }

    let isNew = false;
    if (prevName === null)                         isNew = true;
    else if (prevName !== nm)                      isNew = true;
    else if ((now - prevAt) > CFG.gapThresholdMs)  isNew = true;
    if (!isNew) return;

    // different box while ready → flicker or miss?
    if (S.state === 'ready' && S.activeBox && S.activeBox.name !== nm){
      const age = now - S.activeBox.firstSeen;
      const fired = S.activeBox._fired;

      // FLICKER: rapid sprite swap (same logical box) → just rename
      if (age < CFG.flickerWindowMs && !fired){
        S.activeBox.name = nm;
        S.activeBox.trap = /trap/i.test(nm);
        S.activeBox.lastSeen = now;
        return;
      }

      // don't count as miss if we already fired on it (it was consumed)
      if (!fired){
        S.misses++;
        L(`⚠ MISS ${S.activeBox.name} → replaced by ${nm}`, '#ef4444');
      }
    }

    buildActiveBox(nm, now);
  }

  function onFillAngle(angle, now){
    S.lastAngle = { angle, t: now };
  }

  function hook(w){
    if (!w || w.__P6__) return false;
    w.__P6__ = true;
    const proto = w.CanvasRenderingContext2D.prototype;

    const oDI = proto.drawImage;
    proto.drawImage = function(img, ...a){
      const r = oDI.apply(this, [img, ...a]);
      try {
        let dw, dh;
        if (a.length >= 8){ dw = a[6]; dh = a[7]; }
        else if (a.length >= 4){ dw = a[2]; dh = a[3]; }
        else return r;
        if (dw < 60 || dh < 60 || dw > 260 || dh > 260) return r;

        const nm = (img && (img.currentSrc || img.src) || '').split('/').pop().split('?')[0];
        if (!nm || !BOX_RE.test(nm)) return r;

        onBoxDraw(nm, performance.now());
      } catch(_){}
      return r;
    };

    const oF = proto.fill;
    proto.fill = function(...args){
      try {
        const t = this.getTransform();
        if (Math.hypot(t.a, t.b) > 0.3){
          onFillAngle(Math.atan2(t.b, t.a), performance.now());
        }
      } catch(_){}
      return oF.apply(this, args);
    };

    return true;
  }

  /* ---------- swipe ---------- */
  function performSwipe(dir, done){
    const c = cv(), w = win();
    if (!c || !w){ done(); return; }

    const dist = Math.min(c.width, c.height) * rnd(CFG.distMin, CFG.distMax);
    const rect = c.getBoundingClientRect();

    const cx = rect.left + rect.width/2  + rnd(-CFG.jitterPx, CFG.jitterPx);
    const cy = rect.top  + rect.height/2 + rnd(-CFG.jitterPx, CFG.jitterPx);

    let dx = 0, dy = 0;
    if (dir === 'up')    dy = -dist;
    if (dir === 'down')  dy =  dist;
    if (dir === 'left')  dx = -dist;
    if (dir === 'right') dx =  dist;

    const mx1 = cx + dx*0.35 + rnd(-2,2), my1 = cy + dy*0.35 + rnd(-2,2);
    const mx2 = cx + dx*0.75 + rnd(-2,2), my2 = cy + dy*0.75 + rnd(-2,2);
    const ex  = cx + dx + rnd(-3,3),      ey  = cy + dy + rnd(-3,3);

    const fire = (t, x, y) => {
      const o = {bubbles:true, cancelable:true, composed:true, clientX:x, clientY:y};
      try { c.dispatchEvent(new w.PointerEvent(t, {...o, pointerId:1, pointerType:'touch', isPrimary:true, button:0})); } catch(_){}
      try { c.dispatchEvent(new w.MouseEvent(t.replace('pointer','mouse'), {...o, button:0})); } catch(_){}
    };

    const g1 = rndi(CFG.evGapMin, CFG.evGapMax);
    const g2 = rndi(CFG.evGapMin, CFG.evGapMax);
    const g3 = rndi(CFG.evGapMin, CFG.evGapMax);

    fire('pointerdown', cx, cy);
    setTimeout(() => {
      fire('pointermove', mx1, my1);
      setTimeout(() => {
        fire('pointermove', mx2, my2);
        setTimeout(() => {
          fire('pointerup', ex, ey);
          setTimeout(done, CFG.postSwipeMs);
        }, g3);
      }, g2);
    }, g1);
  }

  /* ---------- driver ---------- */
  function trySwipe(){
    if (S.state !== 'ready') return;
    if (!S.activeBox)        return;
    if (S.activeBox._fired)  return;         // ONE-SHOT

    const box = S.activeBox;                  // ← LOCK reference
    const now = performance.now();

    if (now < box.readyAt) return;
    if (now - box.firstSeen < CFG.minFrameWaitMs) return;

    // STRICT angle freshness: must be captured AFTER this box appeared
    if (!S.lastAngle) return;
    if (S.lastAngle.t < box.firstSeen) return;

    // SNAPSHOT — lock everything now
    const snap = {
      name: box.name,
      trap: box.trap,
      firstSeen: box.firstSeen,
      age: now - box.firstSeen
    };

    const rawDir   = angleToDir(S.lastAngle.angle);
    const swipeDir = snap.trap ? opp(rawDir) : rawDir;

    // mark consumed BEFORE any async
    box._fired = true;
    S.state = 'swiping';
    S.count++;
    S.stats[swipeDir]++;

    if (S.log.length > 120) S.log.shift();
    S.log.push({ n:S.count, box:snap.name, trap:snap.trap, raw:rawDir, swipe:swipeDir, delay:snap.age });

    L(`→ #${S.count} ${swipeDir.toUpperCase()} ${snap.trap?'[TRAP]':'[ARROW]'} ${snap.name} raw=${rawDir} delay=${snap.age}ms`,
      snap.trap ? '#f59e0b' : '#22d3ee');

    performSwipe(swipeDir, () => {
      S.swipedName = snap.name;
      S.swipedAt   = performance.now();
      S.activeBox  = null;
      S.state      = 'idle';

      // Catch any box drawn during our swipe window
      const recentDraw = S.lastDrawnAt;
      const drawnName  = S.lastDrawnName;
      if (drawnName && (performance.now() - recentDraw) < 100){
        if (!(drawnName === snap.name && (performance.now() - S.swipedAt) < CFG.sameBoxCooldown)){
          buildActiveBox(drawnName, performance.now());
        }
      }
    });
  }

  function tick(){
    if (!S.running) return;
    trySwipe();
    requestAnimationFrame(tick);
  }

  /* ---------- bootstrap ---------- */
  if (!hook(win())){
    const mo = new MutationObserver(() => { if (hook(win())) mo.disconnect(); });
    mo.observe(document.body, {childList:true, subtree:true});
  }

  let tries = 0;
  const boot = setInterval(() => {
    const c = cv();
    if (c){
      clearInterval(boot);
      L(`✓ canvas ${c.width}x${c.height} — sequential v4 started (10–30ms, locked)`, '#22c55e');
      requestAnimationFrame(tick);
    } else if (++tries > 100){
      clearInterval(boot);
      L('canvas nahi mila — "Play" dabao', '#f59e0b');
    }
  }, 200);

  window.PLAY6 = {
    __live: true,
    stop(){ S.running = false; L('stopped. swipes='+S.count+' misses='+S.misses); console.table(S.stats); },
    stats(){ console.table(S.stats); console.table(S.log); },
    box(){ return S.activeBox; },
    angle(){ return S.lastAngle; },
    state(){ return S.state; },
    cfg(){ return {...CFG}; },
    setCfg(k,v){ if (k in CFG){ CFG[k]=v; L('cfg.'+k+' = '+v); } },
    reset(){
      S.state='idle'; S.activeBox=null; S.lastAngle=null;
      S.swipedName=null; S.swipedAt=0; S.count=0; S.misses=0;
      L('reset');
    }
  };

  L('PLAY6 v4 — strict sequential, 10–30ms, snapshot-locked', '#22c55e');
})();
