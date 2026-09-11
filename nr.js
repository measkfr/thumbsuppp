/* PLAY6 — Strict Game Rules v5 (Zero Error, Auto-Speed, Sequential) */
(function(){
  if(window.PLAY6 && window.PLAY6.__live){
    try{ PLAY6.stop(); }catch(_){}
  }
  
  const CFG = {
    baseReactionMin: 8,
    baseReactionMax: 20,
    evGapMin: 3,
    evGapMax: 7,
    postSwipeMs: 12,
    gapThresholdMs: 80,
    sameBoxCooldown: 200,
    minFrameWaitMs: 12,
    flickerWindowMs: 40,
    jitterPx: 4,
    distMin: 0.32,
    distMax: 0.42,
    // Auto-speed detection
    speedMultiplier: 1.0,
    lastBoxTime: 0,
    boxIntervals: [],
    avgInterval: 0
  };
  
  function rnd(a,b){ return a + Math.random()*(b-a); }
  function rndi(a,b){ return Math.floor(rnd(a,b+1)); }
  
  const S = {
    __live: true,
    running: true,
    state: 'idle',
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

  /* ========== GAME RULES ENGINE ========== */
  const BOX_RULES = {
    'thunder': { type: 'collect', points: 15, swipe: 'arrow' },
    'gully':   { type: 'collect', points: 50, swipe: 'arrow' },
    'firefox': { type: 'collect', points: 50, swipe: 'arrow' },
    'heart':   { type: 'life',    points: 0,  swipe: 'arrow' },
    'trap':    { type: 'avoid',   points: 0,  swipe: 'opposite' }
  };

  function getBoxType(name){
    const n = name.toLowerCase();
    if(n.includes('thunder')) return 'thunder';
    if(n.includes('gully'))   return 'gully';
    if(n.includes('firefox')) return 'firefox';
    if(n.includes('heart'))   return 'heart';
    if(n.includes('trap'))    return 'trap';
    return null;
  }

  function oppositeDir(d){
    return d==='up'?'down':d==='down'?'up':d==='left'?'right':'left';
  }

  function getCorrectSwipe(boxType, arrowDir){
    const rule = BOX_RULES[boxType];
    if(!rule) return arrowDir;
    return rule.swipe === 'opposite' ? oppositeDir(arrowDir) : arrowDir;
  }
  /* ======================================= */
  
  function angleToDir(a){
    const t = Math.PI*2;
    a = a - t*Math.floor((a+Math.PI)/t);
    const d = a*180/Math.PI;
    if(d>=-45 && d<45)   return 'right';
    if(d>=45  && d<135)  return 'down';
    if(d>=135 || d<-135) return 'left';
    return 'up';
  }

  const BOX_RE = /box-(thunder|gully|firefox|heart|trap)/i;

  /* ---------- AUTO SPEED DETECTION ---------- */
  function updateSpeed(now){
    if(CFG.lastBoxTime > 0){
      const interval = now - CFG.lastBoxTime;
      CFG.boxIntervals.push(interval);
      if(CFG.boxIntervals.length > 20) CFG.boxIntervals.shift();
      
      const sum = CFG.boxIntervals.reduce((a,b)=>a+b, 0);
      CFG.avgInterval = sum / CFG.boxIntervals.length;
      
      // Calculate speed multiplier based on average interval
      // Slower intervals = lower multiplier, faster = higher
      const refInterval = 500; // reference: boxes every 500ms = normal speed
      CFG.speedMultiplier = Math.max(0.3, Math.min(3.0, refInterval / (CFG.avgInterval || refInterval)));
    }
    CFG.lastBoxTime = now;
  }

  function getAdaptiveReaction(){
    // Adjust reaction time based on game speed
    const base = rnd(CFG.baseReactionMin, CFG.baseReactionMax);
    return Math.max(3, base / CFG.speedMultiplier);
  }
  /* ------------------------------------------ */

  /* ---------- box build ---------- */
  function buildActiveBox(nm, now){
    const reaction = getAdaptiveReaction();
    S.activeBox = {
      name: nm,
      firstSeen: now,
      lastSeen: now,
      readyAt: now + reaction,
      trap: /trap/i.test(nm),
      boxType: getBoxType(nm),
      _fired: false
    };
    S.state = 'ready';
    L(`◆ box ${nm} [${S.activeBox.boxType}] ${S.activeBox.trap?'[TRAP]':'[ARROW]'} reaction=${Math.round(reaction)}ms speed=${CFG.speedMultiplier.toFixed(2)}`, '#a78bfa');
  }

  function onBoxDraw(nm, now){
    // Track speed for auto-adjustment
    updateSpeed(now);
    
    const prevName = S.lastDrawnName;
    const prevAt   = S.lastDrawnAt;
    S.lastDrawnName = nm;
    S.lastDrawnAt   = now;

    if (S.state === 'swiping') return;

    if (S.state === 'ready' && S.activeBox && S.activeBox.name === nm){
      S.activeBox.lastSeen = now;
      return;
    }

    if (S.swipedName === nm && (now - S.swipedAt) < CFG.sameBoxCooldown){
      return;
    }

    let isNew = false;
    if (prevName === null)                         isNew = true;
    else if (prevName !== nm)                      isNew = true;
    else if ((now - prevAt) > CFG.gapThresholdMs)  isNew = true;
    if (!isNew) return;

    if (S.state === 'ready' && S.activeBox && S.activeBox.name !== nm){
      const age = now - S.activeBox.firstSeen;
      const fired = S.activeBox._fired;

      if (age < CFG.flickerWindowMs && !fired){
        S.activeBox.name = nm;
        S.activeBox.trap = /trap/i.test(nm);
        S.activeBox.boxType = getBoxType(nm);
        S.activeBox.lastSeen = now;
        return;
      }

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

  /* ---------- driver (SEQUENTIAL ONE-BY-ONE) ---------- */
  function trySwipe(){
    if (S.state !== 'ready') return;
    if (!S.activeBox)        return;
    if (S.activeBox._fired)  return;

    const box = S.activeBox;
    const now = performance.now();

    if (now < box.readyAt) return;
    if (now - box.firstSeen < CFG.minFrameWaitMs) return;

    if (!S.lastAngle) return;
    if (S.lastAngle.t < box.firstSeen) return;

    const snap = {
      name: box.name,
      trap: box.trap,
      boxType: box.boxType,
      firstSeen: box.firstSeen,
      age: now - box.firstSeen
    };

    const rawDir   = angleToDir(S.lastAngle.angle);
    // Apply GAME RULES: get correct swipe direction based on box type
    const swipeDir = getCorrectSwipe(snap.boxType, rawDir);

    // Mark consumed BEFORE any async - ensures ONE BY ONE processing
    box._fired = true;
    S.state = 'swiping';
    S.count++;
    S.stats[swipeDir]++;

    if (S.log.length > 120) S.log.shift();
    S.log.push({ n:S.count, box:snap.name, type:snap.boxType, trap:snap.trap, raw:rawDir, swipe:swipeDir, delay:snap.age });

    L(`→ #${S.count} ${swipeDir.toUpperCase()} [${snap.boxType}] ${snap.trap?'[TRAP INVERTED]':'[ARROW]'} raw=${rawDir} delay=${snap.age.toFixed(1)}ms`,
      snap.trap ? '#f59e0b' : '#22d3ee');

    performSwipe(swipeDir, () => {
      S.swipedName = snap.name;
      S.swipedAt   = performance.now();
      S.activeBox  = null;
      S.state      = 'idle';

      // Check for next box waiting - process ONE BY ONE
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
      L(`✓ canvas ${c.width}x${c.height} — Game Rules v5 started (auto-speed, sequential)`, '#22c55e');
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

  L('PLAY6 v5 — Game Rules Engine, Auto-Speed, Zero Error', '#22c55e');
})();
