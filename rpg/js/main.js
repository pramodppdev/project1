'use strict';

// ---------- Main loop ----------

let last = performance.now();
let hudClock = 0;
let spawnClock = 0;

function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (!uiOpen()) {
        player.time += dt / DAY_SECONDS;
        if (player.time >= 1) { player.time -= 1; newDay(); }
        if (pendingCoronation) { pendingCoronation = false; showEnding('coronation'); }
        else if (player.petition && !player.petition.shown) { player.petition.shown = true; petitionDialog(); }
        if (now >= moveReadyAt && held.size) tryMove([...held].pop(), now);
        moveEnemies(now);
        spawnClock += dt;
        if (spawnClock > 1) { spawnClock = 0; populate(false); }
    }

    approach(player, 1000 / stepTime(), dt);
    for (const e of entities) approach(e, 6, dt);

    hudClock += dt;
    if (hudClock > 0.25) { hudClock = 0; renderHud(); }

    render3d(now, dt);
    requestAnimationFrame(frame);
}

// ---------- Wiring ----------

window.addEventListener('keydown', ev => {
    if (ui.dialog && (ev.code === 'Space' || ev.code === 'Enter')) {
        ev.preventDefault();
        advanceDialog();
        return;
    }
    if (ev.code === 'Escape') {
        if (ui.shop) closeSheet('shop');
        else if (ui.menu) closeSheet('menu');
        return;
    }
    if (ev.code === 'KeyM' || ev.code === 'KeyI') { openMenu(); return; }
    if (ev.code === 'KeyR' && !uiOpen()) { toggleRide(); renderHud(); return; }
    const dir = KEYS[ev.code];
    if (dir) {
        ev.preventDefault();
        if (!uiOpen()) { held.delete(dir); held.add(dir); }
    }
});

window.addEventListener('keyup', ev => {
    const dir = KEYS[ev.code];
    if (dir) held.delete(dir);
});

window.addEventListener('blur', () => held.clear());

for (const btn of document.querySelectorAll('#dpad button')) {
    const dir = btn.dataset.dir;
    btn.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        if (!uiOpen()) held.add(dir);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(type, () => held.delete(dir));
}

$('dialog-next').addEventListener('click', advanceDialog);
$('dialog-choices').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-choice]');
    if (btn && !btn.disabled) chooseDialog(Number(btn.dataset.choice));
});
$('ride-btn').addEventListener('click', () => { toggleRide(); renderHud(); });
$('dialog').addEventListener('click', ev => { if (ev.target === $('dialog')) advanceDialog(); });
$('menu-btn').addEventListener('click', openMenu);
$('battle-actions').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-act]');
    if (btn && !btn.disabled) battleAction(btn.dataset.act, btn.dataset.arg);
});
$('shop-list').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-buy]');
    if (btn && !btn.disabled) buy(btn.dataset.buy);
    const tr = ev.target.closest('button[data-travel]');
    if (tr && !tr.disabled) { const [from, to] = tr.dataset.travel.split(':'); closeSheet('shop'); travel(from, to); return; }
    const rec = ev.target.closest('button[data-recruit]');
    if (rec && !rec.disabled) { recruit(rec.dataset.recruit); save(); renderShop(); renderHud(); }
});
$('menu-body').addEventListener('click', ev => {
    const act = (sel, fn) => { const b = ev.target.closest(sel); if (b && !b.disabled) { fn(b); save(); renderMenu(); renderHud(); return true; } return false; };
    if (act('button[data-plan]', b => { const [pk, sk, ck] = b.dataset.plan.split(':'); setPlan(pk, sk, ck); })) return;
    if (act('button[data-grain]', b => tradeGrain(b.dataset.grain))) return;
    if (act('button[data-tax]', b => setTax(b.dataset.tax))) return;
    if (act('button[data-minister]', b => toggleMinister(b.dataset.minister))) return;
    if (act('button[data-edict]', b => toggleEdict(b.dataset.edict))) return;
    if (act('button[data-focus]', b => { const [pk, fk] = b.dataset.focus.split(':'); setFocus(pk, fk); })) return;
    if (act('button[data-ride]', () => toggleRide())) return;
    const pet = ev.target.closest('button[data-petition]');
    if (pet) { closeSheet('menu'); player.petition.shown = true; petitionDialog(); return; }
    const tab = ev.target.closest('button[data-tab]');
    if (tab) { menuTab = tab.dataset.tab; renderMenu(); return; }
    const st = ev.target.closest('button[data-study]');
    if (st && !st.disabled) { study(st.dataset.study); save(); renderMenu(); renderHud(); return; }
    const bd = ev.target.closest('button[data-build]');
    if (bd && !bd.disabled) { const [pk, bk] = bd.dataset.build.split(':'); construct(pk, bk); save(); renderMenu(); renderHud(); return; }
    const dm = ev.target.closest('button[data-dismiss]');
    if (dm) { player.squad = player.squad.filter(x => String(x.id) !== dm.dataset.dismiss); toast('The soldier returns home'); save(); renderMenu(); return; }
    const use = ev.target.closest('button[data-use]');
    if (use) {
        const msg = useItem(use.dataset.use);
        if (msg) toast(msg);
        renderMenu();
        renderHud();
        return;
    }
    if (ev.target.closest('#restart')) {
        if (!restartArmed) { restartArmed = true; renderMenu(); return; }
        try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
        startGame(null);
    }
});
for (const btn of document.querySelectorAll('[data-close]')) {
    btn.addEventListener('click', () => closeSheet(btn.dataset.close));
}
$('ending-close').addEventListener('click', () => {
    ui.ending = false;
    $('ending').hidden = true;
    renderHud();
});

init3d();
new ResizeObserver(resize).observe(canvas);
startGame(load());
requestAnimationFrame(frame);
