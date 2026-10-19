'use strict';

// ---------- Strategy view: scene, camera, fog of war and instanced models ----------

const canvas = document.getElementById('world');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
let viewW = 1;
let viewH = 1;
let sunLight = null;
let worldGroup = null;
let fogTex = null;
let fogData = null;
const fogUniforms = { fogTex: { value: null }, fogSize: { value: new THREE.Vector2(1, 1) }, fogOn: { value: 1 }, terTex: { value: null } };
let terTex = null;
let terData = null;
let terDrawnAt = -1;
const camTarget = { x: 0, z: 0 };
let camDist = 22;
const CAM_PITCH = 0.96;
let ghost = null;

function vegRadius() {
    return Math.min(46, Math.round(camDist * 1.25 + 8));
}

// Every lit material multiplies its colour by the fog-of-war texture in world space.
function patchFog(material, ground) {
    material.onBeforeCompile = sh => {
        sh.uniforms.terTex = fogUniforms.terTex;
        sh.uniforms.fogTex = fogUniforms.fogTex;
        sh.uniforms.fogSize = fogUniforms.fogSize;
        sh.uniforms.fogOn = fogUniforms.fogOn;
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec2 vFogXZ;')
            .replace('#include <project_vertex>', `#include <project_vertex>
            vec4 fogW = vec4(transformed, 1.0);
            #ifdef USE_INSTANCING
            fogW = instanceMatrix * fogW;
            #endif
            vFogXZ = (modelMatrix * fogW).xz;`);
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\nvarying vec2 vFogXZ;\nuniform sampler2D fogTex;\nuniform sampler2D terTex;\nuniform vec2 fogSize;\nuniform float fogOn;')
            .replace('#include <dithering_fragment>', `#include <dithering_fragment>
            ${ground ? `vec4 ter = texture2D(terTex, (vFogXZ + 0.5) / fogSize);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, ter.rgb, ter.a * fogOn);` : ''}
            float fogV = texture2D(fogTex, (vFogXZ + 0.5) / fogSize).r;
            gl_FragColor.rgb *= mix(1.0, fogV, fogOn);`);
    };
    material.customProgramCacheKey = () => (ground ? 'fog-ground' : 'fog');
    return material;
}

// ---------- Instanced primitive batches ----------

const BATCH = {};
const _mU = new THREE.Matrix4();
const _mP = new THREE.Matrix4();
const _qP = new THREE.Quaternion();
const _eP = new THREE.Euler();
const _vP = new THREE.Vector3();
const _vS = new THREE.Vector3();
const _col = new THREE.Color();
const COLOR_CACHE = new Map();

function C(hex) {
    let c = COLOR_CACHE.get(hex);
    if (!c) { c = new THREE.Color(hex); COLOR_CACHE.set(hex, c); }
    return c;
}

function makeBatch(key, geometry, cap, basic) {
    const material = basic
        ? new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })
        : patchFog(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: key === 'rockb' }));
    const im = new THREE.InstancedMesh(geometry, material, cap);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    im.castShadow = !basic;
    im.receiveShadow = !basic;
    im.frustumCulled = false;
    im.count = 0;
    im.userData.cap = cap;
    BATCH[key] = im;
    worldGroup.add(im);
}

function initBatches() {
    const domeG = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    domeG.translate(0, 0, 0);
    makeBatch('box', new THREE.BoxGeometry(1, 1, 1), 16000);
    makeBatch('cyl', new THREE.CylinderGeometry(0.5, 0.5, 1, 10), 6000);
    makeBatch('cone', new THREE.ConeGeometry(0.5, 1, 10), 3000);
    makeBatch('cone4', (() => { const g = new THREE.ConeGeometry(0.71, 1, 4); g.rotateY(Math.PI / 4); return g; })(), 2000);
    makeBatch('sphere', new THREE.SphereGeometry(0.5, 12, 8), 6000);
    makeBatch('dome', domeG, 2000);
    const ring = new THREE.RingGeometry(0.82, 1, 28);
    ring.rotateX(-Math.PI / 2);
    makeBatch('ring', ring, 600, true);
    makeBatch('glow', new THREE.SphereGeometry(0.5, 10, 8), 400, true);
}

function beginBatches() {
    for (const im of Object.values(BATCH)) im.count = 0;
}

function endBatches() {
    for (const im of Object.values(BATCH)) {
        im.instanceMatrix.needsUpdate = true;
        im.instanceColor.needsUpdate = true;
    }
}

// Push one primitive: position (x,y,z) and scale in the parent frame, an optional rotation.
function prim(key, x, y, z, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
    const im = BATCH[key];
    if (im.count >= im.userData.cap) return;
    _eP.set(rx, ry, rz);
    _qP.setFromEuler(_eP);
    _mP.compose(_vP.set(x, y, z), _qP, _vS.set(sx, sy, sz));
    _mP.premultiply(_mU);
    im.setMatrixAt(im.count, _mP);
    im.setColorAt(im.count, typeof color === 'string' ? C(color) : color);
    im.count++;
}

function frame(x, y, z, yaw = 0, s = 1) {
    _mU.makeRotationY(yaw);
    if (s !== 1) _mU.multiply(_mP.makeScale(s, s, s));
    _mU.setPosition(x, y, z);
}

// ---------- Scene setup ----------

function initRender() {
    THREE.ColorManagement.legacyMode = false;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#05070a');
    camera = new THREE.PerspectiveCamera(40, 1, 0.5, 260);
    scene.add(new THREE.HemisphereLight('#e4eeff', '#5a4a34', 0.75));
    sunLight = new THREE.DirectionalLight('#fff1dc', 1.85);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.normalBias = 0.03;
    scene.add(sunLight, sunLight.target);
    resize();
}

function buildWorldScene() {
    if (worldGroup) {
        scene.remove(worldGroup);
        worldGroup.traverse(o => { if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose(); });
    }
    if (vegGroup) scene.remove(vegGroup);
    for (const k of Object.keys(VEG)) delete VEG[k];
    for (const k of Object.keys(BATCH)) delete BATCH[k];
    vegCenter = null;
    worldGroup = new THREE.Group();
    scene.add(worldGroup);
    fogData = new Uint8Array(MAP_W * MAP_H * 4);
    fogTex = new THREE.DataTexture(fogData, MAP_W, MAP_H, THREE.RGBAFormat);
    fogTex.magFilter = THREE.LinearFilter;
    fogTex.minFilter = THREE.LinearFilter;
    fogUniforms.fogTex.value = fogTex;
    fogUniforms.fogSize.value.set(MAP_W, MAP_H);
    terData = new Uint8Array(MAP_W * MAP_H * 4);
    terTex = new THREE.DataTexture(terData, MAP_W, MAP_H, THREE.RGBAFormat);
    terTex.magFilter = THREE.LinearFilter;
    terTex.minFilter = THREE.LinearFilter;
    fogUniforms.terTex.value = terTex;
    terDrawnAt = -1;
    computeHeights();
    buildTerrain(worldGroup);
    const terrainMeshes = new Set(worldGroup.children);
    buildWater(worldGroup);
    worldGroup.children.forEach(m => { if (m.material && m.material.isMeshStandardMaterial) patchFog(m.material, terrainMeshes.has(m)); });
    initVegetation();
    vegGroup.children.forEach(m => patchFog(m.material));
    initBatches();
    ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 1), new THREE.MeshBasicMaterial({ color: '#4caf50', transparent: true, opacity: 0.45, depthWrite: false }));
    ghost.visible = false;
    worldGroup.add(ghost);
    updateFogTexture();
}

// Borders: a bright line where one kingdom's land meets another's, and a faint wash inside.
function updateTerritoryTexture() {
    if (!terData || !territory || terDrawnAt === G.territoryAt) return;
    terDrawnAt = G.territoryAt;
    const cols = G.players.map(p => new THREE.Color(p.color).convertLinearToSRGB());
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
        const i = idx(x, y);
        const t = territory[i];
        if (!t) { terData[i * 4 + 3] = 0; continue; }
        let edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (inMap(nx, ny) && territory[idx(nx, ny)] !== t) { edge = true; break; }
        }
        const c = cols[t - 1];
        terData[i * 4] = c.r * 255;
        terData[i * 4 + 1] = c.g * 255;
        terData[i * 4 + 2] = c.b * 255;
        terData[i * 4 + 3] = edge ? 190 : 22;
    }
    terTex.needsUpdate = true;
}

function updateFogTexture() {
    if (!fogData) return;
    const N = MAP_W * MAP_H;
    for (let i = 0; i < N; i++) {
        const v = G.revealAll || fogVisible[i] ? 255 : fogExplored[i] ? 118 : 0;
        fogData[i * 4] = v;
    }
    fogTex.needsUpdate = true;
}

