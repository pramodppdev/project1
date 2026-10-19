'use strict';

// ---------- Realistic characters and animals ----------
// Every model is built from smooth primitives (capsules, spheres, lathes and tubes)
// with jointed limbs so walking, lunging and falling can be animated.

const GEO = {};
const MAT_CACHE = new Map();
const models = new Map();
const followers = new Map();
let heroModel = null;
let heroMount = null;

function geo(key, make) {
    if (!GEO[key]) GEO[key] = make();
    return GEO[key];
}

// Each model gets its own materials so a single character can flash red when hit.
function mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0, emissive: opts.emissive || '#000000', side: opts.side || THREE.FrontSide, map: opts.map || null });
}

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
}

const SPHERE = () => geo('sphere', () => new THREE.SphereGeometry(1, 18, 14));
const capsule = (r, len) => geo(`cap${r}_${len}`, () => new THREE.CapsuleGeometry(r, len, 5, 10));
const cyl = (rt, rb, h, seg = 12, open = false) => geo(`cyl${rt}_${rb}_${h}_${seg}_${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
const cone = (r, h, seg = 10) => geo(`cone${r}_${h}_${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const torus = (r, t) => geo(`tor${r}_${t}`, () => new THREE.TorusGeometry(r, t, 8, 20));

function ellipsoid(parent, material, sx, sy, sz, x, y, z) {
    const m = mesh(parent, SPHERE(), material, x, y, z);
    m.scale.set(sx, sy, sz);
    return m;
}

function pivot(parent, x, y, z) {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    parent.add(p);
    return p;
}

function stripeTexture(base, mark, kind) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 64);
    const rng = mulberry32(kind === 'stripes' ? 7 : 11);
    g.fillStyle = mark;
    if (kind === 'stripes') {
        for (let i = 0; i < 22; i++) {
            const x = rng() * 128;
            g.beginPath();
            g.moveTo(x, 0);
            g.quadraticCurveTo(x + rng() * 10 - 5, 32, x + rng() * 6 - 3, 64);
            g.lineWidth = 2 + rng() * 3;
            g.strokeStyle = mark;
            g.stroke();
        }
        g.fillStyle = 'rgba(255,245,230,0.75)';
        g.fillRect(0, 50, 128, 14);
    } else {
        for (let i = 0; i < 90; i++) {
            g.beginPath();
            g.arc(rng() * 128, rng() * 64, 1.5 + rng() * 2.5, 0, Math.PI * 2);
            g.fill();
        }
    }
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
}

// ---------- People ----------

