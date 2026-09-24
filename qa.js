/* Test hooks are available only on the explicit, seeded harness URL. */
if (HARNESS) {
  window.__tdReady = () => artReady && Object.values(ART).every(imgReady);
  window.__tdCapture = (distance, track = 'circuit', x = 0) => {
    qaFrozen = true;
    _seed = (parseInt(Q.get('seed') || '7', 10) >>> 0) || 7;
    setTrack(track);
    window.__tdReset();
    G.state = 'racing'; G.playerDist = distance; G.playerX = x;
    G.time = 10; G.raceTime = 0; G.speedMs = 0; G.skyX = 0;
    document.getElementById('pausebtn').classList.remove('hidden');
    document.getElementById('banner').style.opacity = '0';
    render();
    return JSON.parse(window.__tdState());
  };
  window.__tdStats = () => ({ ...sceneStats, ...jobStats });
  window.__tdFindCollision = () => {
    for (let d = 460; d < LAP_LEN; d += OB_STEP) {
      const o = obstacleBlocks(d).find(x => x.type !== 'car');
      if (o) return { distance: o.d - contactRel(), x: o.lane };
    }
    throw new Error('No stationary collision fixture found');
  };
  window.__tdFindProp = type => {
    for (let d = 460; d < LAP_LEN; d += OB_STEP) {
      const o = obstacleBlocks(d).find(x => x.type === type);
      if (o) return { distance: o.d - 27, d: o.d, x: o.lane, type: o.type, seed: o.seed };
    }
    throw new Error(`No ${type} fixture found`);
  };
  window.__tdPropHit = (fixture, age = .36, side = 1, source = 'player') => {
    const o = { d: fixture.d, lane: fixture.x, type: fixture.type, seed: fixture.seed };
    emitPropHit(o, side, source);
    const hit = propHits.get(civilianKey(o));
    hit.started = G.time - age;
    render();
    return { ...hit, age, count: propHits.size, depthBias: .01 };
  };
  window.__tdPropHits = () => [...propHits.values()].map(hit => ({
    ...hit, age: +(G.time - hit.started).toFixed(3), grounded: G.time - hit.started >= .72,
  }));
  // p3d-064: audit p3d-080's displaced debris visuals. Hit props are
  // non-blocking; report each alpha-visible width beside its zero collision
  // box so tests pin all four new sprite states.
  window.__tdPropCollisionBounds = (type, age) => {
    const fx = window.__tdCollisionFixture(type);
    window.__tdCapture(fx.distance, 'circuit', fx.x);
    const state = window.__tdPropHit(fx, age, 1, 'player');
    const flying = age < .72;
    const key = type === 'barrier'
      ? (flying ? 'barricade-flying' : 'barricade-broken')
      : (flying ? 'cone-flying' : 'cone-crushed');
    const rel = fx.d - G.playerDist;
    const p = projectSprite(rel, state.lane, 0);
    const nominal = type === 'barrier' ? p.w * .46 : p.scale * PROJ_H * Y_FACTOR * .30;
    const drawn = nominal * (flying ? 1 : .82);
    return { type, key, age, collisionHalf: obstacleCollisionHalfRoad({
      d:fx.d, lane:fx.x, type, seed:fx.seed
    }, rel), visualHalf: drawn * spriteAlphaBounds(key).w / (2 * p.w), alphaBounds:spriteAlphaBounds(key) };
  };
  // p3d-064: deterministic fixture at the visual contact plane.
  window.__tdCollisionFixture = (type) => {
    for (let d = 460; d < LAP_LEN; d += OB_STEP) {
      const o = obstacleBlocks(d).find(x => x.type === type);
      if (o) return { distance: o.d - contactRel(), d: o.d, x: o.lane, type: o.type, seed: o.seed };
    }
    throw new Error(`No ${type} collision fixture found`);
  };
  window.__tdPlay = () => { qaFrozen = false; lastT = performance.now(); acc = 0; };
  window.__tdFreeze = () => { qaFrozen = true; };
  window.__tdFrame = () => { render(); return { jobs: jobStats.lastCount, badKey: jobStats.badKey, ...sceneStats }; };
  window.__tdStep = (seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) update(STEP);
    render();
    return JSON.parse(window.__tdState());
  };
  if (Q.has('dist')) {
    const show = () => {
      if (!window.__tdReady()) { requestAnimationFrame(show); return; }
      window.__tdCapture(Number(Q.get('dist')), Q.get('track') || 'circuit', Number(Q.get('x') || 0));
    };
    show();
  }
}
