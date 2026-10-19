'use strict';

// ---------- Player interface: selection, commands, panels and minimap ----------

const $ = id => document.getElementById(id);
const UI = { selected: [], placing: null, markers: [], drag: null, paused: false, idleIdx: 0, panelKey: '', msgSeen: 0, touch: false, pointers: new Map(), lastClick: { t: 0, id: 0 } };
const HOTKEYS = 'QERTYUFGZXCVBNM';

function fmtCost(cost) {
    return Object.entries(cost || {}).map(([k, v]) => `${RES_ICON[k]} ${v}`).join('  ');
}

function mine(e) {
    return e && e.owner === G.human && !e.dead;
}

function select(list, add) {
    const live = list.filter(e => e && !e.dead);
    if (add) {
        for (const e of live) if (!UI.selected.includes(e)) UI.selected.push(e);
    } else UI.selected = live;
    // Never mix own units with buildings or with things you do not control.
    const ownUnits = UI.selected.filter(e => mine(e) && e.kind === 'unit');
    if (ownUnits.length) UI.selected = ownUnits;
    else if (UI.selected.length > 1) UI.selected = UI.selected.slice(0, 1);
    UI.placing = null;
    UI.panelKey = '';
}

function selUnits() {
    return UI.selected.filter(e => mine(e) && e.kind === 'unit');
}

function selVillagers() {
    return selUnits().filter(u => u.def.cls === 'villager');
}

function selBuilding() {
    const b = UI.selected[0];
    return UI.selected.length === 1 && mine(b) && b.kind === 'building' ? b : null;
}

function marker(x, z, color) {
    UI.markers.push({ x, z, color, at: performance.now() });
    if (UI.markers.length > 12) UI.markers.shift();
}

// ---------- Commands from clicks ----------

function smartCommand(pick) {
    const units = selUnits();
    const b = selBuilding();
    const g = pick.g;
    if (!units.length) {
        if (b && b.def.trains && b.built) {
            b.rally = { x: g.x, y: g.z, tile: pick.tile, ent: pick.ent && pick.ent.id };
            marker(g.x, g.z, '#7dff7a');
        }
        return;
    }
    const e = pick.ent;
    const vills = units.filter(u => u.def.cls === 'villager');
    const others = units.filter(u => u.def.cls !== 'villager');
    if (e) {
        if (e.owner >= 0 && e.owner !== G.human && e.kind !== 'carcass') {
            cmdAttack(units, e);
            marker(e.x, e.y, '#ff6a5a');
            return;
        }
        if (e.kind === 'unit' && e.def.cls === 'animal') {
            cmdAttack(units, e);
            marker(e.x, e.y, '#ffe27a');
            return;
        }
        if (e.kind === 'carcass') {
            cmdGatherEnt(vills, e);
            if (others.length) cmdMove(others, e.x, e.y);
            marker(e.x, e.y, '#ffe27a');
            return;
        }
        if (mine(e) && e.kind === 'building') {
            if (vills.length) {
                if (!e.built || e.hp < e.maxHp) cmdBuild(vills, e);
                else if (e.type === 'farm') cmdGatherEnt(vills, e);
                else if (e.def.drop && vills.some(v => v.carry)) {
                    for (const v of vills) {
                        if (v.carry) { v.task = { type: 'gather', res: v.carry.res, returning: true, tile: v.lastTile, ent: v.lastEnt }; v.path = []; }
                        else cmdMove([v], e.x, e.y + e.def.size / 2 + 1);
                    }
                } else cmdMove(vills, e.x, e.y + e.def.size / 2 + 1);
            }
            if (others.length) cmdMove(others, e.x, e.y + e.def.size / 2 + 1);
            marker(e.x, e.y, '#7dff7a');
            return;
        }
    }
    if (pick.tile !== undefined) {
        cmdGatherTile(vills, pick.tile);
        if (others.length) cmdMove(others, g.x, g.z);
        marker(pick.tile % MAP_W, Math.floor(pick.tile / MAP_W), '#ffe27a');
        return;
    }
    cmdMove(units, g.x, g.z);
    marker(g.x, g.z, '#7dff7a');
}