function person(o) {
    const g = new THREE.Group();
    const skin = mat(o.skin, { rough: 0.6 });
    const shirt = mat(o.shirt);
    const lower = mat(o.pants);
    const dark = mat('#1b1210', { rough: 0.5 });
    const all = [];

    // Legs hang from the hips so they can swing.
    const legs = [-0.075, 0.075].map(x => {
        const hip = pivot(g, x, 0.62, 0);
        mesh(hip, capsule(0.055, 0.46), lower, 0, -0.29, 0);
        const foot = ellipsoid(hip, o.barefoot ? skin : mat('#5a3a22'), 0.05, 0.03, 0.09, 0, -0.6, 0.035);
        all.push(foot);
        return hip;
    });

    const torso = pivot(g, 0, 0, 0);
    const chest = mesh(torso, capsule(0.12, 0.26), shirt, 0, 0.9, 0);
    chest.scale.set(1.05, 1, 0.72);
    mesh(torso, cyl(0.14, o.robe ? 0.24 : 0.19, o.robe ? 0.58 : 0.3, 14, true), mat(o.shirt, { side: THREE.DoubleSide }), 0, o.robe ? 0.42 : 0.6, 0);
    if (o.sash) {
        const sash = mesh(torso, geo('sash', () => new THREE.BoxGeometry(0.05, 0.5, 0.2)), mat(o.sash), 0.02, 0.9, 0.02);
        sash.rotation.z = 0.7;
        sash.scale.z = 1.2;
    }
    if (o.belt) mesh(torso, torus(0.13, 0.02), mat(o.belt), 0, 0.72, 0).rotation.x = Math.PI / 2;

    const arms = [-1, 1].map(s => {
        const sh = pivot(torso, 0.19 * s, 1.03, 0);
        mesh(sh, capsule(0.042, 0.4), o.bareArms ? skin : shirt, 0, -0.23, 0);
        ellipsoid(sh, skin, 0.04, 0.05, 0.04, 0, -0.5, 0.01);
        return sh;
    });

    mesh(torso, cyl(0.04, 0.045, 0.08), skin, 0, 1.11, 0);
    const head = pivot(torso, 0, 1.24, 0);
    ellipsoid(head, skin, 0.1, 0.115, 0.105, 0, 0, 0);
    const eyeMat = o.glow ? mat('#ffd23a', { emissive: '#ffae00' }) : dark;
    for (const s of [-1, 1]) {
        ellipsoid(head, mat('#f4efe6', { rough: 0.3 }), 0.022, 0.014, 0.01, 0.037 * s, 0.012, 0.092);
        ellipsoid(head, eyeMat, 0.011, 0.012, 0.008, 0.037 * s, 0.012, 0.099);
        const brow = ellipsoid(head, o.glow ? mat('#1a0808') : mat(o.hair || '#1b1210'), 0.026, 0.006, 0.01, 0.038 * s, 0.042, 0.096);
        brow.rotation.z = -0.15 * s;
        ellipsoid(head, skin, 0.018, 0.03, 0.02, 0.1 * s, 0, 0);
    }
    const nose = mesh(head, cone(0.016, 0.05, 6), skin, 0, -0.012, 0.108);
    nose.rotation.x = Math.PI / 2;
    ellipsoid(head, mat('#7a3b33'), 0.026, 0.007, 0.01, 0, -0.058, 0.094);

    if (o.hair) {
        const hairMat = mat(o.hair, { rough: 0.7 });
        const cap = mesh(head, geo('haircap', () => new THREE.SphereGeometry(0.112, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), hairMat, 0, 0.012, -0.006);
        cap.scale.set(1, 1.05, 1);
        if (o.longHair) {
            ellipsoid(head, hairMat, 0.09, 0.16, 0.05, 0, -0.08, -0.07);
            ellipsoid(head, hairMat, 0.035, 0.035, 0.035, 0, -0.05, -0.12);
        }
    }
    if (o.turban) {
        const tm = mat(o.turban);
        const band = mesh(head, torus(0.1, 0.04), tm, 0, 0.07, 0);
        band.rotation.x = Math.PI / 2;
        band.scale.set(1.05, 1.05, 1.2);
        ellipsoid(head, tm, 0.11, 0.075, 0.11, 0, 0.11, -0.005);
        if (o.turbanTail) ellipsoid(head, tm, 0.03, 0.12, 0.02, 0.05, -0.02, -0.11);
    }
    if (o.hijab) {
        const hm = mat(o.hijab, { side: THREE.DoubleSide });
        const hood = mesh(head, geo('hijab', () => new THREE.SphereGeometry(0.135, 18, 14, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI * 0.72)), hm, 0, 0.01, -0.005);
        hood.rotation.y = 0;
        ellipsoid(torso, hm, 0.2, 0.08, 0.15, 0, 1.06, -0.01);
    }
    if (o.beard) ellipsoid(head, mat(o.beard, { rough: 0.9 }), 0.075, o.longBeard ? 0.11 : 0.06, 0.05, 0, o.longBeard ? -0.1 : -0.075, 0.065);
    if (o.mustache) {
        const mu = mesh(head, capsule(0.012, 0.06), mat(o.mustache), 0, -0.04, 0.1);
        mu.rotation.z = Math.PI / 2;
    }
    if (o.mask) {
        const mk = mesh(head, cyl(0.108, 0.1, 0.08, 16, true), mat(o.mask, { side: THREE.DoubleSide }), 0, -0.045, 0.004);
        mk.scale.z = 1.05;
    }
    if (o.crown) {
        const gold = mat('#e8b923', { metal: 0.8, rough: 0.3 });
        mesh(head, cyl(0.105, 0.1, 0.05, 16, true), gold, 0, 0.1, 0);
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            mesh(head, cone(0.018, 0.06, 5), gold, Math.sin(a) * 0.1, 0.15, Math.cos(a) * 0.1);
        }
    }
    if (o.horns) {
        const horn = mat('#e8dcc0', { rough: 0.5 });
        for (const s of [-1, 1]) {
            const h = mesh(head, cone(0.025, 0.14, 8), horn, 0.07 * s, 0.12, 0);
            h.rotation.z = -0.5 * s;
        }
    }
    if (o.tilak) ellipsoid(head, mat('#d9442b'), 0.006, 0.014, 0.004, 0, 0.055, 0.104);

    g.scale.setScalar(o.scale || 1);
    return { body: g, torso, head, armR: arms[1], armL: arms[0], limbs: [[legs[0], 0, 0.6], [legs[1], Math.PI, 0.6], [arms[0], Math.PI, 0.45], [arms[1], 0, 0.45]] };
}

// ---------- Animals ----------

