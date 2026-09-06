function evaluateBotState(st,side){
  if(!st.jack)return -100000;
  const opp=opponent(side);
  const own=st.balls.filter(b=>b.kind===side);
  const enemies=st.balls.filter(b=>b.kind===opp);
  const od=own.map(b=>simDist(b,st.jack)).sort((a,b)=>a-b);
  const ed=enemies.map(b=>simDist(b,st.jack)).sort((a,b)=>a-b);
  const o0=od[0]??9999,e0=ed[0]??9999;

  let score=(e0-o0)*4.8;
  if(o0<e0){
    score+=od.filter(d=>d<e0).length*72;
    score+=Math.max(0,110-o0)*.45;
  }else{
    score-=ed.filter(d=>d<o0).length*78;
  }
  score+=Math.max(0,70-o0)*1.25;
  score-=enemies.filter(r=>simDist(r,st.jack)<ballR()*5.2).length*16;
  for(const b of own){
    const d=simDist(b,st.jack);
    if(d<ballR()*6&&b.y>st.jack.y)score+=15;
  }
  return score;
}
function botCandidateKey(cand){
  return `${cand.hardnessId}|${cand.intent||'normal'}|${cand.tx.toFixed(1)}|${cand.ty.toFixed(1)}|${cand.speed.toFixed(3)}`;
}
function pushBotCandidate(arr,seen,cand){
  const key=botCandidateKey(cand);
  if(seen.has(key))return;
  seen.add(key);
  arr.push(cand);
}
function botContext(side){
  const opp=opponent(side);
  const own=balls.filter(b=>b.kind===side);
  const enemies=balls.filter(b=>b.kind===opp);
  const ownD=own.length?Math.min(...own.map(b=>dist(b,jack))):Infinity;
  const enemyD=enemies.length?Math.min(...enemies.map(b=>dist(b,jack))):Infinity;
  return{opp,own,enemies,ownD,enemyD,losing:ownD>=enemyD};
}
function botTargetRepeatPenalty(side,cand){
  const history=botTargetHistory[side]||[];
  if(!history.length)return 0;
  const r=ballR();
  let penalty=0;
  history.slice(-4).forEach((p,idx)=>{
    const d=Math.hypot(cand.tx-p.x,cand.ty-p.y);
    const recentWeight=(idx===history.slice(-4).length-1)?1:.72;
    if(d<r*.9)penalty+=95*recentWeight;
    else if(d<r*1.8)penalty+=48*recentWeight;
    else if(d<r*3.0)penalty+=18*recentWeight;
  });
  return penalty;
}
function rememberBotTarget(side,shot){
  if(!shot)return;
  const h=botTargetHistory[side]||(botTargetHistory[side]=[]);
  h.push({x:shot.tx,y:shot.ty});
  while(h.length>5)h.shift();
}

function botJackLogicalMetres(){
  if(!jack)return{x:3,y:5};
  const c=court();
  return{
    x:((jack.x-c.x)/Math.max(1,c.w))*6,
    y:((jack.y-c.y)/Math.max(1,c.h))*12.5
  };
}
function botIsBirdJack(){
  if(!jack)return false;
  const p=botJackLogicalMetres();
  const birdY=botBirdYMetres(p.x);
  // Bird means "just beyond the V" at the Jack's actual lateral position.
  return Math.abs(p.y-birdY)<=.82;
}
function botBirdThreats(side){
  if(!botIsBirdJack()||!jack)return[];
  const r=ballR(),opp=opponent(side);
  return balls
    .filter(b=>b.kind===opp&&dist(b,jack)<r*6.2)
    .sort((a,b)=>dist(a,jack)-dist(b,jack))
    .slice(0,5);
}
function botBirdTakeoutValue(st,side,cand,ctx){
  if(cand.intent!=='birdTakeout'||!botIsBirdJack())return 0;

  const opp=ctx.opp,r=ballR();
  const afterEnemies=st.balls.filter(b=>b.kind===opp);
  const afterOwn=st.balls.filter(b=>b.kind===side);

  const beforeEnemyD=ctx.enemyD;
  const afterEnemyD=afterEnemies.length
    ?Math.min(...afterEnemies.map(b=>simDist(b,st.jack)))
    :9999;
  const afterOwnD=afterOwn.length
    ?Math.min(...afterOwn.map(b=>simDist(b,st.jack)))
    :9999;

  const removed=Math.max(0,ctx.enemies.length-afterEnemies.length);
  const pushedAway=Math.max(0,Math.min(r*8,afterEnemyD-beforeEnemyD));
  const pts=simulatedScoreCurrentEnd(st);

  let value=0;
  value+=removed*260;
  value+=pushedAway*8.5;

  // On the bird, taking the scoring ball away is more important than
  // adding another passive ball in front of it.
  if(ctx.losing&&afterOwnD<afterEnemyD)value+=620;
  if(pts[side]>pts[opp])value+=380;
  if(pts[opp]===0)value+=180;

  // Do not reward a "hit" that leaves the danger essentially unchanged.
  if(removed===0&&afterEnemyD<beforeEnemyD+r*.55)value-=240;
  return value;
}
function botBirdTakeoutSucceeded(st,side,ctx){
  const opp=ctx.opp,r=ballR();
  const afterEnemies=st.balls.filter(b=>b.kind===opp);
  const afterOwn=st.balls.filter(b=>b.kind===side);
  const afterEnemyD=afterEnemies.length
    ?Math.min(...afterEnemies.map(b=>simDist(b,st.jack)))
    :9999;
  const afterOwnD=afterOwn.length
    ?Math.min(...afterOwn.map(b=>simDist(b,st.jack)))
    :9999;
  const removed=afterEnemies.length<ctx.enemies.length;
  const displaced=afterEnemyD>ctx.enemyD+r*.70;
  const wonPosition=afterOwnD<afterEnemyD;
  return removed||displaced||wonPosition;
}

