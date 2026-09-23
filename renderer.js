/* NEON DRIFT scene renderer.
 * World anchors share projectSprite(); near-to-far terrain heights determine
 * occlusion, and opaque sprite jobs draw far-to-near. CSS pixels everywhere:
 * no setTransform() inside a world draw may discard the canvas DPR transform.
 */
'use strict';
const sceneStats = { sprites: 0, culled: 0, invalid: 0 };
const sceneEffectsStats = { lamps:0, rightLamps:0, lightPools:0, shadows:0, shearedCars:0, rotatedCars:0, maxTrafficRotation:0, maxTrafficPlayerRatio:0, bridgeMemberMinPx:999, opaqueWorldFaces:0, texturedBuildingFaces:0, texturedWallFaces:0, portalTexturedFaces:0, secondaryRoadSegments:0, secondaryTrafficMinRel:999, secondaryTrafficMaxRel:-999, tunnelRibs:0, tunnelLights:0, tunnelWallSegments:0, tunnelApproachVisible:0, tunnelWallGap:0, textureOffset:0, textureAnchorWorld:0, textureAnchorY:0, waterPhase:0, waterProjectedQuads:0, portalBaseError:0, treeWorldGap:999 };
const sceneFaceArt = new Map();
let sceneLampArt = null;
function lampSprite(){
  if(sceneLampArt)return sceneLampArt;
  const im=ART['lamp-night'],cv=document.createElement('canvas');cv.width=im.naturalWidth;cv.height=im.naturalHeight;
  const c=cv.getContext('2d');c.drawImage(im,0,0);c.globalCompositeOperation='destination-in';c.fillStyle='#fff';
  // Retain the painted metal and lantern while cutting away the baked pink
  // explosion. This is still the authored sprite, only an opaque silhouette.
  c.beginPath();c.rect(0,0,142,im.naturalHeight);c.moveTo(72,48);c.lineTo(258,66);c.lineTo(332,122);c.lineTo(322,278);c.lineTo(184,282);c.lineTo(142,176);c.closePath();c.fill();
  c.globalCompositeOperation='source-over';sceneLampArt=cv;return cv;
}

function sceneSprite(c, key, rel, lateral, width, height = null, crop = null, options = null) {
  if (rel <= 1 || rel > 1800) return;
  const im = key==='lamp-night' ? lampSprite() : ART[key];
  if (!imgReady(im)) return;
  const p = projectSprite(rel, lateral, 0);
  let sw = p.w * width;
  let sh = height === null ? sw * im.naturalHeight / im.naturalWidth : p.scale * PROJ_H * Y_FACTOR * height;
  if(options?.maxScreenWidth && sw>options.maxScreenWidth){const ratio=options.maxScreenWidth/sw;sw*=ratio;sh*=ratio;}
  const x = p.x - sw / 2, y = p.y - sh;
  if (![x, y, sw, sh].every(Number.isFinite)) { sceneStats.invalid++; return; }
  if (sw < 1 || sh < 1 || x > W || x + sw < 0 || y > H || y + sh < 0) { sceneStats.culled++; return; }
  const grounded = key.startsWith('car-') || key.startsWith('tree-') || key.startsWith('person-') ||
    key === 'lamp-night' || key === 'kanban-night' || key === 'barricade' || key === 'cone' || key === 'nitro-bottle';
  if (grounded && rel < 380) {
    const longShadow = key.startsWith('tree-') || key === 'lamp-night';
    // All cast shadows point away from the nearest left-side street lamp.
    const lampD=Math.round((G.playerDist+rel)/120)*120, away=clamp((G.playerDist+rel-lampD)/120,-1,1);
    c.save(); c.fillStyle = 'rgba(0,0,0,.48)';
    c.beginPath(); c.ellipse(p.x + sw*(.10+away*.18), p.y-1, sw*(longShadow ? .48 : .52), Math.max(1.2,sw*(longShadow ? .06 : .08)), away*.18, 0, Math.PI*2); c.fill(); c.restore();
    sceneEffectsStats.shadows++;
  }
  const animated = (key.startsWith('tree-') && rel < 380) || key.startsWith('person-') || key === 'kanban-night';
  if (animated) {
    const sway = key.startsWith('tree-') ? Math.sin(G.time*1.15 + rel*.03)*.038 : key.startsWith('person-') ? Math.sin(G.time*4 + rel)*.025 : 0;
    c.save(); c.translate(p.x,p.y); c.rotate(sway);
    if (key === 'kanban-night') c.globalAlpha = .78 + .22*Math.sin(G.time*3 + rel*.04);
    if (crop) c.drawImage(im, ...crop, -sw/2, -sh, sw, sh); else c.drawImage(im,-sw/2,-sh,sw,sh);
    c.restore();
  } else if (options?.shear || options?.flip || options?.rotate) {
    c.save();c.translate(p.x,p.y);
    if(options.rotate)c.rotate(options.rotate);
    c.transform(options.flip?-1:1,0,options.shear||0,1,0,0);
    if(crop)c.drawImage(im,...crop,-sw/2,-sh,sw,sh);else c.drawImage(im,-sw/2,-sh,sw,sh);
    if(key.startsWith('car-')){c.fillStyle='#283041';c.fillRect(-sw*.13,-sh*.39,sw*.26,sh*.105);}
    c.restore();
    if(options.shear)sceneEffectsStats.shearedCars++;
    if(options.rotate&&key.startsWith('car-')){
      sceneEffectsStats.rotatedCars++;
      sceneEffectsStats.maxTrafficRotation=Math.max(sceneEffectsStats.maxTrafficRotation,Math.abs(options.rotate));
    }
  } else if (crop) c.drawImage(im, ...crop, x, y, sw, sh);
  else c.drawImage(im, x, y, sw, sh);
  sceneStats.sprites++;
}

