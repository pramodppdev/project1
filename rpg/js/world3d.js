'use strict';

// ---------- Realistic 3D world ----------
// The game logic still runs on the tile grid; this file dresses it as a continuous
// landscape: a heightfield terrain, a flowing river, instanced vegetation that fades
// away when it would hide the hero, buildings, crop fields, sky, weather and light.

const canvas = $('world');
let renderer = null;
let scene = null;
let camera = null;
let worldDirty = true;
let battleClearing = null;
let viewW = 1;
let viewH = 1;

let hemi = null;
let sunLight = null;
let torch = null;
let campLight = null;
let skyDome = null;
let stars = null;
let rain = null;
let rainDrops = [];
let waterMesh = null;
let waterBump = null;
let windowMat = null;
let worldGroup = null;
let trees = [];
let flames = [];
let flags3d = [];
let cropMeshes = {};
let cows = [];
const scrollMeshes = new Map();

const EXT = 10;
let tileH = null;

const REGION_PROVINCE = { village: 'rampur', forest: 'dandak', desert: 'thar', mountain: 'himalaya' };

function shade(hex, amt) {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, amt);
    return `#${c.getHexString()}`;
}

function hash(x, y) {
    return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

function lattice(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise2(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = lattice(xi, yi);
    const b = lattice(xi + 1, yi);
    const c = lattice(xi, yi + 1);
    const d = lattice(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, y) {
    return noise2(x, y) * 0.6 + noise2(x * 2.1 + 5, y * 2.1 + 9) * 0.3 + noise2(x * 4.3 + 11, y * 4.3 + 3) * 0.1;
}

// ---------- Terrain heights ----------

function computeHeights() {
    const raw = new Float32Array(MAP_W * MAP_H);
    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            const g = ground[idx(x, y)];
            const o = objects[idx(x, y)];
            const n = fbm(x * 0.35, y * 0.35);
            let h;
            if (g === '~' || g === '=') h = -0.95;
            else if (o === 'M' || o === 'C') h = 2.1 + n * 2.4 + Math.max(0, 12 - y) * 0.12;
            else if (regionAt(x, y) === 'mountain') h = 0.45 + n * 0.45 + Math.max(0, 12 - y) * 0.05;
            else if (g === 's') h = 0.1 + Math.pow(Math.sin(x * 0.6 + y * 0.3) * 0.5 + 0.5, 2) * 0.6 * n + n * 0.12;
            else if (g === 'f') h = 0.12 + n * 0.32;
            else if (g === 'a') h = 0.06 + n * 0.04;
            else if (g === 'p') h = 0.07 + n * 0.1;
            else h = 0.07 + n * 0.18;
            raw[idx(x, y)] = h;
        }
    }
    let cur = raw;
    for (let pass = 0; pass < 2; pass++) {
        const next = new Float32Array(cur.length);
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                let sum = cur[idx(x, y)] * 2;
                let wsum = 2;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (!inMap(nx, ny)) continue;
                    sum += cur[idx(nx, ny)];
                    wsum++;
                }
                let v = sum / wsum;
                const g = ground[idx(x, y)];
                if (g === '~' || g === '=') v = -0.95;
                if (objects[idx(x, y)] === 'M') v = Math.max(v, raw[idx(x, y)] * 0.8);
                next[idx(x, y)] = v;
            }
        }
        cur = next;
    }
    tileH = cur;
}

function tileHeight(x, y) {
    const cx = Math.max(0, Math.min(MAP_W - 1, x));
    const cy = Math.max(0, Math.min(MAP_H - 1, y));
    const base = tileH[cy * MAP_W + cx];
    const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
    if (!d) return base;
    if (ground[idx(cx, cy)] === '~' || ground[idx(cx, cy)] === '=') return -0.95;
    return base + d * 0.3 + fbm(x * 0.3 + 40, y * 0.3 + 40) * d * 0.28;
}

function heightAt(fx, fz) {
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = fx - x0;
    const tz = fz - z0;
    const a = tileHeight(x0, z0);
    const b = tileHeight(x0 + 1, z0);
    const c = tileHeight(x0, z0 + 1);
    const d = tileHeight(x0 + 1, z0 + 1);
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

function surfaceAt(fx, fz) {
    const tx = Math.round(fx);
    const tz = Math.round(fz);
    if (inMap(tx, tz) && ground[idx(tx, tz)] === '=') return 0.12;
    return Math.max(heightAt(fx, fz), -0.3);
}

// ---------- Textures ----------

function noiseTexture(size, lo, hi, repeat) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = Math.floor(i / size);
        const v = lo + (hi - lo) * (fbm(x * 0.08, y * 0.08) * 0.6 + Math.random() * 0.4);
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    return t;
}

const TINT = {
    '.': ['#6c9443', '#86a54d'],
    f: ['#47692d', '#3b5c27'],
    p: ['#b08d5c', '#a37f50'],
    s: ['#dcc08a', '#cfae74'],
    n: ['#8f9a7a', '#a3a88a'],
    a: ['#6a4b30', '#5c4029'],
    '~': ['#5e5038', '#5e5038'],
    '=': ['#5e5038', '#5e5038'],
};