function animal(o) {
    const g = new THREE.Group();
    const coat = mat(o.color, { map: o.map || null, rough: 0.9 });
    const legMat = mat(o.leg || o.color, { rough: 0.9 });
    const [len, h, w] = o.size;
    const legH = o.legH;
    const bodyY = legH + h * 0.42;
    ellipsoid(g, coat, w / 2, h / 2, len / 2, 0, bodyY, 0);
    if (o.hump) ellipsoid(g, coat, w * 0.28, h * 0.32, len * 0.16, 0, bodyY + h * 0.42, len * 0.22);

    const neck = pivot(g, 0, bodyY + h * 0.15, len * 0.42);
    const headY = o.neckUp || 0.12;
    if (o.neck) {
        const nk = mesh(neck, capsule(o.neck, 0.22), coat, 0, headY * 0.6, 0.08);
        nk.rotation.x = 0.7;
    }
    const head = pivot(neck, 0, headY, o.headFwd || 0.12);
    ellipsoid(head, coat, o.head * 0.5, o.head * 0.45, o.head * 0.6, 0, 0, 0);
    if (o.snout) ellipsoid(head, mat(o.snout, { rough: 0.6 }), o.head * 0.3, o.head * 0.25, o.head * 0.35, 0, -o.head * 0.08, o.head * 0.5);
    for (const s of [-1, 1]) {
        ellipsoid(head, mat('#120c0a', { rough: 0.3 }), 0.018, 0.018, 0.012, o.head * 0.26 * s, o.head * 0.12, o.head * 0.44);
        if (o.ears) {
            const ear = mesh(head, cone(o.head * 0.14, o.head * 0.3, 6), coat, o.head * 0.28 * s, o.head * 0.42, -o.head * 0.05);
            ear.rotation.z = -0.3 * s;
        }
        if (o.tusks) {
            const t = mesh(head, cone(0.018, 0.1, 6), mat('#f4efe2', { rough: 0.4 }), o.head * 0.2 * s, -o.head * 0.15, o.head * 0.62);
            t.rotation.x = -0.6;
        }
        if (o.horns) {
            const hn = mesh(head, cone(0.03, 0.2, 7), mat('#d8cdb4'), o.head * 0.3 * s, o.head * 0.45, -o.head * 0.1);
            hn.rotation.z = -0.8 * s;
        }
    }
    if (o.mane) ellipsoid(neck, mat(o.mane), 0.04, 0.16, 0.12, 0, headY * 0.6, 0.02);

    const legs = [];
    for (const [sx, sz, ph] of [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]]) {
        const hip = pivot(g, sx * w * 0.3, legH + 0.04, sz * len * 0.32);
        mesh(hip, capsule(o.legR || 0.045, legH - 0.06), legMat, 0, -legH / 2, 0);
        if (o.hooves) ellipsoid(hip, mat('#2a2018'), o.legR || 0.045, 0.03, (o.legR || 0.045) * 1.2, 0, -legH + 0.02, 0.01);
        legs.push([hip, ph, 0.55]);
    }
    if (o.tail) {
        const tail = pivot(g, 0, bodyY + h * 0.2, -len * 0.48);
        const tm = mesh(tail, capsule(0.02, o.tail), o.tailMat || legMat, 0, -o.tail * 0.4, -0.04);
        tm.rotation.x = -0.5;
        if (o.tuft) ellipsoid(tail, mat(o.tuft), 0.035, 0.07, 0.035, 0, -o.tail * 0.85, -0.12);
    }
    g.scale.setScalar(o.scale || 1);
    return { body: g, limbs: legs, head, neck };
}

function cobraModel() {
    const g = new THREE.Group();
    const skin = mat('#3d5a26', { map: stripeTexture('#3d5a26', '#c9b060', 'stripes'), rough: 0.5 });
    const coil = [];
    for (let i = 0; i < 40; i++) {
        const a = i * 0.35;
        const r = 0.22 - i * 0.003;
        coil.push(new THREE.Vector3(Math.cos(a) * r, 0.04 + i * 0.004, Math.sin(a) * r));
    }
    coil.push(new THREE.Vector3(0, 0.25, 0.02), new THREE.Vector3(0, 0.45, 0.06), new THREE.Vector3(0, 0.58, 0.1));
    const body = mesh(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 80, 0.035, 8, false), skin);
    body.castShadow = true;
    const sway = pivot(g, 0, 0.58, 0.1);
    const hood = ellipsoid(sway, skin, 0.13, 0.12, 0.025, 0, 0.02, -0.01);
    hood.rotation.x = -0.2;
    ellipsoid(sway, skin, 0.045, 0.03, 0.07, 0, 0.12, 0.05);
    for (const s of [-1, 1]) ellipsoid(sway, mat('#e8d36a', { emissive: '#3a2a00' }), 0.008, 0.008, 0.006, 0.025 * s, 0.135, 0.105);
    return { body: g, limbs: [], sway };
}

function scorpionModel(color, scale = 1) {
    const g = new THREE.Group();
    const shell = mat(color, { rough: 0.35, metal: 0.1 });
    ellipsoid(g, shell, 0.18, 0.07, 0.3, 0, 0.1, 0);
    ellipsoid(g, shell, 0.12, 0.06, 0.1, 0, 0.11, 0.32);
    const legs = [];
    for (const s of [-1, 1]) {
        const arm = mesh(g, capsule(0.025, 0.22), shell, s * 0.17, 0.12, 0.45);
        arm.rotation.x = Math.PI / 2;
        arm.rotation.z = s * 0.4;
        ellipsoid(g, shell, 0.06, 0.04, 0.1, s * 0.24, 0.12, 0.62);
        for (const z of [-0.18, -0.04, 0.1, 0.22]) {
            const hip = pivot(g, s * 0.15, 0.1, z);
            const l = mesh(hip, capsule(0.012, 0.16), shell, s * 0.1, -0.03, 0);
            l.rotation.z = s * 1.1;
            legs.push([hip, z * 12, 0.25]);
        }
    }
    const pts = [[0, 0.12, -0.28], [0, 0.22, -0.45], [0, 0.42, -0.5], [0, 0.56, -0.38], [0, 0.58, -0.2]].map(p => new THREE.Vector3(...p));
    const tail = pivot(g, 0, 0, 0);
    mesh(tail, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.04, 8, false), shell);
    const sting = mesh(tail, cone(0.03, 0.1, 6), mat('#2a0f0f', { emissive: '#3a0000' }), 0, 0.53, -0.14);
    sting.rotation.x = 2.2;
    g.scale.setScalar(scale);
    return { body: g, limbs: legs, tailBob: tail };
}

function horseModel(color, mane) {
    return animal({ color, leg: shade(color, -0.08), size: [1.05, 0.42, 0.34], legH: 0.62, head: 0.2, neck: 0.08, neckUp: 0.42, headFwd: 0.28, ears: true, mane, tail: 0.32, tailMat: mat(mane), hooves: true, legR: 0.035 });
}

