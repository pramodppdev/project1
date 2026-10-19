'use strict';

// ---------- Realistic 3D world ----------
// The game runs on a tile grid; this file dresses any generated world as a continuous
// landscape: chunked heightfield terrain, one water plane for sea, lakes and rivers,
// vegetation streamed in around the hero, regional buildings, fields, sky and weather.

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
let skyDome = null;
let stars = null;
let rain = null;
let rainDrops = [];
let waterBump = null;
let windowMat = null;
let worldGroup = null;
let vegGroup = null;
let trees = [];
let flames = [];
let flags3d = [];
let cropMeshes = {};
let placeGroups = [];
let cows = [];
let vegCenter = null;
const scrollMeshes = new Map();

const EXT = 10;
const CHUNK = 32;
const VEG_RADIUS = 26;
let tileH = null;

function shade(hex, amt) {
    const c = new THREE.Color(hex);
    c.offsetHSL(0, 0, amt);
    return `#${c.getHexString()}`;
}

function hash(x, y) {
    return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

// ---------- Terrain heights ----------

function rawHeight(x, y) {
    const i = idx(x, y);
    const g = ground[i];
    const o = objects[i];
    const b = biome[i];
    const n = fbm(x * 0.33 + 17, y * 0.33 + 5);
    if (g === 'o') return -1.7;
    if (g === '~' || g === '=') return -0.95;
    if (o === 'M' || o === 'C') return 2.0 + n * 2.6 + (b === 'snow' || b === 'peak' ? 0.8 : 0);
    let h;
    switch (b) {
        case 'snow': h = 0.6 + n * 0.7; break;
        case 'badlands': h = 0.2 + Math.round(n * 3) / 3 * 0.75; break;
        case 'desert': h = 0.1 + Math.pow(Math.sin(x * 0.6 + y * 0.3) * 0.5 + 0.5, 2) * 0.6 * n + n * 0.12; break;
        case 'beach': h = 0.02 + n * 0.06; break;
        case 'marsh': h = -0.12 + n * 0.12; break;
        case 'forest': case 'jungle': h = 0.14 + n * 0.36; break;
        case 'savanna': h = 0.1 + n * 0.16; break;
        default: h = 0.07 + n * 0.2;
    }
    if (g === 'p' || g === 'a') h = Math.max(0.03, h * 0.7);
    return h;
}

function computeHeights() {
    const N = MAP_W * MAP_H;
    const raw = new Float32Array(N);
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) raw[idx(x, y)] = rawHeight(x, y);
    let cur = raw;
    for (let pass = 0; pass < 2; pass++) {
        const next = new Float32Array(N);
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
                const i = idx(x, y);
                const g = ground[i];
                if (g === '~' || g === '=') v = Math.min(v, -0.6);
                else if (g === 'o') v = Math.min(v, -1.1);
                else v = Math.max(v, -0.2);
                if (objects[i] === 'M') v = Math.max(v, raw[i] * 0.8);
                next[i] = v;
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
    const g = ground[idx(cx, cy)];
    if (g === 'o') return base - d * 0.05;
    if (g === '~' || g === '=') return -0.95;
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

// ---------- Textures and tints ----------

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
    grassland: ['#6c9443', '#86a54d'],
    forest: ['#47692d', '#3b5c27'],
    jungle: ['#35572a', '#2b4a22'],
    savanna: ['#a89a5a', '#94884c'],
    desert: ['#dcc08a', '#cfae74'],
    badlands: ['#b0653a', '#9a5532'],
    snow: ['#9aa48a', '#b4b8a4'],
    peak: ['#8a8378', '#9a948a'],
    marsh: ['#4f6a3c', '#5f7a48'],
    beach: ['#e6d3a0', '#dcc690'],
    water: ['#5e5038', '#6a5a40'],
    ocean: ['#4a6a6a', '#3e5a5e'],
};
const TINT_GROUND = { p: ['#b08d5c', '#a37f50'], a: ['#6a4b30', '#5c4029'], '=': ['#5e5038', '#5e5038'] };

function tileTint(x, y) {
    const cx = Math.max(0, Math.min(MAP_W - 1, x));
    const cy = Math.max(0, Math.min(MAP_H - 1, y));
    const i = idx(cx, cy);
    const pair = TINT_GROUND[ground[i]] || TINT[biome[i]] || TINT.grassland;
    return new THREE.Color(pair[0]).lerp(new THREE.Color(pair[1]), noise2(x * 0.7, y * 0.7));
}

// ---------- Terrain chunks ----------

function buildTerrain(group) {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, map: noiseTexture(128, 190, 255, 1) });
    material.map.repeat.set(CHUNK / 6, CHUNK / 6);
    const rock = new THREE.Color('#847b70');
    const snow = new THREE.Color('#eef2f5');
    const wet = new THREE.Color('#6e6248');
    const seg = 2;
    for (let cz = -EXT; cz < MAP_H + EXT; cz += CHUNK) {
        for (let cx = -EXT; cx < MAP_W + EXT; cx += CHUNK) {
            const w = Math.min(CHUNK, MAP_W + EXT - cx);
            const h = Math.min(CHUNK, MAP_H + EXT - cz);
            const geom = new THREE.PlaneGeometry(w, h, w * seg, h * seg);
            geom.rotateX(-Math.PI / 2);
            const pos = geom.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const fx = pos.getX(i) + cx + w / 2 - 0.5;
                const fz = pos.getZ(i) + cz + h / 2 - 0.5;
                pos.setXYZ(i, fx, heightAt(fx, fz) + (fbm(fx * 1.7, fz * 1.7) - 0.5) * 0.06, fz);
            }
            geom.computeVertexNormals();
            const nrm = geom.attributes.normal;
            const colors = new Float32Array(pos.count * 3);
            for (let i = 0; i < pos.count; i++) {
                const fx = pos.getX(i);
                const fz = pos.getZ(i);
                const x0 = Math.floor(fx);
                const z0 = Math.floor(fz);
                const tx = fx - x0;
                const tz = fz - z0;
                const top = tileTint(x0, z0).lerp(tileTint(x0 + 1, z0), tx);
                const c = top.lerp(tileTint(x0, z0 + 1).lerp(tileTint(x0 + 1, z0 + 1), tx), tz);
                const y = pos.getY(i);
                const steep = 1 - nrm.getY(i);
                if (y < -0.15) c.lerp(wet, Math.min(1, (-0.15 - y) * 3));
                if (steep > 0.18) c.lerp(rock, Math.min(1, (steep - 0.18) * 3));
                if (y > 2.0) c.lerp(snow, Math.min(1, (y - 2.0) * 1.1));
                const k = 0.92 + fbm(fx * 2.3, fz * 2.3) * 0.16;
                colors[i * 3] = c.r * k;
                colors[i * 3 + 1] = c.g * k;
                colors[i * 3 + 2] = c.b * k;
            }
            geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            const mesh = new THREE.Mesh(geom, material);
            mesh.receiveShadow = true;
            group.add(mesh);
        }
    }
}