function tileTint(x, y) {
    const cx = Math.max(0, Math.min(MAP_W - 1, x));
    const cy = Math.max(0, Math.min(MAP_H - 1, y));
    const g = ground[idx(cx, cy)];
    const pair = TINT[g] || TINT['.'];
    const c = new THREE.Color(pair[0]).lerp(new THREE.Color(pair[1]), noise2(x * 0.7, y * 0.7));
    if (g !== '~' && g !== '=' && g !== 'p' && g !== 'a') {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (inMap(nx, ny) && ground[idx(nx, ny)] === '~') { c.lerp(new THREE.Color('#7a6848'), 0.45); break; }
        }
    }
    return c;
}

// ---------- Terrain mesh ----------

function buildTerrain(group) {
    const w = MAP_W + EXT * 2;
    const h = MAP_H + EXT * 2;
    const seg = 3;
    const geom = new THREE.PlaneGeometry(w, h, w * seg, h * seg);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const fx = pos.getX(i) + MAP_W / 2 - 0.5;
        const fz = pos.getZ(i) + MAP_H / 2 - 0.5;
        pos.setX(i, fx);
        pos.setZ(i, fz);
        pos.setY(i, heightAt(fx, fz) + (fbm(fx * 1.7, fz * 1.7) - 0.5) * 0.06);
    }
    geom.computeVertexNormals();
    const nrm = geom.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    const rock = new THREE.Color('#847b70');
    const snow = new THREE.Color('#eef2f5');
    for (let i = 0; i < pos.count; i++) {
        const fx = pos.getX(i);
        const fz = pos.getZ(i);
        const x0 = Math.floor(fx);
        const z0 = Math.floor(fz);
        const tx = fx - x0;
        const tz = fz - z0;
        const top = tileTint(x0, z0).lerp(tileTint(x0 + 1, z0), tx);
        const bot = tileTint(x0, z0 + 1).lerp(tileTint(x0 + 1, z0 + 1), tx);
        const c = top.lerp(bot, tz);
        const y = pos.getY(i);
        const steep = 1 - nrm.getY(i);
        if (steep > 0.18) c.lerp(rock, Math.min(1, (steep - 0.18) * 3));
        if (y > 2.1) c.lerp(snow, Math.min(1, (y - 2.1) * 1.2));
        const shadeN = 0.92 + fbm(fx * 2.3, fz * 2.3) * 0.16;
        colors[i * 3] = c.r * shadeN;
        colors[i * 3 + 1] = c.g * shadeN;
        colors[i * 3 + 2] = c.b * shadeN;
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const terrain = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, map: noiseTexture(128, 190, 255, (w / 6) | 0) }));
    terrain.receiveShadow = true;
    group.add(terrain);
}