function elephantModel(war) {
    const a = animal({ color: '#7f7a76', size: [1.35, 0.85, 0.78], legH: 0.62, head: 0.55, headFwd: 0.25, neckUp: 0.18, tail: 0.32, legR: 0.11, tuft: '#2a2420' });
    const grey = mat('#78736e', { rough: 0.95, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
        const ear = mesh(a.head, geo('ear', () => new THREE.CircleGeometry(0.26, 16)), grey, 0.27 * s, 0.02, -0.05);
        ear.rotation.y = s * 1.2;
        ear.scale.set(0.9, 1.1, 1);
        const tusk = mesh(a.head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.1 * s, -0.12, 0.25), new THREE.Vector3(0.13 * s, -0.25, 0.42), new THREE.Vector3(0.1 * s, -0.2, 0.58)]), 10, 0.025, 6, false), mat('#f4efe2', { rough: 0.4 }));
        tusk.castShadow = true;
    }
    const trunk = mesh(a.head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(0, -0.25, 0.42), new THREE.Vector3(0, -0.5, 0.4), new THREE.Vector3(0, -0.66, 0.48)]), 16, 0.065, 8, false), grey);
    trunk.castShadow = true;
    if (war) {
        const cloth = mat('#a3192c');
        const gold = mat('#d9a72e', { metal: 0.6, rough: 0.35 });
        const blanket = mesh(a.body, geo('blanket', () => new THREE.BoxGeometry(0.86, 0.04, 0.95)), cloth, 0, 1.16, -0.02);
        blanket.rotation.z = 0;
        mesh(a.body, geo('howdah', () => new THREE.BoxGeometry(0.56, 0.3, 0.56)), gold, 0, 1.33, -0.05);
        for (const [x, z] of [[-0.25, -0.3], [0.25, -0.3], [-0.25, 0.2], [0.25, 0.2]]) mesh(a.body, cyl(0.015, 0.015, 0.35, 6), gold, x, 1.62, z);
        mesh(a.body, cone(0.42, 0.25, 4), cloth, 0, 1.9, -0.05).rotation.y = Math.PI / 4;
        const mahout = person({ skin: '#8e5b3a', shirt: '#f3ead6', pants: '#f3ead6', turban: '#f29a2e', scale: 0.55 });
        mahout.body.position.set(0, 1.08, 0.5);
        mahout.limbs.forEach(([leg], i) => { if (i < 2) { leg.rotation.x = -1.4; leg.rotation.z = (i ? -0.5 : 0.5); } });
        a.body.add(mahout.body);
    }
    return a;
}

// ---------- Equipment ----------

function addSpear(h) {
    mesh(h.armR, cyl(0.014, 0.014, 1.5, 6), mat('#7a5230'), 0, -0.5, 0.05);
    mesh(h.armR, cone(0.03, 0.12, 6), mat('#c9d0d4', { metal: 0.8, rough: 0.3 }), 0, 0.3, 0.05);
    const shield = mesh(h.armL, cyl(0.15, 0.15, 0.03, 18), mat('#6b3a1a', { rough: 0.6 }), -0.04, -0.4, 0.06);
    shield.rotation.z = Math.PI / 2;
    mesh(h.armL, geo('boss', () => new THREE.SphereGeometry(0.035, 10, 8)), mat('#d9a72e', { metal: 0.7 }), -0.06, -0.4, 0.06);
}

function addBow(h) {
    const bow = mesh(h.armL, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.05, 0.02), new THREE.Vector3(0, -0.45, 0.16), new THREE.Vector3(0, -0.85, 0.02)]), 12, 0.012, 5, false), mat('#5a3a1a'));
    bow.castShadow = true;
    ellipsoid(h.torso, mat('#6b4423'), 0.05, 0.18, 0.05, 0.08, 0.95, -0.14).rotation.z = -0.3;
}

function weaponMesh(key) {
    const g = new THREE.Group();
    if (key === 'lathi') {
        mesh(g, cyl(0.015, 0.018, 1.25, 6), mat('#b8935a'), 0, -0.55, 0.04);
    } else {
        const steel = mat('#d7dee2', { metal: 0.9, rough: 0.25 });
        mesh(g, cyl(0.016, 0.016, 0.12, 6), mat('#5a3a1a'), 0, -0.5, 0.04);
        mesh(g, geo('guard', () => new THREE.BoxGeometry(0.12, 0.02, 0.04)), mat('#d9a72e', { metal: 0.7 }), 0, -0.57, 0.04);
        const blade = mesh(g, geo(key === 'khanda' ? 'khanda' : 'talwar', () => new THREE.BoxGeometry(key === 'khanda' ? 0.06 : 0.035, 0.55, 0.008)), steel, 0, -0.85, 0.04);
        if (key === 'talwar') blade.rotation.z = 0.12;
    }
    return g;
}

// ---------- Model registry ----------