function resize() {
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect();
    viewW = Math.max(1, rect.width);
    viewH = Math.max(1, rect.height);
    renderer.setSize(viewW, viewH, false);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    overlay.width = Math.round(viewW * dpr);
    overlay.height = Math.round(viewH * dpr);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    camera.aspect = viewW / viewH;
    camera.updateProjectionMatrix();
}

// ---------- Camera ----------

function clampCamera() {
    camDist = Math.max(9, Math.min(48, camDist));
    camTarget.x = Math.max(0, Math.min(MAP_W - 1, camTarget.x));
    camTarget.z = Math.max(0, Math.min(MAP_H - 1, camTarget.z));
}

function placeCamera() {
    clampCamera();
    const gy = Math.max(0, heightAt(camTarget.x, camTarget.z));
    camera.position.set(camTarget.x, gy + Math.sin(CAM_PITCH) * camDist, camTarget.z + Math.cos(CAM_PITCH) * camDist);
    camera.lookAt(camTarget.x, gy, camTarget.z);
    const r = camDist * 1.15 + 6;
    Object.assign(sunLight.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 140 });
    sunLight.shadow.camera.updateProjectionMatrix();
    sunLight.position.set(camTarget.x - 30, 45, camTarget.z + 18);
    sunLight.target.position.set(camTarget.x, 0, camTarget.z);
    sunLight.target.updateMatrixWorld();
}

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