function buildWater(group) {
    waterBump = noiseTexture(128, 0, 255, 6);
    const water = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, MAP_H + EXT * 2, 1, 1),
        new THREE.MeshStandardMaterial({ color: '#2d6f8e', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86, bumpMap: waterBump, bumpScale: 0.03 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(16.5, -0.32, MAP_H / 2 - 0.5);
    water.receiveShadow = true;
    waterMesh = water;
    group.add(water);
}

// ---------- Instanced vegetation ----------

const VEG = {};

function vegMesh(key, geometry, material, count, shadow = true) {
    const im = new THREE.InstancedMesh(geometry, material, count);
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.count = 0;
    VEG[key] = im;
    return im;
}

function addPart(tree, key, ox, oy, oz, sx, sy, sz, color, rotY = 0) {
    const im = VEG[key];
    const i = im.count++;
    tree.parts.push({ im, i, ox, oy, oz, sx, sy, sz, rotY });
    if (color) im.setColorAt(i, new THREE.Color(color));
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function placeTree(tree) {
    const v = tree.vis;
    for (const p of tree.parts) {
        _e.set(0, p.rotY, 0);
        _q.setFromEuler(_e);
        _p.set(tree.x + p.ox * v, tree.y + p.oy * v, tree.z + p.oz * v);
        _s.set(p.sx * v + 1e-4, p.sy * v + 1e-4, p.sz * v + 1e-4);
        _m.compose(_p, _q, _s);
        p.im.setMatrixAt(p.i, _m);
        p.im.instanceMatrix.needsUpdate = true;
    }
}

function buildVegetation(group) {
    const leaf = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const bark = new THREE.MeshStandardMaterial({ color: '#5a3d26', roughness: 1 });
    const grassMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8a837a', roughness: 0.95, flatShading: true });
    vegMesh('trunk', new THREE.CylinderGeometry(0.05, 0.09, 1, 7), bark, 900);
    vegMesh('canopy', new THREE.IcosahedronGeometry(1, 1), leaf, 1400);
    vegMesh('pine', new THREE.ConeGeometry(1, 1, 8), leaf, 700);
    vegMesh('tuft', new THREE.ConeGeometry(1, 1, 4), grassMat, 2600, false);
    vegMesh('rock', new THREE.DodecahedronGeometry(1, 0), rockMat, 500);
    trees = [];
    const rng = mulberry32(2024);
    const newTree = (x, z) => {
        const t = { x, z, y: heightAt(x, z) - 0.05, parts: [], vis: 1 };
        trees.push(t);
        return t;
    };
    const leafGreen = () => new THREE.Color().setHSL(0.24 + rng() * 0.08, 0.45 + rng() * 0.2, 0.22 + rng() * 0.1);

    for (let y = -EXT + 1; y < MAP_H + EXT - 1; y++) {
        for (let x = -EXT + 1; x < MAP_W + EXT - 1; x++) {
            const inside = inMap(x, y);
            const o = inside ? objects[idx(x, y)] : '';
            const region = inside ? regionAt(x, y) : (x < 16 ? (y < 14 ? 'forest' : 'plains') : (y <= 13 ? 'mountain' : 'desert'));
            const jx = x + (rng() - 0.5) * 0.4;
            const jz = y + (rng() - 0.5) * 0.4;
            const outsideTree = !inside && region !== 'desert' && (x < 15 || x > 18) && rng() < (region === 'mountain' ? 0.25 : 0.3);

            if (o === 'T' || (outsideTree && region !== 'mountain')) {
                const t = newTree(jx, jz);
                const s = 0.8 + rng() * 0.5;
                const trunkH = (0.9 + rng() * 0.5) * s;
                addPart(t, 'trunk', 0, trunkH / 2, 0, s, trunkH, s);
                const blobs = region === 'forest' ? 3 : 2;
                for (let b = 0; b < blobs; b++) {
                    const r = (0.38 + rng() * 0.22) * s;
                    addPart(t, 'canopy', (rng() - 0.5) * 0.5 * s, trunkH + (rng() * 0.45) * s, (rng() - 0.5) * 0.5 * s, r, r * 0.85, r, leafGreen(), rng() * 6);
                }
            } else if ((o === 'M' && rng() < 0.5) || (outsideTree && region === 'mountain')) {
                const t = newTree(jx, jz);
                const s = 0.7 + rng() * 0.6;
                addPart(t, 'trunk', 0, 0.2 * s, 0, s * 0.8, 0.4 * s, s * 0.8);
                const dark = new THREE.Color().setHSL(0.33 + rng() * 0.05, 0.35, 0.16 + rng() * 0.06);
                addPart(t, 'pine', 0, 0.75 * s, 0, 0.42 * s, 0.9 * s, 0.42 * s, dark);
                addPart(t, 'pine', 0, 1.25 * s, 0, 0.3 * s, 0.7 * s, 0.3 * s, dark);
            } else if (o === 'c' || (!inside && region === 'desert' && rng() < 0.12)) {
                // Khejri and acacia: a thin leaning trunk with a flat, airy crown.
                const t = newTree(jx, jz);
                const s = 0.7 + rng() * 0.4;
                addPart(t, 'trunk', 0, 0.45 * s, 0, 0.6 * s, 0.9 * s, 0.6 * s);
                const olive = new THREE.Color().setHSL(0.2 + rng() * 0.04, 0.3, 0.3 + rng() * 0.06);
                addPart(t, 'canopy', 0.05, 0.95 * s, 0, 0.55 * s, 0.18 * s, 0.5 * s, olive, rng() * 6);
                addPart(t, 'canopy', -0.15, 0.85 * s, 0.1, 0.35 * s, 0.14 * s, 0.35 * s, olive, rng() * 6);
            }

            if (!inside || !o) {
                const g = inside ? ground[idx(x, y)] : '.';
                if ((g === '.' || g === 'f') && region !== 'desert' && region !== 'mountain') {
                    const tufts = g === 'f' ? 4 : 3;
                    for (let k = 0; k < tufts; k++) {
                        if (VEG.tuft.count >= 2600) break;
                        const t = { x: x + (rng() - 0.5) * 0.9, z: y + (rng() - 0.5) * 0.9, parts: [], vis: 1 };
                        t.y = heightAt(t.x, t.z);
                        const s = 0.03 + rng() * 0.035;
                        addPart(t, 'tuft', 0, s * 1.2, 0, s, s * 2.4, s, new THREE.Color().setHSL(0.24 + rng() * 0.06, 0.45, 0.17 + rng() * 0.08), rng() * 6);
                        placeTree(t);
                    }
                }
                if ((region === 'desert' || region === 'mountain') && rng() < 0.12 && VEG.rock.count < 500) {
                    const t = { x: x + (rng() - 0.5) * 0.8, z: y + (rng() - 0.5) * 0.8, parts: [], vis: 1 };
                    t.y = heightAt(t.x, t.z);
                    const s = 0.06 + rng() * 0.12;
                    addPart(t, 'rock', 0, s * 0.5, 0, s, s * 0.7, s * 1.2, null, rng() * 6);
                    placeTree(t);
                }
            }
        }
    }
    for (const t of trees) placeTree(t);
    for (const im of Object.values(VEG)) {
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        group.add(im);
    }
}

// Trees between the camera and the hero (or the battle) shrink away so the action stays visible.
function updateCutaway(dt) {
    const fx = battleClearing ? battleClearing.x : player.rx;
    const fz = battleClearing ? battleClearing.z : player.ry;
    const wide = battleClearing ? battleClearing.r : 1.4;
    for (const t of trees) {
        const dz = t.z - fz;
        const near = dz > -0.6 && dz < 3.4 + wide && Math.abs(t.x - fx) < wide + 0.4 + dz * 0.3;
        const target = near ? 0 : 1;
        if (t.vis === target) continue;
        t.vis = Math.max(0, Math.min(1, t.vis + Math.sign(target - t.vis) * dt * 5));
        placeTree(t);
    }
}

// ---------- Buildings and props ----------

function std(color, rough = 0.85, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
}

function part(group, geometry, material, x, y, z, cast = true) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
}

const BOXG = () => geo('box1', () => new THREE.BoxGeometry(1, 1, 1));

function scaled(m, sx, sy, sz) {
    m.scale.set(sx, sy, sz);
    return m;
}

function house(g, x, z, rng, thatch) {
    const base = heightAt(x, z);
    const wall = std(rng() < 0.6 ? '#ece3d2' : '#d9a56a', 0.95);
    scaled(part(g, BOXG(), std('#8a7a66'), x, base + 0.05, z), 0.95, 0.12, 0.85);
    scaled(part(g, BOXG(), wall, x, base + 0.4, z), 0.84, 0.6, 0.74);
    const roof = part(g, geo('roof4', () => new THREE.ConeGeometry(0.72, 0.42, 4)), std(thatch ? '#a68a52' : '#a2502c', 0.9), x, base + 0.91, z);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.9);
    scaled(part(g, BOXG(), std('#4a2c16'), x, base + 0.28, z + 0.371), 0.2, 0.36, 0.02);
    for (const s of [-1, 1]) scaled(part(g, BOXG(), windowMat, x + 0.25 * s, base + 0.48, z + 0.371, false), 0.12, 0.12, 0.02);
}