function sceneMaskedSprite(c,key,rel,lateral,width,height,outline){
  const im=ART[key];if(rel<=1||rel>1800||!imgReady(im))return;
  const p=projectSprite(rel,lateral,0),sw=p.w*width,sh=p.scale*PROJ_H*Y_FACTOR*height,x=p.x-sw/2,y=p.y-sh;
  if(![x,y,sw,sh].every(Number.isFinite)||sw<1||sh<1||x>W||x+sw<0)return;
  c.save();c.beginPath();outline.forEach(([u,v],i)=>(i?c.lineTo(x+u*sw,y+v*sh):c.moveTo(x+u*sw,y+v*sh)));c.closePath();c.clip();c.drawImage(im,x,y,sw,sh);c.restore();
}

function sceneQuad(c, points, color) {
  c.beginPath(); c.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) c.lineTo(points[i][0], points[i][1]);
  c.closePath(); c.fillStyle = color; c.fill();
}
function sceneQuadAlpha(c,points,color,alpha){if(alpha<=.001)return;c.save();c.globalAlpha=alpha;sceneQuad(c,points,color);c.restore();}
// Dense roadside faces need authored pixels but not the two clipped affine
// draws used by road strips. Clip one scaled image draw to the projected face;
// this keeps the art, opacity and world corners while bounding city cost.
function texturedFace(c,key,points){
  const im=ART[key];if(!imgReady(im))return;
  // The inherited paintings are much larger than these narrow projected
  // returns. Cache a small authored mip once instead of resampling a 1024 px
  // source for every building on every frame.
  let source=sceneFaceArt.get(key);
  if(!source){source=document.createElement('canvas');source.width=source.height=64;source.getContext('2d').drawImage(im,0,0,64,64);sceneFaceArt.set(key,source);}
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y);
  c.save();c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);c.closePath();c.clip();
  c.drawImage(source,x,y,w,h);c.restore();
}
function scenePresence(weight,seed){
  // Physical scenery stays opaque. A stable spatial threshold changes its
  // density through a handoff instead of turning buildings into ghosts.
  return weight>hash01(seed+811);
}
function sceneSmoothstep(a,b,x){const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);}

function sceneTexture(c, key, points, alpha = 1, worldDistance = G.playerDist, timeOffset = 0) {
  const im = ART[key];
  if (!imgReady(im)) return;
  // Map a world-distance slice into the projected strip itself. A translated
  // CanvasPattern only changes its screen-space origin; clipping that pattern
  // to a trapezoid does not make its texels recede in perspective. Each 20 m
  // road strip now consumes the next 32 px of the authored tile, so its marks
  // share the road's projection and remain continuous as the camera advances.
  const slice=Math.min(32,im.naturalHeight);
  const strip=Math.round((worldDistance+timeOffset)/SEG_LEN);
  const offset=((strip*slice)%im.naturalHeight+im.naturalHeight)%im.naturalHeight;
  sceneEffectsStats.textureOffset=offset;
  const anchorWorld=Math.ceil(G.playerDist/SEG_LEN)*SEG_LEN;
  sceneEffectsStats.textureAnchorWorld=anchorWorld;
  sceneEffectsStats.textureAnchorY=+projectSprite(Math.max(2,anchorWorld-G.playerDist),0,0).y.toFixed(2);
  if(key==='tile-water-night')sceneEffectsStats.waterPhase=+(.5+.5*Math.sin(G.time*Math.PI)).toFixed(3);
  c.save(); c.globalAlpha = alpha;
  texturedQuad(c,im,points,[0,offset,im.naturalWidth,slice]); c.restore();
}

function drawSceneSky(env) {
  // One opaque mountain panorama remains present for the whole lap. City
  // depth comes from projected building sprites; no backdrop plate swaps and
  // no baked horizontal light-trail strip.
  ctx.fillStyle = '#101327'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(ART['mountains-night'],0,0,W,HORIZON+2);
  if (env === 'snow') {
    ctx.fillStyle = 'rgba(175,200,222,.5)'; ctx.fillRect(0, 0, W, HORIZON);
  } else {
    const moonSize = Math.min(64, H * .1);
    ctx.drawImage(ART['moon-night'], W * .78, HORIZON * .04, moonSize, moonSize);
  }
}

