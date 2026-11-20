// Vista 3D della plancia (prototipo): stessa partita, stesse regole, altra prospettiva.
// Legge lo stato dai file classici (characters, combatState, mappa, terreno, nebbia)
// e un clic chiama handleBoardClick come la vista 2D (static/control.js).
// Gli strumenti del Master (disegno, pennelli, laser) restano nella vista 2D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import {
    FIRST_PERSON_HEIGHT_SCALE, boardBounds, buildFog, buildGrid, buildGround, buildTerrain,
    createStandee, groundHeightAt, hexesInBounds, updateStandee
} from 'board3d/layers.js';

const VIEW_KEY = 'venander-board-view';
const container = document.getElementById('game-container');
const board2d = document.getElementById('boardCanvas');

// ==========================================
// TELA, RENDERER, TELECAMERA, LUCI
// ==========================================

const canvas3d = document.createElement('canvas');
canvas3d.id = 'board3dCanvas';
canvas3d.className = 'board3d-canvas';
container.appendChild(canvas3d);

// Numeri fluttuanti ed emoji: una tela 2D trasparente sopra quella 3D
const overlay = document.createElement('canvas');
overlay.className = 'board3d-overlay';
container.appendChild(overlay);
const overlayCtx = overlay.getContext('2d');

let renderer = null;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101418);
scene.fog = new THREE.Fog(0x101418, 2500, 9000);

const camera = new THREE.PerspectiveCamera(42, 4 / 3, 2, 20000);
camera.position.set(0, 700, 700);

let controls = null;

scene.add(new THREE.HemisphereLight(0xe8f0f8, 0x3a3026, 1.6));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

// Livelli della scena, ricostruiti solo quando cambia quello che mostrano
const layers = { ground: null, grid: null, terrain: null, fog: null };
const signatures = {};
const standees = new Map();   // charId -> gruppo della pedina
const hoverRing = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(HEX_CORNERS.map(c => new THREE.Vector3(c.x, 0, c.y))),
    new THREE.LineBasicMaterial({ color: 0xf4d35e, transparent: true, opacity: 0.9 })
);
hoverRing.visible = false;
scene.add(hoverRing);

let active = false;
let looping = false;
let focusedOnce = false;

function ensureRenderer() {
    if (renderer) return true;
    try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true });
    } catch (error) {
        alert('Questo browser non riesce ad aprire la vista 3D (WebGL non disponibile).');
        return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    controls = new OrbitControls(camera, canvas3d);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 120;
    controls.maxDistance = 4500;
    controls.maxPolarAngle = Math.PI * 0.46;   // mai sotto il pavimento
    controls.screenSpacePanning = false;
    return true;
}

function resize() {
    const width = board2d.clientWidth || board2d.width;
    const height = board2d.clientHeight || board2d.height;
    [canvas3d, overlay].forEach(el => {
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
    });
    overlay.width = width;
    overlay.height = height;
    renderer?.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
}

// ==========================================
// SINCRONIZZAZIONE CON LO STATO DEL GIOCO
// ==========================================

function replaceLayer(name, object) {
    if (layers[name]) {
        scene.remove(layers[name]);
        layers[name].traverse(child => {
            child.geometry?.dispose();
            if (child.material) {
                child.material.map?.dispose();
                child.material.dispose();
            }
        });
    }
    layers[name] = object;
    if (object) scene.add(object);
}

function changed(name, value) {
    const signature = JSON.stringify(value);
    if (signatures[name] === signature) return false;
    signatures[name] = signature;
    return true;
}

function syncBoard() {
    const mapReady = !!(bgImage && bgImage.complete && bgImage.naturalWidth > 0);
    const mapKey = [currentMapUrl, mapReady, mapScale, mapDx, mapDy];
    const bounds = boardBounds();
    const hexes = hexesInBounds(bounds);

    if (changed('ground', mapKey)) {
        replaceLayer('ground', buildGround());
        aimSun(bounds);
    }
    if (changed('grid', [mapKey, mapReady ? null : bounds])) {
        replaceLayer('grid', buildGrid(hexes));
    }
    if (changed('terrain', [window.mapTerrain, window.mapSurfaces])) {
        replaceLayer('terrain', buildTerrain());
    }
    const showFog = !isMaster && window.fowEnabled;
    if (changed('fog', [showFog, mapKey, showFog ? window.revealedHexes.size : 0, showFog ? [...window.revealedHexes].slice(-1) : null])) {
        replaceLayer('fog', showFog ? buildFog(hexes) : null);
    }
}