function temple(g, x, z) {
    const base = heightAt(x, z);
    const stone = std('#d6a46a', 0.9);
    const saffron = std('#d9772e', 0.85);
    scaled(part(g, BOXG(), std('#b89a78'), x, base + 0.08, z), 1, 0.16, 1);
    scaled(part(g, BOXG(), stone, x, base + 0.42, z), 0.66, 0.55, 0.66);
    scaled(part(g, BOXG(), stone, x, base + 0.3, z + 0.4), 0.5, 0.3, 0.3);
    const profile = [];
    for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        profile.push(new THREE.Vector2(0.36 * Math.pow(1 - t, 0.7) + 0.03, t * 1.15));
    }
    part(g, geo('shikhara', () => new THREE.LatheGeometry(profile, 8)), saffron, x, base + 0.7, z);
    const am = part(g, geo('amalaka', () => new THREE.TorusGeometry(0.07, 0.035, 8, 16)), stone, x, base + 1.86, z);
    am.rotation.x = Math.PI / 2;
    part(g, geo('kalash', () => new THREE.SphereGeometry(0.05, 12, 10)), std('#e8b923', 0.3, { metalness: 0.8 }), x, base + 1.93, z);
    part(g, geo('pole', () => new THREE.CylinderGeometry(0.008, 0.008, 0.4, 5)), std('#5a3a1a'), x, base + 2.15, z);
    const flagShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.28, -0.05), new THREE.Vector2(0, -0.12)]);
    const flag = part(g, geo('flag', () => new THREE.ShapeGeometry(flagShape)), std('#f08a1a', 0.8, { side: THREE.DoubleSide }), x, base + 2.33, z);
    flags3d.push(flag);
    scaled(part(g, BOXG(), std('#3a2414'), x, base + 0.27, z + 0.556), 0.16, 0.24, 0.02);
}

function well(g, x, z) {
    const base = heightAt(x, z);
    part(g, geo('wellring', () => new THREE.CylinderGeometry(0.32, 0.34, 0.38, 18, 1, true)), std('#9a9088', 0.95, { side: THREE.DoubleSide }), x, base + 0.19, z);
    part(g, geo('wellwater', () => new THREE.CircleGeometry(0.3, 18)), std('#1f4a5e', 0.2), x, base + 0.1, z, false).rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) part(g, geo('wpost', () => new THREE.CylinderGeometry(0.025, 0.03, 0.7, 6)), std('#6b4423'), x + 0.3 * s, base + 0.5, z);
    const bar = part(g, geo('wbar', () => new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6)), std('#6b4423'), x, base + 0.82, z);
    bar.rotation.z = Math.PI / 2;
    part(g, geo('wheel', () => new THREE.TorusGeometry(0.07, 0.015, 6, 14)), std('#4a2c16'), x, base + 0.82, z);
}

function fortWall(g, x, z, kind) {
    const base = heightAt(x, z);
    const stone = std(kind === 'ruin' ? '#9c8060' : '#cf9a5c', 0.92);
    const h = kind === 'ruin' ? 0.5 + (hash(x, z) % 5) * 0.12 : 1.35;
    scaled(part(g, BOXG(), stone, x, base + h / 2 - 0.1, z), 1, h + 0.2, 1);
    if (kind !== 'ruin') {
        for (const [ox, oz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) scaled(part(g, BOXG(), stone, x + ox, base + h + 0.08, z + oz), 0.22, 0.2, 0.22);
    }
}

function tower(g, x, z) {
    const base = heightAt(x, z);
    const stone = std('#d4a066', 0.9);
    part(g, geo('tower', () => new THREE.CylinderGeometry(0.55, 0.62, 1.9, 16)), stone, x, base + 0.95, z);
    part(g, geo('towerTop', () => new THREE.CylinderGeometry(0.62, 0.55, 0.12, 16)), stone, x, base + 1.95, z);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        part(g, geo('pillar', () => new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6)), stone, x + Math.cos(a) * 0.38, base + 2.22, z + Math.sin(a) * 0.38);
    }
    part(g, geo('chhatri', () => new THREE.SphereGeometry(0.46, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), std('#e6c08a', 0.8), x, base + 2.42, z);
    part(g, geo('finial', () => new THREE.ConeGeometry(0.05, 0.22, 8)), std('#e8b923', 0.3, { metalness: 0.7 }), x, base + 2.98, z);
}