function buildWater(group) {
    waterBump = noiseTexture(128, 0, 255, Math.round((MAP_W + EXT * 2) / 4));
    const water = new THREE.Mesh(
        new THREE.PlaneGeometry(MAP_W + EXT * 2, MAP_H + EXT * 2, 1, 1),
        new THREE.MeshStandardMaterial({ color: '#2d6f8e', roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86, bumpMap: waterBump, bumpScale: 0.03 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(MAP_W / 2 - 0.5, -0.32, MAP_H / 2 - 0.5);
    water.receiveShadow = true;
    group.add(water);
}

// ---------- Vegetation, streamed around the hero ----------

const VEG = {};
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

function vegMesh(key, geometry, material, count, shadow = true) {
    const im = new THREE.InstancedMesh(geometry, material, count);
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.count = 0;
    im.frustumCulled = false;
    im.userData.max = count;
    // Create per-instance colours up front so the shader is compiled with them from the start.
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
    VEG[key] = im;
    return im;
}

function initVegetation() {
    const leaf = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true });
    const plain = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
    const bark = new THREE.MeshStandardMaterial({ color: '#5a3d26', roughness: 1 });
    const rock = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
    const frond = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide });
    vegGroup = new THREE.Group();
    vegGroup.add(
        vegMesh('trunk', new THREE.CylinderGeometry(0.05, 0.09, 1, 7), bark, 3000),
        vegMesh('canopy', new THREE.IcosahedronGeometry(1, 1), leaf, 6000),
        vegMesh('pine', new THREE.ConeGeometry(1, 1, 8), leaf, 3000),
        vegMesh('frond', new THREE.ConeGeometry(1, 1, 3), frond, 3000),
        vegMesh('cane', new THREE.CylinderGeometry(0.025, 0.03, 1, 5), plain, 3500),
        vegMesh('tuft', new THREE.ConeGeometry(1, 1, 4), plain, 5000, false),
        vegMesh('rock', new THREE.DodecahedronGeometry(1, 0), rock, 2500),
    );
    scene.add(vegGroup);
}

function tiltPart(t, key, ox, oy, oz, sx, sy, sz, color, rotY = 0, rotX = 0, rotZ = 0) {
    t.parts.push({ key, ox, oy, oz, sx, sy, sz, color, rotY, rotX, rotZ });
}