function screenToGround(sx, sy) {
    _ndc.set((sx / viewW) * 2 - 1, -(sy / viewH) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const o = _ray.ray.origin;
    const d = _ray.ray.direction;
    let h = 0;
    let p = null;
    for (let k = 0; k < 4; k++) {
        const t = (h - o.y) / d.y;
        p = { x: o.x + d.x * t, z: o.z + d.z * t };
        h = Math.max(-0.3, inMap(Math.round(p.x), Math.round(p.z)) ? heightAt(p.x, p.z) : 0);
    }
    return p;
}

const _proj = new THREE.Vector3();
function toScreen(x, y, z) {
    _proj.set(x, y, z).project(camera);
    return { x: (_proj.x + 1) / 2 * viewW, y: (1 - _proj.y) / 2 * viewH, behind: _proj.z > 1 };
}

// ---------- Models ----------

const SKIN = ['#8d5a3b', '#a86b45', '#7a4a2e', '#b57a50'];
const RES_COLOR = { food: '#c2183a', wood: '#7a5230', stone: '#9a968e', gold: '#e0b43c' };

function teamColor(owner) {
    return owner >= 0 ? G.players[owner].color : owner === -2 ? '#e8e0cc' : '#7a5a3a';
}

const SAREE = ['#c2185b', '#e65100', '#2e7d32', '#f9a825', '#6a1b9a', '#00838f', '#ad1457', '#d84315'];
const HAIR = '#1c1410';

function person(u, t, opts) {
    const team = teamColor(u.owner);
    const walk = u.moving ? Math.sin(t * 11 + u.id) : 0;
    const work = u.working || u.building > G.time - 0.2 ? Math.sin(t * 9 + u.id) : 0;
    const atk = G.time - (u.attackAnim || -9) < 0.35 ? Math.sin((G.time - u.attackAnim) / 0.35 * Math.PI) : 0;
    const skin = SKIN[u.id % SKIN.length];
    const y0 = opts.y || 0;
    const pp = u.person;
    const female = pp && pp.female;
    const age = pp ? ageOf(u) : 30;
    const child = age < ADULT_AGE;
    const elder = age >= ELDER_AGE;
    const by = y0 + (opts.mounted ? 0.05 : 0.34) + Math.abs(walk) * 0.015;
    if (!opts.mounted) {
        if (female) {
            // A saree falls to the ground; the free end crosses the shoulder in the kingdom's colour.
            prim('cone', 0, y0 + 0.25, 0, 0.36, 0.52, 0.3, opts.saree || SAREE[u.id % SAREE.length]);
        } else {
            prim('box', -0.07, y0 + 0.17, walk * 0.06, 0.09, 0.34, 0.1, opts.legs || '#e8e0d0', walk * 0.5);
            prim('box', 0.07, y0 + 0.17, -walk * 0.06, 0.09, 0.34, 0.1, opts.legs || '#e8e0d0', -walk * 0.5);
        }
    }
    const lean = elder ? 0.18 : 0;
    prim('box', 0, by + 0.17, 0.02 * lean, female ? 0.24 : 0.27, 0.34, female ? 0.15 : 0.17, opts.body || (female ? opts.blouse || SAREE[(u.id + 3) % SAREE.length] : team), lean);
    if (female) prim('box', 0, by + 0.2, 0.0, 0.07, 0.4, 0.2, opts.sash || team, 0, 0, 0.6);
    else prim('box', 0, by + 0.09, 0, 0.29, 0.06, 0.19, opts.belt || '#d8b26a');
    const hy = by + 0.44;
    const hz = lean * 0.12;
    prim('sphere', 0, hy, hz, 0.17, 0.19, 0.17, skin);
    if (female) {
        prim('sphere', 0, hy + 0.05, hz - 0.015, 0.18, 0.14, 0.18, elder ? '#c8c4bc' : HAIR);
        prim('sphere', 0, hy + 0.02, hz - 0.11, 0.1, 0.1, 0.1, elder ? '#c8c4bc' : HAIR);
        if (!child) prim('sphere', 0, hy + 0.03, hz + 0.085, 0.02, 0.02, 0.01, '#d01030');
    } else if (child) {
        prim('sphere', 0, hy + 0.05, hz - 0.01, 0.18, 0.12, 0.18, HAIR);
    } else {
        prim('sphere', 0, hy + 0.08, hz - 0.01, 0.2, 0.12, 0.2, opts.turban || (elder ? '#f2efe6' : team));
        if (elder) prim('box', 0, hy - 0.08, hz + 0.07, 0.12, 0.1, 0.05, '#e8e4dc');
        else if (u.id % 3 === 0) prim('box', 0, hy - 0.04, hz + 0.08, 0.1, 0.02, 0.02, HAIR);
    }
    // Arms: the right arm swings with work or attack.
    const swing = work * 0.9 + atk * 1.6;
    prim('box', -0.15, by + 0.18, 0, 0.065, 0.3, 0.075, skin, walk * -0.5);
    prim('box', 0.15, by + 0.2, 0.04, 0.065, 0.3, 0.075, skin, -0.4 - swing);
    if (female && !child) for (const s of [-1, 1]) prim('box', s * 0.15, by + 0.08, s > 0 ? 0.08 : 0, 0.075, 0.03, 0.085, '#e0b43c');
    return { by, swing, team, child, female, elder };
}

function unitModel(u, t) {
    const x = u.x;
    const z = u.y;
    const gy = surfaceAt(x, z);
    const type = u.type;
    if (type === 'deer' || type === 'boar') {
        frame(x, gy, z, u.facing);
        const deer = type === 'deer';
        const c = deer ? '#b07a44' : '#4a3a30';
        const walk = u.moving ? Math.sin(t * 12 + u.id) * 0.25 : 0;
        const h = deer ? 0.32 : 0.2;
        for (const [lx, lz, s] of [[-0.09, 0.16, 1], [0.09, 0.16, -1], [-0.09, -0.16, -1], [0.09, -0.16, 1]]) prim('box', lx, h / 2, lz, 0.05, h, 0.05, c, walk * s);
        prim('box', 0, h + 0.09, 0, deer ? 0.2 : 0.26, deer ? 0.18 : 0.22, deer ? 0.48 : 0.5, c);
        prim('box', 0, h + (deer ? 0.25 : 0.1), deer ? 0.27 : 0.3, 0.12, 0.13, deer ? 0.18 : 0.2, deer ? '#9a6a3a' : '#3a2c24', deer ? -0.4 : 0.2);
        if (deer) for (const s of [-1, 1]) prim('box', s * 0.05, h + 0.38, 0.25, 0.02, 0.16, 0.02, '#e8dcc0', 0.3, 0, s * 0.4);
        else for (const s of [-1, 1]) prim('box', s * 0.06, h + 0.05, 0.42, 0.02, 0.02, 0.07, '#f0e8d8');
        return;
    }
    frame(x, gy, z, u.facing, u.scale || 1);
    const team = teamColor(u.owner);
    switch (type) {
        case 'villager': {
            const guard = u.guard || u.alarm;
            const p = person(u, t, u.guard ? { body: '#b8a070', blouse: '#b8a070', belt: '#7a2a1a', turban: '#a02a1a', sash: '#a02a1a' } : { body: u.person && u.person.female ? undefined : '#e9dcc0', belt: team, turban: team });
            if (u.studying) {
                prim('box', 0, p.by + 0.24, 0.16, 0.18, 0.02, 0.13, '#8a3a2a', -0.7);
                prim('box', 0, p.by + 0.245, 0.16, 0.16, 0.022, 0.11, '#f2ead8', -0.7);
            } else if (guard && !(u.task && u.task.type === 'gather')) {
                prim('cyl', 0.2, p.by + 0.25, 0.1, 0.03, 1.0, 0.03, u.guard ? '#5a3a1a' : '#7a5a3a', 0.25 - p.swing * 0.4);
                if (u.alarm && !u.guard) prim('cone', 0.2, p.by + 0.75, 0.22, 0.05, 0.12, 0.05, '#cfd4da', 0.25 - p.swing * 0.4);
            } else if (!p.child || canWork(u)) {
                const tool = u.task && u.task.res === 'wood' ? '#8a8a8a' : '#6a4a2a';
                if (u.task || u.working) prim('box', 0.2, p.by + 0.1, 0.12, 0.03, 0.03, 0.42, tool, -0.6 - p.swing);
                else if (p.female) prim('cyl', 0, p.by + 0.62, 0, 0.16, 0.1, 0.16, '#b8732a');
            }
            if (u.carry && u.carry.amt > 1) prim('box', 0, p.by + 0.22, -0.15, 0.2, 0.18, 0.12, RES_COLOR[u.carry.res]);
            break;
        }
        case 'spearman': {
            const p = person(u, t, {});
            prim('cyl', 0.2, p.by + 0.3, 0.1, 0.025, 1.1, 0.025, '#7a5a3a', 0.25 - p.swing * 0.4);
            prim('cone', 0.2, p.by + 0.86, 0.24, 0.05, 0.12, 0.05, '#cfd4da', 0.25 - p.swing * 0.4);
            prim('cyl', -0.2, p.by + 0.2, 0.06, 0.26, 0.04, 0.26, p.team, Math.PI / 2, 0, 0);
            break;
        }
        case 'swordsman': {
            const p = person(u, t, { legs: '#6a5a4a', turban: '#cfd4da' });
            prim('box', 0.22, p.by + 0.18, 0.2, 0.03, 0.04, 0.42, '#dfe4ea', -0.3 - p.swing);
            prim('cyl', -0.21, p.by + 0.2, 0.06, 0.3, 0.05, 0.3, '#8a6a3a', Math.PI / 2, 0, 0);
            prim('cyl', -0.235, p.by + 0.2, 0.06, 0.14, 0.03, 0.14, p.team, Math.PI / 2, 0, 0);
            break;
        }
        case 'archer': {
            const p = person(u, t, { turban: '#f2ead8' });
            prim('box', -0.2, p.by + 0.25, 0.12, 0.03, 0.6, 0.04, '#6a4024', 0.1 + p.swing * 0.2);
            prim('cyl', 0.06, p.by + 0.3, -0.12, 0.08, 0.32, 0.08, '#7a4a2a', 0.3);
            break;
        }
        case 'cavalry': case 'horsearcher': {
            const walk = u.moving ? Math.sin(t * 13 + u.id) : 0;
            const horse = u.id % 3 === 0 ? '#3a2a20' : u.id % 3 === 1 ? '#8a5a36' : '#e8e0d4';
            for (const [lx, lz, s] of [[-0.11, 0.26, 1], [0.11, 0.26, -1], [-0.11, -0.26, -1], [0.11, -0.26, 1]]) prim('box', lx, 0.22, lz, 0.07, 0.44, 0.07, horse, walk * 0.5 * s);
            prim('box', 0, 0.55, 0, 0.3, 0.28, 0.75, horse);
            prim('box', 0, 0.78, 0.42, 0.14, 0.38, 0.16, horse, -0.6);
            prim('box', 0, 0.68, 0.06, 0.34, 0.06, 0.36, team);
            const p = person(u, t, { mounted: true, y: 0.62, turban: type === 'cavalry' ? '#cfd4da' : team });
            if (type === 'cavalry') prim('cyl', 0.2, p.by + 0.3, 0.3, 0.025, 1.2, 0.025, '#7a5a3a', 1.2 - p.swing * 0.3);
            else prim('box', -0.2, p.by + 0.25, 0.12, 0.03, 0.55, 0.04, '#6a4024', 0.1);
            break;
        }
        case 'elephant': {
            const walk = u.moving ? Math.sin(t * 6 + u.id) : 0;
            const grey = '#7c7a78';
            for (const [lx, lz, s] of [[-0.24, 0.32, 1], [0.24, 0.32, -1], [-0.24, -0.32, -1], [0.24, -0.32, 1]]) prim('cyl', lx, 0.35, lz, 0.2, 0.7, 0.2, grey, walk * 0.25 * s);
            prim('sphere', 0, 0.95, 0, 0.78, 0.66, 1.15, grey);
            prim('sphere', 0, 1.12, 0.6, 0.48, 0.5, 0.44, grey);
            prim('cyl', 0, 0.7, 0.86, 0.1, 0.62, 0.1, grey, 0.35 + Math.sin(t * 2 + u.id) * 0.15);
            for (const s of [-1, 1]) {
                prim('box', s * 0.27, 1.12, 0.55, 0.05, 0.36, 0.28, '#6a6866', 0, 0, s * 0.3);
                prim('cone', s * 0.12, 0.92, 0.84, 0.05, 0.3, 0.05, '#f2ead8', 1.9);
            }
            prim('box', 0, 1.33, -0.02, 0.56, 0.08, 0.66, team);
            prim('box', 0, 1.48, -0.05, 0.46, 0.22, 0.46, '#c9a24a');
            prim('dome', 0, 1.6, -0.05, 0.26, 0.2, 0.26, team);
            prim('box', 0, 1.18, 0.0, 0.8, 0.3, 0.02, team, 0, Math.PI / 2, 0);
            break;
        }
        case 'ram': {
            const wood = '#6a4a2a';
            for (const [lx, lz] of [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3]]) prim('cyl', lx, 0.16, lz, 0.32, 0.08, 0.32, '#4a3424', 0, 0, Math.PI / 2);
            prim('box', 0, 0.42, 0, 0.6, 0.36, 0.95, wood);
            prim('cone4', 0, 0.82, 0, 0.92, 0.5, 1.35, team);
            prim('cyl', 0, 0.4, 0.45 + Math.max(0, Math.sin((G.time - (u.attackAnim || -9)) * 8)) * 0.2, 0.18, 0.9, 0.18, '#5a3a20', Math.PI / 2);
            prim('cone', 0, 0.4, 0.98, 0.2, 0.18, 0.2, '#5a5a5a', Math.PI / 2);
            break;
        }
        case 'rocket': {
            for (const [lx, lz] of [[-0.3, 0.2], [0.3, 0.2]]) prim('cyl', lx, 0.2, lz, 0.4, 0.06, 0.4, '#4a3424', 0, 0, Math.PI / 2);
            prim('box', 0, 0.36, 0, 0.55, 0.12, 0.8, '#6a4a2a');
            for (let k = 0; k < 6; k++) prim('cyl', -0.18 + (k % 3) * 0.18, 0.52 + Math.floor(k / 3) * 0.12, 0.05, 0.08, 0.6, 0.08, k % 2 ? '#3a3a3a' : team, 1.15);
            prim('box', 0, 0.3, 0.5, 0.06, 0.06, 0.4, '#5a3a20');
            break;
        }
        default: break;
    }
    if (u.carry && u.carry.amt > 1 && type !== 'villager') prim('box', 0, 0.62, -0.17, 0.2, 0.18, 0.12, RES_COLOR[u.carry.res]);
}

function carcassModel(c) {
    const gy = surfaceAt(c.x, c.y);
    frame(c.x, gy, c.y, c.id);
    const s = Math.max(0.35, Math.min(1, c.food / 140));
    prim('box', 0, 0.08, 0, 0.42 * s, 0.14, 0.24, c.type === 'boar' ? '#4a3a30' : '#a0703f', 0, 0, 0);
    prim('box', 0.05, 0.12, 0, 0.3 * s, 0.05, 0.16, '#a83a2a');
}

const SAND = '#d9b27a';
const STONE = '#c9b8a0';