// Il sole copre la mappa intera, così le ombre ci sono ovunque
function aimSun(bounds) {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minY + bounds.maxY) / 2;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 800);
    sun.position.set(cx - span * 0.35, span * 0.9, cz - span * 0.5);
    sun.target.position.set(cx, 0, cz);
    const shadowCam = sun.shadow.camera;
    shadowCam.left = -span * 0.75;
    shadowCam.right = span * 0.75;
    shadowCam.top = span * 0.75;
    shadowCam.bottom = -span * 0.75;
    shadowCam.near = 1;
    shadowCam.far = span * 3;
    shadowCam.updateProjectionMatrix();
}

function actingId() {
    if (!combatState.is_active || !combatState.turn_order?.length) return null;
    return combatState.turn_order[combatState.current_index]?.id ?? null;
}

function syncStandees(delta) {
    const visible = new Set();
    const acting = actingId();

    characters.forEach(char => {
        if (!isTokenVisibleToViewer(char)) return;
        visible.add(char.id);

        let standee = standees.get(char.id);
        const target = hexToPixel(char.x, char.y);
        const targetY = groundHeightAt(char.x, char.y);
        if (!standee) {
            standee = createStandee(char);
            standee.position.set(target.x, targetY, target.y);
            standees.set(char.id, standee);
            scene.add(standee);
        }

        // La pedina scivola verso il suo esagono invece di saltarci
        const ease = 1 - Math.pow(0.0005, delta);
        standee.position.x += (target.x - standee.position.x) * ease;
        standee.position.z += (target.y - standee.position.z) * ease;
        standee.position.y += (targetY - standee.position.y) * ease;

        const dead = isDeadNpc(char);
        updateStandee(standee, char, {
            selected: char.id === selectedCharacterId,
            acting: char.id === acting,
            dead
        });

        // La carta guarda la telecamera (ruota solo sull'asse verticale); i morti restano stesi
        const pivot = standee.userData.pivot;
        if (dead) {
            pivot.rotation.set(-Math.PI / 2 + 0.08, 0, 0);
        } else {
            pivot.rotation.set(0, Math.atan2(camera.position.x - standee.position.x, camera.position.z - standee.position.z), 0);
        }

        // Fantasma per il Master: pedine nascoste o invisibili semitrasparenti
        const ghost = isMaster && (char.is_hidden || char.is_invisible);
        if (standee.userData.ghost !== ghost) {
            standee.userData.ghost = ghost;
            [standee.userData.card.material, standee.userData.base.material].forEach(material => {
                material.transparent = ghost;
                material.opacity = ghost ? 0.4 : 1;
                material.needsUpdate = true;
            });
        }
    });

    // Pedine sparite (eliminate, nascoste, nella nebbia)
    standees.forEach((standee, id) => {
        if (visible.has(id)) return;
        scene.remove(standee);
        standee.traverse(child => {
            child.geometry?.dispose();
            child.material?.map?.dispose();
            child.material?.dispose();
        });
        standees.delete(id);
    });
}

// Prima apertura: la telecamera guarda il proprio personaggio (o il centro della mappa)
function focusCamera() {
    const myId = parseInt(userSelect?.value);
    const char = characters.find(c => c.id === selectedCharacterId) || characters.find(c => c.id === myId);
    let target;
    if (char) {
        const p = hexToPixel(char.x, char.y);
        target = new THREE.Vector3(p.x, 0, p.y);
    } else {
        const b = boardBounds();
        target = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2);
    }
    controls.target.copy(target);
    camera.position.set(target.x, 300, target.z + 330);
    controls.update();
}

// ==========================================
// NUMERI FLUTTUANTI ED EMOJI (stessa coda della vista 2D)
// ==========================================