// Each plant is described relative to its base so it can shrink away in place.
function plantSpec(o, x, y, b) {
    const rng = mulberry32(hash(x, y) + 7);
    const t = { x: x + (rng() - 0.5) * 0.4, z: y + (rng() - 0.5) * 0.4, parts: [], vis: 1, tall: true };
    const green = (h0, s0, l0) => new THREE.Color().setHSL(h0 + rng() * 0.06, s0, l0 + rng() * 0.08, THREE.SRGBColorSpace);
    const s = 0.8 + rng() * 0.5;
    switch (o) {
        case 'T': {
            const trunkH = (0.9 + rng() * 0.5) * s;
            tiltPart(t, 'trunk', 0, trunkH / 2, 0, s, trunkH, s);
            for (let k = 0; k < (b === 'forest' ? 3 : 2); k++) {
                const r = (0.38 + rng() * 0.22) * s;
                tiltPart(t, 'canopy', (rng() - 0.5) * 0.5 * s, trunkH + rng() * 0.45 * s, (rng() - 0.5) * 0.5 * s, r, r * 0.85, r, green(0.24, 0.45, 0.22), rng() * 6);
            }
            break;
        }
        case 'J': {
            const trunkH = 1.3 * s;
            tiltPart(t, 'trunk', 0, trunkH / 2, 0, s * 1.8, trunkH, s * 1.8);
            for (let k = 0; k < 3; k++) {
                const a = rng() * 6.28;
                tiltPart(t, 'trunk', Math.cos(a) * 0.45 * s, trunkH * 0.45, Math.sin(a) * 0.45 * s, 0.35, trunkH * 0.9, 0.35);
            }
            for (let k = 0; k < 4; k++) {
                const r = (0.5 + rng() * 0.3) * s;
                tiltPart(t, 'canopy', (rng() - 0.5) * 1.1 * s, trunkH + rng() * 0.4 * s, (rng() - 0.5) * 1.1 * s, r * 1.2, r * 0.7, r * 1.2, green(0.26, 0.5, 0.16), rng() * 6);
            }
            break;
        }
        case 'P': {
            tiltPart(t, 'trunk', 0, 0.2 * s, 0, s * 0.8, 0.4 * s, s * 0.8);
            const dark = green(0.33, 0.35, 0.14);
            tiltPart(t, 'pine', 0, 0.75 * s, 0, 0.42 * s, 0.9 * s, 0.42 * s, dark);
            tiltPart(t, 'pine', 0, 1.25 * s, 0, 0.3 * s, 0.7 * s, 0.3 * s, dark);
            break;
        }
        case 'L': {
            // A coconut or date palm: a leaning trunk and a crown of long fronds.
            const lean = (rng() - 0.5) * 0.5;
            const h = 1.6 * s;
            tiltPart(t, 'trunk', lean * h * 0.5, h / 2, 0, 0.7, h, 0.7, null, 0, 0, -lean);
            for (let k = 0; k < 7; k++) {
                const a = (k / 7) * Math.PI * 2 + rng() * 0.4;
                tiltPart(t, 'frond', lean * h + Math.cos(a) * 0.35, h + 0.02, Math.sin(a) * 0.35, 0.12, 0.8, 0.04, green(0.25, 0.5, 0.25), -a + Math.PI / 2, 0, 1.25);
            }
            break;
        }
        case 'G': {
            for (let k = 0; k < 5; k++) {
                const a = (k / 5) * Math.PI * 2;
                tiltPart(t, 'trunk', Math.cos(a) * 0.25, 0.25, Math.sin(a) * 0.25, 0.3, 0.6, 0.3, null, 0, Math.sin(a) * 0.4, -Math.cos(a) * 0.4);
            }
            tiltPart(t, 'trunk', 0, 0.6, 0, 0.6, 0.6, 0.6);
            tiltPart(t, 'canopy', 0, 1.0, 0, 0.75 * s, 0.4 * s, 0.75 * s, green(0.3, 0.45, 0.17), rng() * 6);
            break;
        }
        case 'Y': {
            for (let k = 0; k < 7; k++) {
                const h = (1.4 + rng() * 0.9) * s;
                const a = rng() * 6.28;
                const r = rng() * 0.25;
                tiltPart(t, 'cane', Math.cos(a) * r, h / 2, Math.sin(a) * r, 1, h, 1, green(0.2, 0.45, 0.35), 0, (rng() - 0.5) * 0.25, (rng() - 0.5) * 0.25);
            }
            tiltPart(t, 'canopy', 0, 1.9 * s, 0, 0.4, 0.3, 0.4, green(0.24, 0.5, 0.3), rng() * 6);
            break;
        }
        case 'c': {
            tiltPart(t, 'trunk', 0, 0.45 * s, 0, 0.6 * s, 0.9 * s, 0.6 * s);
            const olive = green(0.18, 0.3, 0.3);
            tiltPart(t, 'canopy', 0.05, 0.95 * s, 0, 0.55 * s, 0.18 * s, 0.5 * s, olive, rng() * 6);
            tiltPart(t, 'canopy', -0.15, 0.85 * s, 0.1, 0.35 * s, 0.14 * s, 0.35 * s, olive, rng() * 6);
            break;
        }
        case 'k': {
            const tint = b === 'badlands' ? '#9a5a3a' : b === 'desert' || b === 'beach' ? '#b49a74' : '#86807a';
            for (let k = 0; k < 3; k++) {
                const r = 0.25 + rng() * 0.35;
                tiltPart(t, 'rock', (rng() - 0.5) * 0.5, r * 0.45, (rng() - 0.5) * 0.5, r, r * 0.8, r * 1.1, new THREE.Color(tint).offsetHSL(0, 0, (rng() - 0.5) * 0.08), rng() * 6, rng(), rng());
            }
            break;
        }
        case 'M': {
            if (b !== 'snow' && b !== 'peak' && rng() < 0.4) return plantSpec('P', x, y, b);
            return null;
        }
        default:
            return null;
    }
    return t;
}

function groundCover(x, y, b, g) {
    const rng = mulberry32(hash(x, y) + 31);
    const out = [];
    const tuftColor = { grassland: [0.24, 0.45, 0.2], forest: [0.26, 0.45, 0.16], jungle: [0.28, 0.5, 0.14], savanna: [0.13, 0.4, 0.38], marsh: [0.22, 0.4, 0.25] }[b];
    if (tuftColor && (g === '.' || g === 'f' || g === 'j' || g === 'd' || g === 'q')) {
        const n = b === 'marsh' ? 3 : 2;
        for (let k = 0; k < n; k++) {
            const t = { x: x + (rng() - 0.5) * 0.9, z: y + (rng() - 0.5) * 0.9, parts: [], vis: 1 };
            const sz = b === 'marsh' ? 0.04 : 0.03 + rng() * 0.035;
            const tall = b === 'marsh' ? 6 : b === 'savanna' ? 3.4 : 2.4;
            tiltPart(t, 'tuft', 0, sz * tall / 2, 0, sz, sz * tall, sz, new THREE.Color().setHSL(tuftColor[0] + rng() * 0.05, tuftColor[1], tuftColor[2] + rng() * 0.08, THREE.SRGBColorSpace), rng() * 6);
            out.push(t);
        }
    }
    if ((b === 'desert' || b === 'badlands' || b === 'snow' || b === 'beach') && rng() < 0.12) {
        const t = { x: x + (rng() - 0.5) * 0.8, z: y + (rng() - 0.5) * 0.8, parts: [], vis: 1 };
        const r = 0.06 + rng() * 0.12;
        tiltPart(t, 'rock', 0, r * 0.4, 0, r, r * 0.7, r * 1.2, new THREE.Color(b === 'badlands' ? '#9a5a3a' : '#8a837a'), rng() * 6);
        out.push(t);
    }
    return out;
}

function placeTree(t) {
    const v = t.vis;
    for (const p of t.parts) {
        _e.set(p.rotX, p.rotY, p.rotZ);
        _q.setFromEuler(_e);
        _p.set(t.x + p.ox * v, t.y + p.oy * v, t.z + p.oz * v);
        _s.set(p.sx * v + 1e-4, p.sy * v + 1e-4, p.sz * v + 1e-4);
        _m.compose(_p, _q, _s);
        p.im.setMatrixAt(p.i, _m);
        p.im.instanceMatrix.needsUpdate = true;
    }
}