function botBirdContactPoint(side,target,lateral=0){
  const pos=launcherFor(side),r=ballR();
  let dx=target.x-pos.x,dy=target.y-pos.y;
  const len=Math.max(1,Math.hypot(dx,dy));
  dx/=len;dy/=len;

  // Perpendicular to the actual throw line — unlike a raw X offset,
  // this hits the left/right face correctly even on a diagonal bird.
  const px=-dy,py=dx;
  return{
    x:target.x+px*r*lateral,
    y:target.y+py*r*lateral
  };
}
function botBirdTargetMoved(st,target){
  const r=ballR();
  const idx=balls.indexOf(target);
  if(idx<0)return false;

  const sim=st.balls.find(b=>b._simId===`b${idx}`);
  if(!sim)return true; // target was knocked out

  return Math.hypot(sim.x-target.x,sim.y-target.y)>r*.72;
}
function botBirdBreakOutcomeScore(st,side,target,ctx,cand){
  const opp=ctx.opp,r=ballR();
  const afterEnemies=st.balls.filter(b=>b.kind===opp);
  const afterOwn=st.balls.filter(b=>b.kind===side);

  const beforeNear=ctx.enemies.filter(b=>dist(b,jack)<r*6.2).length;
  const afterNear=afterEnemies.filter(b=>simDist(b,st.jack)<r*6.2).length;
  const removed=Math.max(0,ctx.enemies.length-afterEnemies.length);

  const afterEnemyD=afterEnemies.length
    ?Math.min(...afterEnemies.map(b=>simDist(b,st.jack)))
    :9999;
  const afterOwnD=afterOwn.length
    ?Math.min(...afterOwn.map(b=>simDist(b,st.jack)))
    :9999;

  const pts=simulatedScoreCurrentEnd(st);
  const targetMoved=botBirdTargetMoved(st,target);

  let score=scoreBotCandidate(st,side,cand,ctx,botProfile());
  if(targetMoved)score+=900;
  score+=(beforeNear-afterNear)*420;
  score+=removed*520;
  score+=Math.max(0,Math.min(r*8,afterEnemyD-ctx.enemyD))*12;
  if(afterOwnD<afterEnemyD)score+=520;
  if(pts[side]>pts[opp])score+=420;

  // A "break" that leaves the chosen threat untouched is not a break.
  if(!targetMoved)score-=3000;
  return score;
}
function chooseExpertBirdBreakShot(side,ctx,available){
  if(!botIsBirdJack())return null;

  const threats=botBirdThreats(side);
  if(!threats.length)return null;

  const hardnessOrder=['superHard','hard','medium','mediumSoft','soft','superSoft'];
  let types=hardnessOrder.filter(id=>available.includes(id)).slice(0,3);
  if(!types.length)return null;

  const scales=[1.26,1.38,1.50,1.64,1.80,1.98];
  const laterals=[-.55,-.36,-.18,0,.18,.36,.55];
  const tested=[];

  // Hard rule for Expert on the bird:
  // first search explicitly for a throw that really moves/removes an enemy ball.
  for(const hard of types){
    for(const target of threats.slice(0,4)){
      for(const scale of scales){
        for(const lateral of laterals){
          const p=botBirdContactPoint(side,target,lateral);
          const cand=makeCandidateTo(p.x,p.y,scale,side,hard,'birdTakeout');
          const st=simulateBotCandidate(cand,side,420);

          if(!botBirdTargetMoved(st,target))continue;

          tested.push({
            cand,
            target,
            score:botBirdBreakOutcomeScore(st,side,target,ctx,cand)
          });
        }
      }
    }
  }

  if(!tested.length)return null;
  tested.sort((a,b)=>b.score-a.score);

  // Fine second pass around the best successful contacts.
  let best=tested[0];
  const r=ballR();
  const refineLaterals=[-.10,-.05,0,.05,.10];
  const refineScales=[.985,1,1.015];

  for(const base of tested.slice(0,8)){
    const pos=launcherFor(side);
    let dx=base.target.x-pos.x,dy=base.target.y-pos.y;
    const len=Math.max(1,Math.hypot(dx,dy));
    dx/=len;dy/=len;
    const px=-dy,py=dx;

    for(const dl of refineLaterals){
      for(const ss of refineScales){
        const p={
          x:base.cand.tx+px*r*dl,
          y:base.cand.ty+py*r*dl
        };
        const cand=makeCandidateTo(
          p.x,p.y,
          (base.cand.speedScale??1)*ss,
          side,
          base.cand.hardnessId,
          'birdTakeout'
        );
        const st=simulateBotCandidate(cand,side,460);
        if(!botBirdTargetMoved(st,base.target))continue;

        const score=botBirdBreakOutcomeScore(st,side,base.target,ctx,cand);
        if(score>best.score)best={cand,target:base.target,score};
      }
    }
  }

  return best.cand;
}