function rocks(g, x, z, big) {
    const base = heightAt(x, z);
    const m = std('#7d766c', 0.95, { flatShading: true });
    const rng = mulberry32(hash(x, z));
    const n = big ? 1 : 3;
    for (let i = 0; i < n; i++) {
        const r = big ? 0.85 : 0.22 + rng() * 0.2;
        const rk = part(g, geo('rockD', () => new THREE.DodecahedronGeometry(1, 0)), m, x + (rng() - 0.5) * 0.4, base + r * 0.5, z + (rng() - 0.5) * 0.4);
        rk.scale.set(r, r * 0.8, r * 1.1);
        rk.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    }
}

function tent(g, x, z) {
    const base = heightAt(x, z);
    part(g, geo('tent', () => new THREE.ConeGeometry(0.5, 0.95, 7)), std('#8c2a2a', 0.95), x, base + 0.47, z);
    part(g, geo('tentDoor', () => new THREE.PlaneGeometry(0.22, 0.45)), std('#2a1410', 1, { side: THREE.DoubleSide }), x, base + 0.24, z + 0.42, false).rotation.x = -0.45;
}

function campfire(g, x, z) {
    const base = heightAt(x, z);
    for (const r of [0.5, -0.5, 1.6]) {
        const log = part(g, geo('log', () => new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6)), std('#4a2c16'), x, base + 0.05, z);
        log.rotation.set(Math.PI / 2, r, 0);
    }
    const outer = part(g, geo('flame', () => new THREE.ConeGeometry(0.14, 0.42, 8)), new THREE.MeshBasicMaterial({ color: '#ff9a2a' }), x, base + 0.25, z, false);
    const inner = part(g, geo('flameIn', () => new THREE.ConeGeometry(0.07, 0.26, 8)), new THREE.MeshBasicMaterial({ color: '#fff0a0' }), x, base + 0.18, z, false);
    flames.push({ outer, inner, seed: x });
    campLight.position.set(x, base + 0.6, z);
}

function bridge(g, broken) {
    const wood = std('#7a5230', 0.9);
    const z = 21;
    for (const x of [15.6, 16.2, 16.8, 17.4]) {
        for (const s of [-1, 1]) part(g, geo('bpost', () => new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6)), wood, x, -0.35, z + 0.42 * s);
    }
    if (broken) {
        scaled(part(g, BOXG(), wood, 15.75, 0.02, z), 0.4, 0.06, 0.8);
        const p = scaled(part(g, BOXG(), wood, 17.3, -0.08, z + 0.1), 0.35, 0.06, 0.6);
        p.rotation.z = 0.4;
        return;
    }
    scaled(part(g, BOXG(), wood, 16.5, 0.06, z), 2.2, 0.08, 0.9);
    for (const s of [-1, 1]) {
        const rail = part(g, geo('rail', () => new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6)), wood, 16.5, 0.42, z + 0.42 * s);
        rail.rotation.z = Math.PI / 2;
    }
}

function cave(g, x, z) {
    const base = heightAt(x, z);
    const rk = part(g, geo('rockD', () => new THREE.DodecahedronGeometry(1, 0)), std('#5e5850', 0.95, { flatShading: true }), x, base + 0.7, z);
    rk.scale.set(1.2, 1.1, 1);
    const mouth = part(g, geo('mouth', () => new THREE.SphereGeometry(0.42, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2)), new THREE.MeshBasicMaterial({ color: '#0a0608' }), x, base, z + 0.62, false);
    mouth.scale.set(1, 1.5, 0.4);
}

function cart(g, x, z) {
    const base = heightAt(x, z);
    const wood = std('#7a5230', 0.9);
    scaled(part(g, BOXG(), wood, x, base + 0.42, z), 0.6, 0.06, 0.8);
    for (const s of [-1, 1]) {
        scaled(part(g, BOXG(), wood, x + 0.3 * s, base + 0.52, z), 0.04, 0.16, 0.8);
        const wheel = part(g, geo('cartwheel', () => new THREE.TorusGeometry(0.28, 0.03, 6, 18)), std('#4a2c16'), x + 0.36 * s, base + 0.3, z);
        wheel.rotation.y = Math.PI / 2;
        for (let k = 0; k < 4; k++) {
            const spoke = part(g, geo('spoke', () => new THREE.CylinderGeometry(0.012, 0.012, 0.54, 4)), std('#4a2c16'), x + 0.36 * s, base + 0.3, z);
            spoke.rotation.x = (k * Math.PI) / 4;
        }
    }
    const yoke = part(g, geo('yoke', () => new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6)), wood, x, base + 0.42, z + 0.85);
    yoke.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) {
        const ox = makeModel({ model: 'bullock' });
        ox.root.position.set(x + 0.28 * s, base, z + 1.25);
        ox.body.rotation.y = 0;
        g.add(ox.root);
    }
    const hay = part(g, geo('hayload', () => new THREE.SphereGeometry(0.3, 10, 8)), std('#c9a85a', 1), x, base + 0.55, z - 0.1);
    hay.scale.set(0.9, 0.5, 1.1);
}

function haystack(g, x, z) {
    const base = heightAt(x, z);
    part(g, geo('haystack', () => new THREE.ConeGeometry(0.34, 0.7, 10)), std('#c9a85a', 1), x, base + 0.35, z);
}

// ---------- Crop fields ----------

function fieldTilesFor(prov) {
    const out = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        if (ground[idx(x, y)] === 'a' && REGION_PROVINCE[regionAt(x, y)] === prov) out.push([x, y]);
    }
    return out;
}