function buildingModel(b, t) {
    const n = b.def.size;
    const cx = b.x;
    const cz = b.y;
    let gy = -9;
    for (const [dx, dz] of [[0, 0], [-n / 2, -n / 2], [n / 2, -n / 2], [-n / 2, n / 2], [n / 2, n / 2]]) gy = Math.max(gy, surfaceAt(cx + dx * 0.9, cz + dz * 0.9));
    frame(cx, gy, cz, 0);
    const team = teamColor(b.owner);
    const w = n * 0.92;
    const hp = b.built ? 1 : Math.max(0.08, b.progress);
    if (b.type !== 'farm') prim('box', 0, -0.25, 0, w, 0.55, w, b.built ? '#9a8a74' : '#8a7a62');
    if (!b.built) {
        // Bamboo scaffolding grows with the work.
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prim('cyl', sx * w * 0.45, hp * 0.9, sz * w * 0.45, 0.06, hp * 1.8, 0.06, '#c8a858');
        _mU.multiply(_mP.makeScale(1, hp, 1));
    }
    switch (b.type) {
        case 'tc': {
            prim('box', 0, 0.55, 0, 2.3, 1.1, 2.3, SAND);
            prim('box', 0, 1.12, 0, 2.45, 0.08, 2.45, team);
            prim('box', 0, 1.45, 0, 1.5, 0.66, 1.5, '#e2c290');
            prim('dome', 0, 1.78, 0, 0.62, 0.62, 0.62, '#f0e2c8');
            prim('cone', 0, 2.5, 0, 0.1, 0.24, 0.1, '#e0b43c');
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                prim('cyl', sx * 1.05, 1.35, sz * 1.05, 0.34, 0.5, 0.34, '#e2c290');
                prim('dome', sx * 1.05, 1.6, sz * 1.05, 0.2, 0.2, 0.2, '#f0e2c8');
            }
            prim('box', 0, 0.42, 1.16, 0.6, 0.84, 0.05, '#4a2c16');
            prim('cyl', 0.5, 2.5, 0.5, 0.03, 1.1, 0.03, '#5a4a3a');
            prim('box', 0.72, 2.85, 0.5, 0.42, 0.28, 0.02, team, 0, Math.sin(t * 2) * 0.2, 0);
            break;
        }
        case 'house': {
            if (hasTech(b.owner, 'pucca')) {
                // Fired-brick house with a flat roof, parapet and a little upper room.
                prim('box', 0, 0.5, 0, 1.5, 1.0, 1.3, '#a85a3c');
                prim('box', 0, 1.02, 0, 1.58, 0.06, 1.38, '#d8c8a8');
                for (const [ox, oz, sx, sz] of [[0, -0.66, 1.58, 0.06], [0, 0.66, 1.58, 0.06], [-0.76, 0, 0.06, 1.38], [0.76, 0, 0.06, 1.38]]) prim('box', ox, 1.12, oz, sx, 0.16, sz, '#d8c8a8');
                prim('box', -0.35, 1.3, -0.25, 0.6, 0.5, 0.55, '#b86a48');
                prim('box', 0, 0.34, 0.66, 0.3, 0.58, 0.03, '#4a2c16');
                for (const sx of [-0.45, 0.45]) prim('box', sx, 0.6, 0.66, 0.2, 0.2, 0.03, '#2a1e14');
                prim('box', 0, 0.72, 0.7, 0.6, 0.05, 0.14, team);
            } else {
                prim('box', 0, 0.42, 0, 1.4, 0.84, 1.2, b.id % 2 ? '#ece3d2' : '#d9a56a');
                prim('cone4', 0, 1.1, 0, 1.7, 0.55, 1.45, '#a2502c');
                prim('box', 0, 0.3, 0.61, 0.26, 0.5, 0.03, '#4a2c16');
                prim('box', 0, 0.62, 0.66, 0.5, 0.05, 0.12, team);
            }
            break;
        }
        case 'well': {
            prim('cyl', 0, 0.2, 0, 0.8, 0.4, 0.8, '#a89c8a');
            prim('cyl', 0, 0.41, 0, 0.6, 0.02, 0.6, '#24506e');
            for (const s of [-1, 1]) prim('box', s * 0.35, 0.7, 0, 0.06, 0.65, 0.06, '#6a4a2a');
            prim('box', 0, 1.02, 0, 0.8, 0.06, 0.06, '#6a4a2a');
            prim('cyl', 0, 0.85, 0, 0.12, 0.14, 0.12, '#b8732a');
            break;
        }
        case 'shmashan': {
            // Stone steps down to a burning ghat, with a small shrine and a peepal tree.
            prim('box', 0, 0.06, 0, 1.9, 0.12, 1.9, '#8a847a');
            prim('box', 0, 0.16, 0.1, 1.4, 0.1, 1.4, '#9a948a');
            for (let k = 0; k < 4; k++) prim('box', -0.2 + (k % 2) * 0.4, 0.26 + Math.floor(k / 2) * 0.1, 0.1, 0.5, 0.08, 0.1, '#5a3a20', 0, k * 0.8, 0);
            prim('box', 0.65, 0.45, -0.65, 0.4, 0.5, 0.4, '#d6a46a');
            prim('cone4', 0.65, 0.85, -0.65, 0.45, 0.4, 0.45, '#b86a48');
            prim('cyl', -0.65, 0.6, -0.65, 0.14, 1.0, 0.14, '#5a4030');
            prim('sphere', -0.65, 1.3, -0.65, 0.9, 0.6, 0.9, '#3e6a2a');
            if ((b.pyreUntil || 0) > G.time) {
                const f = 1 + Math.sin(t * 12) * 0.15;
                prim('glow', 0, 0.55, 0.1, 0.5 * f, 0.7 * f, 0.5 * f, '#ff8a20');
                prim('glow', 0, 0.75, 0.1, 0.25, 0.45 * f, 0.25, '#ffd060');
            }
            break;
        }
        case 'market': {
            const awn = ['#d9442b', '#f2b134', '#2a9d9a', '#8e44ad'];
            for (let k = 0; k < 4; k++) {
                const ox = (k % 2 ? 0.65 : -0.65);
                const oz = (k < 2 ? -0.6 : 0.6);
                prim('box', ox, 0.25, oz, 0.9, 0.5, 0.7, '#9a7a4a');
                for (const [px, pz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]]) prim('cyl', ox + px, 0.75, oz + pz, 0.05, 0.5, 0.05, '#6a4a2a');
                prim('cone4', ox, 1.12, oz, 1.1, 0.3, 0.9, awn[k]);
                prim('sphere', ox - 0.2, 0.56, oz + 0.2, 0.22, 0.14, 0.22, ['#e8a020', '#c2183a', '#7aa83a', '#e8dcc0'][k]);
            }
            prim('cyl', 0, 0.9, 0, 0.05, 1.8, 0.05, '#5a4a3a');
            prim('box', 0.2, 1.65, 0, 0.4, 0.26, 0.02, team, 0, Math.sin(t * 2) * 0.2, 0);
            break;
        }
        case 'gurukul': {
            // Thatched huts around a shady banyan where the guru teaches.
            for (const [ox, oz] of [[-0.9, -0.8], [0.9, -0.8], [-0.9, 0.85]]) {
                prim('cyl', ox, 0.3, oz, 0.75, 0.6, 0.75, '#c99a6a');
                prim('cone', ox, 0.85, oz, 1.0, 0.6, 1.0, '#a68a52');
            }
            prim('cyl', 0.5, 0.6, 0.5, 0.3, 1.2, 0.3, '#5a4030');
            prim('sphere', 0.5, 1.45, 0.5, 1.5, 0.8, 1.5, '#3e6a2a');
            prim('box', 0.5, 0.12, 0.5, 1.2, 0.08, 1.2, '#b8a48a');
            prim('box', -0.2, 0.2, 0.3, 0.5, 0.06, 0.3, team);
            break;
        }
        case 'village': {
            // A cluster that grows with the settlement: huts, then tiled houses and a temple, then a walled city.
            const own = b.owner >= 0 ? team : '#f2ead8';
            const lv = b.level;
            if (lv === 1) {
                for (const [ox, oz, r] of [[-0.8, -0.7, 0.42], [0.85, -0.6, 0.38], [-0.75, 0.8, 0.4], [0.7, 0.85, 0.36]]) {
                    prim('cyl', ox, 0.3, oz, r * 1.7, 0.6, r * 1.7, '#c99a6a');
                    prim('cone', ox, 0.82, oz, r * 2.3, 0.5, r * 2.3, '#a68a52');
                }
                prim('cyl', 0, 0.2, 0, 0.5, 0.4, 0.5, '#a89c8a');
            } else {
                const n = lv === 2 ? 5 : 7;
                for (let k = 0; k < n; k++) {
                    const a = (k / n) * Math.PI * 2;
                    const ox = Math.cos(a) * 1.0;
                    const oz = Math.sin(a) * 1.0;
                    prim('box', ox, 0.35, oz, 0.6, 0.7, 0.55, k % 2 ? '#ece3d2' : '#d9a56a', 0, -a, 0);
                    prim('cone4', ox, 0.9, oz, 0.75, 0.4, 0.7, '#a2502c', 0, -a, 0);
                }
                prim('box', 0, 0.55, 0, 0.6, 1.1, 0.6, '#d6a46a');
                for (let k = 0; k < 3; k++) prim('box', 0, 1.2 + k * 0.2, 0, 0.5 - k * 0.12, 0.22, 0.5 - k * 0.12, '#d6a46a');
                if (lv === 3) {
                    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                        prim('cyl', sx * 1.45, 0.6, sz * 1.45, 0.45, 1.2, 0.45, '#c8b498');
                        prim('dome', sx * 1.45, 1.2, sz * 1.45, 0.24, 0.2, 0.24, own);
                    }
                    for (const [ox, oz, sx, sz] of [[0, -1.45, 2.6, 0.18], [0, 1.45, 2.6, 0.18], [-1.45, 0, 0.18, 2.6], [1.45, 0, 0.18, 2.6]]) prim('box', ox, 0.35, oz, sx, 0.7, sz, '#c8b498');
                    prim('dome', 0, 1.85, 0, 0.35, 0.35, 0.35, '#f0e2c8');
                }
            }
            prim('cyl', 0.2, 1.4, 0.2, 0.03, 2.2, 0.03, '#5a4a3a');
            prim('box', 0.42, 2.3, 0.2, 0.42, 0.28, 0.02, own, 0, Math.sin(t * 2 + b.id) * 0.2, 0);
            break;
        }
        case 'fort': {
            const stone = '#b8a68c';
            for (const [ox, oz, sx, sz] of [[0, -1.75, 3.2, 0.45], [-1.75, 0, 0.45, 3.2], [1.75, 0, 0.45, 3.2], [-1.05, 1.75, 1.3, 0.45], [1.05, 1.75, 1.3, 0.45]]) {
                prim('box', ox, 0.75, oz, sx, 1.5, sz, stone);
                const along = sx > sz;
                const len = along ? sx : sz;
                for (let k = 0; k < Math.floor(len / 0.4); k++) {
                    const d = -len / 2 + 0.2 + k * 0.4;
                    if (k % 2) prim('box', ox + (along ? d : 0), 1.6, oz + (along ? 0 : d), 0.22, 0.22, 0.22, stone);
                }
            }
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                prim('cyl', sx * 1.75, 1.0, sz * 1.75, 0.95, 2.0, 0.95, '#a8967c');
                prim('dome', sx * 1.75, 2.0, sz * 1.75, 0.38, 0.3, 0.38, team);
            }
            prim('box', 0, 0.6, 1.8, 0.75, 1.2, 0.5, '#5a3a20');
            prim('box', 0, 1.35, 1.8, 1.0, 0.3, 0.55, stone);
            prim('box', 0, 1.1, -0.2, 1.6, 2.2, 1.4, '#c9b48e');
            prim('dome', 0, 2.2, -0.2, 0.55, 0.5, 0.55, '#f0e2c8');
            prim('cyl', 0.6, 3.0, -0.6, 0.04, 1.6, 0.04, '#5a4a3a');
            prim('box', 0.9, 3.55, -0.6, 0.55, 0.36, 0.02, team, 0, Math.sin(t * 2) * 0.2, 0);
            break;
        }
        case 'wall': case 'gate': {
            // Wall pieces join up with their neighbours.
            const stone = '#b8a68c';
            const link = (dx, dz) => { const o = G.ents.get(occ[idx(b.tx + dx, b.ty + dz)] || 0); return o && !o.dead && o.def.line && o.owner === b.owner; };
            const lx = link(-1, 0);
            const rx = link(1, 0);
            const uz = link(0, -1);
            const dz = link(0, 1);
            if (b.type === 'gate') {
                const across = lx || rx || !(uz || dz);
                for (const sgn of [-1, 1]) prim('box', across ? sgn * 0.38 : 0, 0.8, across ? 0 : sgn * 0.38, across ? 0.28 : 0.7, 1.6, across ? 0.7 : 0.28, stone);
                prim('box', 0, 1.5, 0, across ? 1.0 : 0.7, 0.3, across ? 0.7 : 1.0, '#a8967c');
                prim('box', 0, 1.72, 0, 0.3, 0.14, 0.3, team);
                break;
            }
            prim('box', 0, 0.65, 0, 0.55, 1.3, 0.55, stone);
            if (lx) prim('box', -0.27, 0.6, 0, 0.55, 1.2, 0.45, stone);
            if (rx) prim('box', 0.27, 0.6, 0, 0.55, 1.2, 0.45, stone);
            if (uz) prim('box', 0, 0.6, -0.27, 0.45, 1.2, 0.55, stone);
            if (dz) prim('box', 0, 0.6, 0.27, 0.45, 1.2, 0.55, stone);
            prim('box', 0, 1.36, 0, 0.3, 0.2, 0.3, '#a8967c');
            break;
        }
        case 'thana': {
            prim('box', 0, 0.45, 0, 1.6, 0.9, 1.3, '#d8c49a');
            prim('box', 0, 0.95, 0, 1.75, 0.1, 1.45, '#8a3a2a');
            prim('box', 0, 0.35, 0.66, 0.35, 0.6, 0.03, '#3a2414');
            prim('box', 0, 0.75, 0.68, 1.4, 0.12, 0.03, '#2a3a8a');
            for (let k = 0; k < 4; k++) prim('cyl', 0.55 + k * 0.08, 0.35, 0.8, 0.03, 0.7, 0.03, '#6a4a2a', 0.15);
            prim('cyl', -0.6, 1.4, -0.4, 0.03, 1.0, 0.03, '#5a4a3a');
            prim('box', -0.42, 1.75, -0.4, 0.35, 0.22, 0.02, team);
            break;
        }
        case 'karyalaya': {
            // A colonnaded hall where the officers of the realm work.
            prim('box', 0, 0.12, 0, 2.7, 0.24, 2.2, '#c8b498');
            prim('box', 0, 0.75, -0.3, 2.3, 1.1, 1.3, '#ece3d2');
            for (let k = 0; k < 6; k++) prim('cyl', -1.0 + k * 0.4, 0.75, 0.6, 0.14, 1.1, 0.14, '#f2ead8');
            prim('box', 0, 1.36, 0.1, 2.5, 0.14, 2.0, '#b86a48');
            prim('dome', 0, 1.43, -0.3, 0.5, 0.45, 0.5, '#f0e2c8');
            prim('box', 0, 1.1, 0.72, 2.2, 0.1, 0.03, team);
            break;
        }
        case 'panchayat': {
            // The village council meets on a raised platform under a great peepal tree.
            prim('box', 0, 0.15, 0, 1.8, 0.3, 1.8, '#b8a48a');
            prim('box', 0, 0.33, 0, 1.5, 0.06, 1.5, '#cdb894');
            prim('cyl', 0, 0.9, 0, 0.32, 1.2, 0.32, '#5a4030');
            prim('sphere', 0, 1.75, 0, 1.9, 1.0, 1.9, '#4a7a30');
            for (let k = 0; k < 4; k++) prim('box', Math.cos(k * 1.57) * 0.6, 0.45, Math.sin(k * 1.57) * 0.6, 0.35, 0.12, 0.2, team, 0, k * 1.57, 0);
            break;
        }
        case 'farm': {
            prim('box', 0, 0.02, 0, 1.9, 0.05, 1.9, '#6a4a2c');
            const ripe = b.built ? Math.max(0.1, b.food / (BUILDING_TYPES.farm.food * (hasTech(b.owner, 'plough') ? 1.5 : 1))) : 0.1;
            for (let r = 0; r < 5; r++) prim('box', -0.72 + r * 0.36, 0.05 + ripe * 0.1, 0, 0.16, ripe * 0.22, 1.7, ripe > 0.5 ? '#7aa83a' : '#c8b04a');
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) prim('box', sx * 0.95, 0.15, sz * 0.95, 0.06, 0.3, 0.06, team);
            break;
        }
        case 'storehouse': {
            prim('box', 0, 0.4, 0, 1.5, 0.8, 1.2, '#8a6a44');
            prim('box', 0, 0.85, 0, 1.65, 0.1, 1.35, '#6a4a2a');
            prim('box', 0, 0.62, 0.62, 1.2, 0.18, 0.03, team);
            for (let k = 0; k < 3; k++) prim('sphere', -0.5 + k * 0.32, 0.2, 0.85, 0.3, 0.36, 0.3, '#d8c08a');
            break;
        }
        case 'barracks': {
            prim('box', 0, 0.55, 0, 2.5, 1.1, 2.1, '#b98a5a');
            for (let k = -3; k <= 3; k++) {
                prim('box', k * 0.36, 1.2, 1.04, 0.18, 0.2, 0.08, '#b98a5a');
                prim('box', k * 0.36, 1.2, -1.04, 0.18, 0.2, 0.08, '#b98a5a');
            }
            prim('box', 0, 0.42, 1.06, 0.7, 0.84, 0.05, '#3a2414');
            for (const s of [-1, 1]) prim('box', s * 0.65, 0.75, 1.08, 0.3, 0.6, 0.02, team);
            break;
        }
        case 'range': {
            prim('box', 0, 0.06, 0, 2.6, 0.12, 2.4, '#a88a5a');
            for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) prim('cyl', sx * 1.15, 0.6, sz * 0.95, 0.12, 1.2, 0.12, '#7a5a3a');
            prim('cone4', 0, 1.45, 0, 3.0, 0.6, 2.4, team);
            for (const s of [-1, 1]) {
                prim('cyl', s * 0.6, 0.55, -0.6, 0.6, 0.06, 0.6, '#f2ead8', Math.PI / 2);
                prim('cyl', s * 0.6, 0.55, -0.57, 0.3, 0.07, 0.3, '#c2183a', Math.PI / 2);
            }
            break;
        }
        case 'stable': {
            prim('box', 0, 0.45, 0, 2.6, 0.9, 1.8, '#9a6a44');
            prim('cone4', 0, 1.15, 0, 3.0, 0.55, 2.2, '#7a3a24');
            prim('box', 0, 0.94, 0.92, 2.6, 0.1, 0.05, team);
            for (let k = -2; k <= 2; k++) prim('box', k * 0.5, 0.35, 0.91, 0.32, 0.55, 0.03, '#3a2414');
            prim('sphere', 1.1, 0.2, 1.15, 0.5, 0.4, 0.4, '#d8c070');
            break;
        }
        case 'temple': {
            prim('box', 0, 0.12, 0, 1.8, 0.24, 1.8, '#b89a78');
            prim('box', 0, 0.6, 0, 1.1, 0.8, 1.1, '#d6a46a');
            for (let k = 0; k < 5; k++) prim('box', 0, 1.1 + k * 0.26, 0, 1.0 - k * 0.17, 0.28, 1.0 - k * 0.17, '#d6a46a');
            prim('sphere', 0, 2.45, 0, 0.26, 0.18, 0.26, '#e0b43c');
            prim('box', 0, 0.45, 0.6, 0.6, 0.5, 0.3, '#c99458');
            prim('cyl', 0, 2.9, 0, 0.02, 0.7, 0.02, '#5a4a3a');
            prim('cone', 0.12, 3.1, 0, 0.18, 0.3, 0.04, '#e8771e', 0, 0, -Math.PI / 2);
            break;
        }
        case 'university': {
            prim('box', 0, 0.06, 0, 2.6, 0.12, 2.6, '#c8a87a');
            for (const [sx, sz, rw, rd] of [[0, -1, 2.4, 0.7], [0, 1, 2.4, 0.7], [-1, 0, 0.7, 1.2], [1, 0, 0.7, 1.2]]) prim('box', sx * 0.9, 0.45, sz * 0.9, rw, 0.8, rd, '#b2643a');
            prim('dome', 0, 0.12, 0, 0.55, 0.6, 0.55, '#ece3d2');
            prim('cyl', 0, 0.85, 0, 0.12, 0.2, 0.12, '#e0b43c');
            prim('box', 0, 0.9, 1.26, 2.4, 0.08, 0.03, team);
            break;
        }
        case 'tower': {
            prim('cyl', 0, 1.2, 0, 0.75, 2.4, 0.75, STONE);
            prim('box', 0, 2.5, 0, 0.95, 0.28, 0.95, '#b8a68c');
            prim('cone4', 0, 2.95, 0, 0.95, 0.6, 0.95, team);
            prim('box', 0, 1.7, 0.37, 0.12, 0.2, 0.03, '#2a1e14');
            break;
        }
        case 'gajashala': {
            prim('box', 0, 0.75, 0, 2.6, 1.5, 2.0, '#d9c3a0');
            for (let k = -2; k <= 2; k++) prim('box', k * 0.5, 0.5, 1.01, 0.34, 0.9, 0.03, '#4a2c16');
            for (const s of [-1, 0, 1]) prim('dome', s * 0.85, 1.5, 0, 0.36, 0.42, 0.36, s ? '#e8dcc8' : team);
            prim('box', 0, 1.47, 0, 2.7, 0.08, 2.1, team);
            break;
        }
        case 'workshop': {
            prim('box', 0, 0.5, -0.3, 2.4, 1.0, 1.4, '#8a6a44');
            prim('cone4', 0, 1.25, -0.3, 2.8, 0.5, 1.7, '#5a4a3a');
            prim('cyl', -0.6, 0.3, 0.8, 0.6, 0.08, 0.6, '#4a3424', 0, 0, Math.PI / 2);
            prim('box', 0.4, 0.4, 0.8, 0.9, 0.12, 0.2, '#6a4a2a', 0, 0.4, 0.3);
            prim('box', 0, 1.0, 0.41, 2.4, 0.12, 0.03, team);
            break;
        }
        default: break;
    }
    return gy;
}