function botClusterTargets(side){
  const r=ballR(),objects=balls.filter(b=>dist(b,jack)<r*8.5);
  const targets=[],used=new Set();

  for(let i=0;i<objects.length;i++){
    const seed=objects[i];
    const members=objects.filter(o=>Math.hypot(o.x-seed.x,o.y-seed.y)<r*2.65);
    if(members.length<2)continue;

    const enemyCount=members.filter(o=>o.kind===opponent(side)).length;
    const ownCount=members.filter(o=>o.kind===side).length;
    if(enemyCount===0)continue;

    const x=members.reduce((s,o)=>s+o.x,0)/members.length;
    const y=members.reduce((s,o)=>s+o.y,0)/members.length;
    const key=`${Math.round(x/r)}|${Math.round(y/r)}`;
    if(used.has(key))continue;
    used.add(key);

    targets.push({x,y,enemyCount,ownCount,size:members.length});
  }

  return targets
    .sort((a,b)=>(b.enemyCount*3-b.ownCount)-(a.enemyCount*3-a.ownCount))
    .slice(0,5);
}
function botSmashValue(st,side,cand,ctx){
  if(cand.intent!=='smash')return 0;
  const opp=ctx.opp,r=ballR();

  const beforeNear=ctx.enemies.filter(b=>dist(b,jack)<r*5.4).length;
  const afterEnemies=st.balls.filter(b=>b.kind===opp);
  const afterNear=afterEnemies.filter(b=>simDist(b,st.jack)<r*5.4).length;
  const removed=Math.max(0,ctx.enemies.length-afterEnemies.length);

  const beforeOwnNear=ctx.own.filter(b=>dist(b,jack)<r*5.4).length;
  const afterOwnNear=st.balls.filter(b=>b.kind===side&&simDist(b,st.jack)<r*5.4).length;

  let value=(beforeNear-afterNear)*78 + removed*115;
  value-=Math.max(0,beforeOwnNear-afterOwnNear)*58;

  const pts=simulatedScoreCurrentEnd(st);
  if(pts[side]>pts[opp])value+=70;
  else if(pts[opp]>pts[side])value-=45;

  // A smash is worth using only when it materially changes the position.
  if(beforeNear===afterNear&&removed===0)value-=55;
  return value;
}