function startPlacing(type) {
    if (!selVillagers().length) return;
    UI.placing = { type, tile: null, ok: false };
    UI.panelKey = '';
}

function placingTileAt(sx, sy) {
    const g = screenToGround(sx, sy);
    const n = BUILDING_TYPES[UI.placing.type].size;
    return [Math.round(g.x - (n - 1) / 2), Math.round(g.z - (n - 1) / 2)];
}

function confirmPlacing(keep) {
    const pl = UI.placing;
    if (!pl || !pl.tile) return;
    if (!pl.ok) { say('You cannot build there.', 'bad'); return; }
    const def = BUILDING_TYPES[pl.type];
    if (!canAfford(G.human, def.cost)) { say(`Not enough resources for a ${def.name.toLowerCase()}.`, 'bad'); UI.placing = null; return; }
    const b = tryPlace(G.human, pl.type, pl.tile[0], pl.tile[1], selVillagers());
    if (b) marker(b.x, b.y, '#7dff7a');
    if (!keep || !canAfford(G.human, def.cost)) UI.placing = null;
    UI.panelKey = '';
}

// ---------- Buttons ----------

function lockReason(owner, kind, key) {
    const p = player(owner);
    if (kind === 'build') {
        const d = BUILDING_TYPES[key];
        if (d.age > p.age) return `Requires the ${AGES[d.age].name}`;
    } else if (kind === 'unit') {
        const d = UNIT_TYPES[key];
        if (d.age > p.age) return `Requires the ${AGES[d.age].name}`;
        if (d.tech && !hasTech(owner, d.tech)) return `Requires ${TECHS[d.tech].name}`;
    } else if (kind === 'tech') {
        const t = TECHS[key];
        if (t.age > p.age) return `Requires the ${AGES[t.age].name}`;
    } else if (kind === 'age') {
        const r = ageReady(owner);
        if (r) return r;
    }
    return null;
}

function commandList() {
    const out = [];
    const vills = selVillagers();
    const units = selUnits();
    const b = selBuilding();
    if (vills.length && vills.length === units.length) {
        for (const type of BUILD_MENU) {
            const d = BUILDING_TYPES[type];
            if (d.age > player(G.human).age + 1) continue;
            out.push({ icon: d.icon, label: d.name, cost: d.cost, desc: buildingDesc(type), lock: lockReason(G.human, 'build', type), act: () => startPlacing(type), on: UI.placing && UI.placing.type === type });
        }
    }
    if (units.length) {
        out.push({ icon: '✋', label: 'Stop', desc: 'Stop what they are doing.', act: () => { for (const u of units) { u.task = null; u.path = []; } } });
        out.push({ icon: '🗑️', label: 'Dismiss', desc: 'Send these units away for good.', act: () => { for (const u of units) kill(u, null); select([]); } });
    }
    if (b && b.built) {
        for (const t of b.def.trains || []) {
            const d = UNIT_TYPES[t];
            if (d.age > player(G.human).age + 1) continue;
            out.push({ icon: d.icon, label: d.name, cost: unitCost(G.human, t), desc: unitDesc(t), lock: lockReason(G.human, 'unit', t), act: ev => { const n = ev && ev.shiftKey ? 5 : 1; for (let k = 0; k < n; k++) if (!enqueue(b, { unit: t })) { noAfford(unitCost(G.human, t)); break; } } });
        }
        if (b.type === 'tc') {
            const next = AGES[player(G.human).age + 1];
            const busy = [...G.ents.values()].some(e => e.owner === G.human && e.kind === 'building' && e.queue.some(q => q.age));
            if (next && !busy) out.push({ icon: '🏛️', label: next.name, cost: next.cost, desc: `Advance to the ${next.name} (${next.local}). Unlocks new buildings, units and technologies.`, lock: lockReason(G.human, 'age'), act: () => { if (!enqueue(b, { age: true })) noAfford(next.cost); } });
        }
        for (const [k, t] of Object.entries(TECHS)) {
            if (t.at !== b.type || hasTech(G.human, k)) continue;
            const queued = [...G.ents.values()].some(e => e.owner === G.human && e.kind === 'building' && e.queue.some(q => q.tech === k));
            if (queued || t.age > player(G.human).age + 1) continue;
            out.push({ icon: techIcon(k), label: t.name, cost: t.cost, desc: `${t.effect}${t.source ? ` <i>${t.source}.</i>` : ''}`, lock: lockReason(G.human, 'tech', k), act: () => { if (!enqueue(b, { tech: k })) noAfford(t.cost); } });
        }
    }
    if (b) out.push({ icon: '🗑️', label: b.built ? 'Demolish' : 'Cancel', desc: b.built ? 'Pull this building down.' : 'Cancel construction and get the resources back.', act: () => { if (!b.built) pay(G.human, b.def.cost, -1); kill(b, null); select([]); } });
    return out;
}

