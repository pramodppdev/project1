'use strict';

const W = 14;
const H = 10;
const SAVE_KEY = 'empire-builder-save-v1';
const PLAYER_START = { x: 2, y: 5 };
const RIVAL_START = { x: 11, y: 4 };

const RES = {
    food: { name: 'Food', icon: '🍞' },
    wood: { name: 'Wood', icon: '🪵' },
    stone: { name: 'Stone', icon: '🪨' },
    gold: { name: 'Gold', icon: '🪙' },
};

const TERRAIN = {
    plains: { name: 'Plains', defense: 0, glyph: '' },
    forest: { name: 'Forest', defense: 1, glyph: '🌲' },
    hills: { name: 'Hills', defense: 1, glyph: '' },
    mountain: { name: 'Mountains', defense: 2, glyph: '⛰️' },
    water: { name: 'Water', defense: 0, glyph: '' },
};

const BUILDINGS = {
    farm: { name: 'Farm', icon: '🌾', terrain: ['plains'], cost: { wood: 10 }, yields: { food: 4 }, desc: '+4 food' },
    lumber: { name: 'Lumber Camp', icon: '🪓', terrain: ['forest'], cost: { gold: 10 }, yields: { wood: 3 }, desc: '+3 wood' },
    quarry: { name: 'Quarry', icon: '⛏️', terrain: ['hills'], cost: { wood: 15 }, yields: { stone: 3 }, desc: '+3 stone' },
    mine: { name: 'Gold Mine', icon: '💰', terrain: ['mountain', 'hills'], cost: { wood: 15, stone: 10 }, yields: { gold: 4 }, desc: '+4 gold' },
    house: { name: 'Houses', icon: '🏠', terrain: ['plains', 'forest'], cost: { wood: 15, stone: 5 }, yields: {}, housing: 5, desc: '+5 population cap' },
    market: { name: 'Market', icon: '🏪', terrain: ['plains'], cost: { wood: 20, stone: 15, gold: 10 }, yields: { gold: 6 }, desc: '+6 gold' },
    barracks: { name: 'Barracks', icon: '⚔️', terrain: ['plains', 'hills'], cost: { wood: 20, stone: 20 }, yields: {}, desc: 'Train soldiers, +3 defense here' },
};

const SOLDIER_COST = { gold: 10, food: 5 };
const OWNER_NAME = { player: 'Your empire', rival: 'The Crimson Horde' };

const EVENTS = [
    { text: 'A bountiful harvest! +10 🍞', kind: 'good', run: e => { e.food += 10; } },
    { text: 'Merchants pass through and pay tolls. +12 🪙', kind: 'good', run: e => { e.gold += 12; } },
    { text: 'Migrants arrive seeking a new home. +1 population', kind: 'good', when: e => e.pop < popCap('player'), run: e => { e.pop++; } },
    { text: 'Bandits raid your treasury. -10 🪙 (more soldiers would deter them)', kind: 'bad', when: e => e.soldiers < 3 && e.gold >= 10, run: e => { e.gold -= 10; } },
    { text: 'A storm topples your timber stacks. -6 🪵', kind: 'bad', when: e => e.wood >= 6, run: e => { e.wood -= 6; } },
];

let state;
let selected = null;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ---------- Map helpers ----------

function tileAt(x, y) {
    return x >= 0 && y >= 0 && x < W && y < H ? state.tiles[y * W + x] : null;
}

function neighbors(t) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => tileAt(t.x + dx, t.y + dy))
        .filter(Boolean);
}

function ownedTiles(owner) {
    return state.tiles.filter(t => t.owner === owner);
}

function borders(t, owner) {
    return neighbors(t).some(n => n.owner === owner);
}