function scoreBotCandidate(st,side,cand,ctx,profile){
  const opp=ctx.opp;

  if(tieBreak){
    const ownAfter=st.balls.filter(b=>b.kind===side);
    const enemyAfter=st.balls.filter(b=>b.kind===opp);
    const survived=ownAfter.length>=ctx.own.length+1;
    if(!survived)return -10000;

    const pts=simulatedScoreCurrentEnd(st);
    const nOwn=ownAfter.length?Math.min(...ownAfter.map(b=>simDist(b,st.jack))):9999;
    const nEnemy=enemyAfter.length?Math.min(...enemyAfter.map(b=>simDist(b,st.jack))):9999;
    const margin=Math.max(-220,Math.min(220,(nEnemy-nOwn)*3.2));

    // Tie-break is binary: winning by one point is just as valuable as
    // winning by several. Only positional safety/margin breaks ties.
    let score=0;
    if(pts[side]>pts[opp])score=5000+margin;
    else if(pts[side]<pts[opp])score=-5000+margin;
    else score=margin;

    // If already ahead, prefer a safe controlled result rather than
    // unnecessary high-energy attempts to manufacture more scoring balls.
    if(pts[side]>pts[opp]&&cand.intent==='smash')score-=55;
    score-=botTargetRepeatPenalty(side,cand)*(profile.id==='expert'?.20:.55);
    return score;
  }
  const ownAfter=st.balls.filter(b=>b.kind===side);
  const enemyAfter=st.balls.filter(b=>b.kind===opp);
  const survived=ownAfter.length>=ctx.own.length+1;
  let score=evaluateBotState(st,side);
  const pts=simulatedScoreCurrentEnd(st);

  score+=(pts[side]-pts[opp])*126;
  if(pts[side]>0&&pts[opp]===0)score+=pts[side]*48;
  if(!survived)score-=10000;

  const nOwn=ownAfter.length?Math.min(...ownAfter.map(b=>simDist(b,st.jack))):9999;
  const nEnemy=enemyAfter.length?Math.min(...enemyAfter.map(b=>simDist(b,st.jack))):9999;

  if(ctx.losing){
    score+=(ctx.enemyD-nEnemy)*1.5;
    score+=(ctx.ownD-nOwn)*5.1;
    if(nOwn<nEnemy)score+=240;
    if(pts[side]>pts[opp])score+=170;
  }else{
    if(pts[opp]===0)score+=25;
    if(simDist(st.jack,jack)>ballR()*2.2)score-=24;
  }

  if(['soft','superSoft','mediumSoft'].includes(cand.hardnessId) && pts[side]>0)score+=10;
  if(['superHard','hard'].includes(cand.hardnessId) && ctx.losing)score+=12;

  if(profile.id==='expert'){
    score+=botSmashValue(st,side,cand,ctx);
    score+=botBirdTakeoutValue(st,side,cand,ctx);
  }

  // Expert prioritizes the strongest move first; variety matters only when
  // alternatives are genuinely comparable.
  const repeatFactor=profile.id==='expert'?.34:1;
  score-=botTargetRepeatPenalty(side,cand)*repeatFactor;

  score+=(Math.random()-.5)*profile.evalNoise;
  return score;
}
function refineBotCandidates(ranked,side,profile,passIndex=0){
  const refined=[],seen=new Set(),r=ballR();

  const normalDeltaSets=[
    [[0,0],[-.28,0],[.28,0],[0,-.24],[0,.24]],
    [[0,0],[-.40,0],[.40,0],[0,-.35],[0,.35],[-.45,.25],[.45,.25]],
    [[0,0],[-.55,0],[.55,0],[0,-.45],[0,.45],[-.55,.30],[.55,.30],[-.28,-.28],[.28,-.28]]
  ];
  const normalScaleSets=[
    [.985,1,1.015],
    [.97,.99,1,1.02,1.04],
    [.955,.98,1,1.02,1.045]
  ];

  // Expert refinement becomes progressively finer instead of bouncing
  // around the target. The last pass adjusts by only a few hundredths
  // of one ball radius and tenths of one percent in speed.
  const expertDeltaSets=[
    [[0,0],[-.32,0],[.32,0],[0,-.28],[0,.28],[-.24,-.20],[.24,-.20]],
    [[0,0],[-.16,0],[.16,0],[0,-.14],[0,.14],[-.12,-.10],[.12,-.10]],
    [[0,0],[-.070,0],[.070,0],[0,-.060],[0,.060]],
    [[0,0],[-.025,0],[.025,0],[0,-.022],[0,.022]]
  ];
  const expertScaleSets=[
    [.975,.988,1,1.012,1.025],
    [.990,.995,1,1.005,1.010],
    [.996,.998,1,1.002,1.004],
    [.999,1,1.001]
  ];

  const deltaSets=profile.id==='expert'?expertDeltaSets:normalDeltaSets;
  const scaleSets=profile.id==='expert'?expertScaleSets:normalScaleSets;
  const deltas=deltaSets[Math.min(passIndex,deltaSets.length-1)];
  const scales=scaleSets[Math.min(passIndex,scaleSets.length-1)];

  for(const item of ranked.slice(0,profile.topRefine)){
    const base=item.cand;
    for(const [dx,dy] of deltas){
      for(const sc of scales){
        pushBotCandidate(
          refined,seen,
          makeCandidateTo(
            base.tx+dx*r,
            base.ty+dy*r,
            (base.speedScale??1)*sc,
            side,
            base.hardnessId,
            base.intent||'normal'
          )
        );
      }
    }
  }
  return refined;
}