function buildFields(group) {
    cropMeshes = {};
    const furrows = [];
    for (const prov of Object.keys(PROVINCES)) {
        const tiles = fieldTilesFor(prov);
        if (!tiles.length) continue;
        const spots = [];
        for (const [x, y] of tiles) {
            for (let r = 0; r < 3; r++) {
                furrows.push([x, y - 0.33 + r * 0.33]);
                for (let c = 0; c < 4; c++) spots.push([x - 0.36 + c * 0.24, y - 0.33 + r * 0.33]);
            }
        }
        const blades = new THREE.InstancedMesh(geo('blade', () => new THREE.ConeGeometry(0.07, 1, 5)), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), spots.length);
        const bushes = new THREE.InstancedMesh(geo('bush', () => new THREE.IcosahedronGeometry(1, 1)), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), spots.length);
        for (const im of [blades, bushes]) { im.castShadow = true; im.receiveShadow = true; group.add(im); }
        cropMeshes[prov] = { blades, bushes, spots, look: '' };
    }
    const fm = new THREE.InstancedMesh(BOXG(), std('#4a3220', 1), furrows.length);
    furrows.forEach(([x, z], i) => {
        _m.compose(_p.set(x, heightAt(x, z) + 0.02, z), _q.identity(), _s.set(0.9, 0.04, 0.08));
        fm.setMatrixAt(i, _m);
    });
    fm.receiveShadow = true;
    group.add(fm);
}

function updateFields() {
    for (const [prov, cm] of Object.entries(cropMeshes)) {
        const look = cropLook(prov);
        const key = `${look.crop}:${look.stage.toFixed(1)}`;
        if (cm.look === key) continue;
        cm.look = key;
        const bushy = look.shape === 'bush';
        const show = look.crop && look.stage > 0;
        const rng = mulberry32(prov.length * 31);
        const young = new THREE.Color(look.young || '#7fb54a');
        const ripe = new THREE.Color(look.ripe || '#d9c25a');
        cm.spots.forEach(([x, z], i) => {
            const jitter = 0.75 + rng() * 0.5;
            const h = show ? (0.12 + look.height * look.stage) * jitter : 0;
            const yb = heightAt(x, z);
            const col = young.clone().lerp(ripe, Math.max(0, (look.stage - 0.55) / 0.45)).offsetHSL(0, 0, (rng() - 0.5) * 0.06);
            if (bushy) {
                _m.compose(_p.set(x, yb + h * 0.5, z), _q.identity(), _s.set(h * 0.45 + 1e-4, h * 0.5 + 1e-4, h * 0.45 + 1e-4));
                cm.bushes.setMatrixAt(i, _m);
                cm.bushes.setColorAt(i, col);
                _m.makeScale(1e-4, 1e-4, 1e-4);
                cm.blades.setMatrixAt(i, _m);
            } else {
                _m.compose(_p.set(x, yb + h * 0.5, z), _q.identity(), _s.set(0.7 + 1e-4, h + 1e-4, 0.7 + 1e-4));
                cm.blades.setMatrixAt(i, _m);
                cm.blades.setColorAt(i, col);
                _m.makeScale(1e-4, 1e-4, 1e-4);
                cm.bushes.setMatrixAt(i, _m);
            }
        });
        for (const im of [cm.blades, cm.bushes]) {
            im.instanceMatrix.needsUpdate = true;
            if (im.instanceColor) im.instanceColor.needsUpdate = true;
        }
    }
}

// ---------- Village cattle ----------

function spawnCows() {
    for (const c of cows) scene.remove(c.m.root);
    cows = [];
    const spots = [[4, 24], [11, 22], [6, 21], [12, 26]];
    for (const [x, y] of spots) {
        const e = { x, y, rx: x, ry: y, next: 0 };
        const m = makeModel({ model: 'cow' });
        scene.add(m.root);
        cows.push({ e, m });
    }
}

function updateCows(now, dt) {
    for (const c of cows) {
        if (now > c.e.next) {
            c.e.next = now + rand(3000, 8000);
            const nx = c.e.x + Math.round(rand(-2, 2));
            const ny = c.e.y + Math.round(rand(-2, 2));
            if (regionAt(nx, ny) === 'village' && walkable(nx, ny) && ground[idx(nx, ny)] !== 'p') { c.e.x = nx; c.e.y = ny; }
        }
        approach(c.e, 0.7, dt);
        animateModel(c.m, c.e, now, dt, 0.5);
    }
}

// ---------- Manuscripts ----------