function streamVegetation(force) {
    const cx = Math.round(player.x);
    const cz = Math.round(player.y);
    if (!force && vegCenter && Math.abs(vegCenter[0] - cx) + Math.abs(vegCenter[1] - cz) < 7) return;
    vegCenter = [cx, cz];
    for (const im of Object.values(VEG)) im.count = 0;
    trees = [];
    const R = VEG_RADIUS;
    for (let y = cz - R; y <= cz + R; y++) {
        for (let x = cx - R; x <= cx + R; x++) {
            if ((x - cx) * (x - cx) + (y - cz) * (y - cz) > R * R) continue;
            const inside = inMap(x, y);
            const cxm = Math.max(0, Math.min(MAP_W - 1, x));
            const cym = Math.max(0, Math.min(MAP_H - 1, y));
            const b = biome[idx(cxm, cym)];
            let o = inside ? objects[idx(x, y)] : '';
            if (!inside) {
                // Beyond the map edge the land carries on as wild country.
                const r = (hash(x, y) % 100) / 100;
                if (b === 'forest' || b === 'jungle') o = r < 0.35 ? 'T' : '';
                else if (b === 'grassland' || b === 'savanna') o = r < 0.08 ? (b === 'savanna' ? 'c' : 'T') : '';
                else if (b === 'snow' || b === 'peak') o = r < 0.2 ? 'P' : '';
                else if (b === 'desert') o = r < 0.03 ? 'c' : '';
            }
            const specs = [];
            if (o) { const sp = plantSpec(o, x, y, b); if (sp) specs.push(sp); }
            if (!o && inside) specs.push(...groundCover(x, y, b, ground[idx(x, y)]));
            for (const t of specs) {
                t.y = heightAt(t.x, t.z) - (t.tall ? 0.05 : 0);
                let ok = true;
                for (const p of t.parts) {
                    const im = VEG[p.key];
                    if (im.count >= im.userData.max) { ok = false; break; }
                }
                if (!ok) continue;
                for (const p of t.parts) {
                    p.im = VEG[p.key];
                    p.i = p.im.count++;
                    if (p.color) p.im.setColorAt(p.i, p.color instanceof THREE.Color ? p.color : new THREE.Color(p.color));
                    else if (p.key === 'trunk' || p.key === 'rock') p.im.setColorAt(p.i, new THREE.Color(p.key === 'trunk' ? '#6a4a30' : '#8a837a'));
                }
                placeTree(t);
                if (t.tall) trees.push(t);
            }
        }
    }
    for (const im of Object.values(VEG)) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
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

const MATS3 = {};
function smat(key, color, rough, extra) {
    if (!MATS3[key]) MATS3[key] = std(color, rough, extra);
    return MATS3[key];
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

function houseStyle(st) {
    if (!st) return 'tiled';
    if (st.type === 'monastery' || st.biome === 'snow') return 'stone';
    if (st.type === 'fort' || st.biome === 'desert' || st.biome === 'badlands') return 'flat';
    if (st.type === 'fishing' || st.type === 'ashram' || st.biome === 'jungle' || st.biome === 'marsh') return 'hut';
    return 'tiled';
}

function house(g, x, z, rng, style) {
    const base = heightAt(x, z);
    if (style === 'hut') {
        part(g, geo('hutwall', () => new THREE.CylinderGeometry(0.36, 0.38, 0.55, 12)), smat('mud', '#b9875a', 0.95), x, base + 0.27, z);
        part(g, geo('hutroof', () => new THREE.ConeGeometry(0.56, 0.55, 12)), smat('thatch', '#a68a52', 1), x, base + 0.8, z);
        scaled(part(g, BOXG(), smat('door', '#4a2c16'), x, base + 0.2, z + 0.36), 0.18, 0.34, 0.03);
        return;
    }
    const wallColor = style === 'flat' ? (rng() < 0.5 ? '#d9b07a' : '#e6c99a') : style === 'stone' ? '#e8e4dc' : (rng() < 0.6 ? '#ece3d2' : '#d9a56a');
    const wall = std(wallColor, 0.95);
    scaled(part(g, BOXG(), smat('plinth', '#8a7a66'), x, base + 0.05, z), 0.95, 0.12, 0.85);
    scaled(part(g, BOXG(), wall, x, base + 0.42, z), 0.84, 0.64, 0.74);
    if (style === 'flat') {
        for (const [ox, oz, sx, sz] of [[0, -0.35, 0.86, 0.06], [0, 0.35, 0.86, 0.06], [-0.41, 0, 0.06, 0.76], [0.41, 0, 0.06, 0.76]]) scaled(part(g, BOXG(), wall, x + ox, base + 0.8, z + oz), sx, 0.12, sz);
        if (rng() < 0.3) part(g, geo('dome', () => new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), wall, x + 0.15, base + 0.74, z - 0.1);
    } else if (style === 'stone') {
        scaled(part(g, BOXG(), smat('beam', '#5a3a22'), x, base + 0.78, z), 0.92, 0.08, 0.82);
        scaled(part(g, BOXG(), smat('maroon', '#7a1f2b'), x, base + 0.66, z + 0.371), 0.84, 0.08, 0.02);
    } else {
        const roof = part(g, geo('roof4', () => new THREE.ConeGeometry(0.72, 0.42, 4)), smat('tile', '#a2502c', 0.9), x, base + 0.95, z);
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(1, 1, 0.9);
    }
    scaled(part(g, BOXG(), smat('door', '#4a2c16'), x, base + 0.3, z + 0.371), 0.2, 0.38, 0.02);
    for (const s of [-1, 1]) scaled(part(g, BOXG(), windowMat, x + 0.25 * s, base + 0.5, z + 0.371, false), 0.12, 0.12, 0.02);
}

function temple(g, x, z) {
    const base = heightAt(x, z);
    const stone = smat('templeStone', '#d6a46a', 0.9);
    const saffron = smat('saffron', '#d9772e', 0.85);
    scaled(part(g, BOXG(), smat('templeBase', '#b89a78'), x, base + 0.08, z), 1, 0.16, 1);
    scaled(part(g, BOXG(), stone, x, base + 0.42, z), 0.66, 0.55, 0.66);
    scaled(part(g, BOXG(), stone, x, base + 0.3, z + 0.4), 0.5, 0.3, 0.3);
    const profile = [];
    for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        profile.push(new THREE.Vector2(0.36 * Math.pow(1 - t, 0.7) + 0.03, t * 1.15));
    }
    part(g, geo('shikhara', () => new THREE.LatheGeometry(profile, 8)), saffron, x, base + 0.7, z);
    part(g, geo('kalash', () => new THREE.SphereGeometry(0.05, 12, 10)), smat('gold', '#e8b923', 0.3, { metalness: 0.8 }), x, base + 1.9, z);
    part(g, geo('pole', () => new THREE.CylinderGeometry(0.008, 0.008, 0.4, 5)), smat('wood', '#5a3a1a'), x, base + 2.12, z);
    const flagShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.28, -0.05), new THREE.Vector2(0, -0.12)]);
    flags3d.push(part(g, geo('flag', () => new THREE.ShapeGeometry(flagShape)), smat('flagCloth', '#f08a1a', 0.8, { side: THREE.DoubleSide }), x, base + 2.3, z));
}