function drawOverlay() {
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    const now = performance.now();
    const stack = {};
    (window.floatingTexts || []).forEach(t => {
        const duration = typeof floatingTextDuration === 'function' ? floatingTextDuration(t) : 1800;
        const progress = (now - t.start) / duration;
        if (progress < 0 || progress >= 1) return;
        const char = characters.find(c => c.id === t.char_id);
        const standee = char && standees.get(char.id);
        if (!standee) return;

        const point = new THREE.Vector3(standee.position.x, standee.position.y + 80, standee.position.z).project(camera);
        if (point.z > 1) return;
        const index = stack[t.char_id] = (stack[t.char_id] ?? -1) + 1;
        const x = (point.x + 1) / 2 * overlay.width;
        const y = (1 - point.y) / 2 * overlay.height - progress * 40 - index * 30;

        overlayCtx.globalAlpha = 1 - progress * progress;
        overlayCtx.textAlign = 'center';
        overlayCtx.textBaseline = 'middle';
        if (t.kind === 'emoji') {
            overlayCtx.font = '34px Arial';
        } else {
            overlayCtx.font = 'bold 22px Arial';
            overlayCtx.lineWidth = 4;
            overlayCtx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            overlayCtx.strokeText(t.text, x, y);
            overlayCtx.fillStyle = (typeof FLOATING_TEXT_COLORS !== 'undefined' && FLOATING_TEXT_COLORS[t.kind]) || '#fff';
        }
        overlayCtx.fillText(t.text, x, y);
    });
    overlayCtx.globalAlpha = 1;

    if (firstPerson) {
        overlayCtx.font = 'bold 13px Arial';
        overlayCtx.textAlign = 'center';
        overlayCtx.textBaseline = 'bottom';
        overlayCtx.lineWidth = 3;
        overlayCtx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        const hint = 'WASD per camminare · frecce, Q/E o trascina per guardarti intorno · Esc per uscire';
        overlayCtx.strokeText(hint, overlay.width / 2, overlay.height - 12);
        overlayCtx.fillText(hint, overlay.width / 2, overlay.height - 12);
    }
}

// ==========================================
// INPUT: clic = stesso comportamento della vista 2D
// ==========================================

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let pressedAt = null;

function pointerToRay(event) {
    const rect = canvas3d.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
}

// Punto della mappa (pixel 2D) sotto il puntatore: prima le pedine, poi il pavimento
function boardPointUnder(event) {
    pointerToRay(event);
    const cards = [...standees.values()]
        .filter(s => !firstPerson || s.userData.charId !== firstPerson.charId)
        .map(s => s.userData.card);
    const hit = raycaster.intersectObjects(cards, false)[0];
    if (hit) {
        const char = characters.find(c => c.id === hit.object.userData.charId);
        if (char) return hexToPixel(char.x, char.y);
    }
    const point = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, point)) return null;
    return { x: point.x, y: point.z };
}

canvas3d.addEventListener('pointerdown', (event) => {
    pressedAt = { x: event.clientX, y: event.clientY };
    lookFrom = { x: event.clientX, y: event.clientY };
});

canvas3d.addEventListener('pointerup', (event) => {
    lookFrom = null;
    if (!pressedAt || event.button !== 0) return;
    // Trascinare ruota la telecamera: è un clic solo se il puntatore non si è mosso
    const moved = Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y);
    pressedAt = null;
    if (moved > 6) return;
    const pos = boardPointUnder(event);
    if (pos) handleBoardClick(pos);
});

canvas3d.addEventListener('pointermove', (event) => {
    // Prima persona: trascinare gira lo sguardo
    if (firstPerson && lookFrom && event.buttons) {
        firstPerson.yaw -= (event.clientX - lookFrom.x) * 0.005;
        firstPerson.pitch = Math.max(-1.2, Math.min(1.0, firstPerson.pitch - (event.clientY - lookFrom.y) * 0.004));
        lookFrom = { x: event.clientX, y: event.clientY };
    }
    const pos = boardPointUnder(event);
    if (!pos) {
        hoverRing.visible = false;
        return;
    }
    const hex = pixelToHex(pos.x, pos.y);
    const center = hexToPixel(hex.col, hex.row);
    hoverRing.position.set(center.x, groundHeightAt(hex.col, hex.row) + 1, center.y);
    hoverRing.visible = true;
});

canvas3d.addEventListener('pointerleave', () => { hoverRing.visible = false; });

// ==========================================
// CICLO DI DISEGNO E ATTIVAZIONE
// ==========================================

let lastFrame = performance.now();