function syncScrolls(now) {
    for (const s of SCROLLS) {
        const taken = flags.scrolls.includes(s.id);
        let g = scrollMeshes.get(s.id);
        if (taken) {
            if (g) { scene.remove(g); scrollMeshes.delete(s.id); }
            continue;
        }
        if (!g) {
            g = new THREE.Group();
            const leaf = new THREE.Group();
            const palm = std('#e6d3a0', 0.8, { emissive: '#3a2a08' });
            for (let i = 0; i < 5; i++) scaled(part(leaf, BOXG(), palm, 0, i * 0.018, 0), 0.42, 0.012, 0.09);
            for (const sx of [-1, 1]) scaled(part(leaf, BOXG(), std('#6b4423'), 0.22 * sx, 0.04, 0), 0.03, 0.12, 0.12);
            part(leaf, geo('cord', () => new THREE.TorusGeometry(0.05, 0.008, 6, 12)), std('#b8322a'), 0, 0.04, 0).rotation.y = Math.PI / 2;
            leaf.position.y = 0.55;
            g.add(leaf);
            const beam = new THREE.Mesh(geo('beam', () => new THREE.CylinderGeometry(0.06, 0.12, 3, 10, 1, true)), new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
            beam.position.y = 1.5;
            g.add(beam);
            g.userData.leaf = leaf;
            g.position.set(s.x, heightAt(s.x, s.y), s.y);
            scene.add(g);
            scrollMeshes.set(s.id, g);
        }
        g.userData.leaf.rotation.y = now / 800;
        g.userData.leaf.position.y = 0.55 + Math.sin(now / 420 + s.x) * 0.06;
    }
}

// ---------- World assembly ----------

function rebuildWorld() {
    worldDirty = false;
    if (worldGroup) {
        scene.remove(worldGroup);
        worldGroup.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    }
    worldGroup = new THREE.Group();
    flames = [];
    flags3d = [];
    computeHeights();
    buildTerrain(worldGroup);
    buildWater(worldGroup);
    buildVegetation(worldGroup);
    buildFields(worldGroup);

    const rng = mulberry32(77);
    const towers = new Set(['29,22', '37,22', '29,28', '37,28', '32,22', '34,22']);
    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            const o = objects[idx(x, y)];
            if (o === 'H') house(worldGroup, x, y, rng, regionAt(x, y) !== 'village');
            else if (o === 'K') temple(worldGroup, x, y);
            else if (o === 'w') well(worldGroup, x, y);
            else if (o === 'W') {
                const ruin = regionAt(x, y) === 'desert';
                if (!ruin && towers.has(`${x},${y}`)) tower(worldGroup, x, y);
                else fortWall(worldGroup, x, y, ruin ? 'ruin' : 'fort');
            } else if (o === 'R') rocks(worldGroup, x, y, false);
            else if (o === 'C') cave(worldGroup, x, y);
            else if (o === 'A') tent(worldGroup, x, y);
            else if (o === 'F') campfire(worldGroup, x, y);
        }
    }
    bridge(worldGroup, !flags.bridgeFixed);
    for (const st of Object.values(STATIONS)) cart(worldGroup, st.cart[0], st.cart[1]);
    for (const [x, z] of [[2.6, 27.4], [13.4, 27.5], [19.4, 22.6], [26.6, 22.6]]) haystack(worldGroup, x, z);
    scene.add(worldGroup);
    for (const cm of Object.values(cropMeshes)) cm.look = '';
    updateFields();
}

// ---------- Sky, light and weather ----------

function makeSky() {
    const geom = new THREE.SphereGeometry(90, 24, 16);
    const material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color('#4f8fd0') }, horizon: { value: new THREE.Color('#cfe4f2') }, glow: { value: new THREE.Color('#ffffff') }, sunDir: { value: new THREE.Vector3(0, 1, 0) } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir; varying vec3 vDir; void main(){ float h = clamp(vDir.y*1.6, 0.0, 1.0); vec3 c = mix(horizon, top, pow(h, 0.7)); float s = pow(max(dot(vDir, normalize(sunDir)), 0.0), 64.0); c += glow * s * 0.8; gl_FragColor = vec4(c, 1.0); }',
    });
    skyDome = new THREE.Mesh(geom, material);
    scene.add(skyDome);
}

function lerpColor(a, b, t) {
    return new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));
}

function updateSky(now, dt) {
    const t = player.time;
    const sunH = Math.sin((t - 0.25) * Math.PI * 2);
    const day = Math.max(0, Math.min(1, (sunH + 0.12) / 0.42));
    const dusk = Math.max(0, 1 - Math.abs(sunH) / 0.3);
    const rainy = player.weather === 'rain';

    const top = lerpColor('#0a1230', rainy ? '#6d7884' : '#3f7fc4', day);
    const horizon = lerpColor('#26304f', rainy ? '#a7b0b8' : '#d4e6f2', day);
    if (!rainy) horizon.lerp(new THREE.Color('#f39a62'), dusk * 0.7);
    const u = skyDome.material.uniforms;
    u.top.value.copy(top);
    u.horizon.value.copy(horizon);
    u.glow.value.set(rainy ? '#000000' : dusk > 0.2 ? '#ffb070' : '#fff6e0').multiplyScalar(day);
    const ang = (t - 0.25) * Math.PI * 2;
    const dir = day > 0.05
        ? new THREE.Vector3(-Math.cos(ang), Math.max(0.08, Math.sin(ang)), 0.35).normalize()
        : new THREE.Vector3(Math.cos(ang), Math.max(0.3, -Math.sin(ang)), 0.35).normalize();
    u.sunDir.value.copy(dir);
    skyDome.position.copy(camera.position);
    scene.fog.color.copy(horizon);
    scene.fog.near = rainy ? 10 : 18;
    scene.fog.far = rainy ? 30 : 46;

    // At night the "sun" light becomes soft blue moonlight so the land stays readable.
    hemi.intensity = 0.42 + 0.3 * day;
    hemi.color.copy(lerpColor('#7f90c8', '#dfeaff', day));
    sunLight.intensity = (0.55 + 1.35 * day) * (rainy ? 0.4 : 1);
    sunLight.color.copy(day > 0.05 ? lerpColor('#fff4e0', '#ff9a5a', dusk) : new THREE.Color('#9fb4e8'));
    const fx = camLook.x;
    const fz = camLook.z;
    sunLight.position.set(fx + dir.x * 30, dir.y * 30, fz + dir.z * 30);
    sunLight.target.position.set(fx, 0, fz);
    sunLight.target.updateMatrixWorld();

    const night = 1 - day;
    torch.intensity = night * 2.2;
    torch.position.set(player.rx + 0.2, surfaceAt(player.rx, player.ry) + 1.5, player.ry + 0.25);
    campLight.intensity = (0.6 + night * 2.5) * (1 + Math.sin(now / 80) * 0.1);
    windowMat.emissiveIntensity = night * 1.4;
    renderer.toneMappingExposure = 0.85 + day * 0.25;

    stars.material.opacity = night * (rainy ? 0.05 : 0.95);
    stars.position.copy(camera.position);

    rain.visible = rainy;
    if (rainy) {
        rainDrops.forEach((d, i) => {
            d.y -= dt * 16;
            if (d.y < -1) { d.y += 10; d.x = rand(-10, 10); d.z = rand(-8, 8); }
            _m.compose(_p.set(fx + d.x, d.y + 0.5, fz + d.z), _q.identity(), _s.set(0.012, 0.5, 0.012));
            rain.setMatrixAt(i, _m);
        });
        rain.instanceMatrix.needsUpdate = true;
    }
}