function gompa(g, x, z) {
    const base = heightAt(x, z);
    scaled(part(g, BOXG(), smat('gompaWall', '#f2efe8', 0.9), x, base + 0.6, z), 1, 1.2, 0.9);
    scaled(part(g, BOXG(), smat('maroon', '#7a1f2b'), x, base + 1.16, z), 1.02, 0.14, 0.92);
    const roof = part(g, geo('roof4', () => new THREE.ConeGeometry(0.72, 0.42, 4)), smat('gold', '#e8b923', 0.3, { metalness: 0.8 }), x, base + 1.42, z);
    roof.rotation.y = Math.PI / 4;
    scaled(part(g, BOXG(), smat('door', '#4a2c16'), x, base + 0.3, z + 0.451), 0.24, 0.5, 0.02);
    // Strings of prayer flags run from the roof down to the ground.
    const colors = ['#3f6fd0', '#f2f2f2', '#d9442b', '#3f9a4a', '#e8c21a'];
    for (const side of [-1, 1]) {
        for (let k = 0; k < 6; k++) {
            const t = k / 6;
            const fl = part(g, geo('pflag', () => new THREE.PlaneGeometry(0.1, 0.08)), smat(`pf${k % 5}`, colors[k % 5], 0.9, { side: THREE.DoubleSide }), x + side * (0.5 + t * 1.2), base + 1.3 - t * 1.1, z, false);
            fl.rotation.y = Math.PI / 2;
        }
    }
}

function well(g, x, z) {
    const base = heightAt(x, z);
    part(g, geo('wellring', () => new THREE.CylinderGeometry(0.32, 0.34, 0.38, 18, 1, true)), smat('wellStone', '#9a9088', 0.95, { side: THREE.DoubleSide }), x, base + 0.19, z);
    part(g, geo('wellwater', () => new THREE.CircleGeometry(0.3, 18)), smat('wellWater', '#1f4a5e', 0.2), x, base + 0.1, z, false).rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) part(g, geo('wpost', () => new THREE.CylinderGeometry(0.025, 0.03, 0.7, 6)), smat('wood2', '#6b4423'), x + 0.3 * s, base + 0.5, z);
    part(g, geo('wbar', () => new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6)), smat('wood2', '#6b4423'), x, base + 0.82, z).rotation.z = Math.PI / 2;
}

function stall(g, x, z, rng) {
    const base = heightAt(x, z);
    for (const [ox, oz] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) part(g, geo('spost', () => new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5)), smat('wood2', '#6b4423'), x + ox, base + 0.4, z + oz);
    const cloth = std(['#d9442b', '#e8b923', '#2e7d55', '#3f6fd0'][Math.floor(rng() * 4)], 0.9);
    scaled(part(g, BOXG(), cloth, x, base + 0.82, z), 0.85, 0.05, 0.75);
    scaled(part(g, BOXG(), smat('wood2', '#6b4423'), x, base + 0.35, z), 0.7, 0.06, 0.5);
    for (let k = 0; k < 4; k++) part(g, geo('goods', () => new THREE.SphereGeometry(0.06, 8, 6)), std(['#e8892a', '#c0392b', '#7fb54a', '#e8d22a'][k], 0.8), x - 0.24 + k * 0.16, base + 0.43, z);
}

function fortWall(g, x, z) {
    const base = heightAt(x, z);
    const stone = smat('fortStone', '#cf9a5c', 0.92);
    scaled(part(g, BOXG(), stone, x, base + 0.6, z), 1, 1.55, 1);
    for (const [ox, oz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) scaled(part(g, BOXG(), stone, x + ox, base + 1.45, z + oz), 0.22, 0.2, 0.22);
}

function tower(g, x, z) {
    const base = heightAt(x, z);
    const stone = smat('towerStone', '#d4a066', 0.9);
    part(g, geo('tower', () => new THREE.CylinderGeometry(0.55, 0.62, 1.9, 16)), stone, x, base + 0.95, z);
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        part(g, geo('pillar', () => new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6)), stone, x + Math.cos(a) * 0.38, base + 2.12, z + Math.sin(a) * 0.38);
    }
    part(g, geo('chhatri', () => new THREE.SphereGeometry(0.46, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), smat('chhatri', '#e6c08a', 0.8), x, base + 2.32, z);
    part(g, geo('finial', () => new THREE.ConeGeometry(0.05, 0.22, 8)), smat('gold', '#e8b923', 0.3, { metalness: 0.8 }), x, base + 2.88, z);
}