// Festival decorations and wedding garlands on homes.
const HOLI = ['#ff2f7a', '#ffd400', '#21c46b', '#2f8bff', '#ff7a1a', '#b03cff'];

function decorate(b, gy, t) {
    if (b.owner < 0) return;
    const fest = player(b.owner).festival;
    const home = b.type === 'house' || b.type === 'tc';
    const n = b.def.size;
    if ((b.celebrateUntil || 0) > G.time && home) {
        frame(b.x, gy, b.y, 0);
        for (let k = 0; k < 9; k++) prim('sphere', -0.6 + k * 0.15, 0.95 - Math.sin(k / 8 * Math.PI) * 0.15, n * 0.33 + 0.05, 0.09, 0.09, 0.09, k % 2 ? '#ff9a10' : '#ffd400');
    }
    if (!fest || !home) return;
    frame(b.x, gy, b.y, 0);
    const front = n * 0.42 + 0.15;
    if (fest.kind === 'lights') {
        for (let k = 0; k < 6; k++) {
            const f = 0.8 + Math.sin(t * 7 + k * 1.7 + b.id) * 0.2;
            prim('glow', -n * 0.4 + k * n * 0.16, 0.08, front, 0.1 * f, 0.14 * f, 0.1 * f, '#ffc040');
        }
    } else if (fest.kind === 'colours') {
        for (let k = 0; k < 5; k++) {
            const ph = (t * 0.6 + k * 0.37 + b.id * 0.13) % 1;
            prim('glow', Math.sin(k * 2.1 + b.id) * n * 0.5, 0.3 + ph * 1.2, front + Math.cos(k * 1.3) * 0.3, 0.25 + ph * 0.4, 0.25 + ph * 0.4, 0.25 + ph * 0.4, HOLI[(k + b.id) % HOLI.length]);
        }
    } else if (fest.kind === 'flowers') {
        prim('cyl', 0, 0.03, front + 0.25, 0.7, 0.03, 0.7, '#ffb000');
        prim('cyl', 0, 0.05, front + 0.25, 0.45, 0.03, 0.45, '#e8441a');
        prim('cyl', 0, 0.07, front + 0.25, 0.2, 0.03, 0.2, '#f8f0e0');
    } else if (fest.kind === 'harvest') {
        prim('sphere', n * 0.3, 0.15, front, 0.28, 0.3, 0.28, '#b8732a');
        prim('glow', n * 0.3, 0.32, front, 0.18, 0.12, 0.18, '#f8f0e0');
        for (const s of [-1, 1]) prim('cyl', -n * 0.3 + s * 0.1, 0.4, front, 0.04, 0.8, 0.04, '#5a8a2a', 0, 0, s * 0.15);
    }
}