const PEOPLE = {
    hero: { skin: '#b07650', shirt: '#e8892a', pants: '#f2e9d8', hair: '#1d1410', sash: '#b8322a', tilak: true },
    elder: { skin: '#9a6a48', shirt: '#f3ece0', pants: '#f3ece0', turban: '#f6f1e6', beard: '#e8e4dc', longBeard: true, mustache: '#e8e4dc', robe: true },
    vaidya: { skin: '#a2714e', shirt: '#2e7d55', pants: '#2e7d55', robe: true, hair: '#8e8e8e', longHair: true, sash: '#d9a72e', tilak: true },
    merchant: { skin: '#a8754e', shirt: '#e2b23a', pants: '#f2e9d8', turban: '#b8322a', turbanTail: true, mustache: '#1b1210', belt: '#6b3a1a' },
    child: { skin: '#b07650', shirt: '#3f8fd9', pants: '#6b4a2e', hair: '#1d1410', scale: 0.7, barefoot: true },
    guru: { skin: '#9a6a48', shirt: '#d9762a', pants: '#d9762a', robe: true, beard: '#ecebe6', longBeard: true, bareArms: true, hair: '#d8d6d0', barefoot: true, tilak: true },
    rani: { skin: '#b9845c', shirt: '#9c1730', pants: '#9c1730', robe: true, hair: '#1b1210', longHair: true, crown: true, sash: '#e8b923', tilak: true },
    trader: { skin: '#b07c55', shirt: '#1f7f7f', pants: '#2b2b44', hijab: '#145a5a' },
    havaldar: { skin: '#8e5b3a', shirt: '#7a2a2a', pants: '#f2e9d8', turban: '#e8892a', mustache: '#1b1210', sash: '#e8b923', belt: '#3a2414' },
    captain: { skin: '#9a6a48', shirt: '#2c3e6b', pants: '#f2e9d8', turban: '#e8b923', turbanTail: true, beard: '#1b1210', sash: '#b8322a', scale: 1.08 },
    carter: { skin: '#8e5b3a', shirt: '#f3ece0', pants: '#f3ece0', turban: '#d9762a', mustache: '#1b1210', barefoot: true },
    dacoit: { skin: '#8e5b3a', shirt: '#2a221d', pants: '#2a221d', turban: '#2a221d', turbanTail: true, mask: '#9c1730', belt: '#5a3a1a' },
    sardar: { skin: '#8e5b3a', shirt: '#3a1414', pants: '#2a221d', turban: '#7a1f1f', turbanTail: true, beard: '#1b1210', mustache: '#1b1210', sash: '#e8b923', belt: '#e8b923', scale: 1.3 },
    scout: { skin: '#7a2626', shirt: '#2a1420', pants: '#2a1420', horns: true, glow: true, bareArms: true, scale: 1.15, barefoot: true },
    kaal: { skin: '#3e1220', shirt: '#160a10', pants: '#160a10', horns: true, glow: true, bareArms: true, crown: true, scale: 2.1, barefoot: true },
};

function crocModel(scale = 1) {
    const g = new THREE.Group();
    const skin = mat('#4a5a32', { rough: 0.7, map: stripeTexture('#4a5a32', '#2c3820', 'spots') });
    const belly = mat('#9a9a6a', { rough: 0.8 });
    ellipsoid(g, skin, 0.22, 0.09, 0.5, 0, 0.13, 0);
    ellipsoid(g, belly, 0.2, 0.05, 0.46, 0, 0.08, 0);
    const head = pivot(g, 0, 0.13, 0.45);
    ellipsoid(head, skin, 0.13, 0.07, 0.16, 0, 0.01, 0.08);
    ellipsoid(head, skin, 0.08, 0.045, 0.2, 0, -0.005, 0.3);
    for (const s of [-1, 1]) ellipsoid(head, mat('#d8c040', { emissive: '#2a2000' }), 0.025, 0.022, 0.022, 0.06 * s, 0.065, 0.06);
    const tail = mesh(g, cone(0.12, 0.8, 8), skin, 0, 0.11, -0.85);
    tail.rotation.x = -Math.PI / 2;
    tail.scale.set(1, 1, 0.55);
    const legs = [];
    for (const [sx, sz, ph] of [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]]) {
        const hip = pivot(g, sx * 0.2, 0.11, sz * 0.28);
        const l = mesh(hip, capsule(0.035, 0.1), skin, sx * 0.05, -0.05, 0);
        l.rotation.z = sx * 0.9;
        legs.push([hip, ph, 0.35]);
    }
    g.scale.setScalar(scale);
    return { body: g, limbs: legs, head };
}

const SKIN_TONES = ['#7a4a2e', '#8e5b3a', '#9a6a48', '#a8754e', '#b07c55', '#c08a62'];
const CLOTH = {
    desert: ['#d9442b', '#e8892a', '#e8b923', '#c2185b', '#f2e9d8', '#8e244d'],
    badlands: ['#b8322a', '#e2b23a', '#f2e9d8', '#6b3a1a', '#2e7d55'],
    snow: ['#7a1f2b', '#5a3a22', '#8a5a2b', '#3a4a6b', '#b8862e'],
    beach: ['#2b5f9e', '#f2e9d8', '#1f7f7f', '#e2b23a', '#3f8fd9'],
    jungle: ['#2e7d55', '#8e5b2a', '#f2e9d8', '#b8322a', '#6b8e23'],
    default: ['#f2e9d8', '#3f8fd9', '#2e7d55', '#b8322a', '#e2b23a', '#6b4a8e', '#d9762a'],
};