function tent(g, x, z) {
    const base = heightAt(x, z);
    part(g, geo('tent', () => new THREE.ConeGeometry(0.5, 0.95, 7)), smat('tentCloth', '#8c2a2a', 0.95), x, base + 0.47, z);
}

function campfire(g, x, z) {
    const base = heightAt(x, z);
    for (const r of [0.5, -0.5, 1.6]) {
        const log = part(g, geo('log', () => new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6)), smat('log', '#4a2c16'), x, base + 0.05, z);
        log.rotation.set(Math.PI / 2, r, 0);
    }
    const outer = part(g, geo('flame', () => new THREE.ConeGeometry(0.14, 0.42, 8)), new THREE.MeshBasicMaterial({ color: '#ff9a2a' }), x, base + 0.25, z, false);
    const inner = part(g, geo('flameIn', () => new THREE.ConeGeometry(0.07, 0.26, 8)), new THREE.MeshBasicMaterial({ color: '#fff0a0' }), x, base + 0.18, z, false);
    flames.push({ outer, inner, seed: x });
}

function cave(g, x, z) {
    const base = heightAt(x, z);
    const rk = part(g, geo('rockD', () => new THREE.DodecahedronGeometry(1, 0)), smat('caveRock', '#5e5850', 0.95, { flatShading: true }), x, base + 0.7, z);
    rk.scale.set(1.2, 1.1, 1);
    const mouth = part(g, geo('mouth', () => new THREE.SphereGeometry(0.42, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2)), new THREE.MeshBasicMaterial({ color: '#0a0608' }), x, base, z + 0.62, false);
    mouth.scale.set(1, 1.5, 0.4);
}

function bridgeTile(g, x, z) {
    const horiz = (inMap(x - 1, z) && ['=', 'p'].includes(ground[idx(x - 1, z)])) || (inMap(x + 1, z) && ['=', 'p'].includes(ground[idx(x + 1, z)]));
    const wood = smat('bridgeWood', '#7a5230', 0.9);
    const deck = scaled(part(g, BOXG(), wood, x, 0.06, z), horiz ? 1.02 : 0.9, 0.08, horiz ? 0.9 : 1.02);
    deck.receiveShadow = true;
    for (const s of [-1, 1]) {
        const px = horiz ? x : x + 0.42 * s;
        const pz = horiz ? z + 0.42 * s : z;
        part(g, geo('bpost', () => new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6)), wood, px, -0.3, pz);
        const rail = part(g, geo('rail', () => new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6)), wood, px, 0.42, pz);
        if (horiz) rail.rotation.z = Math.PI / 2;
        else rail.rotation.x = Math.PI / 2;
    }
}

function boat(g, x, z, rng) {
    const b = new THREE.Group();
    const hull = part(b, geo('hull', () => new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), smat('hull', '#6b4423', 0.8), 0, 0, 0);
    hull.scale.set(0.45, 0.35, 1.2);
    part(b, geo('mast', () => new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5)), smat('wood2', '#6b4423'), 0, 0.6, 0);
    const sail = part(b, geo('sail', () => new THREE.PlaneGeometry(0.6, 0.8)), smat('sail', '#efe6d2', 0.9, { side: THREE.DoubleSide }), 0, 0.75, 0.02);
    sail.rotation.y = Math.PI / 2;
    b.position.set(x, -0.3, z);
    b.rotation.y = rng() * Math.PI * 2;
    b.userData.bob = rng() * 10;
    flames.push({ boat: b });
    g.add(b);
}

function cart(g, x, z) {
    const base = heightAt(x, z);
    const wood = smat('cartWood', '#7a5230', 0.9);
    scaled(part(g, BOXG(), wood, x, base + 0.42, z), 0.6, 0.06, 0.8);
    for (const s of [-1, 1]) {
        const wheel = part(g, geo('cartwheel', () => new THREE.TorusGeometry(0.28, 0.03, 6, 18)), smat('door', '#4a2c16'), x + 0.36 * s, base + 0.3, z);
        wheel.rotation.y = Math.PI / 2;
    }
    const hay = part(g, geo('hayload', () => new THREE.SphereGeometry(0.3, 10, 8)), smat('hay', '#c9a85a', 1), x, base + 0.55, z - 0.1);
    hay.scale.set(0.9, 0.5, 1.1);
    for (const s of [-1, 1]) {
        const ox = makeModel({ model: 'bullock' });
        ox.root.position.set(x + 0.28 * s, heightAt(x + 0.28 * s, z + 1.25), z + 1.25);
        g.add(ox.root);
    }
}

function haystack(g, x, z) {
    part(g, geo('haystack', () => new THREE.ConeGeometry(0.34, 0.7, 10)), smat('hay', '#c9a85a', 1), x, heightAt(x, z) + 0.35, z);
}

// ---------- Crop fields ----------

function buildFields(st, group) {
    const spots = [];
    const furrows = [];
    for (let y = st.y - st.r - 9; y <= st.y + st.r + 9; y++) {
        for (let x = st.x - st.r - 9; x <= st.x + st.r + 9; x++) {
            if (!inMap(x, y) || fieldOwner[idx(x, y)] !== st.id) continue;
            for (let r = 0; r < 3; r++) {
                furrows.push([x, y - 0.33 + r * 0.33]);
                for (let c = 0; c < 4; c++) spots.push([x - 0.36 + c * 0.24, y - 0.33 + r * 0.33]);
            }
        }
    }
    if (!spots.length) return;
    const blades = new THREE.InstancedMesh(geo('blade', () => new THREE.ConeGeometry(0.07, 1, 5)), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }), spots.length);
    const bushes = new THREE.InstancedMesh(geo('bush', () => new THREE.IcosahedronGeometry(1, 1)), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), spots.length);
    for (const im of [blades, bushes]) {
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spots.length * 3).fill(1), 3);
        im.castShadow = true;
        im.receiveShadow = true;
        group.add(im);
    }
    cropMeshes[st.id] = { blades, bushes, spots, look: '', group };
    const fm = new THREE.InstancedMesh(BOXG(), smat('furrow', '#4a3220', 1), furrows.length);
    furrows.forEach(([x, z], i) => {
        _m.compose(_p.set(x, heightAt(x, z) + 0.02, z), _q.identity(), _s.set(0.9, 0.04, 0.08));
        fm.setMatrixAt(i, _m);
    });
    fm.receiveShadow = true;
    group.add(fm);
}