function drawSceneRoad(env) {
  const weights=sceneWeights(G.playerDist),water=weights.water,green=weights.green;
  ctx.fillStyle = env === 'snow' ? '#a5b7c6' : '#171b24';
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
  // Only front-facing road strips can be seen. Hidden descending terrain
  // never paints a second road through the crest in front of it.
  for (let n = DRAW; n >= 1; n--) {
    let yf = projY[n], yn = projY[n - 1];
    if (yf >= runMin[n - 1] || yn <= 0 || yf > H || yn <= yf) continue;
    const far = { x: projX[n], w: projW[n], y: yf };
    const near = { x: projX[n - 1], w: projW[n - 1], y: yn };
    // Clip the geometry before rasterization, including giant near-plane
    // polygons. This makes bridge cost bounded at all frame positions.
    const bounds = (y) => {
      const t = clamp((y - yf) / (yn - yf), 0, 1);
      return { x: lerp(far.x, near.x, t), w: lerp(far.w, near.w, t), y };
    };
    const a = bounds(Math.max(0, yf)), b = bounds(Math.min(H + 1, yn));
    if (b.y <= a.y) continue;
    const bd = G.playerDist + (n - basePct) * SEG_LEN;
    const bridge = inBridge(bd),sw=sceneWeights(bd);
    const quayRight = inHarbor(bd), quayLeft = inWaterfront(bd);
    const terrain = env === 'snow' ? '#b5c1cb' : '#25242a';
    const leftOut = bridge ? 1.13 : quayLeft ? 1.65 : 40;
    const rightOut = bridge ? 1.13 : quayRight ? 1.65 : 40;
    const quad = (left, right) => [[a.x+a.w*left,a.y],[a.x+a.w*right,a.y],[b.x+b.w*right,b.y],[b.x+b.w*left,b.y]];
    const surface=sw.green>.5?'#183027':terrain;
    sceneQuad(ctx, quad(-40,40), surface);
    // Water is real projected terrain. Each segment maps the painted water
    // tile through the same quad as land/road; world-space wave bands advance
    // along z and therefore converge at the horizon.
    if(sw.water>.5){
      const waterQuad=bridge?quad(-40,40):quayRight?quad(1.65,40):quayLeft?quad(-40,-1.65):quad(-40,40);
      sceneQuad(ctx,waterQuad,'#0b2230');
      const phase=((bd+G.time*12)%100+100)%100;if(phase<SEG_LEN)sceneQuad(ctx,waterQuad,'#17364b');
      sceneEffectsStats.waterPhase=+phase.toFixed(2);
      sceneEffectsStats.waterProjectedQuads++;
    }
    if (b.y - a.y > 2 && !bridge) {
      if(sw.water<=.5){sceneTexture(ctx,env==='snow'?'tile-concrete-night':'tile-concrete-night',quad(-leftOut,rightOut),1,bd);
      if(env!=='snow'&&sw.green>.5)sceneTexture(ctx,'tile-grass-night',quad(-leftOut,rightOut),1,bd);}
    }
    sceneQuad(ctx, quad(-1.12,1.12), env === 'snow' ? '#d1d4d5' : '#454653');
    sceneQuad(ctx, quad(-1,1), '#202532');
    if (b.y - a.y > 2) sceneTexture(ctx, 'tile-road-night', quad(-1,1), .16,bd);
    sceneQuad(ctx, quad(-.99,-.976), '#bec4cc'); sceneQuad(ctx, quad(.976,.99), '#bec4cc');
    // Road paint is anchored to track distance, not a restarted canvas dash.
    if (Math.floor(bd / SEG_LEN) % 3 === 0) {
      for (const lat of [-1/3,1/3]) sceneQuad(ctx, quad(lat-.007,lat+.007), '#c6c3ac');
    }
    const inLap = ((bd % LAP_LEN) + LAP_LEN) % LAP_LEN;
    if (Math.abs(inLap - CROSS_D) < SEG_LEN) {
      for (let l=-.86; l<.9; l+=.17) sceneQuad(ctx, quad(l,l+.085), '#c1c7ce');
    }
  }
}

function sceneBuilding(c, frontKey, sideKey, rel, lateral, width, height, depth, side) {
  const half=width/2, f0=projectSprite(rel,lateral-half,0), f1=projectSprite(rel,lateral+half,0);
  const ft0=projectSprite(rel,lateral-half,-height), ft1=projectSprite(rel,lateral+half,-height);
  const backRel=rel+depth, b0=projectSprite(backRel,lateral-half,0), b1=projectSprite(backRel,lateral+half,0);
  const bt0=projectSprite(backRel,lateral-half,-height), bt1=projectSprite(backRel,lateral+half,-height);
  // Front, road-facing side and roof all share projected world corners.
  // A front face at one depth is rectangular in this projection, so keep the
  // painted sprite on the fast drawImage path. Only the receding return needs
  // the clipped quad mapper.
  sceneSprite(c,frontKey,rel,lateral,width,height);
  const roadFace=side<0 ? [[ft1.x,ft1.y],[bt1.x,bt1.y],[b1.x,b1.y],[f1.x,f1.y]] : [[bt0.x,bt0.y],[ft0.x,ft0.y],[f0.x,f0.y],[b0.x,b0.y]];
  // p3d-040: the return and roof are authored surfaces too. The sideKey was
  // previously passed in but never used, leaving a flat Canvas slab beside an
  // otherwise painted facade. Perspective-map the actual facade onto the road
  // face and an opaque concrete texture onto the roof; only the hidden ground
  // footprint remains a solid fill.
  const roofFace=[[bt0.x,bt0.y],[bt1.x,bt1.y],[ft1.x,ft1.y],[ft0.x,ft0.y]];
  if(rel<180){
    texturedFace(c,imgReady(ART[sideKey])?sideKey:frontKey,roadFace);
    texturedFace(c,'tile-concrete-night',roofFace);
    sceneEffectsStats.texturedBuildingFaces+=2;
  }else{
    // Beyond this depth the painted texels collapse below a pixel. Preserve
    // the authored near-field treatment and use its restrained backing tones
    // instead of paying clip/image cost for invisible detail.
    sceneQuad(c,roadFace,'#1f2a3f');sceneQuad(c,roofFace,'#2a3143');
  }
  c.fillStyle='#090c13'; c.beginPath(); c.moveTo(f0.x,f0.y); c.lineTo(f1.x,f1.y); c.lineTo(b1.x,b1.y); c.lineTo(b0.x,b0.y); c.closePath(); c.fill();
  sceneEffectsStats.opaqueWorldFaces+=3;
}