function makeCandidateTo(tx,ty,speedScale,side,hardnessId='medium',intent='normal'){
  const pos=launcherFor(side);
  let dx=tx-pos.x,dy=ty-pos.y,d=Math.max(1,Math.hypot(dx,dy));
  dx/=d;dy/=d;
  const actualScale=speedScale??1;
  const speed=botSpeedForDistance(d,hardnessId)*actualScale;
  return{vx:dx*speed,vy:dy*speed,tx,ty,speed,hardnessId,speedScale:actualScale,intent};
}
function chooseBestBotShot(side){
  const c=court(),pos=launcherFor(side),profile=botProfile();
  const ctx=botContext(side),opp=ctx.opp,candidates=[],seen=new Set();
  const own=ctx.own,enemies=ctx.enemies,available=availableBallIds(side);
  const has=id=>available.includes(id);
  const pick=ids=>ids.filter(has);

  if(profile.id==='expert'&&botIsBirdJack()&&botBirdThreats(side).length){
    const forcedBreak=chooseExpertBirdBreakShot(side,ctx,available);
    if(forcedBreak)return forcedBreak;
  }

  const drawTypes=pick(['superSoft','soft','mediumSoft','medium']).slice(0,profile.drawTake);
  const drawOffsets=[
    [0,0],[-.42,0],[.42,0],[0,.52],[0,.95],
    [-.75,.42],[.75,.42],[-1.05,.72],[1.05,.72]
  ];
  for(const hard of drawTypes){
    for(const [ox,oy] of drawOffsets){
      for(const scale of [.96,1.00,1.04]){
        pushBotCandidate(candidates,seen,makeCandidateTo(jack.x+ox*ballR(),jack.y+oy*ballR(),scale,side,hard));
      }
    }
  }

  const danger=enemies.slice().sort((a,b)=>dist(a,jack)-dist(b,jack)).slice(0,4);
  const hitTypes=pick(['superHard','hard','medium']).slice(0,profile.hitTake);
  if(ctx.losing||danger.length){
    for(const hard of hitTypes){
      for(const r of danger){
        for(const scale of [1.00,1.06,1.12]){
          pushBotCandidate(candidates,seen,makeCandidateTo(r.x,r.y,scale,side,hard));
          pushBotCandidate(candidates,seen,makeCandidateTo(r.x-ballR()*.42,r.y,scale,side,hard));
          pushBotCandidate(candidates,seen,makeCandidateTo(r.x+ballR()*.42,r.y,scale,side,hard));
          pushBotCandidate(candidates,seen,makeCandidateTo(r.x,r.y-ballR()*.28,scale,side,hard));
        }
      }
    }
  }

  if(profile.id==='expert'){
    const smashTypes=pick(['superHard','hard','medium']).slice(0,3);
    const smashTargets=[
      ...danger.slice(0,4).map(b=>({x:b.x,y:b.y,enemyCount:1,ownCount:0,size:1})),
      ...botClusterTargets(side)
    ];

    for(const hard of smashTypes){
      for(const target of smashTargets){
        // Direct centre hit plus two small face offsets. Higher speed gives
        // enough remaining energy to split a packed group instead of merely
        // stopping against its front ball.
        for(const scale of [1.16,1.26,1.38,1.50]){
          pushBotCandidate(candidates,seen,makeCandidateTo(target.x,target.y,scale,side,hard,'smash'));
          pushBotCandidate(candidates,seen,makeCandidateTo(target.x-ballR()*.22,target.y,scale,side,hard,'smash'));
          pushBotCandidate(candidates,seen,makeCandidateTo(target.x+ballR()*.22,target.y,scale,side,hard,'smash'));
        }
      }
    }
  }

  if(profile.id==='expert'&&botIsBirdJack()){
    const birdThreats=botBirdThreats(side);
    const birdHitTypes=pick(['superHard','hard','medium']).slice(0,3);

    for(const hard of birdHitTypes){
      for(const target of birdThreats){
        // Dedicated drive/take-out set for the bird. The stronger variants
        // are intentional: the ball should pass energy through the front
        // opponent ball instead of merely joining the cluster.
        for(const scale of [1.28,1.40,1.54,1.70,1.86]){
          for(const lateral of [0,-.15,.15,-.30,.30]){
            const p=botBirdContactPoint(side,target,lateral);
            pushBotCandidate(
              candidates,seen,
              makeCandidateTo(
                p.x,
                p.y,
                scale,
                side,
                hard,
                'birdTakeout'
              )
            );
          }
        }
      }
    }
  }

  if(ctx.losing){
    for(const hard of hitTypes.slice(0,Math.max(1,profile.hitTake-1))){
      for(const lateral of [-1.15,-.65,.65,1.15]){
        pushBotCandidate(candidates,seen,makeCandidateTo(
          jack.x+lateral*ballR(),
          jack.y+ballR()*.15,
          1.08,
          side,
          hard
        ));
      }
    }
  }

  if(!ctx.losing){
    const blockTypes=pick(['mediumSoft','soft','medium']).slice(0,profile.blockTake);
    const vx=jack.x-pos.x,vy=jack.y-pos.y,len=Math.max(1,Math.hypot(vx,vy));
    const ux=vx/len,uy=vy/len;
    for(const hard of blockTypes){
      for(const ahead of [ballR()*3.0,ballR()*4.0,ballR()*5.0]){
        pushBotCandidate(candidates,seen,makeCandidateTo(jack.x-ux*ahead,jack.y-uy*ahead,.99,side,hard));
      }
    }
  }

  const recoveryTypes=pick(['medium','mediumSoft','soft']).slice(0,profile.recoveryTake);
  for(const hard of recoveryTypes){
    for(const yf of [.50,.58,.65]){
      for(const xf of [.34,.50,.66]){
        pushBotCandidate(candidates,seen,makeCandidateTo(c.x+c.w*xf,c.y+c.h*yf,.99,side,hard));
      }
    }

    // Named boccia reference zones: useful for guards, recovery balls and
    // changing the geometry of an end instead of stacking every shot on one line.
    for(const p of botBaseJackPlans(side)){
      pushBotCandidate(candidates,seen,makeCandidateTo(mx(p.mx),my(p.my),.99,side,hard));
    }
  }

  let ranked=candidates.map(cand=>{
    const st=simulateBotCandidate(cand,side);
    return{cand,score:scoreBotCandidate(st,side,cand,ctx,profile)};
  }).sort((a,b)=>b.score-a.score);

  for(let pass=0;pass<profile.refinePasses;pass++){
    const refined=refineBotCandidates(ranked,side,profile,pass);
    const rankedRefined=refined.map(cand=>{
      const st=simulateBotCandidate(cand,side);
      return{cand,score:scoreBotCandidate(st,side,cand,ctx,profile)};
    }).sort((a,b)=>b.score-a.score);

    ranked=[...ranked,...rankedRefined]
      .sort((a,b)=>b.score-a.score)
      .filter((item,idx,arr)=>arr.findIndex(x=>botCandidateKey(x.cand)===botCandidateKey(item.cand))===idx)
      .slice(0,Math.max(24,profile.topRefine*8));
  }

  const best=ranked[0];
  if(!best||best.score<-2500){
    const hard=pick(['superHard','hard','medium'])[0]||available[0]||'medium';
    const target=danger[0]||jack;
    return makeCandidateTo(target.x,target.y,1.04,side,hard);
  }

  if(profile.id==='expert'&&botIsBirdJack()&&ctx.losing&&botBirdThreats(side).length){
    // Spend extra simulation time here deliberately. On the bird, if a
    // dedicated take-out actually removes/displaces the scoring threat,
    // Expert prefers it instead of endlessly drawing another ball nearby.
    const takeouts=ranked.filter(x=>x.cand.intent==='birdTakeout').slice(0,18);
    let bestSuccessful=null;

    for(const item of takeouts){
      const st=simulateBotCandidate(item.cand,side,340);
      if(!botBirdTakeoutSucceeded(st,side,ctx))continue;
      if(!bestSuccessful||item.score>bestSuccessful.score){
        bestSuccessful=item;
      }
    }

    if(bestSuccessful)return bestSuccessful.cand;
  }

  return best.cand;
}
function botBellRandom(){
  return (Math.random()+Math.random()+Math.random()+Math.random()-2)/2;
}
function botExecutionResult(vx,vy,profile,options={}){
  if(profile.id==='expert'){
    const makesError=Math.random()<(profile.executionErrorChance??.04);

    // In 96% of throws Expert executes the simulated vector exactly.
    if(!makesError)return{vx,vy};

    // Remaining errors are small and bounded. On a Jack throw, execution
    // can drift slightly sideways or long, but never loses speed and
    // therefore never creates an artificial undershoot.
    const angle=(Math.random()-.5)*profile.grossAngleError;
    let speedFactor=1+(Math.random()-.5)*profile.grossSpeedError;
    if(options.jack)speedFactor=Math.max(1,speedFactor);

    const cos=Math.cos(angle),sin=Math.sin(angle);
    return{
      vx:(vx*cos-vy*sin)*speedFactor,
      vy:(vx*sin+vy*cos)*speedFactor
    };
  }

  let angle=botBellRandom()*profile.angleError;
  let speedFactor=(profile.speedBias||1)+botBellRandom()*profile.speedError;

  if(Math.random()<profile.grossMissChance){
    angle+=(Math.random()-.5)*profile.grossAngleError;
    const direction=Math.random()<.5?-1:1;
    const amount=(.45+Math.random()*.55)*profile.grossSpeedError;
    speedFactor*=1+direction*amount;
  }

  speedFactor=Math.max(.42,Math.min(1.60,speedFactor));

  const cos=Math.cos(angle),sin=Math.sin(angle);
  return{
    vx:(vx*cos-vy*sin)*speedFactor,
    vy:(vx*sin+vy*cos)*speedFactor
  };
}