function projectileModel(p) {
    const tx = p.target.x;
    const tz = p.target.y;
    const yaw = Math.atan2(tx - p.x, tz - p.y);
    const gy = surfaceAt(p.x, p.y) + (p.z || 0.9) * 0.6 + (p.h || 0) + 0.3;
    frame(p.x, gy, p.y, yaw);
    if (p.kind === 'rocket') {
        prim('cyl', 0, 0, 0, 0.08, 0.5, 0.08, '#4a3a2a', Math.PI / 2);
        prim('glow', 0, 0, -0.3, 0.22, 0.22, 0.32, '#ffb040');
    } else {
        prim('box', 0, 0, 0, 0.02, 0.02, 0.45, '#3a2a1a');
    }
}

// ---------- Per-frame drawing ----------

let lastVeg = 0;

function renderFrame(now) {
    if (!renderer || !G) return;
    const t = now / 1000;
    placeCamera();
    updateTerritoryTexture();
    if (vegDirty && now - lastVeg > 500) { vegDirty = false; lastVeg = now; streamVegetation(true); } else streamVegetation(false);
    waterBump.offset.y = (now / 9000) % 1;
    beginBatches();
    const sel = UI.selected;
    const view = viewBounds();
    for (const e of G.ents.values()) {
        if (e.x < view.x0 || e.x > view.x1 || e.y < view.z0 || e.y > view.z1) continue;
        if (!seenByHuman(e)) continue;
        if (e.kind === 'building') { const gy = buildingModel(e, t); if (e.built) decorate(e, gy, t); }
        else if (e.kind === 'unit') {
            if (e.dead) {
                if (G.time - e.deadAt > 3) continue;
                frame(e.x, surfaceAt(e.x, e.y), e.y, e.facing);
                prim('box', 0, 0.06, 0, 0.3, 0.1, 0.5, teamColor(e.owner));
                continue;
            }
            unitModel(e, t);
        } else if (e.kind === 'carcass') carcassModel(e);
    }
    // Selection rings and rally flag.
    for (const e of sel) {
        if (e.dead) continue;
        const r = e.kind === 'building' ? e.def.size * 0.72 : (e.radius || 0.3) + 0.12;
        frame(e.x, surfaceAt(e.x, e.y) + 0.04, e.y, 0);
        prim('ring', 0, 0, 0, r, 1, r, e.owner === G.human ? '#7dff7a' : e.owner < 0 ? '#ffe27a' : '#ff6a5a');
        if (e.kind === 'building' && e.rally && e.owner === G.human) {
            frame(e.rally.x, surfaceAt(e.rally.x, e.rally.y), e.rally.y, 0);
            prim('cyl', 0, 0.5, 0, 0.04, 1, 0.04, '#5a4a3a');
            prim('box', 0.16, 0.88, 0, 0.3, 0.2, 0.02, teamColor(G.human), 0, Math.sin(t * 3) * 0.3, 0);
        }
    }
    for (const m of UI.markers) {
        const age = (now - m.at) / 600;
        if (age > 1) continue;
        frame(m.x, surfaceAt(m.x, m.z) + 0.05, m.z, 0);
        prim('ring', 0, 0, 0, 0.6 - age * 0.4, 1, 0.6 - age * 0.4, m.color);
    }
    for (const p of G.projectiles) if (seenByHuman(p.target) || p.srcOwner === G.human) projectileModel(p);
    for (const b of G.booms) {
        const k = (G.time - b.t) / 0.6;
        frame(b.x, surfaceAt(b.x, b.y) + 0.4, b.y, 0);
        prim('glow', 0, 0, 0, 0.6 + k * 2, 0.6 + k * 1.6, 0.6 + k * 2, k < 0.5 ? '#ffd060' : '#a0603a');
    }
    // A wall being dragged out shows each piece it will place.
    const pl = UI.placing;
    if (pl && pl.lineStart && pl.tile) {
        pl.lineTiles = lineTiles(pl.lineStart, pl.tile);
        pl.lineOk = 0;
        for (const [x, y] of pl.lineTiles) {
            const ok = footprintFree(pl.type, x, y) && mayBuild(G.human, pl.type, x, y) && inMap(x, y) && fogExplored[idx(x, y)];
            if (ok) pl.lineOk++;
            frame(x, surfaceAt(x, y) + 0.3, y, 0);
            prim('glow', 0, 0, 0, 0.9, 0.5, 0.9, ok ? '#4caf50' : '#e53935');
        }
        pl.ok = pl.lineOk > 0;
    }
    endBatches();
    updateGhost();
    renderer.render(scene, camera);
    drawOverlay();
}