function sceneSceneryJobs(env) {
  sceneStats.sprites = sceneStats.culled = 0;
  // Fixed WORLD spacing; texture choice must not change with projected size.
  const spacing = 72 / TUNE.propDensity;
  const first = Math.ceil((G.playerDist + 1) / spacing) * spacing;
  for (let bd = first; bd < G.playerDist + 900; bd += spacing) {
    const rel = bd - G.playerDist, id = Math.floor(bd / 72);
    if (inBridge(bd) || inTunnel(bd)) continue;
    const sw=sceneWeights(bd);if(sw.tunnel>.94)continue;
    const green = sw.green>sw.city;
    for (const side of [-1,1]) {
      const baySide = (inHarbor(bd) && side === 1) || (inWaterfront(bd) && side === -1);
      if (baySide) continue;
      const seed = id * 2 + (side === 1 ? 1 : 0);
      if (green) {
        if(!scenePresence(sw.green,seed))continue;
        const key = hash01(seed + 2) > .5 ? 'tree-broad' : 'tree-pine';
        pushJob(rel, c => sceneSprite(c, key, rel, side * (1.8 + hash01(seed) * .65), .55 + hash01(seed+1)*.35, .8 + hash01(seed+3)*.7));
      } else {
        if(!scenePresence(sw.city,seed))continue;
        const shop = sectorOf(bd) === 0;
        const key = env === 'snow' ? 'facade-snow-' + (1 + seed % 2) : shop ? 'facade-shop-' + (1 + seed % 2) : 'facade-night-' + (1 + seed % 4);
        const height = shop ? .8 + hash01(seed + 7) * .6 : 1.3 + hash01(seed + 7) * 1.4;
        const lat = side * (2.35 + hash01(seed + 9) * .25);
        const backKey = env === 'snow' ? 'facade-snow-' + (1 + (seed+1) % 2) : 'facade-night-' + (1 + (seed+1) % 4);
        sceneEffectsStats.opaqueWorldFaces+=3;
        pushJob(rel,c=>sceneBuilding(c,key,backKey,rel,lat,1.55,height,12+hash01(seed+12)*12,side));
        // A second row stays farther from the road and at its own depth.
        if (id % 3 === 0) pushJob(rel + 36, c => sceneSprite(c, 'facade-night-' + (1 + seed % 4), rel + 36, side * 4.6, 1.8, height + .7));
      }
    }
  }
  // Sidewalk life is limited to dense city districts. Painted pedestrians
  // walk parallel to the road with deterministic, short lateral cycles.
  const pedSpacing = 190 / TUNE.propDensity;
  for (let bd=Math.ceil((G.playerDist+1)/pedSpacing)*pedSpacing; bd<G.playerDist+420; bd+=pedSpacing) {
    if (inTunnel(bd)||inBridge(bd)||inClimb(bd)||inPark(bd)||getEnv(bd)==='snow') continue;
    const rel=bd-G.playerDist, seed=Math.floor(bd/pedSpacing), side=seed%2?1:-1;
    const walk=Math.sin(G.time*.9+seed)*.22;
    pushJob(rel,c=>sceneSprite(c,'person-night-'+(1+Math.abs(seed)%3),rel,side*(1.48+walk),.13,.34));
    if (sectorOf(bd)===0 && seed%2===0) pushJob(rel+5,c=>sceneSprite(c,'kanban-night',rel+5,side*1.88,.28,.68));
  }
  const lampSpacing = 120 / TUNE.propDensity;
  for (let bd = Math.ceil((G.playerDist + 1) / lampSpacing) * lampSpacing; bd < G.playerDist + 800; bd += lampSpacing) {
    if (inTunnel(bd)) continue;
    const rel = bd - G.playerDist;
    for (const side of [-1]) pushJob(rel, c => {
      // Lamp art includes its own light head; no procedural duplicate poles.
      const height = 1.05;
      const width = H * Y_FACTOR * height / (W * ROAD_FACTOR) * ART['lamp-night'].naturalWidth / ART['lamp-night'].naturalHeight;
      if(rel>80){const f0=projectSprite(rel-8,-.55,0),f1=projectSprite(rel-8,.05,0),b0=projectSprite(rel+8,-.55,0),b1=projectSprite(rel+8,.05,0);
      sceneQuad(c,[[b0.x,b0.y],[b1.x,b1.y],[f1.x,f1.y],[f0.x,f0.y]],'#35343a');sceneEffectsStats.lightPools++;}
      sceneEffectsStats.lamps++;
      sceneSprite(c, 'lamp-night', rel, side * 1.43, width, height);
    });
  }
}