function generateMap() {
    const bag = [['plains', 7], ['forest', 5], ['hills', 3], ['mountain', 2], ['water', 2]]
        .flatMap(([k, n]) => Array(n).fill(k));

    for (let attempt = 0; attempt < 100; attempt++) {
        const seeds = Array.from({ length: 22 }, () => ({ x: rand(0, W), y: rand(0, H), terrain: pick(bag) }));
        state.tiles = [];
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let best = null;
                let bestDist = Infinity;
                for (const s of seeds) {
                    const d = (s.x - x) ** 2 + (s.y - y) ** 2 + rand(0, 1.5);
                    if (d < bestDist) { bestDist = d; best = s; }
                }
                state.tiles.push({ x, y, terrain: best.terrain, owner: null, building: null, capital: null });
            }
        }

        for (const p of [PLAYER_START, RIVAL_START]) {
            const cap = tileAt(p.x, p.y);
            cap.terrain = 'plains';
            neighbors(cap).forEach(n => { if (n.terrain === 'water') n.terrain = 'plains'; });
        }

        if (landPathExists(tileAt(PLAYER_START.x, PLAYER_START.y), tileAt(RIVAL_START.x, RIVAL_START.y))) return;
    }
}

function landPathExists(from, to) {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
        const t = queue.shift();
        if (t === to) return true;
        for (const n of neighbors(t)) {
            if (n.terrain !== 'water' && !seen.has(n)) { seen.add(n); queue.push(n); }
        }
    }
    return false;
}

// ---------- Economy ----------

function newEmpire() {
    return { food: 20, wood: 25, stone: 10, gold: 30, pop: 3, soldiers: 0 };
}

function popCap(owner) {
    return 5 + ownedTiles(owner).filter(t => t.building === 'house').length * BUILDINGS.house.housing;
}

function income(owner) {
    const e = state.empires[owner];
    const producers = ownedTiles(owner).filter(t => t.building && Object.keys(BUILDINGS[t.building].yields).length);
    const eff = producers.length ? Math.min(1, e.pop / producers.length) : 1;
    // The capital always produces a little of everything.
    const inc = { food: 2, wood: 1, stone: 1, gold: 2 };
    for (const t of producers) {
        for (const [k, v] of Object.entries(BUILDINGS[t.building].yields)) inc[k] += Math.floor(v * eff);
    }
    if (owner === 'rival') { inc.food += 1; inc.gold += 2; }
    inc.gold += Math.floor(e.pop / 2) - Math.ceil(e.soldiers / 2);
    inc.food -= Math.ceil(e.pop / 2) + e.soldiers;
    return { inc, eff, workers: producers.length };
}

function applyIncome(owner) {
    const e = state.empires[owner];
    const { inc } = income(owner);
    const msgs = [];
    for (const k of Object.keys(RES)) e[k] += inc[k];

    if (e.gold < 0) {
        e.gold = 0;
        if (e.soldiers > 0) { e.soldiers--; msgs.push(['Unpaid soldiers desert your army.', 'bad']); }
    }
    if (e.food < 0) {
        e.food = 0;
        if (e.soldiers > 0) { e.soldiers--; msgs.push(['Hungry soldiers desert your army.', 'bad']); }
        else if (e.pop > 1) { e.pop--; msgs.push(['Famine! Your population shrinks.', 'bad']); }
    } else if (inc.food > 0 && e.pop < popCap(owner)) {
        e.pop++;
    }
    return msgs;
}

function canAfford(owner, cost) {
    const e = state.empires[owner];
    return Object.entries(cost).every(([k, v]) => e[k] >= v);
}

function pay(owner, cost) {
    const e = state.empires[owner];
    for (const [k, v] of Object.entries(cost)) e[k] -= v;
}

function costText(cost) {
    return Object.entries(cost).map(([k, v]) => `${v} ${RES[k].icon}`).join(' ');
}

// ---------- Actions (shared by player and AI) ----------

function claimCost(owner) {
    return { gold: 8 + 2 * ownedTiles(owner).length };
}

function canClaim(owner, t) {
    return !t.owner && t.terrain !== 'water' && borders(t, owner);
}

function claim(owner, t) {
    pay(owner, claimCost(owner));
    t.owner = owner;
}

function canBuild(owner, t, b) {
    return t.owner === owner && !t.building && !t.capital && BUILDINGS[b].terrain.includes(t.terrain);
}

function build(owner, t, b) {
    pay(owner, BUILDINGS[b].cost);
    t.building = b;
}

function hasBarracks(owner) {
    return ownedTiles(owner).some(t => t.building === 'barracks');
}