// Townsfolk are dressed from their settlement's region, so each place looks different.
function npcAppearance(e) {
    const st = settlementById(e.settlement);
    const r = mulberry32(e.look);
    const pal = CLOTH[st.type === 'fishing' ? 'beach' : st.biome] || CLOTH.default;
    const c = () => pal[Math.floor(r() * pal.length)];
    const o = { skin: SKIN_TONES[Math.floor(r() * SKIN_TONES.length)], shirt: c(), pants: r() < 0.55 ? '#f2e9d8' : c() };
    if (e.female) {
        Object.assign(o, { robe: true, hair: '#1b1210', longHair: true, sash: c(), tilak: r() < 0.5 });
        if (st.type === 'fort' || st.biome === 'desert') o.hijab = r() < 0.3 ? c() : null;
    } else if (st.biome === 'snow') {
        Object.assign(o, { hair: '#1b1210', robe: r() < 0.5, sash: '#b8862e' });
    } else if (r() < 0.65) {
        Object.assign(o, { turban: c(), turbanTail: r() < 0.4, mustache: r() < 0.6 ? '#1b1210' : null });
    } else {
        o.hair = '#1b1210';
    }
    if (e.role === 'headman') Object.assign(o, { robe: true, beard: '#d8d4cc', longBeard: !e.female && r() < 0.6, mustache: e.female ? null : '#d8d4cc' });
    if (e.role === 'guru') Object.assign(o, { shirt: '#d9762a', pants: '#d9762a', robe: true, beard: e.female ? null : '#ecebe6', longBeard: true, bareArms: true, barefoot: true, turban: null, tilak: true });
    if (e.role === 'healer') o.sash = '#2e7d55';
    if (e.role === 'recruiter') Object.assign(o, { shirt: '#7a2a2a', belt: '#3a2414', turban: '#e8892a', hijab: null, robe: false, longHair: false, hair: null });
    if (e.role === 'carter') Object.assign(o, { barefoot: true, shirt: '#f3ece0' });
    if (e.role === 'merchant' || e.role === 'trader') o.belt = '#6b3a1a';
    return o;
}

const MODEL_BUILDERS = {
    croc: () => crocModel(1),
    mugger: () => crocModel(1.9),
    leopard: () => animal({ color: '#d9a64a', map: stripeTexture('#d9a64a', '#2e2214', 'spots'), size: [0.95, 0.35, 0.3], legH: 0.34, head: 0.27, ears: true, tail: 0.6, legR: 0.045 }),
    snowleopard: () => animal({ color: '#e2dccf', map: stripeTexture('#e2dccf', '#3a332c', 'spots'), size: [0.95, 0.35, 0.3], legH: 0.34, head: 0.27, ears: true, tail: 0.7, legR: 0.045 }),
    chief: () => person(PEOPLE.sardar),
    rakshasa: () => person({ ...PEOPLE.kaal, scale: 1.8 }),
    maneater: () => { const t = MODEL_BUILDERS.tiger(); t.body.scale.setScalar(1.55); return t; },
    boar: () => animal({ color: '#4a3528', size: [0.75, 0.42, 0.36], legH: 0.22, head: 0.28, snout: '#7a5a4a', tusks: true, ears: true, tail: 0.1 }),
    jackal: () => animal({ color: '#a8875e', leg: '#8a6c48', size: [0.62, 0.26, 0.22], legH: 0.32, head: 0.2, snout: '#c9a87e', ears: true, tail: 0.28, tailMat: mat('#7a6040') }),
    tiger: () => animal({ color: '#e0832a', map: stripeTexture('#e0832a', '#1d120a', 'stripes'), size: [1.05, 0.4, 0.36], legH: 0.34, head: 0.32, snout: '#f6ead2', ears: true, tail: 0.5, legR: 0.055 }),
    cobra: cobraModel,
    scorpion: () => scorpionModel('#6e4426'),
    queen: () => scorpionModel('#4a1424', 2.3),
    raider: () => {
        const h = horseModel('#5a3a22', '#1b1210');
        const rider = person({ skin: '#9a6440', shirt: '#2c3e6b', pants: '#2c3e6b', turban: '#b8322a', turbanTail: true, mustache: '#1b1210', scale: 0.8 });
        rider.body.position.set(0, 0.62, -0.05);
        rider.limbs.forEach(([leg], i) => { if (i < 2) { leg.rotation.x = -1.3; leg.rotation.z = i ? -0.45 : 0.45; } });
        rider.armR.add(weaponMesh('talwar'));
        h.body.add(rider.body);
        return h;
    },
    unit_paidal: () => { const h = person({ skin: '#9a6a48', shirt: '#f2e9d8', pants: '#f2e9d8', turban: '#b8322a', sash: '#b8322a', belt: '#5a3a1a' }); addSpear(h); return h; },
    unit_archer: () => { const h = person({ skin: '#a8754e', shirt: '#3d6b35', pants: '#5a4630', turban: '#2f4a2a', belt: '#5a3a1a' }); addBow(h); return h; },
    unit_cavalry: () => {
        const h = horseModel('#e2dbcf', '#5a5048');
        const rider = person({ skin: '#9a6a48', shirt: '#b8322a', pants: '#f2e9d8', turban: '#e8892a', mustache: '#1b1210', scale: 0.8 });
        rider.body.position.set(0, 0.62, -0.05);
        rider.limbs.forEach(([leg], i) => { if (i < 2) { leg.rotation.x = -1.3; leg.rotation.z = i ? -0.45 : 0.45; } });
        mesh(rider.armR, cyl(0.012, 0.012, 1.7, 6), mat('#7a5230'), 0, -0.4, 0.1);
        h.body.add(rider.body);
        return h;
    },
    unit_elephant: () => elephantModel(true),
    horse: () => horseModel('#6b4426', '#1b1210'),
    cow: () => animal({ color: '#ece6da', leg: '#d8d0c2', size: [0.85, 0.42, 0.34], legH: 0.42, head: 0.22, snout: '#c9a89a', ears: true, horns: true, hump: true, tail: 0.38, tuft: '#2a2420', hooves: true, legR: 0.04 }),
    bullock: () => animal({ color: '#d8cfc0', leg: '#c8bfae', size: [0.9, 0.44, 0.36], legH: 0.42, head: 0.23, snout: '#b89a8a', ears: true, horns: true, hump: true, tail: 0.38, tuft: '#2a2420', hooves: true, legR: 0.045 }),
};

