'use strict';

// ---------- Boot, start screen and main loop ----------

const setup = { civ: 'maurya', kingdoms: 8, difficulty: 'normal', size: 'large' };
const SIZE_FOR = { 2: 'medium', 4: 'large', 8: 'large', 12: 'huge', 20: 'giant' };
const MAX_FOR_SIZE = { medium: 4, large: 8, huge: 14, giant: 20 };

function randomSeed() {
    return String(Math.floor(Math.random() * 900000) + 100000);
}

function initStart() {
    const chips = $('civ-chips');
    chips.innerHTML = Object.entries(CIVS).map(([k, c]) => `<button data-civ="${k}"${k === setup.civ ? ' class="on"' : ''}><span class="swatch" style="background:${c.color}"></span>${c.name}</button>`).join('');
    const showBonus = () => { $('civ-bonus').textContent = `${CIVS[setup.civ].leader}: ${CIVS[setup.civ].bonus}`; };
    showBonus();
    chips.querySelectorAll('button').forEach(b => b.onclick = () => {
        setup.civ = b.dataset.civ;
        chips.querySelectorAll('button').forEach(o => o.classList.toggle('on', o === b));
        showBonus();
    });
    const sync = () => {
        document.querySelectorAll('#kingdom-chips button').forEach(o => o.classList.toggle('on', +o.dataset.k === setup.kingdoms));
        document.querySelectorAll('#size-chips button').forEach(o => o.classList.toggle('on', o.dataset.size === setup.size));
        document.querySelectorAll('#diff-chips button').forEach(o => o.classList.toggle('on', o.dataset.diff === setup.difficulty));
        const side = WORLD_SIZES[setup.size];
        $('land-note').textContent = `${side} × ${side} land with ${setup.kingdoms} kingdoms and about ${Math.max(setup.kingdoms + 2, Math.round(side * side / 1500))} independent villages.${setup.kingdoms >= 12 ? ' A long game: computer kingdoms may be slower on older phones.' : ''}`;
    };
    document.querySelectorAll('#kingdom-chips button').forEach(b => b.onclick = () => {
        setup.kingdoms = +b.dataset.k;
        setup.size = SIZE_FOR[setup.kingdoms];
        sync();
    });
    document.querySelectorAll('#size-chips button').forEach(b => b.onclick = () => {
        setup.size = b.dataset.size;
        if (setup.kingdoms > MAX_FOR_SIZE[setup.size]) setup.kingdoms = [2, 4, 8, 12, 20].filter(k => k <= MAX_FOR_SIZE[setup.size]).pop();
        sync();
    });
    document.querySelectorAll('#diff-chips button').forEach(b => b.onclick = () => { setup.difficulty = b.dataset.diff; sync(); });
    sync();
    $('seed-input').value = randomSeed();
    $('seed-random').onclick = () => { $('seed-input').value = randomSeed(); };
    $('start-btn').onclick = beginGame;
    $('how-btn').onclick = () => { $('how').hidden = false; };
    $('how-btn2').onclick = () => { $('how').hidden = false; };
    $('how-close').onclick = () => { $('how').hidden = true; };
    $('resume-btn').onclick = () => setPaused(false);
    $('restart-btn').onclick = () => { setPaused(false); showStart(); };
    $('end-new').onclick = () => { $('end').hidden = true; showStart(); };
    $('end-watch').onclick = () => { $('end').hidden = true; G.revealAll = true; updateFog(); updateFogTexture(); };
}

function showStart() {
    $('start').hidden = false;
    $('seed-input').value = randomSeed();
}

function beginGame() {
    const raw = $('seed-input').value.trim();
    const seed = /^\d+$/.test(raw) ? Number(raw) : [...raw].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;
    newGame({ seed, size: setup.size, kingdoms: setup.kingdoms, opponents: setup.kingdoms - 1, civ: setup.civ, difficulty: setup.difficulty });
    UI.selected = [];
    UI.placing = null;
    UI.msgSeen = -1;
    UI.panelKey = '';
    $('messages').innerHTML = '';
    buildWorldScene();
    makePortraits();
    buildMiniBase();
    closePeople();
    const [sx, sy] = player(G.human).start;
    camDist = viewW / viewH < 0.8 ? 32 : 22;
    lookAt(sx, sy + 1);
    $('start').hidden = true;
    selectTC();
}

function showEnd() {
    const win = G.over === 'victory';
    $('end-title').textContent = win ? 'Victory!' : 'Defeat';
    const s = Math.floor(G.time);
    $('end-text').textContent = win
        ? (G.victoryKind === 'empire' ? `In ${Math.floor(s / 60)} minutes the ${CIVS[player(G.human).civ].name} have built an empire that rules two thirds of all towns and villages.` : `In ${Math.floor(s / 60)} minutes the ${CIVS[player(G.human).civ].name} and their allies have united the land.`)
        : `After ${Math.floor(s / 60)} minutes your kingdom has fallen. Rise again with a new seed.`;
    $('end-stats').innerHTML = '<tr><th>Kingdom</th><th>Lands</th><th>Age</th><th>Gathered</th><th>Killed</th><th>Lost</th></tr>'
        + G.players.slice().sort((a, b) => settlementsOf(b.id).length - settlementsOf(a.id).length).map(p => `<tr><td style="color:${p.color}">${p.name}${p.defeated ? ' ✝' : ''}${p.id !== G.human && relation(G.human, p.id) === 'ally' ? ' (ally)' : ''}</td><td>${settlementsOf(p.id).length}</td><td>${AGES[p.age].name.replace(' Age', '')}</td><td>${Math.floor(p.stats.gathered)}</td><td>${p.stats.killed}</td><td>${p.stats.lost}</td></tr>`).join('');
    $('end').hidden = false;
}

let last = performance.now();
let panelClock = 0;
let miniClock = 0;
let fogTexClock = 0;

function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!G) return;
    if (!UI.paused && $('start').hidden) {
        // Fixed simulation steps keep combat and gathering the same at any frame rate.
        G.acc = (G.acc || 0) + dt;
        let n = 0;
        while (G.acc >= 0.05 && n++ < 4) { step(0.05); G.acc -= 0.05; }
        if (G.acc > 0.2) G.acc = 0;
    }
    edgeAndKeyScroll(dt);
    fogTexClock += dt;
    if (fogTexClock > 0.25) { fogTexClock = 0; updateFogTexture(); }
    renderFrame(now);
    panelClock += dt;
    if (panelClock > 0.2) { panelClock = 0; updatePanels(); }
    miniClock += dt;
    if (miniClock > 0.3) { miniClock = 0; drawMinimap(); }
    if (G.over && G.over !== 'shown') { showEnd(); G.over = 'shown'; }
}

function boot() {
    if (!window.THREE) {
        document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:auto 16px 16px;z-index:20;background:#2a1f33;padding:12px;border-radius:8px">The 3D engine could not load. Check your internet connection and reload the page.</p>');
        return;
    }
    initRender();
    initStart();
    initInput();
    window.addEventListener('resize', resize);
    requestAnimationFrame(loop);
}

boot();