function techIcon(k) {
    return { plough: '🪓', bowsaw: '🪚', mining: '⛏️', wootz: '🗡️', dhanurveda: '🏹', ayurveda: '🌿', ironarmour: '🛡️', stepwell: '💧', ganita: '🔢', jyotisha: '🔭', rockets: '🚀', nalanda: '📚' }[k] || '📜';
}

function noAfford(cost) {
    const r = player(G.human).res;
    const lack = Object.entries(cost).filter(([k, v]) => r[k] < v).map(([k]) => RES_NAME[k].toLowerCase());
    if (lack.length) say(`Not enough ${lack.join(' and ')}.`, 'bad');
    else if (popOf(G.human).used >= popOf(G.human).cap) say('Build more houses first.', 'bad');
    else say('That queue is full.', 'bad');
}

function unitDesc(t) {
    const d = UNIT_TYPES[t];
    const bonus = d.bonus ? ` Strong against ${Object.keys(d.bonus).join(', ')}.` : '';
    return `${d.local ? `<i>${d.local}</i>. ` : ''}HP ${d.hp}, attack ${d.atk}, armour ${d.arm[0]}/${d.arm[1]}${d.range > 1.5 ? `, range ${d.range}` : ''}.${bonus}${d.onlyBuildings ? ' Attacks buildings only.' : ''}`;
}

function buildingDesc(t) {
    const d = BUILDING_TYPES[t];
    const bits = [];
    if (d.pop) bits.push(`+${d.pop} population`);
    if (d.drop) bits.push('resources can be dropped off here');
    if (d.trains) bits.push(`trains ${d.trains.map(u => UNIT_TYPES[u].name.toLowerCase()).join(', ')}`);
    if (d.atk) bits.push('shoots arrows at enemies');
    if (d.heal) bits.push('heals nearby units');
    if (d.food) bits.push(`${d.food} food, then reseed`);
    if (t === 'university') bits.push('research Indian sciences');
    if (d.counts || t === 'storehouse') bits.push('counts towards the next age');
    return `<i>${d.local}</i>. ${bits.join('; ')}.`;
}

// ---------- Panels ----------