function viewBounds() {
    const pts = [[0, 0], [viewW, 0], [0, viewH], [viewW, viewH]].map(([x, y]) => screenToGround(x, y));
    const xs = pts.map(p => p.x);
    const zs = pts.map(p => p.z);
    return { x0: Math.min(...xs) - 3, x1: Math.max(...xs) + 3, z0: Math.min(...zs) - 4, z1: Math.max(...zs) + 3 };
}

function updateGhost() {
    const pl = UI.placing;
    if (!pl || !pl.tile) { ghost.visible = false; return; }
    const n = BUILDING_TYPES[pl.type].size;
    if (pl.lineStart) { ghost.visible = false; return; }
    const ok = footprintFree(pl.type, pl.tile[0], pl.tile[1]) && fogExploredAll(pl.tile[0], pl.tile[1], n) && mayBuild(G.human, pl.type, pl.tile[0], pl.tile[1]);
    ghost.visible = true;
    ghost.scale.set(n, 1, n);
    const cx = pl.tile[0] + (n - 1) / 2;
    const cz = pl.tile[1] + (n - 1) / 2;
    ghost.position.set(cx, surfaceAt(cx, cz) + 0.15, cz);
    ghost.material.color.set(ok ? '#4caf50' : '#e53935');
    pl.ok = ok;
}

function fogExploredAll(tx, ty, n) {
    for (let y = ty; y < ty + n; y++) for (let x = tx; x < tx + n; x++) if (!inMap(x, y) || !fogExplored[idx(x, y)]) return false;
    return true;
}

