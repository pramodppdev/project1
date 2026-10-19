'use strict';

// ---------- Player interface: selection, commands, panels and minimap ----------

const $ = id => document.getElementById(id);
const UI = { selected: [], placing: null, markers: [], drag: null, paused: false, idleIdx: 0, panelKey: '', msgSeen: 0, touch: false, pointers: new Map(), lastClick: { t: 0, id: 0 } };
const HOTKEYS = 'QERTYUFGZXCVBNM';

function fmtCost(cost) {
    return Object.entries(cost || {}).map(([k, v]) => `<span class="cost-item">${icon(k, 14)}${v}</span>`).join(' ');
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
    const vills = units.filter(canGather);
    const others = units.filter(u => !canGather(u));
    if (e) {
        if (e.type === 'village' && e.owner !== G.human) {
            // Soldiers standing in a settlement win it over.
            const army = units.filter(u => u.def.cls !== 'villager');
            if (e.owner >= 0 && relation(G.human, e.owner) === 'ally') { cmdMove(units, e.x, e.y + 2.5); return; }
            if (e.owner >= 0 && relation(G.human, e.owner) === 'neutral' && !confirmWar(e.owner)) return;
            if (e.owner >= 0 && relation(G.human, e.owner) === 'neutral') declareWar(G.human, e.owner);
            cmdMove(units, e.x, e.y + 2.5);
            marker(e.x, e.y, '#ffd34a');
            say(army.length ? `March on ${e.name}! Keep soldiers inside it, with no defenders left, to win it over.` : 'Only soldiers can win over a settlement. Villagers will just walk there.', 'info');
            return;
        }
        if (e.owner >= 0 && e.owner !== G.human && e.kind !== 'carcass') {
            const rel = relation(G.human, e.owner);
            if (rel === 'ally') { cmdMove(units, e.x, e.y + 1.5); return; }
            if (rel === 'neutral' && !confirmWar(e.owner)) return;
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

// Attacking a neutral kingdom means war, so ask once by needing a second click.
function confirmWar(owner) {
    if (UI.warAsk && UI.warAsk.owner === owner && performance.now() - UI.warAsk.at < 6000) { UI.warAsk = null; return true; }
    UI.warAsk = { owner, at: performance.now() };
    say(`${CIVS[player(owner).civ].name} is at peace with you. Give the order again to declare war.`, 'bad');
    return false;
}

function lineTiles(a, b) {
    const out = [];
    let [x, y] = a;
    const [x1, y1] = b;
    out.push([x, y]);
    let guard = 0;
    while ((x !== x1 || y !== y1) && guard++ < 80) {
        const dx = x1 - x;
        const dy = y1 - y;
        if (Math.abs(dx) * (Math.abs(b[1] - a[1]) + 1) >= Math.abs(dy) * (Math.abs(b[0] - a[0]) + 1)) x += Math.sign(dx);
        else y += Math.sign(dy);
        out.push([x, y]);
    }
    return out;
}

function confirmLine() {
    const pl = UI.placing;
    const tiles = pl.lineTiles || [];
    const builders = selUnits().filter(canGather).filter(u => !isChild(u));
    const placed = [];
    for (const [x, y] of tiles) {
        if (!inMap(x, y) || !fogExplored[idx(x, y)]) continue;
        const b = tryPlace(G.human, pl.type, x, y, []);
        if (b) placed.push(b);
        else if (!canAfford(G.human, BUILDING_TYPES[pl.type].cost)) { say('Not enough stone to finish the wall.', 'bad'); break; }
    }
    if (placed.length) {
        placed.sort((a, b) => Math.hypot(a.x - builders[0].x, a.y - builders[0].y) - Math.hypot(b.x - builders[0].x, b.y - builders[0].y));
        cmdBuild(builders, placed[0]);
        marker(placed[0].x, placed[0].y, '#7dff7a');
    } else say('A wall cannot be built there.', 'bad');
    UI.placing = null;
    UI.panelKey = '';
    $('cursor-tip').hidden = true;
}

function startPlacing(type) {
    if (!selUnits().some(canGather)) return;
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
    if (!pl.ok) { say(mayBuild(G.human, pl.type, pl.tile[0], pl.tile[1]) ? 'You cannot build there.' : 'That land belongs to another kingdom.', 'bad'); return; }
    const def = BUILDING_TYPES[pl.type];
    if (!canAfford(G.human, def.cost)) { say(`Not enough resources for a ${def.name.toLowerCase()}.`, 'bad'); UI.placing = null; return; }
    const b = tryPlace(G.human, pl.type, pl.tile[0], pl.tile[1], selUnits().filter(canGather));
    if (b) marker(b.x, b.y, '#7dff7a');
    if (!keep || !canAfford(G.human, def.cost)) { UI.placing = null; $('cursor-tip').hidden = true; }
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
    const builders = vills.filter(v => !isChild(v));
    if (vills.length && vills.length === units.length && builders.length) {
        for (const type of BUILD_MENU) {
            const d = BUILDING_TYPES[type];
            if (d.age > player(G.human).age + 1) continue;
            out.push({ img: PORTRAIT[type], label: d.name, cost: d.cost, desc: buildingDesc(type), lock: lockReason(G.human, 'build', type), act: () => startPlacing(type), on: UI.placing && UI.placing.type === type });
        }
    }
    if (vills.length && vills.length === units.length) {
        const allGuards = vills.every(v => v.guard);
        const post = hasBuilt(G.human, 'thana');
        out.push({ svg: icon('police', 28), label: allGuards ? 'Stand down' : 'Make guard', desc: allGuards ? 'These guards go back to ordinary life.' : 'Enrol as police guards (Rakshak). Guards keep working but take up their lathis and gather to defend whenever enemies come near your homes.', lock: allGuards || post ? null : 'Requires a Police Post (Thana)', act: () => { for (const v of vills) if (!isChild(v)) v.guard = !allGuards; } });
    }
    if (units.length) {
        out.push({ svg: icon('stop', 26), label: 'Stop', desc: 'Stop what they are doing.', act: () => { for (const u of units) { u.task = null; u.path = []; } } });
        out.push({ svg: icon('dismiss', 26), label: 'Dismiss', desc: 'Send these people away from the kingdom for good.', act: () => { for (const u of units) leaveKingdom(u); select([]); } });
    }
    if (b && b.built && b.type === 'village') {
        const next = SETTLEMENT_LEVELS[b.level + 1];
        if (next) out.push({ img: PORTRAIT.village, label: `Grow to ${next.name}`, cost: next.cost, desc: `Turn ${b.name} into a ${next.name.toLowerCase()} (${next.local}): ${next.pop} homes, more tribute, wider borders${next.arrows ? `, and archers on its walls` : ''}.`, lock: player(G.human).age < next.age ? `Requires the ${AGES[next.age].name}` : null, act: () => { const r = developSettlement(G.human, b); if (r) say(r, 'bad'); } });
    }
    if (b && b.built) {
        for (const t of b.def.trains || []) {
            const d = UNIT_TYPES[t];
            if (d.age > player(G.human).age + 1) continue;
            const label = t === 'villager' ? 'New settler' : d.name;
            const desc = t === 'villager' ? 'A young man or woman from a nearby village joins your kingdom. Families also grow by themselves when couples have children.' : unitDesc(t);
            out.push({ img: t === 'villager' ? PORTRAIT.villager_m : PORTRAIT[t], label, cost: unitCost(G.human, t), desc, lock: lockReason(G.human, 'unit', t), act: ev => { const n = ev && ev.shiftKey ? 5 : 1; for (let k = 0; k < n; k++) if (!enqueue(b, { unit: t })) { noAfford(unitCost(G.human, t)); break; } } });
        }
        if (b.type === 'tc') {
            const next = AGES[player(G.human).age + 1];
            const busy = [...G.ents.values()].some(e => e.owner === G.human && e.kind === 'building' && e.queue.some(q => q.age));
            if (next && !busy) out.push({ svg: icon('age', 28), label: next.name, cost: next.cost, desc: `Advance to the ${next.name} (${next.local}). Unlocks new buildings, units and technologies.`, lock: lockReason(G.human, 'age'), act: () => { if (!enqueue(b, { age: true })) noAfford(next.cost); } });
        }
        for (const [k, t] of Object.entries(TECHS)) {
            if (t.at !== b.type || hasTech(G.human, k)) continue;
            const queued = [...G.ents.values()].some(e => e.owner === G.human && e.kind === 'building' && e.queue.some(q => q.tech === k));
            if (queued || t.age > player(G.human).age + 1) continue;
            out.push({ svg: icon(k, 28), label: t.name, cost: t.cost, desc: `${t.effect}${t.source ? ` <i>${t.source}.</i>` : ''}`, lock: lockReason(G.human, 'tech', k), act: () => { if (!enqueue(b, { tech: k })) noAfford(t.cost); } });
        }
        if (b.type === 'market') {
            const pr = player(G.human).prices;
            for (const r of ['food', 'wood', 'stone']) {
                out.push({ svg: `<span class="trade">${icon('buy', 14)}${icon(r, 22)}</span>`, label: `Buy ${r}`, cost: { gold: Math.round(pr[r]) }, desc: `Buy 100 ${r} for ${Math.round(pr[r])} gold. Prices rise as you buy.`, act: () => { if (!trade(G.human, r, true)) noAfford({ gold: Math.round(pr[r]) }); } });
                out.push({ svg: `<span class="trade">${icon('sell', 14)}${icon(r, 22)}</span>`, label: `Sell ${r}`, cost: { [r]: 100 }, desc: `Sell 100 ${r} for ${Math.round(pr[r] * 0.75)} gold.`, act: () => { if (!trade(G.human, r, false)) noAfford({ [r]: 100 }); } });
            }
        }
    }
    if (b) out.push({ svg: icon('demolish', 26), label: b.built ? 'Demolish' : 'Cancel', desc: b.built ? 'Pull this building down.' : 'Cancel construction and get the resources back.', act: () => { if (!b.built) pay(G.human, b.def.cost, -1); kill(b, null); select([]); } });
    return out;
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
    $('resbar').innerHTML = RES_KEYS.map(k => `<span class="res" title="${RES_NAME[k]}">${icon(k, 20)}${Math.floor(p.res[k])}</span>`).join('')
        + `<span class="res${pop.used >= pop.cap ? ' short' : ''}" title="Population: people / homes">${icon('pop', 20)}${pop.used}<small>/${pop.cap}</small></span>`
        + `<button class="res mood" id="mood-btn" title="Happiness of your people">${moodIcon(p.mood, 20)}${Math.round(p.mood)}</button>`;
    $('mood-btn').onclick = () => openPeople('mood');
    $('age-name').textContent = AGES[p.age].name;
    const rt = realmTitle(G.human);
    $('realm-title').textContent = `${CIVS[p.civ].name} ${rt.realm} · ${rt.n} ${rt.n === 1 ? 'settlement' : 'settlements'}`;
    $('btn-alarm').innerHTML = `${icon('bell', 18)}<span>${p.alarm ? 'All clear' : 'Alarm'}</span>`;
    $('btn-alarm').classList.toggle('ringing', !!p.alarm || !!p.threat);
    const offers = G.offers.filter(o => o.to === G.human).length;
    $('btn-kingdoms').innerHTML = `${icon('ally', 18)}<span>Kingdoms</span>${offers ? ` <b>${offers}</b>` : ''}`;
    const s = Math.floor(G.time);
    const year = Math.floor(G.time / YEAR) + 1;
    $('clock').textContent = `Year ${year} · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    $('idle-n').textContent = idleVillagers().length;
    $('btn-pause').innerHTML = `${icon(UI.paused ? 'play' : 'pause', 16)}<span>${UI.paused ? 'Resume' : 'Pause'}</span>`;
    const f = p.festival;
    const fb = $('festival');
    if (f) {
        fb.hidden = false;
        fb.className = `fest-${f.kind}`;
        fb.innerHTML = `<b>${f.name}</b> · ${f.local}`;
    } else fb.hidden = true;
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

function skillBars(u) {
    return `<div class="skills">${Object.entries(SKILLS).map(([k, name]) => {
        const v = u.person.skills[k];
        return `<div class="skill" title="${name}: ${skillLevel(v)} (${Math.floor(v)}/100)"><span>${name}</span><i style="--v:${v}%"></i><b>${skillLevel(v)}</b></div>`;
    }).join('')}</div>`;
}

function personLine(u) {
    const a = Math.floor(ageOf(u));
    const pl = player(u.owner);
    const stage = a < WORK_AGE ? (u.person.female ? 'Little girl' : 'Little boy') : a < ADULT_AGE ? (u.person.female ? 'Girl' : 'Boy') : a >= ELDER_AGE ? (u.person.female ? 'Elder woman' : 'Elder man') : u.person.female ? 'Woman' : 'Man';
    const bits = [`${stage}, ${a}`];
    const office = officeHeld(u);
    if (office) bits.unshift(`${icon(office.key === 'mukhiya' ? 'crown' : 'office', 14)} ${office.title} (${office.role.toLowerCase()})`);
    if (u.guard) bits.push(`${icon('police', 14)} Police guard`);
    if (u.def.cls !== 'villager') bits.unshift(`${icon('star', 14)} ${RANKS[rankOf(u)][1]}${u.person.kills ? ` · ${u.person.kills} defeated` : ''}`);
    return bits.join(' · ');
}

function familyLine(u) {
    const fam = familyOf(u);
    const out = [];
    if (fam) out.push(`<button class="link" data-family="${fam.id}">${fam.name}</button>`);
    if (u.person.spouse) {
        const s = G.ents.get(u.person.spouse);
        if (s && !s.dead) out.push(`${u.person.female ? 'wife of' : 'husband of'} <button class="link" data-person="${s.id}">${s.person.name}</button>`);
    }
    if (u.person.parents) out.push(`${u.person.female ? 'daughter' : 'son'} of ${u.person.parents.join(' and ')}`);
    return out.join(' · ');
}

function renderInfo() {
    const sel = UI.selected.filter(e => !e.dead && (e.kind !== 'carcass' || e.food > 0));
    if (sel.length !== UI.selected.length) UI.selected = sel;
    const el = $('info');
    if (!sel.length) {
        const p = player(G.human);
        const next = AGES[p.age + 1];
        const fams = p.families.size;
        el.innerHTML = `<div class="head"><div><h3>${CIVS[p.civ].name} · ${AGES[p.age].name}</h3><div class="sub">${CIVS[p.civ].bonus}</div></div></div>`
            + (next ? `<div class="sub">Next: <b>${next.name}</b> ${fmtCost(next.cost)} — ${ageReady(G.human) || 'ready to research at the Town Center.'}</div>` : '')
            + `<div class="sub">${fams} families · ${moodIcon(p.mood, 14)} ${moodWord(p.mood)} · next festival: ${nextFestival()}</div>`
            + `<div class="sub">${UI.touch ? 'Tap a person to select. Drag to look around, pinch to zoom.' : 'Click or drag-select people. Right-click to give orders.'}</div>`;
        return;
    }
    if (sel.length > 1) {
        const groups = {};
        for (const u of sel) {
            const k = u.type === 'villager' ? (isChild(u) ? 'children' : 'villager') : u.type;
            (groups[k] = groups[k] || []).push(u);
        }
        el.innerHTML = `<h3>${sel.length} selected</h3><div class="group">${Object.entries(groups).map(([t, us]) => `<button data-type="${t}" title="Select only these">${t === 'children' ? `<img src="${PORTRAIT.child_m}" alt="">` : `<img src="${t === 'villager' ? PORTRAIT.villager_m : PORTRAIT[t]}" alt="">`}<b>${us.length}</b></button>`).join('')}</div>`
            + `<div class="names">${sel.slice(0, 14).map(u => `<button class="link" data-person="${u.id}">${u.person ? u.person.name : u.def.name}</button>`).join(', ')}${sel.length > 14 ? ` and ${sel.length - 14} more` : ''}</div>`;
        el.querySelectorAll('[data-type]').forEach(btn => btn.onclick = () => select(sel.filter(u => (u.type === 'villager' ? (isChild(u) ? 'children' : 'villager') : u.type) === btn.dataset.type)));
        wireLinks(el);
        return;
    }
    const e = sel[0];
    const owner = e.owner >= 0 ? `${player(e.owner).name}${e.owner !== G.human ? ` · ${{ ally: 'ally', neutral: 'neutral', enemy: 'enemy' }[relation(G.human, e.owner)]}` : ''}` : e.kind === 'unit' && e.def.cls === 'animal' ? 'Wild animal' : e.owner === -2 ? 'Independent' : '';
    const pic = portraitFor(e);
    const title = e.person ? e.person.name : e.def.name;
    const sub = e.person ? `${e.def.name}${e.def.local ? ` (${e.def.local})` : ''} · ${owner}` : `${e.def.local ? `${e.def.local} · ` : ''}${owner}`;
    let html = `<div class="head">${pic ? `<img class="portrait" src="${pic}" alt="">` : ''}<div class="who"><h3>${title}</h3><div class="sub">${sub}</div>`;
    if (e.hp !== undefined) html += `<div class="bar"><i style="width:${Math.max(0, e.hp / e.maxHp) * 100}%"></i></div><div class="stats"><span>${icon('heart', 14)} ${Math.ceil(e.hp)}/${e.maxHp}</span>`;
    if (e.kind === 'unit') {
        if (e.def.cls !== 'animal') html += `<span>${icon('sword', 14)} ${Math.round(unitAtk(e) * 10) / 10}</span><span>${icon('shield', 14)} ${armourOf(e, false)}/${armourOf(e, true)}</span>${e.def.range > 1.5 ? `<span>${icon('range', 14)} ${unitRange(e)}</span>` : ''}`;
        html += '</div></div></div>';
        if (e.person) html += `<div class="sub">${personLine(e)}</div><div class="sub">${familyLine(e)}</div>`;
        const st = e.person && e.def.cls === 'villager' ? stageOf(e) : 'adult';
        const doing = st === 'infant' ? 'Too young to work — plays near home' : st === 'school' ? 'Pupil at the Gurukul, learning every trade' : st === 'college' ? `Student at the University, studying ${SKILLS[studyStream(e)].toLowerCase()} until 18` : taskText(e);
        html += `<div class="sub doing">${e.def.cls === 'animal' ? `${e.def.food} food when hunted` : doing}${e.carry && e.carry.amt >= 1 ? ` · carrying ${Math.floor(e.carry.amt)} ${icon(e.carry.res, 14)}` : ''}</div>`;
        if (e.person && e.owner === G.human) {
            const best = bestSkill(e);
            html += `<div class="sub best">${best && best[1] >= 1 ? `Best at ${SKILLS[best[0]].toLowerCase()}: ${skillLevel(best[1])} (${Math.floor(best[1])})` : 'Still learning every trade'}</div>`;
            html += skillBars(e);
        }
    } else if (e.kind === 'building') {
        html += '</div></div></div>';
        if (!e.built) html += `<div class="sub">Under construction: ${Math.floor(e.progress * 100)}%</div>`;
        else if (e.type === 'farm') html += `<div class="sub">${Math.floor(e.food)} food left${wellNear(e) ? ' · watered by a well (+10%)' : ''}</div>`;
        else if (e.def.pop && e.type !== 'village') {
            const fam = [...player(e.owner).families.values()].find(f => f.home === e.id);
            html += `<div class="sub">Shelters ${e.def.pop + (e.type === 'house' && hasTech(e.owner, 'pucca') ? 3 : 0)} people${fam ? ` · home of <button class="link" data-family="${fam.id}">${fam.name}</button>` : e.type === 'house' ? ' · empty, waiting for a newly-wed couple' : ''}</div>`;
        }
        if (e.type === 'village') {
            const L = SETTLEMENT_LEVELS[e.level];
            html = html.replace(`<h3>${e.def.name}</h3>`, `<h3>${e.name}</h3>`).replace(`${e.def.local ? `${e.def.local} · ` : ''}${owner}`, `${L.name} (${L.local}) · ${e.owner >= 0 ? player(e.owner).name : 'Independent'}`);
            html += `<div class="sub">About ${e.people} people · ${e.owner >= 0 ? `pays ${Math.round(L.tribute * 0.75 * 60)} goods a minute in tribute · shelters ${L.pop}` : `free, defended by its own militia (${Math.round(e.militia)})`}${L.arrows ? ` · ${L.arrows} archers on the walls` : ''}</div>`;
            if (e.capture) html += `<div class="sub">${e.capture.owner === G.human ? 'Your soldiers are winning it over' : `${CIVS[player(e.capture.owner).civ].name} is taking it`}: ${Math.floor(e.capture.p)}%</div><div class="bar"><i style="width:${e.capture.p}%;background:${player(e.capture.owner).color}"></i></div>`;
            else if (e.owner !== G.human) html += `<div class="sub">${e.owner >= 0 && relation(G.human, e.owner) === 'ally' ? 'Held by your ally.' : 'Right-click it with soldiers selected to win it over.'}</div>`;
        }
        if (e.type === 'shmashan') html += `<div class="sub">${(e.pyreUntil || 0) > G.time ? 'A pyre is burning. The family grieves.' : 'The dead are given their last rites here.'}</div>`;
        if (e.type === 'panchayat') { const m = G.ents.get(player(e.owner).mukhiya); html += `<div class="sub">${m ? `Mukhiya: <button class="link" data-person="${m.id}">${m.person.name}</button> (all work +5%)` : 'Choosing a Mukhiya…'}</div>`; }
        if (e.type === 'gurukul') html += '<div class="sub">Children aged 5 and up learn every trade here.</div>';
        if (e.type === 'well') html += '<div class="sub">Lifts spirits and waters farms within 5 steps (+10% food).</div>';
        if (mine(e) && e.queue.length) {
            html += `<div class="queue">${e.queue.map((q, k) => `<button data-q="${k}" title="Cancel">${q.unit ? `<img src="${q.unit === 'villager' ? PORTRAIT.villager_m : PORTRAIT[q.unit]}" alt="">` : q.tech ? icon(q.tech, 24) : icon('age', 24)}${k === 0 ? `<i style="width:${Math.min(1, q.t / q.time) * 100}%"></i>` : ''}</button>`).join('')}</div>`;
        }
    } else if (e.kind === 'carcass') {
        html += `</div></div><div class="sub">${Math.floor(e.food)} food left</div>`;
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-q]').forEach(btn => btn.onclick = () => { cancelQueue(e, +btn.dataset.q); UI.panelKey = ''; });
    wireLinks(el);
}

function wireLinks(el) {
    el.querySelectorAll('[data-person]').forEach(btn => btn.onclick = () => { const u = G.ents.get(+btn.dataset.person); if (u && !u.dead) { select([u]); lookAt(u.x, u.y); } });
    el.querySelectorAll('[data-family]').forEach(btn => btn.onclick = () => openPeople('families', +btn.dataset.family));
}

function moodWord(m) {
    return m >= 80 ? 'joyful' : m >= 65 ? 'content' : m >= 45 ? 'uneasy' : m >= 25 ? 'unhappy' : 'miserable';
}

function nextFestival() {
    const yearT = (G.time / FESTIVAL_CYCLE) % 1;
    const next = FESTIVALS.find(f => f.at > yearT) || FESTIVALS[0];
    const wait = ((next.at - yearT + 1) % 1) * FESTIVAL_CYCLE;
    return `${next.name} in ${Math.ceil(wait / 60) > 1 ? `${Math.ceil(wait / 60)} min` : `${Math.ceil(wait)} s`}`;
}

let cmdItems = [];

function renderCommands() {
    cmdItems = commandList();
    const el = $('commands');
    el.innerHTML = cmdItems.map((c, k) => `<button class="cmd${c.on ? ' on' : ''}" data-k="${k}"${c.lock ? ' aria-disabled="true"' : ''}>${c.img ? `<img src="${c.img}" alt="">` : c.svg}<span>${c.label}</span>${k < HOTKEYS.length ? `<kbd>${HOTKEYS[k]}</kbd>` : ''}</button>`).join('');
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
    const cost = c.cost ? `<div class="cost">${Object.entries(c.cost).map(([k, v]) => `<span class="${r[k] < v ? 'no' : ''}">${icon(k, 14)} ${v}</span>`).join('')}</div>` : '';
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
            btn.classList.toggle('dim', !!(c.lock || (c.cost && !canAfford(G.human, c.cost))));
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

let TER_RGB = [];

function drawMinimap() {
    if (TER_RGB.g !== G) { TER_RGB = G.players.map(p => { const c = new THREE.Color(p.color).convertLinearToSRGB(); return [c.r * 255, c.g * 255, c.b * 255]; }); TER_RGB.g = G; }
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
        const t = territory ? territory[i] : 0;
        if (t && v) {
            const c = TER_RGB[t - 1];
            r = r * 0.55 + c[0] * 0.45;
            gg = gg * 0.55 + c[1] * 0.45;
            b = b * 0.55 + c[2] * 0.45;
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
        g.fillStyle = e.owner >= 0 ? player(e.owner).color : e.owner === -2 ? '#f6ead2' : '#e8d8a8';
        if (e.type === 'village') {
            g.strokeStyle = '#120d18';
            g.lineWidth = 1;
            g.beginPath();
            g.arc((e.x + 0.5) * sx, (e.y + 0.5) * sy, 2 + e.level, 0, Math.PI * 2);
            g.fill();
            g.stroke();
        } else if (e.kind === 'building') g.fillRect(e.tx * sx, e.ty * sy, Math.max(2, e.def.size * sx), Math.max(2, e.def.size * sy));
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

    $('btn-people').innerHTML = `${icon('people', 18)}<span>People</span>`;
    $('btn-idle').innerHTML = `${icon('idle', 18)}<span>Idle</span> <b id="idle-n">0</b>`;
    $('btn-army').innerHTML = `${icon('army', 18)}<span>Army</span>`;
    $('btn-people').onclick = () => openPeople('families');
    $('btn-kingdoms').onclick = () => openPeople('kingdoms');
    $('btn-alarm').onclick = () => soundAlarm(G.human, !player(G.human).alarm);
    $('people-close').onclick = closePeople;
    document.querySelectorAll('#people .tabs [data-tab]').forEach(b => b.onclick = () => openPeople(b.dataset.tab));
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
    else {
        UI.drag = { x0: x, y0: y, x1: x, y1: y, mode: 'place' };
        if (UI.placing && BUILDING_TYPES[UI.placing.type].line && e.button === 0) UI.placing.lineStart = placingTileAt(x, y);
    }
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
    if (e.pointerType === 'mouse' && UI.mouse.inside && !UI.drag) updateHover(x, y, e.clientX, e.clientY);
    else if (!UI.mouse.inside) { UI.hover = null; $('cursor-tip').hidden = true; }
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
        if (UI.placing && e.button === 0 && UI.placing.lineStart) { UI.placing.tile = placingTileAt(d.x1, d.y1); UI.placing.lineTiles = lineTiles(UI.placing.lineStart, UI.placing.tile); confirmLine(); }
        else if (UI.placing && e.button === 0) { UI.placing.tile = placingTileAt(d.x1, d.y1); confirmPlacing(shift); }
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
        if (BUILDING_TYPES[UI.placing.type].line) {
            // First tap marks where the wall starts, the second where it ends.
            if (!UI.placing.lineStart) { UI.placing.lineStart = t; UI.placing.tile = t; say('Now tap where the wall should end.', 'info'); }
            else { UI.placing.tile = t; UI.placing.lineTiles = lineTiles(UI.placing.lineStart, t); confirmLine(); }
            return;
        }
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
        else if (!$('people').hidden) closePeople();
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
    if (k === 'k') { if ($('people').hidden || peopleTab !== 'kingdoms') openPeople('kingdoms'); else closePeople(); return; }
    if (k === 'b') { soundAlarm(G.human, !player(G.human).alarm); return; }
    if (k === 'l') { if ($('people').hidden) openPeople('families'); else closePeople(); return; }
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

// ---------- Hover: what is under the cursor and what a right-click would do ----------

let hoverAt = 0;

function updateHover(x, y, cx, cy) {
    const now = performance.now();
    if (now - hoverAt < 70) return;
    hoverAt = now;
    const tip = $('cursor-tip');
    const cv = $('world');
    if (UI.placing) {
        UI.hover = null;
        tip.hidden = false;
        const d = BUILDING_TYPES[UI.placing.type];
        tip.innerHTML = d.line ? `<b>${d.name}</b> ${UI.placing.lineStart ? `${UI.placing.lineOk || 0} pieces · ${icon('stone', 14)} ${(UI.placing.lineOk || 0) * d.cost.stone}` : 'Press and drag to draw a line'} · right-click to cancel` : `<b>${d.name}</b> ${UI.placing.ok ? 'Click to place' : '<span class="no">Blocked here</span>'} · right-click to cancel`;
        placeTip(tip, cx, cy);
        cv.style.cursor = 'copy';
        return;
    }
    const pick = pickAt(x, y);
    UI.hover = pick;
    const units = selUnits();
    const vills = units.filter(u => u.def.cls === 'villager' && canWork(u));
    let what = '';
    let act = '';
    let cursor = 'default';
    const e = pick.ent;
    if (e) {
        what = e.person ? `<b>${e.person.name}</b> ${e.def.name.toLowerCase()}, ${Math.floor(ageOf(e))}` : `<b>${e.def.name}</b>`;
        if (e.owner >= 0 && e.owner !== G.human) what += ` · <span class="no">${player(e.owner).name}</span>`;
        if (e.kind === 'carcass') what += ` · ${Math.floor(e.food)} food`;
        if (e.kind === 'building' && e.type === 'farm' && e.built) what += ` · ${Math.floor(e.food)} food`;
        if (units.length) {
            if (e.owner >= 0 && e.owner !== G.human && e.kind !== 'carcass') { act = 'Attack'; cursor = 'crosshair'; }
            else if (e.kind === 'unit' && e.def.cls === 'animal') { act = vills.length ? 'Hunt' : 'Attack'; cursor = 'crosshair'; }
            else if (e.kind === 'carcass' && vills.length) { act = 'Gather food'; cursor = 'pointer'; }
            else if (mine(e) && e.kind === 'building' && vills.length) {
                act = !e.built ? 'Help build' : e.hp < e.maxHp ? 'Repair' : e.type === 'farm' ? 'Farm here' : e.def.drop && vills.some(v => v.carry) ? 'Drop off' : 'Go here';
                cursor = 'pointer';
            }
        }
    } else if (pick.tile !== undefined) {
        const r = tileRes(pick.tile);
        const names = { T: 'Tree', J: 'Banyan tree', P: 'Pine', Y: 'Bamboo', L: 'Palm', G: 'Mangrove', c: 'Acacia', $: 'Gold mine', '%': 'Stone quarry', '*': 'Berry bushes' };
        what = `<b>${names[objects[pick.tile]] || 'Resource'}</b> · ${Math.ceil(r.left)} ${icon(r.res, 14)}`;
        if (vills.length) { act = { food: 'Gather berries', wood: 'Chop wood', stone: 'Quarry stone', gold: 'Mine gold' }[r.res]; cursor = 'pointer'; }
    }
    cv.style.cursor = cursor;
    if (!what) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.innerHTML = what + (act ? `<div class="act">Right-click: ${act}</div>` : '');
    placeTip(tip, cx, cy);
}

function placeTip(tip, cx, cy) {
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(window.innerWidth - w - 8, cx + 16)}px`;
    tip.style.top = `${Math.max(8, cy - 34)}px`;
}

// ---------- People sheet: families, happiness and the chronicle ----------

let peopleTab = 'families';

function openPeople(tab, famId) {
    peopleTab = tab || peopleTab;
    $('people').hidden = false;
    document.querySelectorAll('#people .tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === peopleTab));
    renderPeople(famId);
}

function closePeople() {
    $('people').hidden = true;
}

function renderPeople(famId) {
    const p = player(G.human);
    const body = $('people-body');
    if (peopleTab === 'mood') {
        body.innerHTML = `<div class="mood-big">${moodIcon(p.mood, 40)}<div><b>${Math.round(p.mood)}</b> — your people are ${moodWord(p.mood)}<div class="sub">Happiness changes how fast everyone works (${Math.round((moodMult(G.human) - 1) * 100) >= 0 ? '+' : ''}${Math.round((moodMult(G.human) - 1) * 100)}%) and how often families have children.</div></div></div>`
            + `<table class="mood-parts">${p.moodParts.map(([n, v]) => `<tr><td>${n}</td><td class="${v < 0 ? 'no' : 'yes'}">${v > 0 ? '+' : ''}${v}</td></tr>`).join('')}</table>`
            + `<h4>Festivals</h4><div class="fest-list">${FESTIVALS.map(f => `<div class="fest-${f.kind}"><b>${f.name}</b> <span class="sub">${f.local}</span><div class="sub">${f.text}</div></div>`).join('')}</div><div class="sub">Next: ${nextFestival()}. A temple doubles the joy of every festival.</div>`;
        return;
    }
    if (peopleTab === 'government') {
        const head = G.ents.get(p.mukhiya);
        const council = hasBuilt(G.human, 'panchayat');
        const office = hasBuilt(G.human, 'karyalaya');
        const card = (u, title, role, extra) => `<div class="officer">${u ? `<img src="${portraitFor(u)}" alt="">` : '<div class="empty"></div>'}<div><b>${title}</b><div class="sub">${role}</div>${u ? `<button class="link" data-person="${u.id}">${u.person.name}</button> <span class="sub">${Math.floor(ageOf(u))}${extra ? ` · ${extra}` : ''}</span>` : '<span class="sub">Vacant</span>'}</div></div>`;
        let html = `<div class="sub summary">${council ? `Next election in ${Math.max(0, Math.ceil(((p.nextElection || G.time) - G.time) / YEAR))} years (every ${ELECTION_YEARS} years). Every grown-up votes, first for their own family.` : 'Build a Village Council (Panchayat) so the people can elect a Mukhiya.'}</div>`;
        html += `<div class="officers">${card(head, `${icon('crown', 16)} Mukhiya`, 'Village head: everyone works 5% faster', head ? `${Math.round(reputation(head))} respect` : '')}`;
        for (const [k, o] of Object.entries(OFFICES)) {
            const u = officerOf(G.human, k);
            const sk = k === 'police' ? 'fight' : k;
            html += card(u, `${icon(k === 'police' ? 'police' : k === 'fight' ? 'sword' : k === 'build' ? 'office' : k, 16)} ${o.title}`, `${o.role}${office ? '' : ' — needs a Government Office'}`, u ? `${skillLevel(u.person.skills[sk])} (${Math.floor(u.person.skills[sk])}) · +${Math.round(u.person.skills[sk] * 0.15)}%` : '');
        }
        html += '</div>';
        const last = p.lastElection;
        if (last) html += `<h4>${icon('vote', 16)} Election of year ${last.year}</h4><div class="races">${last.races.map(r => `<div class="race"><b>${r.office}</b> <span class="sub">${r.title}</span><ul>${r.results.map((x, k) => `<li class="${k ? '' : 'won'}"><button class="link" data-person="${x.id}">${x.name}</button><i style="--w:${Math.round(100 * x.votes / Math.max(1, r.results.reduce((a, y) => a + y.votes, 0)))}%"></i><span>${x.votes}</span></li>`).join('')}</ul></div>`).join('')}</div>`;
        const guards = [...G.ents.values()].filter(e => e.owner === G.human && !e.dead && e.guard).length;
        const students = [...G.ents.values()].filter(e => e.owner === G.human && !e.dead && e.person && (stageOf(e) === 'school' || stageOf(e) === 'college'));
        html += `<h4>Schools and police</h4><div class="sub">${hasBuilt(G.human, 'gurukul') ? `${students.filter(e => stageOf(e) === 'school').length} pupils at the Gurukul` : 'No Gurukul: children work in the fields from age 6'} · ${hasBuilt(G.human, 'university') ? `${students.filter(e => stageOf(e) === 'college').length} students at the University` : 'No University yet'} · ${guards} police guards${hasBuilt(G.human, 'thana') ? '' : ' (build a Police Post to enrol them)'}</div>`;
        body.innerHTML = html;
        wireLinks(body);
        body.querySelectorAll('[data-person]').forEach(btn => btn.addEventListener('click', closePeople));
        return;
    }
    if (peopleTab === 'kingdoms') {
        const offers = G.offers.filter(o => o.to === G.human);
        const rows = G.players.filter(q => q.id !== G.human).sort((a, b) => (a.defeated - b.defeated) || (Math.hypot(a.start[0] - p.start[0], a.start[1] - p.start[1]) - Math.hypot(b.start[0] - p.start[0], b.start[1] - p.start[1])));
        let html = offers.length ? `<div class="offers">${offers.map((o, k) => `<div class="offer">${icon(o.what === 'peace' ? 'peace' : 'ally', 20)} <b style="color:${player(o.from).color}">${CIVS[player(o.from).civ].name}</b> ${o.what === 'peace' ? 'asks for peace.' : 'offers you an alliance.'} <button class="primary" data-offer="${k}" data-yes="1">Accept</button><button data-offer="${k}" data-yes="0">Refuse</button></div>`).join('')}</div>` : '';
        html += `<table class="kingdoms"><tr><th>Kingdom</th><th>Lands</th><th>Strength</th><th>Opinion of you</th><th>Relation</th><th></th></tr>${rows.map(q => {
            const rel = relation(G.human, q.id);
            const op = q.defeated ? '' : opinionOf(q.id, G.human);
            const acts = q.defeated ? '<span class="sub">Defeated</span>'
                : rel === 'enemy' ? `<button data-act="peace" data-k="${q.id}">${icon('peace', 16)} Ask peace</button>`
                    : rel === 'ally' ? `<button data-act="gift" data-k="${q.id}">${icon('gift', 16)} Gift 100 gold</button><button data-act="break" data-k="${q.id}">Break alliance</button>`
                        : `<button data-act="alliance" data-k="${q.id}">${icon('ally', 16)} Propose alliance</button><button data-act="gift" data-k="${q.id}">${icon('gift', 16)} Gift</button><button data-act="war" data-k="${q.id}">${icon('war', 16)} War</button>`;
            return `<tr class="${q.defeated ? 'gone' : ''}"><td><span class="swatch" style="background:${q.color}"></span><b>${CIVS[q.civ].name}</b><div class="sub">${CIVS[q.civ].leader} · ${AGES[q.age].name}</div></td><td>${settlementsOf(q.id).length}</td><td>${Math.round(strength(q.id))}</td><td class="${op < 0 ? 'no' : op > 0 ? 'yes' : ''}">${op}</td><td><span class="rel rel-${rel}">${{ ally: 'Ally', neutral: 'Neutral', enemy: 'At war' }[rel]}</span></td><td class="acts">${acts}</td></tr>`;
        }).join('')}</table>`;
        html += '<p class="sub">Allies share what they see and join your wars of defence. Gifts and common enemies raise opinion; war and taking their villages lower it.</p>';
        body.innerHTML = html;
        body.querySelectorAll('[data-offer]').forEach(b => b.onclick = () => { answerOffer(offers[+b.dataset.offer], b.dataset.yes === '1'); renderPeople(); });
        body.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
            const q = +b.dataset.k;
            const act = b.dataset.act;
            if (act === 'war') declareWar(G.human, q);
            else if (act === 'gift') { if (!sendTribute(G.human, q, 'gold', 100)) say('You need 100 gold to send a gift.', 'bad'); else say(`You send 100 gold to ${CIVS[player(q).civ].name}.`, 'good'); }
            else if (act === 'break') { setRelation(G.human, q, 'neutral'); G.opinion[q][G.human] -= 40; say(`You end your alliance with ${CIVS[player(q).civ].name}.`, 'bad'); }
            else { const r = propose(G.human, q, act); if (r) say(r, 'bad'); }
            renderPeople();
        });
        return;
    }
    if (peopleTab === 'chronicle') {
        body.innerHTML = p.chronicle.length ? `<ol class="chronicle">${p.chronicle.map(c => `<li class="${c.kind}"><span class="when">Year ${Math.floor(c.t / YEAR) + 1}</span>${c.text}</li>`).join('')}</ol>` : '<p class="sub">Nothing has happened yet. Weddings, births, festivals and deaths will be written here.</p>';
        return;
    }
    const fams = [...p.families.values()].sort((a, b) => b.members.size - a.members.size);
    const people = [...G.ents.values()].filter(e => e.owner === G.human && !e.dead && e.person);
    const kids = people.filter(e => isChild(e)).length;
    const elders = people.filter(e => ageOf(e) >= ELDER_AGE).length;
    const women = people.filter(e => e.person.female).length;
    const head = G.ents.get(p.mukhiya);
    body.innerHTML = `<div class="sub summary">${people.length} people in ${fams.length} families · ${women} women, ${people.length - women} men · ${kids} children · ${elders} elders${head ? ` · Mukhiya ${icon('crown', 14)} <button class="link" data-person="${head.id}">${head.person.name}</button>` : ' · build a Village Council to choose a Mukhiya'}</div>`
        + `<div class="families">${fams.map(f => {
            const members = [...f.members].map(id => G.ents.get(id)).filter(m => m && !m.dead).sort((a, b) => ageOf(b) - ageOf(a));
            const headM = familyHead(f);
            const home = f.home && G.ents.get(f.home);
            return `<section class="family${f.id === famId ? ' focus' : ''}" id="fam-${f.id}"><h4>${f.name}</h4><div class="sub">${home && !home.dead ? `Lives in the ${home.def.name.toLowerCase()}` : 'No home yet'} · ${members.length} ${members.length === 1 ? 'member' : 'members'}</div><ul>${members.map(m => {
                const best = bestSkill(m);
                const tag = m === headM ? '<span class="tag">Head</span>' : '';
                const job = ageOf(m) < WORK_AGE ? 'at play' : m.def.cls !== 'villager' ? RANKS[rankOf(m)][1] : taskText(m).toLowerCase();
                return `<li><img src="${portraitFor(m)}" alt=""><button class="link" data-person="${m.id}">${m.person.name}</button>${tag}<span class="sub">${m.person.female ? '♀' : '♂'} ${Math.floor(ageOf(m))} · ${job}${best && best[1] >= 25 ? ` · ${skillLevel(best[1])} ${SKILL_WORD[best[0]]}` : ''}</span></li>`;
            }).join('')}</ul></section>`;
        }).join('')}</div>`;
    body.querySelectorAll('[data-person]').forEach(btn => btn.onclick = () => { const u = G.ents.get(+btn.dataset.person); if (u && !u.dead) { closePeople(); select([u]); lookAt(u.x, u.y); } });
    if (famId) { const el = $(`fam-${famId}`); if (el) el.scrollIntoView({ block: 'center' }); }
}