function botOwnLaneSign(side){
  // Internal AI convention only:
  // red owns the left half, blue owns the right half.
  // Nothing about this split is drawn on the court.
  return side==='red'?-1:1;
}
function botHalfX(side,position){
  // position: 0 = outer edge of own half, 1 = close to centre line.
  const t=Math.max(0,Math.min(1,position));
  return side==='red'
    ? .55 + t*2.15
    : 5.45 - t*2.15;
}
function botVLineYMetres(xm){
  const x=Math.max(0,Math.min(6,xm));
  if(x<=3)return 7+(8.5-7)*(x/3);
  return 8.5+(7-8.5)*((x-3)/3);
}
function botBirdYMetres(xm){
  // The Jack must be completely beyond the V-line, not merely have its
  // centre beyond it. Convert the rendered ball radius back into court metres
  // and keep an extra safety margin.
  const c=court();
  const radiusM=(ballR()/Math.max(1,c.h))*12.5;
  return botVLineYMetres(xm)-radiusM-.12;
}
function botSafeJackTarget(tx,ty){
  const c=court(),r=ballR();
  const minX=c.x+r+2,maxX=c.x+c.w-r-2;
  const minY=c.y+r+2,maxY=throwingY()-r-2;

  let x=Math.max(minX,Math.min(maxX,tx));
  let y=Math.max(minY,Math.min(maxY,ty));

  // Official validity condition in this game: the whole Jack must be
  // beyond the V. If a planned point is too shallow at this lateral x,
  // move it only deeper, never sideways.
  const latestValidY=vYAtX(x)-r-2;
  if(y>latestValidY)y=latestValidY;

  return{x,y};
}
function botBaseJackPlans(side){
  // Multiple lateral points at every depth so the bot does not serve
  // down one repeated rail directly in front of itself.
  const birdOuter=botHalfX(side,.25);
  const birdMid=botHalfX(side,.55);
  const birdInner=botHalfX(side,.82);
  return[
    {name:'bird-outer',label:'Птичка',group:'defense',mx:birdOuter,my:botBirdYMetres(birdOuter),weight:.92},
    {name:'bird-mid',label:'Птичка',group:'defense',mx:birdMid,my:botBirdYMetres(birdMid),weight:1.08},
    {name:'bird-inner',label:'Птичка',group:'defense',mx:birdInner,my:botBirdYMetres(birdInner),weight:.96},

    {name:'2.5-outer',label:'2,5 м',group:'defense',mx:botHalfX(side,.18),my:7.50,weight:.92},
    {name:'2.5-mid',label:'2,5 м',group:'defense',mx:botHalfX(side,.52),my:7.50,weight:1.05},
    {name:'2.5-inner',label:'2,5 м',group:'defense',mx:botHalfX(side,.84),my:7.50,weight:.96},

    {name:'corner',label:'Угол',group:'defense',mx:botHalfX(side,.02),my:6.72,weight:.90},

    {name:'5m-outer',label:'5 м',group:'attack',mx:botHalfX(side,.18),my:5.00,weight:.90},
    {name:'5m-mid',label:'5 м',group:'attack',mx:botHalfX(side,.52),my:5.00,weight:1.06},
    {name:'5m-inner',label:'5 м',group:'attack',mx:botHalfX(side,.84),my:5.00,weight:.98},

    {name:'7m-outer',label:'7 м',group:'attack',mx:botHalfX(side,.16),my:3.00,weight:.92},
    {name:'7m-mid',label:'7 м',group:'attack',mx:botHalfX(side,.50),my:3.00,weight:1.04},
    {name:'7m-inner',label:'7 м',group:'attack',mx:botHalfX(side,.82),my:3.00,weight:.96},

    {name:'9m-outer',label:'9 м',group:'attack',mx:botHalfX(side,.22),my:1.00,weight:.82},
    {name:'9m-mid',label:'9 м',group:'attack',mx:botHalfX(side,.52),my:1.00,weight:.92},
    {name:'9m-inner',label:'9 м',group:'attack',mx:botHalfX(side,.80),my:1.00,weight:.84}
  ];
}
function botJackTacticalMode(side){
  const myScore=side==='red'?redScore:blueScore;
  const oppScore=side==='red'?blueScore:redScore;
  const diff=myScore-oppScore;

  if(diff>0)return 'defense';
  if(diff<0)return 'attack';

  // At an equal score alternate plans instead of repeating one family.
  const last=botJackHistory[botJackHistory.length-1];
  if(last?.group==='defense')return 'attack';
  if(last?.group==='attack')return 'defense';

  return Math.random()<.52?'defense':'attack';
}
function chooseBotJackPlan(side){
  const plans=botBaseJackPlans(side);
  const mode=botJackTacticalMode(side);

  let pool=plans.filter(p=>p.group===mode);
  const recentNames=botJackHistory.slice(-5).map(x=>x.name);

  // Prefer a different named point inside the same tactical family.
  const fresh=pool.filter(p=>!recentNames.includes(p.name));
  if(fresh.length)pool=fresh;

  const total=pool.reduce((s,p)=>s+(p.weight||1),0);
  let roll=Math.random()*total;
  for(const p of pool){
    roll-=p.weight||1;
    if(roll<=0)return p;
  }
  return pool[pool.length-1];
}

