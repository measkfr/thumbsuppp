/* PLAY7 — Human-like Noob Mode (appears slow/random but pro inside) */
(function(){
  if(window.PLAY7 && window.PLAY7.__live){
    try{ PLAY7.stop(); }catch(_){}
  }
  // purane versions bhi band karo
  try{ window.PLAY6 && PLAY6.stop && PLAY6.stop(); }catch(_){}
  try{ window.PLAY5 && PLAY5.stop && PLAY5.stop(); }catch(_){}
  try{ window.PLAY4 && PLAY4.stop && PLAY4.stop(); }catch(_){}

  const CFG = {
    // Reaction time: appear slow like a noob (200ms to 800ms average)
    reactionMin: 150,
    reactionMax: 600,

    // Add extra randomness to reaction
    reactionJitter: 300,

    jitterPx: 8,
    distMin: 0.32,
    distMax: 0.52,

    evGapMin: 8,
    evGapMax: 18,

    sameBoxCooldown: 500,
    inactivityResetMs: 600,

    // NEW: Random progress threshold (30% to 95% of screen)
    swipeProgressMin: 0.30,
    swipeProgressMax: 0.95,

    // NEW: Chance to skip a box (appear human, miss sometimes)
    skipChance: 0.15,  // 15% chance to skip non-trap boxes

    // NEW: Variable speed modes
    speedModes: ['slow', 'medium', 'fast', 'veryfast'],
    currentSpeed: 'medium',
    speedChangeChance: 0.3,  // 30% chance to change speed after each swipe

    // Speed profiles (reaction time ranges)
    speedProfiles: {
      slow: { min: 400, max: 900 },
      medium: { min: 200, max: 500 },
      fast: { min: 100, max: 300 },
      veryfast: { min: 50, max: 150 }
    }
  };

  const rnd=(a,b)=>a+Math.random()*(b-a);
  const rndi=(a,b)=>Math.floor(rnd(a,b+1));

  const S = {
    __live:true, box:null, swiped:false, count:0,
    stats:{up:0,down:0,left:0,right:0}, log:[],
    lastAngle:null, swipeAt:0, lastBoxName:null, busyUntil:0
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

  const BOX_RE = /box-(thunder|gully|firefox|heart|trap)/i;

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

        // Same sprite + recently swiped → sirf timer refresh, kuch nahi
        if(S.lastBoxName === nm && (now - S.swipeAt) < CFG.sameBoxCooldown){
          if(S.box) S.box.t = now;
          return r;
        }

        const inactive = S.box && (now - S.box.t) > CFG.inactivityResetMs;
        const isNew = !S.box || S.box.name !== nm || inactive;

        if(isNew){
          S.box = {
            name: nm,
            t: now,
            first: now,
            trap: /trap/i.test(nm),
            readyAt: now + rnd(CFG.reactionMin, CFG.reactionMax)
          };
          S.swiped = false;
          S.lastAngle = null;
        } else {
          S.box.t = now;
        }
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

    S.busyUntil = performance.now() + g1+g2+g3 + 10;
    return true;
  }

  const opp=d=>d==='up'?'down':d==='down'?'up':d==='left'?'right':'left';

  // Helper: Change speed mode randomly
  function changeSpeedMode(){
    if(Math.random() < CFG.speedChangeChance){
      const modes = CFG.speedModes.filter(m => m !== CFG.currentSpeed);
      CFG.currentSpeed = modes[rndi(0, modes.length - 1)];
      const profile = CFG.speedProfiles[CFG.currentSpeed];
      CFG.reactionMin = profile.min;
      CFG.reactionMax = profile.max;
      L(`Speed changed to: ${CFG.currentSpeed} (${CFG.reactionMin}-${CFG.reactionMax}ms)`, '#a855f7');
    }
  }

  // Helper: Check if box has reached swipe threshold (30%-95% of screen)
  function shouldSwipeNow(box, lastAngle, canvasHeight){
    if(!box || !lastAngle) return false;
    
    // For trap boxes, always swipe correctly (pro inside)
    if(box.trap) return true;
    
    // Random progress threshold: swipe when box is between 30%-95% across screen
    const timeAlive = performance.now() - box.first;
    const maxTime = 1200; // box travels for ~1200ms typically
    
    // Calculate approximate progress (0 to 1)
    const progress = Math.min(1, timeAlive / maxTime);
    
    // Get random threshold for this box
    const threshold = rnd(CFG.swipeProgressMin, CFG.swipeProgressMax);
    
    // Swipe if we've passed the threshold
    return progress >= threshold;
  }

  let running = true;
  function tick(){
    if(!running) return;
    const now = performance.now();
    if(now < S.busyUntil){ requestAnimationFrame(tick); return; }

    if(!S.swiped && S.box && S.lastAngle){
      if(now < S.box.readyAt){ requestAnimationFrame(tick); return; }
      if(S.lastAngle.t >= S.box.first && (now - S.box.first) < 1500){
        
        // Check if we should skip this box (appear human, sometimes miss)
        if(!S.box.trap && Math.random() < CFG.skipChance){
          L(`⊘ Skipping #${S.count+1} [APPEAR HUMAN] ${S.box.name}`, '#94a3b8');
          S.swiped = true;  // Mark as processed but don't swipe
          S.box = null;
          S.lastAngle = null;
          changeSpeedMode();
          requestAnimationFrame(tick);
          return;
        }
        
        // Check if box has reached random progress threshold
        const c = cv();
        if(c && !shouldSwipeNow(S.box, S.lastAngle, c.height)){
          requestAnimationFrame(tick);
          return;
        }
        
        const rawDir   = angleToDir(S.lastAngle.angle);
        const swipeDir = S.box.trap ? opp(rawDir) : rawDir;

        S.swiped = true;
        S.count++;
        S.stats[swipeDir]++;

        if(S.log.length>80) S.log.shift();
        S.log.push({
          name:S.box.name,
          angle:(S.lastAngle.angle*180/Math.PI).toFixed(0),
          raw:rawDir, swipe:swipeDir, trap:S.box.trap,
          delay:Math.round(now-S.box.first),
          speedMode: CFG.currentSpeed
        });

        L(`→ ${swipeDir.toUpperCase()} #${S.count} ${S.box.trap?'[TRAP]':'[ARROW]'} ${S.box.name} raw=${rawDir} delay=${Math.round(now-S.box.first)}ms [${CFG.currentSpeed}]`,
          S.box.trap?'#f59e0b':'#22d3ee');

        swipe(swipeDir);
        S.swipeAt = performance.now();
        S.lastBoxName = S.box.name;
        
        // Change speed mode after each swipe
        changeSpeedMode();
      }
    }
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
      L(`✓ canvas ${c.width}x${c.height} — fast loop started`,'#22c55e');
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
    
    // Speed modes for appearing human
    fast(){ CFG.reactionMin=0; CFG.reactionMax=10; CFG.evGapMin=3; CFG.evGapMax=7; L('FAST mode'); },
    safe(){ CFG.reactionMin=20; CFG.reactionMax=50; CFG.evGapMin=5; CFG.evGapMax=12; L('SAFE mode'); },
    
    // NEW: Human-like noob mode (default)
    noob(){ 
      CFG.reactionMin=150; CFG.reactionMax=600; CFG.reactionJitter=300;
      CFG.swipeProgressMin=0.30; CFG.swipeProgressMax=0.95;
      CFG.skipChance=0.15; CFG.speedChangeChance=0.3;
      CFG.currentSpeed='medium';
      L('NOOB MODE: Appears slow & random but pro inside! 💛', '#fbbf24');
    },
    
    // Set specific skip chance
    setSkipChance(v){ CFG.skipChance=v; L(`Skip chance: ${Math.round(v*100)}%`); },
    
    // Set progress range (when to swipe)
    setProgressRange(min,max){ CFG.swipeProgressMin=min; CFG.swipeProgressMax=max; L(`Progress range: ${min}-${max}`); },
    
    // Get current status
    status(){ 
      L(`Current speed: ${CFG.currentSpeed}, Skip chance: ${Math.round(CFG.skipChance*100)}%, Progress: ${CFG.swipeProgressMin}-${CFG.swipeProgressMax}`, '#22c55e');
      return {speed: CFG.currentSpeed, skipChance: CFG.skipChance, progress: [CFG.swipeProgressMin, CFG.swipeProgressMax]};
    }
  };
  L('PLAY7 ready - NOOB MODE active (appears slow but pro inside!) 💛','#22c55e');
})();