function updateFields() {
    for (const [sid, cm] of Object.entries(cropMeshes)) {
        if (!cm.group.visible) continue;
        const look = cropLook(sid);
        const key = `${look.crop}:${look.stage.toFixed(1)}`;
        if (cm.look === key) continue;
        cm.look = key;
        const bushy = look.shape === 'bush';
        const show = look.crop && look.stage > 0;
        const rng = mulberry32(sid.length * 31 + 7);
        const young = new THREE.Color(look.young || '#7fb54a');
        const ripe = new THREE.Color(look.ripe || '#d9c25a');
        cm.spots.forEach(([x, z], i) => {
            const h = show ? (0.12 + look.height * look.stage) * (0.75 + rng() * 0.5) : 0;
            const yb = heightAt(x, z);
            const col = young.clone().lerp(ripe, Math.max(0, (look.stage - 0.55) / 0.45)).offsetHSL(0, 0, (rng() - 0.5) * 0.06);
            const [on, off] = bushy ? [cm.bushes, cm.blades] : [cm.blades, cm.bushes];
            if (bushy) _m.compose(_p.set(x, yb + h * 0.5, z), _q.identity(), _s.set(h * 0.45 + 1e-4, h * 0.5 + 1e-4, h * 0.45 + 1e-4));
            else _m.compose(_p.set(x, yb + h * 0.5, z), _q.identity(), _s.set(0.7 + 1e-4, h + 1e-4, 0.7 + 1e-4));
            on.setMatrixAt(i, _m);
            on.setColorAt(i, col);
            _m.makeScale(1e-4, 1e-4, 1e-4);
            off.setMatrixAt(i, _m);
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
    for (const st of WORLD.settlements) {
        if (!['village', 'town', 'fishing'].includes(st.type)) continue;
        for (let k = 0; k < 2; k++) {
            const x = st.x + (k ? 2 : -2);
            const y = st.y + (k ? -1 : 2);
            const e = { x, y, rx: x, ry: y, next: 0, home: st };
            const m = makeModel({ model: 'cow' });
            m.root.visible = false;
            scene.add(m.root);
            cows.push({ e, m });
        }
    }
}

function updateCows(now, dt) {
    for (const c of cows) {
        const near = Math.hypot(c.e.x - player.x, c.e.y - player.y) < 30;
        c.m.root.visible = near;
        if (!near) continue;
        if (now > c.e.next) {
            c.e.next = now + rand(3000, 8000);
            const nx = c.e.x + Math.round(rand(-2, 2));
            const ny = c.e.y + Math.round(rand(-2, 2));
            if (Math.hypot(nx - c.e.home.x, ny - c.e.home.y) <= c.e.home.r + 1 && walkable(nx, ny) && ground[idx(nx, ny)] !== 'p' && !entityAt(nx, ny)) { c.e.x = nx; c.e.y = ny; }
        }
        approach(c.e, 0.7, dt);
        animateModel(c.m, c.e, now, dt, 0.5);
    }
}

// ---------- Manuscripts ----------

function syncScrolls(now) {
    for (const s of WORLD.scrolls) {
        const taken = flags.scrolls.includes(s.id);
        let g = scrollMeshes.get(s.id);
        if (taken || Math.hypot(s.x - player.x, s.y - player.y) > 34) {
            if (g) { scene.remove(g); scrollMeshes.delete(s.id); }
            continue;
        }
        if (!g) {
            g = new THREE.Group();
            const leaf = new THREE.Group();
            const palm = smat('palmleaf', '#e6d3a0', 0.8, { emissive: '#3a2a08' });
            for (let i = 0; i < 5; i++) scaled(part(leaf, BOXG(), palm, 0, i * 0.018, 0), 0.42, 0.012, 0.09);
            for (const sx of [-1, 1]) scaled(part(leaf, BOXG(), smat('wood2', '#6b4423'), 0.22 * sx, 0.04, 0), 0.03, 0.12, 0.12);
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
        worldGroup.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose(); });
    }
    for (const g of scrollMeshes.values()) scene.remove(g);
    scrollMeshes.clear();
    worldGroup = new THREE.Group();
    flames = [];
    flags3d = [];
    cropMeshes = {};
    placeGroups = [];
    computeHeights();
    buildTerrain(worldGroup);
    buildWater(worldGroup);

    // Each settlement and lair is its own group, hidden when far away.
    const owner = new Map();
    const groupFor = (x, y) => {
        let best = null;
        let bd = Infinity;
        for (const pg of placeGroups) {
            const d = Math.hypot(pg.x - x, pg.y - y);
            if (d < bd) { bd = d; best = pg; }
        }
        return best && bd < 14 ? best.group : worldGroup;
    };
    for (const st of WORLD.settlements) {
        const group = new THREE.Group();
        placeGroups.push({ x: st.x, y: st.y, group, st });
        worldGroup.add(group);
        owner.set(st.id, group);
    }
    for (const l of WORLD.lairs) {
        const group = new THREE.Group();
        placeGroups.push({ x: l.x, y: l.y, group });
        worldGroup.add(group);
    }

    const rng = mulberry32(WORLD.seed + 77);
    for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
            const i = idx(x, y);
            const o = objects[i];
            if (ground[i] === '=') { bridgeTile(worldGroup, x, y); continue; }
            if (!o || 'TJPLGYckM'.includes(o)) continue;
            const g = groupFor(x, y);
            if (o === 'H') house(g, x, y, rng, houseStyle(settlementAt(x, y)));
            else if (o === 'K') temple(g, x, y);
            else if (o === 'g') gompa(g, x, y);
            else if (o === 'w') well(g, x, y);
            else if (o === 'V') stall(g, x, y, rng);
            else if (o === 'W') fortWall(g, x, y);
            else if (o === 'X') tower(g, x, y);
            else if (o === 'C') cave(g, x, y);
            else if (o === 'A') tent(g, x, y);
            else if (o === 'F') campfire(g, x, y);
        }
    }
    for (const st of WORLD.settlements) {
        const g = owner.get(st.id);
        cart(g, st.cart[0], st.cart[1]);
        buildFields(st, g);
        if (st.fieldTiles) haystack(g, st.x + st.r + 1.5, st.y + 0.5);
        for (const [bx, by] of st.boats || []) boat(g, bx, by, rng);
    }
    scene.add(worldGroup);
    if (!vegGroup) initVegetation();
    streamVegetation(true);
    spawnCows();
    updateFields();
}