function renderTop() {
    const p = player(G.human);
    const pop = popOf(G.human);
    $('resbar').innerHTML = RES_KEYS.map(k => `<span class="res" title="${RES_NAME[k]}">${RES_ICON[k]} ${Math.floor(p.res[k])}</span>`).join('')
        + `<span class="res${pop.used >= pop.cap ? ' short' : ''}" title="Population">👥 ${pop.used}<small>/${pop.cap}</small></span>`;
    $('age-name').textContent = AGES[p.age].name;
    const s = Math.floor(G.time);
    $('clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    $('idle-n').textContent = idleVillagers().length;
    $('btn-pause').textContent = UI.paused ? 'Resume' : 'Pause';
}

function taskText(u) {
    const t = u.task;
    if (!t) return u.moving ? 'Moving' : 'Idle';
    if (t.type === 'move') return 'Moving';
    if (t.type === 'attack') { const e = G.ents.get(t.ent); return e ? `Attacking ${e.def.name.toLowerCase()}` : 'Attacking'; }
    if (t.type === 'build') { const e = G.ents.get(t.ent); return e && e.built ? `Repairing ${e.def.name.toLowerCase()}` : `Building ${e ? e.def.name.toLowerCase() : ''}`; }
    if (t.type === 'gather') {
        const verb = { food: t.hunt ? 'Hunting' : 'Gathering food', wood: 'Chopping wood', stone: 'Mining stone', gold: 'Mining gold' }[t.res];
        return t.returning ? `Carrying ${t.res} home` : verb;
    }
    return '';
}

function renderInfo() {
    const sel = UI.selected.filter(e => !e.dead && (e.kind !== 'carcass' || e.food > 0));
    if (sel.length !== UI.selected.length) UI.selected = sel;
    const el = $('info');
    if (!sel.length) {
        const p = player(G.human);
        const next = AGES[p.age + 1];
        el.innerHTML = `<h3>${CIVS[p.civ].name} · ${AGES[p.age].name}</h3><div class="sub">${CIVS[p.civ].bonus}</div>`
            + (next ? `<div class="sub" style="margin-top:6px">Next: <b>${next.name}</b> — ${fmtCost(next.cost)}. ${ageReady(G.human) || 'Ready to research at the Town Center.'}</div>` : '')
            + `<div class="sub" style="margin-top:6px">${UI.touch ? 'Tap a unit to select it. Drag to look around, pinch to zoom.' : 'Click or drag-select units. Right-click to command.'}</div>`;
        return;
    }
    if (sel.length > 1) {
        const groups = {};
        for (const u of sel) (groups[u.type] = groups[u.type] || []).push(u);
        el.innerHTML = `<h3>${sel.length} units</h3><div class="group">${Object.entries(groups).map(([t, us]) => `<button data-type="${t}" title="Select only ${UNIT_TYPES[t].name}">${UNIT_TYPES[t].icon} ${us.length}</button>`).join('')}</div>`;
        el.querySelectorAll('[data-type]').forEach(btn => btn.onclick = () => select(sel.filter(u => u.type === btn.dataset.type)));
        return;
    }
    const e = sel[0];
    const owner = e.owner >= 0 ? player(e.owner).name : e.kind === 'unit' && e.def.cls === 'animal' ? 'Wild animal' : '';
    let html = `<span class="big-icon">${e.def.icon || '🍖'}</span><h3>${e.def.name}</h3><div class="sub">${e.def.local ? `${e.def.local} · ` : ''}${owner}</div>`;
    if (e.hp !== undefined) html += `<div class="bar"><i style="width:${Math.max(0, e.hp / e.maxHp) * 100}%"></i></div><div class="stats"><span>❤️ ${Math.ceil(e.hp)}/${e.maxHp}</span>`;
    if (e.kind === 'unit') {
        if (e.def.cls !== 'animal') html += `<span>⚔️ ${unitAtk(e)}</span><span>🛡️ ${armourOf(e, false)}/${armourOf(e, true)}</span>${e.def.range > 1.5 ? `<span>🎯 ${unitRange(e)}</span>` : ''}`;
        html += `</div><div class="sub">${e.def.cls === 'animal' ? `${e.def.food} food when hunted` : taskText(e)}${e.carry && e.carry.amt >= 1 ? ` · carrying ${Math.floor(e.carry.amt)} ${e.carry.res}` : ''}</div>`;
    } else if (e.kind === 'building') {
        html += '</div>';
        if (!e.built) html += `<div class="sub">Under construction: ${Math.floor(e.progress * 100)}%</div>`;
        else if (e.type === 'farm') html += `<div class="sub">${Math.floor(e.food)} food left</div>`;
        else if (e.def.pop) html += `<div class="sub">Shelters ${e.def.pop} people</div>`;
        if (mine(e) && e.queue.length) {
            html += `<div class="queue">${e.queue.map((q, k) => `<button data-q="${k}" title="Cancel">${q.unit ? UNIT_TYPES[q.unit].icon : q.tech ? techIcon(q.tech) : '🏛️'}${k === 0 ? `<i style="width:${Math.min(1, q.t / q.time) * 100}%"></i>` : ''}</button>`).join('')}</div>`;
        }
    } else if (e.kind === 'carcass') {
        html += `<div class="sub">${Math.floor(e.food)} food left</div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-q]').forEach(btn => btn.onclick = () => { cancelQueue(e, +btn.dataset.q); UI.panelKey = ''; });
}

let cmdItems = [];

function renderCommands() {
    cmdItems = commandList();
    const el = $('commands');
    el.innerHTML = cmdItems.map((c, k) => `<button class="cmd" data-k="${k}"${c.lock ? ' aria-disabled="true" style="opacity:.42"' : ''}${c.on ? ' style="border-color:var(--saffron)"' : ''}>${c.icon}<span>${c.label}</span>${k < HOTKEYS.length ? `<kbd>${HOTKEYS[k]}</kbd>` : ''}</button>`).join('');
    el.querySelectorAll('.cmd').forEach(btn => {
        const c = cmdItems[+btn.dataset.k];
        btn.onclick = ev => runCommand(c, ev);
        btn.onpointerenter = () => showHint(btn, c);
        btn.onpointerleave = hideHint;
    });
}

function runCommand(c, ev) {
    if (!c) return;
    if (c.lock) { say(c.lock, 'bad'); return; }
    c.act(ev);
    UI.panelKey = '';
    hideHint();
}

function showHint(btn, c) {
    if (UI.touch) return;
    const r = player(G.human).res;
    const cost = c.cost ? `<div class="cost">${Object.entries(c.cost).map(([k, v]) => `<span class="${r[k] < v ? 'no' : ''}">${RES_ICON[k]} ${v}</span>`).join('')}</div>` : '';
    const h = $('hint');
    h.innerHTML = `<b>${c.label}</b><div>${c.desc || ''}</div>${cost}${c.lock ? `<div class="why">${c.lock}</div>` : ''}`;
    h.hidden = false;
    const br = btn.getBoundingClientRect();
    const hr = h.getBoundingClientRect();
    h.style.left = `${Math.max(8, Math.min(window.innerWidth - hr.width - 8, br.left + br.width / 2 - hr.width / 2))}px`;
    h.style.top = `${Math.max(8, br.top - hr.height - 8)}px`;
}

function hideHint() {
    $('hint').hidden = true;
}

function renderMessages() {
    const list = $('messages');
    for (const m of G.messages) {
        if (m.t <= UI.msgSeen) continue;
        UI.msgSeen = m.t;
        const li = document.createElement('li');
        li.className = m.kind;
        li.textContent = m.text;
        list.appendChild(li);
        setTimeout(() => li.remove(), 8000);
        while (list.children.length > 5) list.firstChild.remove();
    }
}

function panelSignature() {
    const s = UI.selected;
    const b = selBuilding();
    const p = player(G.human);
    return [s.map(e => e.id).join(','), p.age, p.techs.length, b ? b.queue.map(q => q.unit || q.tech || 'a').join('') + b.built : '', UI.placing ? UI.placing.type : '', [...G.ents.values()].filter(e => e.owner === G.human && e.kind === 'building' && e.queue.some(q => q.age || q.tech)).length].join('|');
}

function updatePanels() {
    renderTop();
    renderInfo();
    const key = panelSignature();
    if (key !== UI.panelKey) { UI.panelKey = key; renderCommands(); }
    else {
        // Refresh locks and affordability without rebuilding the buttons.
        const items = commandList();
        $('commands').querySelectorAll('.cmd').forEach((btn, k) => {
            const c = items[k];
            if (!c) return;
            cmdItems[k] = c;
            btn.style.opacity = c.lock || (c.cost && !canAfford(G.human, c.cost)) ? '.42' : '';
        });
    }
    renderMessages();
}

// ---------- Minimap ----------

let miniBase = null;
const MINI_TINT = { grassland: '#6c9443', forest: '#3b5c27', jungle: '#2b4a22', savanna: '#a89a5a', desert: '#dcc08a', badlands: '#b0653a', snow: '#c4c8b8', peak: '#8a8378', marsh: '#4f6a3c', beach: '#e6d3a0' };

function buildMiniBase() {
    const c = document.createElement('canvas');
    c.width = MAP_W;
    c.height = MAP_H;
    const g = c.getContext('2d');
    const img = g.createImageData(MAP_W, MAP_H);
    const col = new THREE.Color();
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        const i = idx(x, y);
        const gr = ground[i];
        const o = objects[i];
        let hex = gr === '~' || gr === '=' ? '#3a7aa0' : gr === 'o' ? '#24506e' : gr === 'p' ? '#b08d5c' : MINI_TINT[biome[i]] || '#6c9443';
        if (o === 'M') hex = '#8a8378';
        col.set(hex);
        col.convertLinearToSRGB();
        img.data[i * 4] = col.r * 255;
        img.data[i * 4 + 1] = col.g * 255;
        img.data[i * 4 + 2] = col.b * 255;
        img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    miniBase = { canvas: c, ctx: g, img };
}

function drawMinimap() {
    const mm = $('minimap');
    const g = mm.getContext('2d');
    const W = mm.width;
    const H = mm.height;
    const img = miniBase.ctx.createImageData(MAP_W, MAP_H);
    const base = miniBase.img.data;
    for (let i = 0; i < MAP_W * MAP_H; i++) {
        const v = G.revealAll || fogVisible[i] ? 1 : fogExplored[i] ? 0.5 : 0;
        let r = base[i * 4];
        let gg = base[i * 4 + 1];
        let b = base[i * 4 + 2];
        const ro = RESOURCE_OBJECTS[objects[i]];
        if (ro && v) {
            if (ro.res === 'wood') { r = 40; gg = 78; b = 30; } else if (ro.res === 'gold') { r = 240; gg = 200; b = 60; } else if (ro.res === 'stone') { r = 190; gg = 190; b = 180; } else { r = 200; gg = 40; b = 70; }
        }
        img.data[i * 4] = r * v;
        img.data[i * 4 + 1] = gg * v;
        img.data[i * 4 + 2] = b * v;
        img.data[i * 4 + 3] = 255;
    }
    miniBase.ctx.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(miniBase.canvas, 0, 0, W, H);
    const sx = W / MAP_W;
    const sy = H / MAP_H;
    for (const e of G.ents.values()) {
        if (e.dead || e.kind === 'carcass' || !seenByHuman(e)) continue;
        g.fillStyle = e.owner >= 0 ? player(e.owner).color : '#e8d8a8';
        if (e.kind === 'building') g.fillRect(e.tx * sx, e.ty * sy, Math.max(3, e.def.size * sx), Math.max(3, e.def.size * sy));
        else g.fillRect(e.x * sx - 1, e.y * sy - 1, 2.5, 2.5);
    }
    if (G.alertPos && G.time - G.alertAt < 4 && Math.floor(G.time * 3) % 2) {
        g.strokeStyle = '#ff4a3a';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(G.alertPos[0] * sx, G.alertPos[1] * sy, 8, 0, Math.PI * 2);
        g.stroke();
    }
    const pts = [[0, 0], [viewW, 0], [viewW, viewH], [0, viewH]].map(([x, y]) => screenToGround(x, y));
    g.strokeStyle = '#ffffffcc';
    g.lineWidth = 1;
    g.beginPath();
    pts.forEach((p, k) => (k ? g.lineTo(p.x * sx, p.z * sy) : g.moveTo(p.x * sx, p.z * sy)));
    g.closePath();
    g.stroke();
}

function miniToWorld(ev) {
    const r = $('minimap').getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * MAP_W, z: ((ev.clientY - r.top) / r.height) * MAP_H };
}

// ---------- Helpers for buttons and keys ----------

function idleVillagers() {
    return [...G.ents.values()].filter(e => e.owner === G.human && !e.dead && e.type === 'villager' && !e.task && !e.moving);
}

function lookAt(x, z) {
    camTarget.x = x;
    camTarget.z = z + 1;
}

function nextIdle() {
    const list = idleVillagers();
    if (!list.length) { say('No idle villagers.', ''); return; }
    const v = list[UI.idleIdx++ % list.length];
    select([v]);
    lookAt(v.x, v.y);
}

function selectArmy() {
    const list = [...G.ents.values()].filter(e => e.owner === G.human && !e.dead && e.kind === 'unit' && e.def.cls !== 'villager');
    if (!list.length) { say('You have no soldiers yet.', ''); return; }
    select(list);
}

function selectTC() {
    const tc = [...G.ents.values()].find(e => e.owner === G.human && !e.dead && e.type === 'tc');
    if (tc) { select([tc]); lookAt(tc.x, tc.y); }
}

// ---------- Input ----------

const keys = new Set();

function initInput() {
    const cv = $('world');
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', e => { e.preventDefault(); camDist *= Math.exp(e.deltaY * 0.0012); clampCamera(); }, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => keys.clear());

    const mm = $('minimap');
    let miniDrag = false;
    mm.addEventListener('contextmenu', e => e.preventDefault());
    mm.addEventListener('pointerdown', e => {
        const w = miniToWorld(e);
        if (e.button === 2 && selUnits().length) { cmdMove(selUnits(), w.x, w.z); marker(w.x, w.z, '#7dff7a'); return; }
        miniDrag = true;
        mm.setPointerCapture(e.pointerId);
        lookAt(w.x, w.z);
    });
    mm.addEventListener('pointermove', e => { if (miniDrag) { const w = miniToWorld(e); lookAt(w.x, w.z); } });
    mm.addEventListener('pointerup', () => { miniDrag = false; });

    $('btn-idle').onclick = nextIdle;
    $('btn-army').onclick = selectArmy;
    $('btn-pause').onclick = () => setPaused(!UI.paused);
}

function onDown(e) {
    if (!G) return;
    if (e.pointerType === 'touch') UI.touch = true;
    $('world').setPointerCapture(e.pointerId);
    UI.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, button: e.button, type: e.pointerType, t: performance.now() });
    const pts = [...UI.pointers.values()];
    if (pts.length === 2) {
        UI.pinch = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), dist: camDist };
        UI.drag = null;
        return;
    }
    const r = $('world').getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (e.pointerType === 'mouse' && e.button === 0 && !UI.placing) UI.drag = { x0: x, y0: y, x1: x, y1: y, box: false, mode: 'select' };
    else if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2)) UI.drag = { x0: x, y0: y, x1: x, y1: y, mode: 'pan', button: e.button, cam: { ...camTarget } };
    else if (e.pointerType !== 'mouse') UI.drag = { x0: x, y0: y, x1: x, y1: y, mode: 'pan', touch: true, cam: { ...camTarget } };
    else UI.drag = { x0: x, y0: y, x1: x, y1: y, mode: 'place' };
}

function onMove(e) {
    if (!G) return;
    const r = $('world').getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    UI.mouse = { x, y, inside: e.target === $('world'), type: e.pointerType };
    const p = UI.pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (UI.pinch && UI.pointers.size >= 2) {
        const pts = [...UI.pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        camDist = UI.pinch.dist * (UI.pinch.d / Math.max(20, d));
        clampCamera();
        return;
    }
    if (UI.placing && (!UI.drag || UI.drag.mode !== 'pan' || !UI.drag.moved)) UI.placing.tile = placingTileAt(x, y);
    const d = UI.drag;
    if (!d || !p) return;
    d.x1 = x;
    d.y1 = y;
    const moved = Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > (d.touch ? 10 : 6);
    if (moved) d.moved = true;
    if (d.mode === 'select' && moved) d.box = true;
    if (d.mode === 'pan' && d.moved) {
        const a = screenToGround(d.x0, d.y0);
        const b = screenToGround(x, y);
        camTarget.x = d.cam.x - (b.x - a.x);
        camTarget.z = d.cam.z - (b.z - a.z);
        clampCamera();
        d.cam = { ...camTarget };
        d.x0 = x;
        d.y0 = y;
    }
}

function onUp(e) {
    const p = UI.pointers.get(e.pointerId);
    UI.pointers.delete(e.pointerId);
    if (UI.pinch) { if (UI.pointers.size < 2) { UI.pinch = null; UI.drag = null; } return; }
    const d = UI.drag;
    UI.drag = null;
    if (!d || !p || !G) return;
    const shift = e.shiftKey;
    if (d.mode === 'select') {
        if (d.box) { select(unitsInBox(d.x0, d.y0, d.x1, d.y1), shift); return; }
        clickSelect(d.x1, d.y1, shift);
        return;
    }
    if (d.mode === 'place') {
        if (UI.placing && e.button === 0) { UI.placing.tile = placingTileAt(d.x1, d.y1); confirmPlacing(shift); }
        else if (UI.placing) UI.placing = null;
        return;
    }
    if (d.mode === 'pan' && !d.moved) {
        if (d.touch) { touchTap(d.x1, d.y1, performance.now() - p.t > 550); return; }
        if (d.button === 2) {
            if (UI.placing) { UI.placing = null; return; }
            smartCommand(pickAt(d.x1, d.y1));
        }
    }
}

function clickSelect(x, y, shift) {
    const pick = pickAt(x, y);
    const e = pick.ent;
    if (!e) { if (!shift) select([]); return; }
    const now = performance.now();
    if (mine(e) && e.kind === 'unit' && UI.lastClick.id === e.id && now - UI.lastClick.t < 350) {
        const v = viewBounds();
        select([...G.ents.values()].filter(o => o.owner === G.human && !o.dead && o.type === e.type && o.x > v.x0 && o.x < v.x1 && o.y > v.z0 && o.y < v.z1));
        return;
    }
    UI.lastClick = { t: now, id: e.id };
    if (shift && mine(e) && e.kind === 'unit' && UI.selected.includes(e)) { UI.selected = UI.selected.filter(o => o !== e); UI.panelKey = ''; return; }
    select([e], shift);
}

// Touch: tap to select your own things; with units selected, a tap elsewhere is a command.
function touchTap(x, y, long) {
    if (UI.placing) {
        const t = placingTileAt(x, y);
        if (UI.placing.tile && UI.placing.tile[0] === t[0] && UI.placing.tile[1] === t[1]) confirmPlacing(false);
        else UI.placing.tile = t;
        return;
    }
    const pick = pickAt(x, y);
    const e = pick.ent;
    if (long) { select(e ? [e] : []); return; }
    const units = selUnits();
    if (e && mine(e) && (!units.length || e.kind === 'unit' || !(units.some(u => u.def.cls === 'villager') && (!e.built || e.type === 'farm' || e.hp < e.maxHp)))) {
        if (units.length && e.kind === 'unit' && units.includes(e)) { select([e]); return; }
        if (units.length && e.kind === 'unit' && e.def.cls === units[0].def.cls) { select([e], true); return; }
        select([e]);
        return;
    }
    if (units.length || selBuilding()) { smartCommand(pick); return; }
    select(e ? [e] : []);
}

function onKey(e) {
    if (!G || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === 'escape') {
        if (UI.placing) UI.placing = null;
        else if (!$('pausebox').hidden) setPaused(false);
        else select([]);
        return;
    }
    if (k === 'p') { setPaused(!UI.paused); return; }
    if (UI.paused) return;
    if (k === 'delete' || k === 'backspace') {
        const c = commandList().find(c => c.label === 'Dismiss' || c.label === 'Demolish' || c.label === 'Cancel');
        if (c) c.act();
        return;
    }
    if (k === 'h') { selectTC(); return; }
    if (k === '.') { nextIdle(); return; }
    if (k === ',') { selectArmy(); return; }
    if (k === ' ' && G.alertPos) { lookAt(G.alertPos[0], G.alertPos[1]); e.preventDefault(); return; }
    // Hotkeys apply only while the matching letter is not a camera key, unless shift is held.
    const hk = HOTKEYS.indexOf(e.key.toUpperCase());
    const items = commandList();
    if (hk >= 0 && items[hk]) { runCommand(items[hk], e); e.preventDefault(); }
}

function setPaused(on) {
    UI.paused = on;
    $('pausebox').hidden = !on;
}

function edgeAndKeyScroll(dt) {
    let dx = 0;
    let dz = 0;
    if (keys.has('arrowleft') || keys.has('a')) dx--;
    if (keys.has('arrowright') || keys.has('d')) dx++;
    if (keys.has('arrowup') || keys.has('w')) dz--;
    if (keys.has('arrowdown') || keys.has('s')) dz++;
    const m = UI.mouse;
    if (m && m.inside && m.type === 'mouse' && !UI.drag) {
        const edge = 14;
        if (m.x < edge) dx--;
        if (m.x > viewW - edge) dx++;
        if (m.y < edge) dz--;
        if (m.y > viewH - edge) dz++;
    }
    if (dx || dz) {
        const sp = camDist * 1.1 * dt;
        camTarget.x += dx * sp;
        camTarget.z += dz * sp;
        clampCamera();
    }
}