function makeModel(e) {
    const key = e.hero ? 'hero' : e.unit ? `unit_${e.unit}` : e.kind || e.model;
    let built;
    if (e.npc) {
        built = person(npcAppearance(e));
        if (e.role === 'recruiter') addSpear(built);
    } else {
        built = PEOPLE[key] ? person(PEOPLE[key]) : MODEL_BUILDERS[key]();
    }
    if (e.foe && e.foe.tier && !e.boss) built.body.scale.multiplyScalar(1 + e.foe.tier * 0.06);
    const root = new THREE.Group();

    const ringColor = e.hero ? '#f29a2e' : e.boss ? '#f2c230' : e.kind ? '#d9442b' : null;
    let ring = null;
    if (ringColor) {
        ring = new THREE.Mesh(geo('ring', () => new THREE.RingGeometry(0.42, 0.5, 32)), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        ring.scale.setScalar(e.boss ? 1.8 : 1);
        root.add(ring);
    }
    let marker = null;
    if (e.npc) {
        marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(), depthTest: false }));
        marker.scale.set(0.42, 0.42, 1);
        marker.position.y = 1.85;
        root.add(marker);
    }
    root.add(built.body);
    const mats = [];
    built.body.traverse(o => { if (o.isMesh) { mats.push(o.material); o.material.userData.baseEmissive = `#${o.material.emissive.getHexString()}`; } });
    return { root, ring, marker, mats, facing: 0, walk: 0, ...built };
}

let markerTex = null;
function markerTexture() {
    if (markerTex) return markerTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 56px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#1a1322';
    g.strokeText('!', 32, 34);
    g.fillStyle = '#f2c230';
    g.fillText('!', 32, 34);
    markerTex = new THREE.CanvasTexture(c);
    markerTex.encoding = THREE.sRGBEncoding;
    return markerTex;
}

// ---------- Animation ----------

function turnToward(m, target, dt) {
    let d = target - m.body.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    m.body.rotation.y += d * Math.min(1, dt * 10);
}

function animateModel(m, e, now, dt, speed = 1) {
    const dx = e.x - e.rx;
    const dz = e.y - e.ry;
    const moving = Math.abs(dx) + Math.abs(dz) > 0.01;
    if (moving) m.facing = Math.atan2(dx, dz);
    turnToward(m, m.facing, dt);
    m.walk += ((moving ? 1 : 0) - m.walk) * Math.min(1, dt * 8);
    const cycle = now / (110 / speed);
    for (const [p, phase, amp] of m.limbs) p.rotation.x = Math.sin(cycle + phase) * amp * m.walk;
    if (m.torso) m.torso.rotation.z = Math.sin(cycle) * 0.03 * m.walk;

    let ox = 0;
    let oz = 0;
    if (m.lunge) {
        const p = (now - m.lunge.start) / 340;
        if (p >= 1) m.lunge = null;
        else {
            const k = Math.sin(p * Math.PI) * 0.42;
            ox = m.lunge.dx * k;
            oz = m.lunge.dz * k;
            if (m.armR) m.armR.rotation.x = -Math.sin(p * Math.PI) * 2.2;
        }
    }
    const x = e.rx + ox;
    const z = e.ry + oz;
    m.root.position.set(x, surfaceAt(x, z), z);
    const breathe = Math.sin(now / 700) * 0.006;
    m.body.position.y = (m.walk > 0.1 ? Math.abs(Math.sin(cycle)) * 0.035 * m.walk : 0) + breathe;

    if (m.sway) m.sway.rotation.z = Math.sin(now / 420) * 0.18;
    if (m.tailBob) m.tailBob.rotation.x = Math.sin(now / 260) * 0.12;
    if (m.ring && e.boss) m.ring.material.opacity = 0.5 + 0.4 * Math.sin(now / 300);
    if (m.marker) {
        m.marker.visible = hasNews(e);
        m.marker.position.y = 1.85 + Math.sin(now / 250) * 0.07;
    }
    const flashing = now < (m.flashUntil || 0);
    if (flashing !== !!m.flashed) {
        m.flashed = flashing;
        for (const mt of m.mats) mt.emissive.set(flashing ? '#b01a10' : mt.userData.baseEmissive);
    }
}

function dyingStep(m, now) {
    if (!m.dyingAt) m.dyingAt = now;
    const p = (now - m.dyingAt) / 800;
    m.body.rotation.z = Math.min(1, p * 1.6) * Math.PI / 2;
    m.root.position.y -= Math.max(0, p - 0.6) * 0.05;
    return p >= 1;
}

function clearModels() {
    for (const m of models.values()) scene.remove(m.root);
    models.clear();
}