function sceneRailJobs() {
  const first = Math.floor(G.playerDist / SEG_LEN) * SEG_LEN;
  for (let bd = first; bd < G.playerDist + 1200; bd += SEG_LEN) {
    if (inTunnel(bd)) continue;
    const rel = bd - G.playerDist;
    const r0 = Math.max(2, rel), r1 = rel + SEG_LEN;
    if (r1 <= r0) continue;
    for (const side of [-1,1]) pushJob(r0, c => {
      const a = projectSprite(r0, side * 1.15, 0), b = projectSprite(r1, side * 1.15, 0);
      const ah = a.scale * PROJ_H * Y_FACTOR * .22, bh = b.scale * PROJ_H * Y_FACTOR * .22;
      if (Math.max(a.x,b.x) < -40 || Math.min(a.x,b.x) > W+40 || Math.min(a.y-ah,b.y-bh)>H) return;
      const points = [[a.x,a.y-ah],[b.x,b.y-bh],[b.x,b.y],[a.x,a.y]];
      texturedQuad(c, ART['guardrail-seg'], points);
    });
  }
}

function sceneHighWallJobs() {
  const first=Math.floor(G.playerDist/SEG_LEN)*SEG_LEN;
  for(let bd=first;bd<G.playerDist+700;bd+=SEG_LEN){
    const visibility=sceneWeights(bd).city;
    if(!scenePresence(visibility,Math.round(bd/SEG_LEN)))continue;
    const r0=Math.max(2,bd-G.playerDist),r1=bd+SEG_LEN-G.playerDist;
    if(r1<=r0) continue;
    for(const side of [-1,1]) pushJob(r0,c=>{
      c.globalAlpha=1;
      const fb=projectSprite(r1,side*1.18,0), nb=projectSprite(r0,side*1.18,0);
      const ft=projectSprite(r1,side*1.18,-.38), nt=projectSprite(r0,side*1.18,-.38);
      const wallFace=[[ft.x,ft.y],[nt.x,nt.y],[nb.x,nb.y],[fb.x,fb.y]];
      if(r0<200){texturedFace(c,'tile-concrete-night',wallFace);sceneEffectsStats.texturedWallFaces++;}
      else sceneQuad(c,wallFace,'#252b35');
      c.strokeStyle='#59606d';c.lineWidth=Math.max(1,nb.w*.003);c.beginPath();c.moveTo(ft.x,ft.y);c.lineTo(fb.x,fb.y);c.stroke();
      c.strokeStyle='#0c0f16'; c.lineWidth=Math.max(1,nb.w*.006); c.beginPath(); c.moveTo(ft.x,ft.y);c.lineTo(nt.x,nt.y);c.stroke();
      sceneEffectsStats.opaqueWorldFaces++;
    });
  }
  // Repeated painted trees form a porous dark silhouette behind the low rail;
  // no single wall slab is asked to hide the whole roadside.
  const spacing=92,firstTree=Math.ceil((G.playerDist+20)/spacing)*spacing;
  const portrait=H/W>1.5, treeStep=portrait?24:36;
  sceneEffectsStats.treeWorldGap=treeStep;
  for(let bd=Math.ceil((G.playerDist+20)/treeStep)*treeStep;bd<G.playerDist+760;bd+=treeStep){
    const visibility=sceneWeights(bd).city;
    if(!scenePresence(visibility,Math.round(bd/spacing)+41))continue;
    const rel=bd-G.playerDist;
    for(const side of [-1,1])for(const row of [0,1,2])pushJob(rel+row*10,c=>sceneSprite(c,row%2?'tree-broad':'tree-pine',rel+row*10,side*(portrait?1.40+row*.28:1.48+row*.3),portrait?.84:.76,portrait?1.28:1.16));
  }
}

function sceneSkidJobs(){
  for(const s of G.skids){const rel=s.d-G.playerDist;if(rel<3||rel>650)continue;pushJob(rel,c=>{
    const a=projectSprite(rel,s.x,0),b=projectSprite(rel+9,s.x,0);
    c.globalAlpha=clamp(s.life/2,0,.5);c.strokeStyle='#08090d';c.lineWidth=Math.max(1,a.w*.018);
    c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.globalAlpha=1;
  });}
}