function frame(now) {
    if (!active) {
        looping = false;
        return;
    }
    const delta = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    syncBoard();
    syncStandees(delta);

    // Le superfici di fuoco tremolano
    layers.terrain?.children.forEach(mesh => {
        if (mesh.userData.surface === 'fuoco') {
            mesh.material.emissiveIntensity = 0.5 + Math.sin(now / 120) * 0.15 + Math.sin(now / 47) * 0.1;
        }
    });

    applyFirstPersonScale();
    if (firstPerson) updateFirstPersonKeys(now, delta);
    else updateOverviewKeys(delta);
    if (firstPerson) {
        updateFirstPersonCamera();
    } else {
        controls.update();
    }
    renderer.render(scene, camera);
    drawOverlay();
    requestAnimationFrame(frame);
}

// ==========================================
// PRIMA PERSONA
// Il giocatore guarda con gli occhi del suo personaggio, il Master con quelli
// dell'entità selezionata. Trascinare gira lo sguardo; un clic su un esagono
// muove come sempre (handleBoardClick) e la telecamera segue la pedina.
// ==========================================

const OVERVIEW_SKY = 0x101418;
const FIRST_PERSON_SKY = 0x3a4a5c;
const EYE_HEIGHT = 88;           // ~1,7 m: un esagono è 1 m (~52 pixel)
const FIRST_PERSON_STANDEE_SCALE = 1.25;
let firstPerson = null;          // { charId, yaw, pitch }
let lookFrom = null;

function firstPersonCandidate() {
    if (isMaster) return characters.find(c => c.id === selectedCharacterId) || null;
    const myId = parseInt(userSelect?.value);
    return characters.find(c => c.id === myId && c.role === 'player') || null;
}