function syncModels(now, dt) {
    const alive = new Set(entities);
    for (const e of entities) {
        if (models.has(e)) continue;
        const m = makeModel(e);
        m.facing = e.npc ? 0 : Math.random() * Math.PI * 2;
        m.body.rotation.y = m.facing;
        models.set(e, m);
        scene.add(m.root);
    }
    for (const [e, m] of models) {
        if (alive.has(e)) { animateModel(m, e, now, dt); continue; }
        if (dyingStep(m, now)) { scene.remove(m.root); models.delete(e); }
    }

    // The hero rides when mounted: the horse carries the hero model on its back.
    const riding = !!player.mounted && !ui.battle;
    if (riding && !heroMount) {
        heroMount = makeModel({ model: 'horse' });
        heroMount.body.rotation.y = heroModel.body.rotation.y;
        scene.add(heroMount.root);
    } else if (!riding && heroMount) {
        scene.remove(heroMount.root);
        heroMount = null;
    }
    if (heroModel.weapon !== player.weapon) {
        if (heroModel.weaponMesh) heroModel.armR.remove(heroModel.weaponMesh);
        heroModel.weaponMesh = weaponMesh(player.weapon);
        heroModel.armR.add(heroModel.weaponMesh);
        heroModel.weapon = player.weapon;
    }
    if (heroMount) {
        animateModel(heroMount, player, now, dt, 1.6);
        heroModel.root.position.set(heroMount.root.position.x, heroMount.root.position.y + 0.66, heroMount.root.position.z);
        heroModel.body.rotation.y = heroMount.body.rotation.y;
        heroModel.limbs.forEach(([leg], i) => { if (i < 2) { leg.rotation.x = -1.35; leg.rotation.z = i ? -0.45 : 0.45; } });
        if (heroModel.ring) heroModel.ring.visible = false;
    } else {
        heroModel.limbs.forEach(([leg], i) => { if (i < 2) leg.rotation.z = 0; });
        if (heroModel.ring) heroModel.ring.visible = true;
        animateModel(heroModel, player, now, dt);
    }
}

// ---------- Squad followers ----------

function trailPoint(i) {
    if (trail[i]) return trail[i];
    const back = trail.length ? trail[trail.length - 1] : { x: player.x, y: player.y };
    return { x: back.x, y: back.y + 0.6 * (i - trail.length + 1) };
}

// In battle the squad fans out beside and beyond the fight, away from the camera.
function formationPoint(i, foe) {
    const midX = (player.x + foe.x) / 2;
    const midZ = Math.min(player.y, foe.y) + (player.y === foe.y ? 0 : 0.5);
    const side = i % 2 ? 1 : -1;
    const k = Math.floor(i / 2);
    return { x: midX + side * (1.2 + (k % 2) * 0.7 + Math.floor(k / 2) * 0.9), y: midZ - 0.3 - (k % 2) * 0.9 };
}

function syncFollowers(now, dt) {
    const ids = new Set(player.squad.map(s => s.id));
    const pace = player.mounted ? 9 : 5.5;
    player.squad.forEach((s, i) => {
        let f = followers.get(s.id);
        if (!f) {
            const start = trailPoint(i);
            const m = makeModel({ unit: s.type });
            f = { m, e: { x: start.x, y: start.y, rx: start.x, ry: start.y } };
            followers.set(s.id, f);
            scene.add(m.root);
        }
        const target = ui.battle ? formationPoint(i, ui.battle.ent) : trailPoint(i);
        f.e.x = target.x;
        f.e.y = target.y;
        approach(f.e, pace, dt);
        if (ui.battle) f.m.facing = Math.atan2(ui.battle.ent.x - f.e.rx, ui.battle.ent.y - f.e.ry);
        animateModel(f.m, f.e, now, dt);
    });
    for (const [id, f] of followers) {
        if (ids.has(id)) continue;
        if (dyingStep(f.m, now)) { scene.remove(f.m.root); followers.delete(id); }
    }
}

function clearFollowers() {
    for (const f of followers.values()) scene.remove(f.m.root);
    followers.clear();
}

// ---------- Battle effects ----------

function facePair(ent) {
    const fm = models.get(ent);
    heroModel.facing = Math.atan2(ent.x - player.x, ent.y - player.y);
    if (fm) fm.facing = Math.atan2(player.x - ent.x, player.y - ent.y);
}

function fxAttack(heroAttacks, text, color) {
    const b = ui.battle;
    if (!b || !heroModel) return;
    const foeModel = models.get(b.ent);
    const attacker = heroAttacks ? heroModel : foeModel;
    const target = heroAttacks ? foeModel : heroModel;
    const from = heroAttacks ? player : b.ent;
    const to = heroAttacks ? b.ent : player;
    if (attacker) attacker.lunge = { start: performance.now(), dx: Math.sign(to.x - from.x), dz: Math.sign(to.y - from.y) };
    if (target) setTimeout(() => { target.flashUntil = performance.now() + 260; }, 160);
    if (text) floatText(to, text, color, heroAttacks ? (b.def.boss ? 2.6 : 1.4) : 1.7);
}

function fxSquad() {
    if (!ui.battle) return;
    const foe = ui.battle.ent;
    let i = 0;
    for (const f of followers.values()) {
        if (f.m.dyingAt) continue;
        const dx = foe.x - f.e.rx;
        const dz = foe.y - f.e.ry;
        const len = Math.hypot(dx, dz) || 1;
        setTimeout(() => { f.m.lunge = { start: performance.now(), dx: dx / len, dz: dz / len }; }, i * 70);
        i++;
    }
}

function floatText(e, text, color, height) {
    if (!camera) return;
    const v = new THREE.Vector3(e.rx, surfaceAt(e.rx, e.ry) + height, e.ry).project(camera);
    const el = document.createElement('div');
    el.className = 'dmg';
    el.textContent = text;
    el.style.color = color;
    el.style.left = `${((v.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - v.y) / 2) * 100}%`;
    $('frame').appendChild(el);
    setTimeout(() => el.remove(), 1000);
}