function chooseBotMatchJackHardness(side,profile){
  // One physical Jack per colour for the whole match.
  // The AI chooses it once before play and then keeps it for every end.
  //
  // For a whole-match Jack, versatility matters more than optimizing for
  // one particular serve: soft/medium-soft give control near the V,
  // medium remains useful for deeper attacking serves.
  const options=[
    {id:'soft',score:100},
    {id:'mediumSoft',score:106},
    {id:'medium',score:102},
    {id:'hard',score:88},
    {id:'superSoft',score:82},
    {id:'superHard',score:76}
  ];

  if(profile.id==='expert'){
    // World-class AI chooses the strongest all-round option deterministically.
    return options.slice().sort((a,b)=>b.score-a.score)[0].id;
  }

  // Other difficulties still make a sensible equipment decision, with
  // increasing variation as the difficulty drops.
  const pool=profile.id==='hard'
    ?options.filter(x=>x.score>=98)
    :profile.id==='medium'
      ?options.filter(x=>x.score>=88)
      :options;

  const total=pool.reduce((s,x)=>s+x.score,0);
  let roll=Math.random()*total;
  for(const x of pool){
    roll-=x.score;
    if(roll<=0)return x.id;
  }
  return pool[0].id;
}

function botThrowJack(side){
  if(phase!==sidePhase(side,'jack')||!isBotSide(side))return;
  const pos=launcherFor(side),profile=botProfile();

  const plan=chooseBotJackPlan(side);
  botJackHistory.push({name:plan.name,group:plan.group});
  while(botJackHistory.length>6)botJackHistory.shift();

  const targetX=mx(plan.mx);
  const targetY=my(plan.my);
  const c=court();

  // Expert aims at the exact strategic point. Other levels may have target
  // selection jitter, but the final point is still made legally valid.
  const jackJitterScale=profile.id==='expert'?0:1;
  const rawTx=targetX+(Math.random()-.5)*c.w*profile.jackJitterX*.45*jackJitterScale;
  const rawTy=targetY+(Math.random()-.5)*c.h*profile.jackJitterY*.35*jackJitterScale;
  const safeTarget=botSafeJackTarget(rawTx,rawTy);
  const tx=safeTarget.x,ty=safeTarget.y;

  let dx=tx-pos.x,dy=ty-pos.y,d=Math.max(1,Math.hypot(dx,dy));
  dx/=d;dy/=d;

  // The Jack was chosen once before the match. Do not swap it
  // depending on the current end or target.
  const jackHardnessId=jackHardness[side]||'soft';

  // Exact calibration uses the physics of that same physical Jack.
  let speed=botSpeedForDistance(d,jackHardnessId);

  let launch;
  if(profile.id==='expert'){
    // Expert Jack is deterministic: no execution miss and no random floor
    // slowdown. The calibrated vector is played exactly, so it cannot
    // artificially finish short of the chosen target.
    launch={vx:dx*speed,vy:dy*speed};
  }else{
    const executed=botExecutionResult(dx*speed,dy*speed,profile,{jack:true});
    launch=applyRealismToLaunch(executed.vx,executed.vy,'jack',jackHardnessId);
  }
  const b=spawnBall('jack',side,pos.x,pos.y,launch.vx,launch.vy,jackHardnessId);
  if(profile.id==='expert')b.realism=null;

  if(profile.id==='expert'){
    b.expertJackTarget={x:tx,y:ty};
  }
  lastShot={kind:'jack',side,ball:b,fouled:false,plan:plan.name,target:{x:tx,y:ty}};
  phase='moving';
  tone(500,.05,.025);
  updateUI();
}
function chooseBotPlayerBox(side){
  if(firstColourLockedBox[side]&&remainingForBox(side,firstColourLockedBox[side])>0){
    activePlayerBox[side]=firstColourLockedBox[side];
    return activePlayerBox[side];
  }
  const boxes=availableBoxes(side);
  if(!boxes.length)return sideBoxes(side)[0];
  // Prefer the box with a useful spread of hardnesses and a lateral lane toward the jack.
  let best=boxes[0],bestScore=-Infinity;
  for(const box of boxes){
    const items=unusedItemsForBox(side,box);
    const pos=boxCenter(box);
    let score=items.length*8-Math.abs(pos.x-jack.x)*.03;
    if(items.some(x=>x.id==='superHard'||x.id==='hard'))score+=6;
    if(items.some(x=>x.id==='soft'||x.id==='superSoft'))score+=6;
    if(score>bestScore){bestScore=score;best=box}
  }
  activePlayerBox[side]=best;
  return best;
}

function botThrowColour(side){
  if(phase!==side||!isBotSide(side))return;
  chooseBotPlayerBox(side);
  const pos=launcherFor(side),shot=chooseBestBotShot(side),profile=botProfile();
  rememberBotTarget(side,shot);

  const executed=botExecutionResult(shot.vx,shot.vy,profile,{jack:false});
  const hardnessId=shot.hardnessId||ensureSelectedBall(side);
  const launch=applyRealismToLaunch(executed.vx,executed.vy,side,hardnessId);

  const b=spawnBall(side,side,pos.x,pos.y,launch.vx,launch.vy,hardnessId);
  consumeBall(side,hardnessId);
  setBallsLeft(side,ballsLeft(side)-1);
  lastColourSide=side;
  if(firstColourLockedBox[side])firstColourLockedBox[side]=null;
  lastShot={kind:'colour',side,ball:b,fouled:false,intent:shot.intent||'normal'};
  phase='moving';tone(side==='red'?260:190,.05,.025);updateUI();
}