function canTrain(owner) {
    return hasBarracks(owner) && state.empires[owner].pop > 1 && canAfford(owner, SOLDIER_COST);
}

function train(owner) {
    const e = state.empires[owner];
    pay(owner, SOLDIER_COST);
    e.pop--;
    e.soldiers++;
}

function defense(t) {
    const e = state.empires[t.owner];
    return 1 + TERRAIN[t.terrain].defense + (t.building === 'barracks' ? 3 : 0) + (t.capital ? 4 : 0) + Math.floor(e.soldiers / 2);
}

function attack(attacker, t) {
    const a = state.empires[attacker];
    const d = state.empires[t.owner];
    const n = a.soldiers;
    const power = n * rand(0.75, 1.25);
    const resist = defense(t) * rand(0.75, 1.25);

    if (power > resist) {
        const losses = Math.min(n - 1, Math.round(n * rand(0.05, 0.25)));
        a.soldiers -= losses;
        if (d.soldiers > 0) d.soldiers--;
        const wasCapital = !!t.capital;
        t.owner = attacker;
        if (wasCapital) { t.capital = null; t.building = null; }
        return { won: true, losses, wasCapital };
    }
    const losses = Math.min(n, Math.max(1, Math.ceil(n * rand(0.3, 0.5))));
    a.soldiers -= losses;
    return { won: false, losses };
}

// ---------- Rival AI ----------

function aiBuildScore(me, b, inc, saturated) {
    const e = state.empires[me];
    const producer = Object.keys(BUILDINGS[b].yields).length > 0;
    if (b === 'farm' && inc.food <= 1) return 10;
    if (saturated && producer) return 1.5;
    switch (b) {
        case 'farm': return e.food > 50 ? 1 : 3;
        case 'house': return e.pop >= popCap(me) - 1 ? 8 : 0.5;
        case 'lumber': return inc.wood < 4 ? 7 : 3;
        case 'quarry': return inc.stone < 3 ? 6 : 3;
        case 'mine': return 5;
        case 'market': return 4;
        case 'barracks': return hasBarracks(me) ? 0.5 : (state.turn > 6 ? 9 : 1);
        default: return 0;
    }
}