function cullPlaces() {
    for (const pg of placeGroups) pg.group.visible = Math.hypot(pg.x - player.x, pg.y - player.y) < 36;
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
    const here = biomeAt(player.x, player.y);
    const wet = player.weather === 'rain' && here !== 'desert';
    const snowing = wet && (here === 'snow' || here === 'peak');

    const top = lerpColor('#0a1230', wet ? '#6d7884' : '#3f7fc4', day);
    const horizon = lerpColor('#26304f', wet ? '#a7b0b8' : here === 'desert' ? '#e6dcc8' : '#d4e6f2', day);
    if (!wet) horizon.lerp(new THREE.Color('#f39a62'), dusk * 0.7);
    const u = skyDome.material.uniforms;
    u.top.value.copy(top);
    u.horizon.value.copy(horizon);
    u.glow.value.set(wet ? '#000000' : dusk > 0.2 ? '#ffb070' : '#fff6e0').multiplyScalar(day);
    const ang = (t - 0.25) * Math.PI * 2;
    const dir = day > 0.05
        ? new THREE.Vector3(-Math.cos(ang), Math.max(0.08, Math.sin(ang)), 0.35).normalize()
        : new THREE.Vector3(Math.cos(ang), Math.max(0.3, -Math.sin(ang)), 0.35).normalize();
    u.sunDir.value.copy(dir);
    skyDome.position.copy(camera.position);
    scene.fog.color.copy(horizon);
    scene.fog.near = wet ? 10 : 18;
    scene.fog.far = wet ? 30 : 46;

    // At night the "sun" light becomes soft blue moonlight so the land stays readable.
    hemi.intensity = 0.42 + 0.3 * day;
    hemi.color.copy(lerpColor('#7f90c8', '#dfeaff', day));
    sunLight.intensity = (0.55 + 1.35 * day) * (wet ? 0.4 : 1);
    sunLight.color.copy(day > 0.05 ? lerpColor('#fff4e0', '#ff9a5a', dusk) : new THREE.Color('#9fb4e8'));
    const fx = camLook.x;
    const fz = camLook.z;
    sunLight.position.set(fx + dir.x * 30, dir.y * 30, fz + dir.z * 30);
    sunLight.target.position.set(fx, 0, fz);
    sunLight.target.updateMatrixWorld();

    const night = 1 - day;
    torch.intensity = night * 2.2;
    torch.position.set(player.rx + 0.2, surfaceAt(player.rx, player.ry) + 1.5, player.ry + 0.25);
    windowMat.emissiveIntensity = night * 1.4;
    renderer.toneMappingExposure = 0.85 + day * 0.25;
    stars.material.opacity = night * (wet ? 0.05 : 0.95);
    stars.position.copy(camera.position);

    rain.visible = wet;
    if (wet) {
        rain.material.color.set(snowing ? '#ffffff' : '#c4d6e6');
        rain.material.opacity = snowing ? 0.9 : 0.45;
        rainDrops.forEach((d, i) => {
            d.y -= dt * (snowing ? 2.2 : 16);
            if (snowing) d.x += Math.sin(now / 600 + i) * dt * 0.3;
            if (d.y < -1) { d.y += 10; d.x = rand(-10, 10); d.z = rand(-8, 8); }
            const sy = snowing ? 0.04 : 0.5;
            _m.compose(_p.set(fx + d.x, d.y + 0.5, fz + d.z), _q.identity(), _s.set(snowing ? 0.04 : 0.012, sy, snowing ? 0.04 : 0.012));
            rain.setMatrixAt(i, _m);
        });
        rain.instanceMatrix.needsUpdate = true;
    }
}

// ---------- Camera ----------

const camPos = { x: 0, y: 8, z: 7 };
const camLook = { x: 0, y: 0, z: 0 };

function snapCamera() {
    camPos.x = player.rx;
    camPos.y = surfaceAt(player.rx, player.ry) + 7.4;
    camPos.z = player.ry + 6.6;
    camLook.x = player.rx;
    camLook.y = surfaceAt(player.rx, player.ry);
    camLook.z = player.ry;
}

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
    if (Math.hypot(camLook.x - tx, camLook.z - tz) > 12) snapCamera();
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
    if (!renderer || !WORLD) return;
    if (worldDirty) { rebuildWorld(); snapCamera(); }
    streamVegetation(false);
    cullPlaces();
    waterBump.offset.y = (now / 9000) % 1;
    waterBump.offset.x = Math.sin(now / 5000) * 0.05;
    for (const f of flames) {
        if (f.boat) {
            f.boat.position.y = -0.3 + Math.sin(now / 700 + f.boat.userData.bob) * 0.03;
            f.boat.rotation.z = Math.sin(now / 900 + f.boat.userData.bob) * 0.05;
            continue;
        }
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
    scene.add(torch);
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
    resize();
    return true;
}
