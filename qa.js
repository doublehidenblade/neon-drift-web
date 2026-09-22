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
      if (o) return { distance: o.d - 27, x: o.lane };
    }
    throw new Error('No stationary collision fixture found');
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