function sceneCrossroadJobs(){
  const t=crossTrafficState(),rel=t.d-G.playerDist;if(rel<8||rel>900)return;
  for(const side of [-1,1])pushJob(rel,c=>{
    // Compact traffic signal, not a second street-lamp row.
    const foot=projectSprite(rel,side*1.32,0),top=projectSprite(rel,side*1.32,-.62);
    c.strokeStyle='#252b37';c.lineWidth=Math.max(2,foot.w*.012);c.beginPath();c.moveTo(foot.x,foot.y);c.lineTo(top.x,top.y);c.stroke();
    const p=projectSprite(rel,side*1.27,-.58);c.fillStyle=t.red?'#ff304e':'#44ef83';c.beginPath();c.arc(p.x,p.y,Math.max(2,p.w*.025),0,Math.PI*2);c.fill();
  });
}

function sceneSecondaryHighwayJobs(){
  for(const side of [-1,1]){
    // Keep the near road at the shared 20 m resolution, then merge the final
    // horizon stretch into longer projected slabs. At that depth the joins
    // collapse to only a few pixels, so extra 20 m jobs add no visible detail
    // and can push busy city frames beyond the bounded render queue.
    for(let rel=20;rel<1200;rel+=SEG_LEN){pushJob(rel,c=>{
      const visibility=sceneWeights(G.playerDist+rel).city;if(visibility<.08)return;
      // The final quad continues to the 1.6 km horizon in one piece; its far
      // joins would be sub-pixel, so subdividing it only bloats the job queue.
      const span=rel===1180?420:SEG_LEN;
      const a=projectSprite(rel,side*3.35,0),b=projectSprite(rel+span,side*3.35,0);
      const aw=a.w*.42,bw=b.w*.42;
      sceneQuad(c,[[b.x-bw,b.y],[b.x+bw,b.y],[a.x+aw,a.y],[a.x-aw,a.y]],'#191f2a');
      c.strokeStyle='#d0c8a7';c.lineWidth=Math.max(1,a.w*.006);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
      sceneEffectsStats.secondaryRoadSegments++;
    });}
    // p3d-040: traffic traverses a full far-to-behind-camera lifecycle. The
    // wrap happens while the car is already invisible, so it never teleports
    // from the far horizon straight into the near field.
    const cycle=1650,phase=((G.raceTime*24+(side>0?825:0))%cycle+cycle)%cycle;
    const carRel=1500-phase;
    sceneEffectsStats.secondaryTrafficMinRel=Math.min(sceneEffectsStats.secondaryTrafficMinRel,carRel);
    sceneEffectsStats.secondaryTrafficMaxRel=Math.max(sceneEffectsStats.secondaryTrafficMaxRel,carRel);
    if(carRel>2&&carRel<1600)pushJob(carRel,c=>{
      const visibility=sceneWeights(G.playerDist+carRel).city;if(visibility<.08)return;
      sceneSprite(c,side<0?'car-van':'car-sedan',carRel,side*3.35,.42,null,null,{
        rotate:trafficTravelAngle(carRel,side*3.35),maxScreenWidth:playerWpx()*.72
      });
    });
  }
}

// Two clipped triangles map an image into a real projected quad. Transform
// composes with DPR and camera shake; clipping prevents affine overspill.
function texturedQuad(c, im, p, crop = null) {
  if (!imgReady(im) || !p.flat().every(Number.isFinite)) return;
  const source = crop || [0,0,im.naturalWidth,im.naturalHeight];
  const tri = (a,b,d,u0,v0,u1,v1,u2,v2) => {
    const det=(u1-u0)*(v2-v0)-(u2-u0)*(v1-v0);
    if (Math.abs(det)<.001) return;
    const A=((b[0]-a[0])*(v2-v0)-(d[0]-a[0])*(v1-v0))/det;
    const B=((b[1]-a[1])*(v2-v0)-(d[1]-a[1])*(v1-v0))/det;
    const C=((d[0]-a[0])*(u1-u0)-(b[0]-a[0])*(u2-u0))/det;
    const D=((d[1]-a[1])*(u1-u0)-(b[1]-a[1])*(u2-u0))/det;
    c.save(); c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.lineTo(...d); c.closePath(); c.clip();
    c.transform(A,B,C,D,a[0]-A*u0-C*v0,a[1]-B*u0-D*v0);
    c.drawImage(im,...source,0,0,1,1); c.restore();
  };
  tri(p[0],p[1],p[3],0,0,1,0,0,1);
  tri(p[1],p[2],p[3],1,0,1,1,0,1);
}