function enterFirstPerson() {
    const char = firstPersonCandidate();
    if (!char || !standees.has(char.id)) {
        alert(isMaster
            ? 'Seleziona prima un\'entità sulla mappa: guarderai con i suoi occhi.'
            : 'Scegli il tuo personaggio (e che sia visibile sulla mappa) per guardare con i suoi occhi.');
        return;
    }

    // Sguardo iniziale verso il personaggio più vicino ma non attaccato (una
    // carta a un passo riempirebbe lo schermo), altrimenti verso il centro della mappa
    const me = hexToPixel(char.x, char.y);
    const others = characters
        .filter(c => c.id !== char.id && standees.has(c.id) && hexDistance(c.x, c.y, char.x, char.y) >= 3)
        .map(c => hexToPixel(c.x, c.y))
        .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    const bounds = boardBounds();
    const look = others[0] || { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const yaw = Math.atan2(-(look.x - me.x), -(look.y - me.y));

    firstPerson = { charId: char.id, yaw, pitch: -0.08 };
    controls.enabled = false;
    camera.fov = 70;
    camera.updateProjectionMatrix();
    // Cielo al crepuscolo: le cime dei muri si staccano dallo sfondo
    scene.background.set(FIRST_PERSON_SKY);
    scene.fog.color.set(FIRST_PERSON_SKY);
    scene.fog.near = 500;
    scene.fog.far = 3200;
    updateFirstPersonButton();
}

function exitFirstPerson() {
    if (!firstPerson) return;
    heldKeys.clear();
    const standee = standees.get(firstPerson.charId);
    if (standee) standee.visible = true;
    firstPerson = null;
    controls.enabled = true;
    camera.fov = 42;
    camera.updateProjectionMatrix();
    scene.background.set(OVERVIEW_SKY);
    scene.fog.color.set(OVERVIEW_SKY);
    scene.fog.near = 2500;
    scene.fog.far = 9000;
    applyFirstPersonScale();
    focusCamera();
    updateFirstPersonButton();
}

// Muri e coperture alti quanto una persona; pedine a grandezza umana
function applyFirstPersonScale() {
    layers.terrain?.children.forEach(mesh => {
        const type = mesh.userData.terrain;
        if (type) mesh.scale.y = firstPerson ? (FIRST_PERSON_HEIGHT_SCALE[type] ?? 1) : 1;
    });
    standees.forEach(standee => {
        standee.scale.setScalar(firstPerson ? FIRST_PERSON_STANDEE_SCALE : 1);
    });
}

// ==========================================
// WASD: un passo di un esagono nella direzione in cui si guarda (Q/E per girarsi)
// Ogni passo passa da handleBoardClick: muri, caselle occupate e combattimento
// (in combattimento dopo "Muovi", con il costo in frame) seguono le regole di sempre.
// ==========================================

// Direzione di ogni tasto rispetto allo sguardo
const STEP_KEYS = { w: 0, s: Math.PI, a: Math.PI / 2, d: -Math.PI / 2 };
const STEP_INTERVAL_MS = 260;
const TURN_SPEED = 2.2;   // radianti al secondo con Q/E
const CUBE_DIRECTIONS = [
    { q: 1, r: -1, s: 0 }, { q: 1, r: 0, s: -1 }, { q: 0, r: 1, s: -1 },
    { q: -1, r: 1, s: 0 }, { q: -1, r: 0, s: 1 }, { q: 0, r: -1, s: 1 }
];
const heldKeys = new Set();
let lastStepAt = 0;

function isTypingIn(target) {
    return !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

// Frecce: muovono la visuale (in prima persona lo sguardo, dall'alto la telecamera)
const ARROW_KEYS = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown']);
const LOOK_SPEED = 1.4;     // radianti al secondo con su/giù
const ORBIT_SPEED = 1.6;    // dall'alto: giro attorno al punto guardato

document.addEventListener('keydown', (event) => {
    if (!active || isTypingIn(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (ARROW_KEYS.has(key)) {
        event.preventDefault();   // la pagina non scorre
        heldKeys.add(key);
        return;
    }
    if (!firstPerson) return;
    if (!(key in STEP_KEYS) && key !== 'q' && key !== 'e') return;
    event.preventDefault();
    if (key in STEP_KEYS && !heldKeys.has(key)) lastStepAt = 0;   // il primo passo parte subito
    heldKeys.add(key);
});
document.addEventListener('keyup', (event) => heldKeys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => heldKeys.clear());

// Esagono vicino che sta più nella direzione voluta (angolo come lo sguardo: 0 = avanti)
function neighborTowards(char, angle) {
    const here = hexToPixel(char.x, char.y);
    const dirX = -Math.sin(angle);
    const dirY = -Math.cos(angle);
    const origin = offsetToCube(char.x, char.y);
    let best = null;
    CUBE_DIRECTIONS.forEach(d => {
        const hex = cubeToOffset({ q: origin.q + d.q, r: origin.r + d.r, s: origin.s + d.s });
        const p = hexToPixel(hex.col, hex.row);
        const length = Math.hypot(p.x - here.x, p.y - here.y) || 1;
        const score = ((p.x - here.x) * dirX + (p.y - here.y) * dirY) / length;
        if (!best || score > best.score) best = { hex, pos: p, score };
    });
    return best;
}

function updateFirstPersonKeys(now, delta) {
    if (heldKeys.has('q') || heldKeys.has('arrowleft')) firstPerson.yaw += TURN_SPEED * delta;
    if (heldKeys.has('e') || heldKeys.has('arrowright')) firstPerson.yaw -= TURN_SPEED * delta;
    if (heldKeys.has('arrowup')) firstPerson.pitch = Math.min(1.0, firstPerson.pitch + LOOK_SPEED * delta);
    if (heldKeys.has('arrowdown')) firstPerson.pitch = Math.max(-1.2, firstPerson.pitch - LOOK_SPEED * delta);

    const stepKey = ['w', 's', 'a', 'd'].find(key => heldKeys.has(key));
    if (!stepKey || now - lastStepAt < STEP_INTERVAL_MS) return;

    const char = characters.find(c => c.id === firstPerson.charId);
    const standee = standees.get(firstPerson.charId);
    if (!char || !standee) return;

    // Un passo alla volta: si aspetta che la pedina sia arrivata
    const here = hexToPixel(char.x, char.y);
    if (Math.hypot(standee.position.x - here.x, standee.position.z - here.y) > 8) return;
    lastStepAt = now;

    const next = neighborTowards(char, firstPerson.yaw + STEP_KEYS[stepKey]);
    if (!next) return;

    // Nella nebbia non si entra (il clic mostrerebbe un avviso a ogni passo)
    if (!isMaster && window.fowEnabled && !window.revealedHexes.has(`${next.hex.col},${next.hex.row}`)) {
        statusBar.innerText = '🌫️ La nebbia copre quella direzione.';
        return;
    }
    // Il Master muove l'entità selezionata: dopo ogni passo la selezione va ripristinata
    if (isMaster) selectedCharacterId = char.id;
    handleBoardClick(next.pos);
}

// Dall'alto: le frecce girano e inclinano la telecamera attorno al punto guardato
const orbitOffset = new THREE.Vector3();
const orbitSpherical = new THREE.Spherical();

function updateOverviewKeys(delta) {
    const left = heldKeys.has('arrowleft'), right = heldKeys.has('arrowright');
    const up = heldKeys.has('arrowup'), down = heldKeys.has('arrowdown');
    if (!left && !right && !up && !down) return;

    orbitOffset.copy(camera.position).sub(controls.target);
    orbitSpherical.setFromVector3(orbitOffset);
    if (left) orbitSpherical.theta -= ORBIT_SPEED * delta;
    if (right) orbitSpherical.theta += ORBIT_SPEED * delta;
    if (up) orbitSpherical.phi -= ORBIT_SPEED * 0.6 * delta;
    if (down) orbitSpherical.phi += ORBIT_SPEED * 0.6 * delta;
    // Stessi limiti del mouse: mai sotto il pavimento, mai a piombo
    orbitSpherical.phi = Math.max(0.12, Math.min(controls.maxPolarAngle, orbitSpherical.phi));
    orbitOffset.setFromSpherical(orbitSpherical);
    camera.position.copy(controls.target).add(orbitOffset);
}

function updateFirstPersonCamera() {
    const standee = standees.get(firstPerson.charId);
    // Il personaggio è sparito (nebbia, nascosto, eliminato): si torna alla vista dall'alto
    if (!standee) {
        exitFirstPerson();
        return;
    }
    standee.visible = false;
    camera.position.set(standee.position.x, standee.position.y + EYE_HEIGHT, standee.position.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(firstPerson.pitch, firstPerson.yaw, 0);
}

function setView3d(enabled) {
    if (enabled && !ensureRenderer()) enabled = false;
    if (!enabled) exitFirstPerson();
    active = enabled;
    container.classList.toggle('board3d-on', enabled);
    toggleButton.textContent = enabled ? '🗺️ 2D' : '🧊 3D';
    updateFirstPersonButton();
    toggleButton.title = enabled ? 'Torna alla plancia 2D (strumenti del Master)' : 'Plancia 3D (prototipo)';
    try { localStorage.setItem(VIEW_KEY, enabled ? '3d' : '2d'); } catch (e) { /* solo per questa volta */ }

    if (enabled) {
        resize();
        if (!focusedOnce) {
            focusCamera();
            focusedOnce = true;
        }
        lastFrame = performance.now();
        if (!looping) {
            looping = true;
            requestAnimationFrame(frame);
        }
    } else if (typeof requestRender === 'function') {
        requestRender();
    }
}

// Pulsante accanto a "Centra" nella barra in alto
const toggleButton = document.createElement('button');
toggleButton.id = 'board3d-toggle';
toggleButton.type = 'button';
toggleButton.className = 'board3d-toggle';
toggleButton.addEventListener('click', () => setView3d(!active));
const centerButton = document.getElementById('center-cam-btn');
centerButton?.parentElement?.insertBefore(toggleButton, centerButton);

// Prima persona: compare solo nella vista 3D
const firstPersonButton = document.createElement('button');
firstPersonButton.id = 'board3d-first-person';
firstPersonButton.type = 'button';
firstPersonButton.className = 'board3d-toggle';
firstPersonButton.addEventListener('click', () => (firstPerson ? exitFirstPerson() : enterFirstPerson()));
toggleButton.after(firstPersonButton);

function updateFirstPersonButton() {
    firstPersonButton.style.display = active ? 'inline-block' : 'none';
    firstPersonButton.textContent = firstPerson ? '🦅 Dall\'alto' : '👁️ Prima persona';
    firstPersonButton.classList.toggle('on', !!firstPerson);
}

// Esc esce dalla prima persona (oltre a chiudere i pannelli come sempre)
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && firstPerson) exitFirstPerson();
});

// "Centra" in 3D porta la telecamera sul personaggio
centerButton?.addEventListener('click', () => {
    if (active && !firstPerson) focusCamera();
});

window.addEventListener('resize', () => { if (active) resize(); });

let startIn3d = false;
try { startIn3d = localStorage.getItem(VIEW_KEY) === '3d'; } catch (e) { /* vista 2D */ }
toggleButton.textContent = '🧊 3D';
updateFirstPersonButton();
if (startIn3d) setView3d(true);

// Per le prove dalla console
window.board3d = { setView3d, focusCamera, enterFirstPerson, exitFirstPerson, scene, camera, getRenderer: () => renderer };