function aiTurn(me = 'rival') {
    const enemy = me === 'rival' ? 'player' : 'rival';
    const e = state.empires[me];

    for (let i = 0; i < 2; i++) {
        const { inc, workers } = income(me);
        const saturated = workers >= e.pop;
        const candidates = [];
        for (const t of ownedTiles(me)) {
            for (const b of Object.keys(BUILDINGS)) {
                if (canBuild(me, t, b)) candidates.push({ t, b, score: aiBuildScore(me, b, inc, saturated) + Math.random() });
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        const wanted = candidates[0];
        if (!wanted || wanted.score < 2) break;
        // Save up for the most wanted building, but spend resources it doesn't need.
        const reserved = Object.keys(BUILDINGS[wanted.b].cost);
        const choice = canAfford(me, BUILDINGS[wanted.b].cost) ? wanted : candidates.find(c =>
            c.score >= 3 && canAfford(me, BUILDINGS[c.b].cost) &&
            !Object.keys(BUILDINGS[c.b].cost).some(k => reserved.includes(k)));
        if (!choice) break;
        build(me, choice.t, choice.b);
    }

    if (e.gold >= claimCost(me).gold + 5) {
        const value = { plains: 3, forest: 2.5, hills: 2.5, mountain: 2 };
        const ownedTerrain = new Set(ownedTiles(me).map(t => t.terrain));
        const foe = state.tiles.find(t => t.capital === enemy);
        // Expand toward the enemy so the empires eventually share a front.
        const pull = t => foe ? (Math.abs(t.x - foe.x) + Math.abs(t.y - foe.y)) * (state.turn > 10 ? 0.6 : 0.2) : 0;
        const score = t => value[t.terrain] + (ownedTerrain.has(t.terrain) ? 0 : 2) - pull(t) + Math.random();
        const options = state.tiles.filter(t => canClaim(me, t)).map(t => ({ t, s: score(t) }));
        if (options.length) {
            options.sort((a, b) => b.s - a.s);
            claim(me, options[0].t);
        }
    }

    const armyTarget = 2 + Math.floor(state.turn / 3);
    while (canTrain(me) && e.soldiers < armyTarget && e.pop > 4 && e.gold >= 20 && income(me).inc.food > 1) train(me);

    if (state.turn >= 12 && e.soldiers >= 4) {
        const targets = state.tiles.filter(t => t.owner === enemy && borders(t, me));
        targets.sort((a, b) => defense(a) - defense(b));
        const target = targets[0];
        if (target && e.soldiers > defense(target) * 1.4) {
            const label = tileName(target);
            const r = attack(me, target);
            if (r.won) {
                addLog(`The Crimson Horde seized your ${label}!`, 'bad');
                if (r.wasCapital) endGame(me === 'player');
            } else {
                addLog(`Your defenders repelled a Horde attack on your ${label}.`, 'good');
            }
        }
    }
}

// ---------- Turn flow ----------

function addLog(text, kind = '') {
    state.log.unshift({ turn: state.turn, text, kind });
    state.log.length = Math.min(state.log.length, 60);
}

function endTurn() {
    if (state.over) return;
    for (const [m, k] of applyIncome('player')) addLog(m, k);

    aiTurn();
    if (state.over) { save(); render(); return; }
    applyIncome('rival');

    if (Math.random() < 0.15) {
        const e = state.empires.player;
        const options = EVENTS.filter(ev => !ev.when || ev.when(e));
        if (options.length) {
            const ev = pick(options);
            ev.run(e);
            addLog(ev.text, ev.kind);
        }
    }

    state.turn++;
    state.attacked = false;
    save();
    render();
}

function endGame(won) {
    state.over = won ? 'won' : 'lost';
    addLog(won ? 'The Horde capital has fallen. Your empire reigns supreme!' : 'Your capital has fallen. Your empire is no more.', won ? 'good' : 'bad');
}

function newGame() {
    state = {
        turn: 1,
        tiles: [],
        empires: { player: newEmpire(), rival: newEmpire() },
        log: [],
        attacked: false,
        over: null,
    };
    generateMap();
    for (const [owner, p] of [['player', PLAYER_START], ['rival', RIVAL_START]]) {
        const cap = tileAt(p.x, p.y);
        cap.owner = owner;
        cap.capital = owner;
        neighbors(cap).forEach(n => { if (n.terrain !== 'water') n.owner = owner; });
    }
    selected = { ...PLAYER_START };
    addLog('Your people have founded a capital. Grow your empire and capture the Crimson Horde\'s fortress to win.', 'good');
    save();
    render();
}

function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

function load() {
    try {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY));
        if (s && Array.isArray(s.tiles) && s.tiles.length === W * H) return s;
    } catch { /* ignore corrupt or missing saves */ }
    return null;
}

// ---------- Player commands ----------

function selectedTile() {
    return selected ? tileAt(selected.x, selected.y) : null;
}

function handleAction(action, arg) {
    if (state.over) return;
    const t = selectedTile();
    const e = state.empires.player;

    if (action === 'claim' && t && canClaim('player', t) && canAfford('player', claimCost('player'))) {
        claim('player', t);
        addLog(`You claimed new ${TERRAIN[t.terrain].name.toLowerCase()}.`);
    } else if (action === 'build' && t && canBuild('player', t, arg) && canAfford('player', BUILDINGS[arg].cost)) {
        build('player', t, arg);
        addLog(`You built a ${BUILDINGS[arg].name}.`);
    } else if (action === 'train' && canTrain('player')) {
        train('player');
    } else if (action === 'attack' && t && t.owner === 'rival' && borders(t, 'player') && e.soldiers > 0 && !state.attacked) {
        state.attacked = true;
        const label = tileName(t);
        const r = attack('player', t);
        if (r.won) {
            addLog(`Victory! You captured the Horde's ${label} and lost ${r.losses} soldier${r.losses === 1 ? '' : 's'}.`, 'good');
            if (r.wasCapital) endGame(true);
        } else {
            addLog(`Your assault on the Horde's ${label} failed. ${r.losses} soldier${r.losses === 1 ? '' : 's'} fell.`, 'bad');
        }
    } else {
        return;
    }
    save();
    render();
}