function drawOverlay() {
    octx.clearRect(0, 0, viewW, viewH);
    const sel = new Set(UI.selected);
    for (const e of G.ents.values()) {
        if (e.dead || (e.kind !== 'unit' && e.kind !== 'building')) continue;
        const show = sel.has(e) || (e.hp < e.maxHp && G.time - (e.hitAt || -99) < 6) || (e.kind === 'building' && !e.built && e.owner === G.human);
        if (!show || !seenByHuman(e)) continue;
        const h = e.kind === 'building' ? (e.type === 'tower' ? 3.4 : 2.4) : e.type === 'elephant' ? 2.1 : e.def.cls === 'cavalry' ? 1.7 : 1.15;
        const s = toScreen(e.x, surfaceAt(e.x, e.y) + h, e.y);
        if (s.behind || s.x < -40 || s.x > viewW + 40 || s.y < -20 || s.y > viewH + 20) continue;
        const w = e.kind === 'building' ? 46 : 26;
        const f = Math.max(0, e.hp / e.maxHp);
        octx.fillStyle = 'rgba(0,0,0,.6)';
        octx.fillRect(s.x - w / 2 - 1, s.y - 1, w + 2, 6);
        octx.fillStyle = e.owner === G.human ? (f > 0.5 ? '#5ad15a' : f > 0.25 ? '#e8c93a' : '#e5533a') : e.owner < 0 ? '#e8c93a' : '#e5533a';
        octx.fillRect(s.x - w / 2, s.y, w * f, 4);
        if (e.kind === 'building' && !e.built) {
            octx.fillStyle = '#7fc8ff';
            octx.fillRect(s.x - w / 2, s.y + 5, w * e.progress, 3);
        }
    }
    // Floating words: delivered loads, births, skills learned.
    octx.textAlign = 'center';
    octx.font = '600 13px Hind, system-ui, sans-serif';
    for (const f of G.floats || []) {
        const age = G.time - f.t;
        if (age > 2.4) continue;
        const s = toScreen(f.x, surfaceAt(f.x, f.y) + 1.3 + age * 0.45, f.y);
        if (s.behind) continue;
        octx.globalAlpha = Math.min(1, (2.4 - age) * 1.5);
        octx.lineWidth = 3;
        octx.strokeStyle = 'rgba(20,12,24,.85)';
        octx.strokeText(f.text, s.x, s.y);
        octx.fillStyle = f.color;
        octx.fillText(f.text, s.x, s.y);
    }
    octx.globalAlpha = 1;
    // Name tags for the selected person and whatever is under the cursor.
    const tagged = new Set();
    if (UI.selected.length <= 12) for (const e of UI.selected) tagged.add(e);
    if (UI.hover && UI.hover.ent) tagged.add(UI.hover.ent);
    for (const e of tagged) {
        if (e.dead || !seenByHuman(e)) continue;
        const label = entLabel(e);
        if (!label) continue;
        const h = e.kind === 'building' ? (e.type === 'tower' ? 3.4 : 2.4) : e.type === 'elephant' ? 2.1 : e.def.cls === 'cavalry' ? 1.7 : 1.15 * (e.scale || 1);
        const s = toScreen(e.x, surfaceAt(e.x, e.y) + h, e.y);
        if (s.behind) continue;
        octx.font = '600 12px Hind, system-ui, sans-serif';
        const w = octx.measureText(label.text).width + 14;
        const y = s.y - 16;
        octx.fillStyle = 'rgba(20,12,24,.82)';
        roundRect(octx, s.x - w / 2, y - 11, w, 18, 9);
        octx.fill();
        octx.fillStyle = label.color;
        octx.fillText(label.text, s.x, y + 2);
    }
    // Settlement names, like labels on a map, with the progress of any siege.
    octx.font = '600 12px Hind, system-ui, sans-serif';
    for (const v of G.ents.values()) {
        if (v.type !== 'village' || v.dead || !seenByHuman(v)) continue;
        const s = toScreen(v.x, surfaceAt(v.x, v.y) + 2.8, v.y);
        if (s.behind || s.x < -60 || s.x > viewW + 60 || s.y < -20 || s.y > viewH + 20) continue;
        const text = `${v.name} · ${SETTLEMENT_LEVELS[v.level].name}`;
        const w = octx.measureText(text).width + 22;
        octx.fillStyle = 'rgba(20,12,24,.82)';
        roundRect(octx, s.x - w / 2, s.y - 11, w, 19, 9);
        octx.fill();
        octx.fillStyle = v.owner >= 0 ? player(v.owner).color : '#e8e0cc';
        octx.beginPath();
        octx.arc(s.x - w / 2 + 10, s.y - 1.5, 4, 0, Math.PI * 2);
        octx.fill();
        octx.fillStyle = '#f6ead2';
        octx.fillText(text, s.x + 5, s.y + 2);
        if (v.capture) {
            octx.fillStyle = 'rgba(0,0,0,.6)';
            octx.fillRect(s.x - 30, s.y + 10, 60, 5);
            octx.fillStyle = player(v.capture.owner).color;
            octx.fillRect(s.x - 30, s.y + 10, 60 * Math.min(1, v.capture.p / 100), 5);
        }
    }
    if (UI.drag && UI.drag.box) {
        const d = UI.drag;
        octx.strokeStyle = '#d8ffd0';
        octx.lineWidth = 1.5;
        octx.fillStyle = 'rgba(160,255,150,.12)';
        const x = Math.min(d.x0, d.x1);
        const y = Math.min(d.y0, d.y1);
        octx.fillRect(x, y, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
        octx.strokeRect(x, y, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    }
}

function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

function entLabel(e) {
    const color = e.owner === G.human ? '#f6ead2' : e.owner < 0 ? '#ffe9a8' : '#ffb4a8';
    if (e.person) {
        const pl = player(e.owner);
        let t = e.person.name;
        if (pl.mukhiya === e.id) t = `Mukhiya ${t}`;
        else if (e.def.cls !== 'villager') t = `${RANKS[rankOf(e)][1]} ${t}`;
        return { text: `${t}, ${Math.floor(ageOf(e))}`, color };
    }
    if (e.kind === 'unit' || e.kind === 'building') return { text: e.def.name, color };
    if (e.kind === 'carcass') return { text: `${Math.floor(e.food)} food`, color };
    return null;
}

// ---------- Portraits: every unit and building drawn once from the 3D models ----------

const PORTRAIT = {};

function makePortraits() {
    const size = 112;
    const rt = new THREE.WebGLRenderTarget(size, size);
    rt.texture.encoding = THREE.sRGBEncoding;
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    const hidden = [];
    for (const c of worldGroup.children) if (!Object.values(BATCH).includes(c) && c.visible) { c.visible = false; hidden.push(c); }
    const vegWas = vegGroup.visible;
    vegGroup.visible = false;
    const bg = scene.background;
    scene.background = null;
    fogUniforms.fogOn.value = 0;
    const sunPos = sunLight.position.clone();
    const sunTarget = sunLight.target.position.clone();
    const pixels = new Uint8Array(size * size * 4);
    const c2 = document.createElement('canvas');
    c2.width = c2.height = size;
    const g2 = c2.getContext('2d');
    const shoot = (key, draw, height, dist) => {
        beginBatches();
        const gy = draw();
        endBatches();
        cam.position.set(dist * 0.55, gy + height * 0.62 + dist * 0.42, dist);
        cam.lookAt(0, gy + height * 0.45, 0);
        sunLight.position.set(-4, gy + 8, 6);
        sunLight.target.position.set(0, gy, 0);
        sunLight.target.updateMatrixWorld();
        renderer.setRenderTarget(rt);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(scene, cam);
        renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
        const img = g2.createImageData(size, size);
        for (let y = 0; y < size; y++) img.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
        g2.clearRect(0, 0, size, size);
        g2.putImageData(img, 0, 0);
        PORTRAIT[key] = c2.toDataURL();
    };
    const unit = (type, person) => {
        const u = { id: 11, type, def: UNIT_TYPES[type], owner: G.human, x: 0, y: 0, facing: 0.45, moving: false, path: [], radius: 0.3, scale: 1 };
        if (person) {
            u.person = { female: person.female, born: G.time - person.age * YEAR, skills: {}, kills: 0 };
            u.scale = person.age < ADULT_AGE ? 0.5 + 0.5 * person.age / ADULT_AGE : 1;
        }
        return u;
    };
    const ppl = { villager_m: { female: false, age: 28 }, villager_f: { female: true, age: 26 }, child_m: { female: false, age: 7 }, child_f: { female: true, age: 7 }, elder_m: { female: false, age: 66 }, elder_f: { female: true, age: 64 } };
    for (const [key, pp] of Object.entries(ppl)) shoot(key, () => { const u = unit('villager', pp); unitModel(u, 0); return surfaceAt(0, 0); }, pp.age < 14 ? 0.8 : 1.1, pp.age < 14 ? 1.05 : 1.4);
    for (const type of Object.keys(UNIT_TYPES)) {
        if (type === 'villager') continue;
        const d = UNIT_TYPES[type];
        const big = type === 'elephant' ? 2.2 : d.cls === 'cavalry' ? 1.7 : d.cls === 'siege' ? 1.3 : d.cls === 'animal' ? 0.7 : 1.15;
        shoot(type, () => { const u = unit(type, d.cls === 'animal' || d.cls === 'siege' ? null : { female: false, age: 26 }); unitModel(u, 0); return surfaceAt(0, 0); }, big, big * 1.45);
    }
    for (const type of Object.keys(BUILDING_TYPES)) {
        const d = BUILDING_TYPES[type];
        const n = d.size;
        shoot(type, () => buildingModel({ id: 5, type, def: d, owner: G.human, x: 0, y: 0, tx: 0, ty: 0, built: true, progress: 1, queue: [], food: d.food || 0, hp: 1, maxHp: 1 }, 0), type === 'tower' ? 3.2 : n * 0.9, n * 1.6 + 1.6);
    }
    renderer.setRenderTarget(null);
    rt.dispose();
    for (const c of hidden) c.visible = true;
    vegGroup.visible = vegWas;
    scene.background = bg;
    fogUniforms.fogOn.value = 1;
    sunLight.position.copy(sunPos);
    sunLight.target.position.copy(sunTarget);
    sunLight.target.updateMatrixWorld();
}

function portraitFor(e) {
    if (e.kind === 'building') return PORTRAIT[e.type];
    if (e.kind === 'carcass') return PORTRAIT[e.type];
    if (e.type === 'villager' && e.person) {
        const a = ageOf(e);
        const stage = a < ADULT_AGE ? 'child' : a >= ELDER_AGE ? 'elder' : 'villager';
        return PORTRAIT[`${stage}_${e.person.female ? 'f' : 'm'}`];
    }
    return PORTRAIT[e.type];
}

// ---------- Picking ----------

function pickAt(sx, sy) {
    const g = screenToGround(sx, sy);
    let best = null;
    let bd = Infinity;
    for (const e of G.ents.values()) {
        if (e.dead || !seenByHuman(e)) continue;
        if (e.kind === 'building') {
            const n = e.def.size;
            if (g.x > e.tx - 0.55 && g.x < e.tx + n - 0.45 && g.z > e.ty - 0.55 && g.z < e.ty + n - 0.45) {
                if (1 < bd) { bd = 1; best = e; }
            }
            continue;
        }
        const h = e.type === 'elephant' ? 1 : e.def && e.def.cls === 'cavalry' ? 0.8 : 0.45;
        const s = toScreen(e.x, surfaceAt(e.x, e.y) + h, e.y);
        const px = Math.hypot(s.x - sx, s.y - sy);
        const lim = Math.max(14, 520 / camDist * (e.radius || 0.3) + 6);
        if (px < lim && px / lim < bd) { bd = px / lim; best = e; }
    }
    if (best) return { ent: best, g };
    const tx = Math.round(g.x);
    const tz = Math.round(g.z);
    if (inMap(tx, tz) && RESOURCE_OBJECTS[objects[idx(tx, tz)]] && fogExplored[idx(tx, tz)]) return { tile: idx(tx, tz), g };
    return { g };
}

function unitsInBox(x0, y0, x1, y1) {
    const out = [];
    const ax = Math.min(x0, x1);
    const bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1);
    const by = Math.max(y0, y1);
    for (const e of G.ents.values()) {
        if (e.kind !== 'unit' || e.dead || e.owner !== G.human) continue;
        const s = toScreen(e.x, surfaceAt(e.x, e.y) + 0.4, e.y);
        if (s.x >= ax && s.x <= bx && s.y >= ay && s.y <= by) out.push(e);
    }
    return out;
}