function sceneBridgeJobs() {
  const [A,B] = bridgeBounds();
  const lap = Math.floor(G.playerDist / LAP_LEN);
  const bridgeLaps = G.track === 'mixed' ? [0] : [lap,lap+1];
  for (const l of bridgeLaps) {
    const start = l*LAP_LEN+A, end = l*LAP_LEN+B;
    const towers = [start+30,start+(end-start)/2,end-30];
    for (const td of towers) {
      const rel = td-G.playerDist;
      if (rel <= 2 || rel > 1800) continue;
      pushJob(rel,c => {
        const im=ART['bridge-tower-night'];
        // Reuse the painted steel columns; remove the original low crossbars
        // from the driving corridor. The only crossbeam is 3.4m above camera.
        for (const side of [-1,1]) sceneSprite(c,'bridge-tower-night',rel,side*1.25,.22,3.4,[48,52,65,572]);
        const a=projectSprite(rel,-1.32,-3.4),b=projectSprite(rel,1.32,-3.4);
        const h=a.scale*PROJ_H*Y_FACTOR*.16;
        if (a.y+h>0 && a.y<H) c.drawImage(im,117,42,157,42,a.x,a.y,b.x-a.x,h);
      });
    }
    for (let i=0;i<towers.length-1;i++) {
      const ta=towers[i],tb=towers[i+1];
      for (let sd=ta;sd<tb;sd+=50) {
        const r0=Math.max(2,sd-G.playerDist),r1=Math.min(sd+50,tb)-G.playerDist;
        if (r1<=r0 || r0>1500) continue;
        const cableH = d => { const u=(d-ta)/(tb-ta); return 3.4-7*u*(1-u); };
        for (const side of [-1,1]) pushJob(r0,c => {
          const a=projectSprite(r0,side*1.25,-cableH(G.playerDist+r0));
          const b=projectSprite(r1,side*1.25,-cableH(G.playerDist+r1));
          const foot=projectSprite(r1,side*1.25,0);
          c.strokeStyle='#718796'; c.lineWidth=Math.max(2,Math.min(5,foot.w*.009));
          sceneEffectsStats.bridgeMemberMinPx=Math.min(sceneEffectsStats.bridgeMemberMinPx,c.lineWidth);
          c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(b.x,b.y); c.stroke();
          if(Math.floor((sd-ta)/50)%2===0){c.beginPath();c.moveTo(b.x,b.y);c.lineTo(foot.x,foot.y);c.stroke();}
        });
      }
    }
  }
}

function sceneTunnelJobs() {
  const im=ART['tile-tunnel-wall'], roof=ART['tile-tunnel-ceiling'];
  const first=Math.floor(G.playerDist/SEG_LEN)*SEG_LEN;
  const approach=tunnelZones().find(([a])=>G.playerDist<a&&G.playerDist>a-600);
  for (let bd=first;bd<G.playerDist+1500;bd+=SEG_LEN) {
    // An outside viewer sees the continuous shell through the entrance's
    // projected aperture. Previously the entire interior popped into being
    // only 45 m before the mouth, which is the phone-visible discontinuity.
    if ((!inTunnel(G.playerDist)&&!approach)||!inTunnel(bd+SEG_LEN/2)) continue;
    const r0=Math.max(2,bd-G.playerDist),r1=bd+SEG_LEN-G.playerDist;
    if (r1<=r0) continue;
    pushJob(r0,c => {
      c.save();
      if(approach){
        const mouth=approach[0]-G.playerDist,ml=projectSprite(mouth,-1.12,0),mr=projectSprite(mouth,1.12,0),mt=projectSprite(mouth,0,-2.35).y;
        c.beginPath();c.moveTo(ml.x,mt);c.lineTo(mr.x,mt);c.lineTo(mr.x,mr.y);c.lineTo(ml.x,ml.y);c.closePath();c.clip();
        sceneEffectsStats.tunnelApproachVisible++;
      }
      const fl=projectSprite(r1,-1.15,0),fr=projectSprite(r1,1.15,0);
      const nl=projectSprite(r0,-1.15,0),nr=projectSprite(r0,1.15,0);
      const ft=projectSprite(r1,0,-2.4).y,nt=projectSprite(r0,0,-2.4).y;
      const slice=Math.min(64,im.naturalWidth),offset=((Math.round(bd/SEG_LEN)*slice)%im.naturalWidth+im.naturalWidth)%im.naturalWidth;
      texturedQuad(c,im,[[fl.x,ft],[nl.x,nt],[nl.x,nl.y],[fl.x,fl.y]],[offset,0,slice,im.naturalHeight]);
      texturedQuad(c,im,[[nr.x,nt],[fr.x,ft],[fr.x,fr.y],[nr.x,nr.y]],[offset,0,slice,im.naturalHeight]);
      texturedQuad(c,roof,[[fl.x,ft],[fr.x,ft],[nr.x,nt],[nl.x,nt]],[offset,0,Math.min(slice,roof.naturalWidth),roof.naturalHeight]);
      sceneEffectsStats.tunnelWallSegments++;
      sceneEffectsStats.tunnelWallGap=Math.max(sceneEffectsStats.tunnelWallGap,Math.abs(fl.x-projectSprite(r1,-1.15,0).x),Math.abs(fr.x-projectSprite(r1,1.15,0).x));
      // Repeating world-space ribs and ceiling lights expose real depth and
      // naturally grow/contract at both tunnel boundaries.
      if(Math.floor(bd/SEG_LEN)%3===0){
        c.save();c.strokeStyle='#647080';c.lineWidth=Math.max(1,nl.w*.008);
        c.beginPath();c.moveTo(nl.x,nl.y);c.lineTo(nl.x,nt);c.lineTo(nr.x,nt);c.lineTo(nr.x,nr.y);c.stroke();c.restore();
        // Small opaque fixtures, never vertically stretched glow/flames.
        c.fillStyle='#f6d889';const fw=Math.max(2,nl.w*.055),fh=Math.max(2,nl.w*.014);
        for(const x of [lerp(nl.x,nr.x,.32),lerp(nl.x,nr.x,.68)])c.fillRect(x-fw/2,nt+fh,fw,fh);
        sceneEffectsStats.tunnelRibs++;sceneEffectsStats.tunnelLights++;
      }
      c.restore();
    });
  }
  const zones=tunnelZones();
  for (const [a,b] of zones) {
    // Approach vegetation is independent world geometry. It establishes the
    // mountain cut over hundreds of metres instead of asking one billboard to
    // materialize an entire biome at the portal plane.
    for(let d=a-430;d<a-35;d+=55){
      const rel=d-G.playerDist;if(rel<=2||rel>1500)continue;
      const seed=Math.floor(d/55);
      for(const side of [-1,1])pushJob(rel,c=>sceneSprite(c,seed%2?'tree-pine':'tree-broad',rel,side*(1.45+hash01(seed)*.42),.48+.12*hash01(seed+3),.74+.2*hash01(seed+5)));
    }
    // Entrance and exit use the same opaque projected frame. Its base shares
    // the road plane exactly; wing walls connect into roadside terrain.
    for(const mouth of [a,b]){const rel=mouth-G.playerDist;if(rel>3&&rel<1500)pushJob(rel,c=>{
      const il=projectSprite(rel,-1.12,0),ir=projectSprite(rel,1.12,0),it=projectSprite(rel,0,-2.35);
      const ol=projectSprite(rel,-1.75,0),or=projectSprite(rel,1.75,0),ot=projectSprite(rel,0,-2.72);
      sceneEffectsStats.portalBaseError=Math.max(sceneEffectsStats.portalBaseError,Math.abs(il.y-projectSprite(rel,-1.12,0).y),Math.abs(ir.y-projectSprite(rel,1.12,0).y));
      texturedQuad(c,im,[[ol.x,ot.y],[il.x,it.y],[il.x,il.y],[ol.x,ol.y]]);
      texturedQuad(c,im,[[ir.x,it.y],[or.x,ot.y],[or.x,or.y],[ir.x,ir.y]]);
      texturedQuad(c,roof,[[ol.x,ot.y],[or.x,ot.y],[ir.x,it.y],[il.x,it.y]]);
      const wl=projectSprite(rel,-3.2,0),wr=projectSprite(rel,3.2,0);
      const wlt=projectSprite(rel,-3.2,-1.55),wrt=projectSprite(rel,3.2,-1.55);
      const portal=ART['tunnel-portal-night'];
      const leftWing=[[wlt.x,wlt.y],[ol.x,ot.y],[ol.x,ol.y],[wl.x,wl.y]];
      const rightWing=[[or.x,ot.y],[wrt.x,wrt.y],[wr.x,wr.y],[or.x,or.y]];
      if(imgReady(portal)){
        const pw=portal.naturalWidth,ph=portal.naturalHeight;
        texturedQuad(c,portal,leftWing,[0,0,pw*.38,ph]);
        texturedQuad(c,portal,rightWing,[pw*.62,0,pw*.38,ph]);
      }else{
        texturedQuad(c,im,leftWing);texturedQuad(c,im,rightWing);
      }
      sceneEffectsStats.portalTexturedFaces+=2;
    });}
  }
}