// ---------- Rendering ----------

function tileName(t) {
    if (t.capital) return 'capital';
    if (t.building) return BUILDINGS[t.building].name.toLowerCase();
    return TERRAIN[t.terrain].name.toLowerCase();
}

function tileLabel(t) {
    const parts = [TERRAIN[t.terrain].name];
    if (t.capital) parts.push('Capital');
    else if (t.building) parts.push(BUILDINGS[t.building].name);
    if (t.owner) parts.push(OWNER_NAME[t.owner]);
    return parts.join(' · ');
}

function delta(v) {
    const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
    return `<span class="delta ${cls}">${v > 0 ? '+' : ''}${v}</span>`;
}

function renderMap() {
    document.getElementById('map').innerHTML = state.tiles.map(t => {
        const cls = ['tile', t.terrain];
        if (t.owner) cls.push(`own-${t.owner}`);
        if (selected && selected.x === t.x && selected.y === t.y) cls.push('selected');
        if (canClaim('player', t)) cls.push('claimable');
        const content = t.capital ? '🏰'
            : t.building ? BUILDINGS[t.building].icon
            : TERRAIN[t.terrain].glyph ? `<span class="glyph">${TERRAIN[t.terrain].glyph}</span>` : '';
        const label = tileLabel(t);
        return `<button class="${cls.join(' ')}" data-x="${t.x}" data-y="${t.y}" title="${label}" aria-label="${label}">${content}</button>`;
    }).join('');
}

function renderResources() {
    const e = state.empires.player;
    const { inc, eff, workers } = income('player');
    const res = Object.entries(RES).map(([k, r]) =>
        `<div class="res" title="${r.name}"><span>${r.icon} ${e[k]}</span>${delta(inc[k])}</div>`).join('');

    const warnings = [];
    if (eff < 1) warnings.push(`Not enough workers: ${workers} buildings but only ${e.pop} people. Output is at ${Math.round(eff * 100)}%.`);
    if (inc.food < 0) warnings.push('Food is running out. Build farms or your people will starve.');

    const trainHint = !hasBarracks('player') ? 'Build barracks first'
        : e.pop <= 1 ? 'Need more people'
        : `${costText(SOLDIER_COST)}, 1 person`;

    document.getElementById('resources').innerHTML = `
        <h2>Treasury</h2>
        <div class="res-grid">
            ${res}
            <div class="res" title="Population"><span>👥 ${e.pop} / ${popCap('player')}</span></div>
            <div class="res" title="Territory"><span>🗺️ ${ownedTiles('player').length} tiles</span></div>
        </div>
        ${warnings.map(w => `<p class="warn">${w}</p>`).join('')}
        <div class="army-row">
            <span>🛡️ ${e.soldiers} soldier${e.soldiers === 1 ? '' : 's'}</span>
            <button data-action="train" ${canTrain('player') && !state.over ? '' : 'disabled'} title="${trainHint}">Train <small>${trainHint}</small></button>
        </div>
        <p class="muted">Crimson Horde: ${ownedTiles('rival').length} tiles, ${state.empires.rival.soldiers} soldiers</p>`;
}