// ---------- Camera ----------

const camPos = { x: START.x, y: 8, z: START.y + 7 };
const camLook = { x: START.x, y: 0, z: START.y };

function updateCamera(dt) {
    const far = viewW / viewH < 0.9 ? 1.45 : 1;
    let tx = player.rx;
    let tz = player.ry;
    let off = [0, 7.4 * far, 6.6 * far];
    let lookUp = 0.6;
    if (ui.battle) {
        const e = ui.battle.ent;
        tx = (player.rx + e.rx) / 2;
        tz = (player.ry + e.ry) / 2;
        const big = ui.battle.def.boss ? 1.5 : 1;
        off = [1.3 * big, 3.0 * far * big, 4.4 * far * big];
        lookUp = 0.8;
    }
    const ground0 = surfaceAt(tx, tz);
    const k = 1 - Math.exp(-dt * 4.5);
    camPos.x += (tx + off[0] - camPos.x) * k;
    camPos.y += (ground0 + off[1] - camPos.y) * k;
    camPos.z += (tz + off[2] - camPos.z) * k;
    camLook.x += (tx - camLook.x) * k;
    camLook.y += (ground0 + lookUp - camLook.y) * k;
    camLook.z += (tz - camLook.z) * k;
    camera.position.set(camPos.x, camPos.y, camPos.z);
    camera.lookAt(camLook.x, camLook.y, camLook.z);
}

function resize() {
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect();
    viewW = Math.max(1, rect.width);
    viewH = Math.max(1, rect.height);
    renderer.setSize(viewW, viewH, false);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
}

function render3d(now, dt) {
    if (!renderer) return;
    if (worldDirty) rebuildWorld();
    waterBump.offset.y = (now / 9000) % 1;
    waterBump.offset.x = Math.sin(now / 5000) * 0.05;
    for (const f of flames) {
        const s = 1 + Math.sin(now / 70 + f.seed) * 0.15;
        f.outer.scale.set(s, 1 + Math.sin(now / 55) * 0.2, s);
        f.inner.scale.set(1, s, 1);
    }
    for (const fl of flags3d) fl.rotation.y = Math.sin(now / 400) * 0.4;
    syncModels(now, dt);
    syncFollowers(now, dt);
    syncScrolls(now);
    updateCows(now, dt);
    updateCutaway(dt);
    updateFields();
    updateCamera(dt);
    updateSky(now, dt);
    renderer.render(scene, camera);
}

function init3d() {
    if (!window.THREE) {
        $('frame').insertAdjacentHTML('beforeend', '<p class="engine-error">The 3D engine could not load. Check your internet connection and reload the page.</p>');
        return false;
    }
    THREE.ColorManagement.legacyMode = false;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#d4e6f2', 18, 46);
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    hemi = new THREE.HemisphereLight('#dfeaff', '#5a4a34', 0.6);
    scene.add(hemi);
    sunLight = new THREE.DirectionalLight('#fff4e0', 1.9);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    Object.assign(sunLight.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 80 });
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.normalBias = 0.03;
    scene.add(sunLight, sunLight.target);
    torch = new THREE.PointLight('#ffb060', 0, 7, 2);
    campLight = new THREE.PointLight('#ff9a3a', 1, 6, 2);
    scene.add(torch, campLight);
    windowMat = new THREE.MeshStandardMaterial({ color: '#2a1e14', emissive: '#ffb040', emissiveIntensity: 0 });

    makeSky();
    const pts = [];
    for (let i = 0; i < 500; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = Math.random() * 0.9 + 0.12;
        pts.push(Math.cos(a) * Math.cos(e) * 80, Math.sin(e) * 80, Math.sin(a) * Math.cos(e) * 80);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.5, transparent: true, opacity: 0, fog: false }));
    scene.add(stars);
    rain = new THREE.InstancedMesh(BOXG(), new THREE.MeshBasicMaterial({ color: '#c4d6e6', transparent: true, opacity: 0.45 }), 600);
    rainDrops = Array.from({ length: 600 }, () => ({ x: rand(-10, 10), y: rand(-1, 9), z: rand(-8, 8) }));
    rain.frustumCulled = false;
    rain.visible = false;
    scene.add(rain);

    heroModel = makeModel({ hero: true });
    scene.add(heroModel.root);
    spawnCows();
    resize();
    return true;
}