function sceneGateJobs() {
  const lap=Math.floor(G.playerDist/LAP_LEN);
  for (const l of [lap,lap+1]) {
    const rel=l*LAP_LEN+55-G.playerDist;
    if (rel<=2 || rel>1200) continue;
    pushJob(rel,c => sceneSprite(c,'torii-night',rel,0,2.65,2.7));
  }
}

function drawCompactHUD() {
  const lap = Math.min(LAPS, Math.floor(G.playerDist / LAP_LEN) + 1);
  ctx.fillStyle = 'rgba(4,6,14,.7)'; ctx.fillRect(0,0,W,44);
  pxText(ctx,String(Math.round(G.speedMs*3.6)),12,8,4,'#ffffff','left');
  pxText(ctx,'KM/H',90,25,1,'#9da8bc','left');
  pxText(ctx,'LAP '+lap+'/'+LAPS,W-12,8,2,'#ffdd46','right');
  pxText(ctx,'POS '+playerPos()+'/'+(G.rivals.length+1),W-12,28,1,'#dfe3ed','right');
  pxText(ctx,fmtTimeShort(Math.floor(G.raceTime*1000)),W/2,8,2,'#ffffff','center');
  for(let i=0;i<TUNE.startHearts;i++) drawHeart(ctx,W/2-38+i*16,29,1,i<G.hearts?'#ff2a4a':'#532138');
  ctx.fillStyle = 'rgba(4,6,14,.7)'; ctx.fillRect(10,H-38,150,28);
  pxText(ctx,'NITRO',16,H-33,1,'#53e1ff','left');
  ctx.fillStyle='#253447';ctx.fillRect(16,H-20,136,5);
  ctx.fillStyle='#53e1ff';ctx.fillRect(16,H-20,136*G.nitro/TUNE.nitroCap,5);
  if(G.state==='countdown') {
    const n=Math.floor(G.cdT),label=n<3?String(3-n):'GO!';
    pxText(ctx,label,W/2,H*.37,8,'#ffffff','center');
  }
}