function renderTilePanel() {
    const el = document.getElementById('tile-panel');
    const t = selectedTile();
    if (!t) {
        el.innerHTML = '<h2>Land</h2><p class="muted">Select a tile on the map.</p>';
        return;
    }

    const e = state.empires.player;
    let info = `<p class="muted">${TERRAIN[t.terrain].name}${t.owner ? ` · ${OWNER_NAME[t.owner]}` : ' · Unclaimed'}</p>`;
    if (t.capital) info += '<p>🏰 Capital. Produces a little of everything.</p>';
    else if (t.building) info += `<p>${BUILDINGS[t.building].icon} ${BUILDINGS[t.building].name}: ${BUILDINGS[t.building].desc}</p>`;
    if (t.owner) info += `<p class="muted">Defense: ${defense(t)}</p>`;

    const actions = [];
    const locked = state.over ? 'disabled' : '';

    if (t.terrain === 'water') {
        info += '<p class="muted">Water cannot be settled.</p>';
    } else if (!t.owner) {
        if (canClaim('player', t)) {
            const cost = claimCost('player');
            actions.push(`<button class="primary" data-action="claim" ${canAfford('player', cost) ? locked : 'disabled'}>Claim land <small>${costText(cost)}</small></button>`);
        } else {
            info += '<p class="muted">Too far away. Expand toward it first.</p>';
        }
    } else if (t.owner === 'player' && !t.building && !t.capital) {
        const options = Object.entries(BUILDINGS).filter(([b]) => canBuild('player', t, b));
        for (const [b, def] of options) {
            actions.push(`<button data-action="build" data-arg="${b}" ${canAfford('player', def.cost) ? locked : 'disabled'} title="${def.desc}">${def.icon} ${def.name} <small>${def.desc} · ${costText(def.cost)}</small></button>`);
        }
    } else if (t.owner === 'rival') {
        if (borders(t, 'player')) {
            const reason = state.attacked ? 'Already attacked this turn'
                : e.soldiers === 0 ? 'You have no soldiers'
                : `Send ${e.soldiers} soldier${e.soldiers === 1 ? '' : 's'}`;
            const ok = e.soldiers > 0 && !state.attacked;
            actions.push(`<button class="primary" data-action="attack" ${ok ? locked : 'disabled'}>⚔️ Attack <small>${reason}</small></button>`);
        } else {
            info += '<p class="muted">Not on your border.</p>';
        }
    }

    el.innerHTML = `<h2>${t.capital ? 'Capital' : t.building ? BUILDINGS[t.building].name : TERRAIN[t.terrain].name}</h2>
        ${info}
        ${actions.length ? `<h3>${t.owner === 'player' ? 'Build' : 'Actions'}</h3><div class="actions">${actions.join('')}</div>` : ''}`;
}

function renderLog() {
    document.getElementById('log').innerHTML = state.log
        .map(l => `<li class="${l.kind}"><span class="t">T${l.turn}</span>${l.text}</li>`).join('');
}

function renderOverlay() {
    const overlay = document.getElementById('overlay');
    overlay.hidden = !state.over;
    if (!state.over) return;
    const won = state.over === 'won';
    document.getElementById('overlay-title').textContent = won ? '🏆 Victory!' : '💀 Defeat';
    document.getElementById('overlay-text').textContent = won
        ? `You conquered the Crimson Horde in ${state.turn} turns with an empire of ${ownedTiles('player').length} tiles.`
        : `The Crimson Horde took your capital on turn ${state.turn}. Try building more barracks and soldiers.`;
}

function render() {
    document.getElementById('turn').textContent = state.turn;
    document.getElementById('end-turn').disabled = !!state.over;
    renderMap();
    renderResources();
    renderTilePanel();
    renderLog();
    renderOverlay();
}

// ---------- Wiring ----------

document.getElementById('map').addEventListener('click', ev => {
    const btn = ev.target.closest('.tile');
    if (!btn) return;
    selected = { x: Number(btn.dataset.x), y: Number(btn.dataset.y) };
    render();
});

for (const id of ['resources', 'tile-panel']) {
    document.getElementById(id).addEventListener('click', ev => {
        const btn = ev.target.closest('button[data-action]');
        if (btn && !btn.disabled) handleAction(btn.dataset.action, btn.dataset.arg);
    });
}

document.getElementById('end-turn').addEventListener('click', endTurn);
document.getElementById('play-again').addEventListener('click', newGame);
// Two-step confirmation inside the page, since browser dialogs may be blocked.
let confirmTimer = null;
document.getElementById('new-game').addEventListener('click', ev => {
    const btn = ev.currentTarget;
    if (state.over || confirmTimer) {
        clearTimeout(confirmTimer);
        confirmTimer = null;
        btn.textContent = 'New game';
        newGame();
        return;
    }
    btn.textContent = 'Click again to restart';
    confirmTimer = setTimeout(() => { confirmTimer = null; btn.textContent = 'New game'; }, 3000);
});

state = load();
if (state) {
    selected = { ...PLAYER_START };
    render();
} else {
    newGame();
}
