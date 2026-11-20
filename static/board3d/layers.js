// Costruzione della scena 3D a partire dallo stato del gioco (lo stesso della vista 2D).
// Coordinate: 1 unità = 1 pixel della mappa 2D. La X resta X, la Y della mappa
// diventa la Z 3D e l'altezza è la Y 3D. Così hexToPixel/pixelToHex valgono uguali.
import * as THREE from 'three';

// Altezze del terreno (in pixel della mappa; un esagono è largo circa 52)
export const TERRAIN_STYLE = {
    muro: { height: 52, color: 0x4a4a4f },
    copertura_totale: { height: 34, color: 0x6b6f73 },
    copertura_parziale: { height: 16, color: 0x8a8f94 },
    altura: { height: 12, color: 0x8b6b45 },
    difficile: { height: 1.5, color: 0x5e7d34, opacity: 0.55 }
};

// In prima persona l'occhio è a ~1,7 m: muri e coperture prendono la loro altezza vera
// (un esagono è 1 m, circa 52 pixel). Dall'alto restano bassi per non coprire la mappa.
export const FIRST_PERSON_HEIGHT_SCALE = {
    muro: 2.6,
    copertura_totale: 3.2,
    copertura_parziale: 3.2
};

export const SURFACE_STYLE = {
    fuoco: { color: 0xe74c3c, emissive: 0xff5a1f, opacity: 0.75, height: 2 },
    veleno: { color: 0x2ecc71, emissive: 0x1e8449, opacity: 0.6, height: 2 },
    ghiaccio: { color: 0xaed6f1, emissive: 0x2e4053, opacity: 0.75, height: 2 },
    fumo: { color: 0xb3b6b7, emissive: 0x000000, opacity: 0.35, height: 70 }
};

// Prisma esagonale con le punte su e giù (come la griglia 2D)
function hexPrism(height, scale = 0.98) {
    const geometry = new THREE.CylinderGeometry(HEX_SIZE * scale, HEX_SIZE * scale, height, 6);
    geometry.translate(0, height / 2, 0);
    return geometry;
}

// Altezza del terreno sotto un esagono: le pedine ci salgono sopra
export function groundHeightAt(col, row) {
    const type = terrainAt(col, row);
    return type === 'altura' ? TERRAIN_STYLE.altura.height : 0;
}

// ==========================================
// MAPPA (immagine di sfondo) E PAVIMENTO
// ==========================================

export function buildGround() {
    const group = new THREE.Group();

    // Pavimento infinito scuro: si vede oltre i bordi della mappa
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(40000, 40000),
        new THREE.MeshStandardMaterial({ color: 0x39424b, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    group.add(floor);

    if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
        const width = bgImage.width * mapScale;
        const height = bgImage.height * mapScale;
        const texture = new THREE.Texture(bgImage);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.needsUpdate = true;

        const map = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 })
        );
        map.rotation.x = -Math.PI / 2;
        map.position.set(mapDx + width / 2, 0, mapDy + height / 2);
        map.receiveShadow = true;
        group.add(map);
    }

    return group;
}

// Area da coprire con griglia e nebbia: la mappa, oppure la zona delle pedine
export function boardBounds() {
    if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
        return {
            minX: mapDx, minY: mapDy,
            maxX: mapDx + bgImage.width * mapScale, maxY: mapDy + bgImage.height * mapScale
        };
    }
    const points = characters.map(c => hexToPixel(c.x, c.y));
    if (!points.length) points.push({ x: 0, y: 0 });
    const pad = HEX_SIZE * 12;
    return {
        minX: Math.min(...points.map(p => p.x)) - pad, minY: Math.min(...points.map(p => p.y)) - pad,
        maxX: Math.max(...points.map(p => p.x)) + pad, maxY: Math.max(...points.map(p => p.y)) + pad
    };
}

// Esagoni che coprono un rettangolo di pixel della mappa
export function hexesInBounds(bounds) {
    const first = pixelToHex(bounds.minX, bounds.minY);
    const last = pixelToHex(bounds.maxX, bounds.maxY);
    const hexes = [];
    for (let row = first.row - 1; row <= last.row + 1; row++) {
        for (let col = first.col - 1; col <= last.col + 1; col++) {
            hexes.push({ col, row });
        }
    }
    return hexes;
}

// ==========================================
// GRIGLIA
// ==========================================

export function buildGrid(hexes) {
    const positions = [];
    hexes.forEach(({ col, row }) => {
        const center = hexToPixel(col, row);
        for (let i = 0; i < 6; i++) {
            const a = HEX_CORNERS[i];
            const b = HEX_CORNERS[(i + 1) % 6];
            positions.push(center.x + a.x, 0.6, center.y + a.y, center.x + b.x, 0.6, center.y + b.y);
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })
    );
}

// ==========================================
// TERRENO E SUPERFICI (un InstancedMesh per tipo: migliaia di esagoni restano leggeri)
// ==========================================

function instancedHexes(keys, height, material, castShadow) {
    const mesh = new THREE.InstancedMesh(hexPrism(height), material, keys.length);
    const matrix = new THREE.Matrix4();
    keys.forEach((key, index) => {
        const [col, row] = key.split(',').map(Number);
        const center = hexToPixel(col, row);
        matrix.makeTranslation(center.x, 0, center.y);
        mesh.setMatrixAt(index, matrix);
    });
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
}

export function buildTerrain() {
    const group = new THREE.Group();

    Object.entries(TERRAIN_STYLE).forEach(([type, style]) => {
        const keys = Object.keys(window.mapTerrain || {}).filter(key => window.mapTerrain[key] === type);
        if (!keys.length) return;
        const material = new THREE.MeshStandardMaterial({
            color: style.color,
            roughness: 0.9,
            transparent: !!style.opacity,
            opacity: style.opacity ?? 1
        });
        const mesh = instancedHexes(keys, style.height, material, style.height > 4);
        mesh.userData.terrain = type;
        group.add(mesh);
    });

    Object.entries(SURFACE_STYLE).forEach(([type, style]) => {
        const keys = Object.keys(window.mapSurfaces || {}).filter(key => window.mapSurfaces[key] === type);
        if (!keys.length) return;
        const material = new THREE.MeshStandardMaterial({
            color: style.color,
            emissive: style.emissive,
            emissiveIntensity: 0.6,
            transparent: true,
            opacity: style.opacity,
            depthWrite: type !== 'fumo'
        });
        const mesh = instancedHexes(keys, style.height, material, false);
        mesh.userData.surface = type;
        group.add(mesh);
    });

    return group;
}

// ==========================================
// NEBBIA DI GUERRA (solo per i giocatori)
// ==========================================

export function buildFog(hexes) {
    const hidden = hexes.filter(({ col, row }) => !window.revealedHexes.has(`${col},${row}`));
    if (!hidden.length) return new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0x05080b, transparent: true, opacity: 0.94 });
    return instancedHexes(hidden.map(({ col, row }) => `${col},${row}`), 64, material, false);
}

// ==========================================
// PEDINE: miniature di cartone con il ritratto, su una base colorata
// ==========================================

const STANDEE_WIDTH = 54;
const STANDEE_HEIGHT = 74;

// Ritratto della pedina disegnato su una "carta" con bordo del colore del personaggio
function drawStandeeCard(char, image, dead) {
    const canvas = document.createElement('canvas');
    canvas.width = 184;
    canvas.height = 248;
    const ctx2 = canvas.getContext('2d');

    ctx2.fillStyle = char.color || '#7f8c8d';
    ctx2.beginPath();
    ctx2.roundRect(0, 0, canvas.width, canvas.height, 18);
    ctx2.fill();

    ctx2.save();
    ctx2.beginPath();
    ctx2.roundRect(8, 8, canvas.width - 16, canvas.height - 50, 12);
    ctx2.clip();
    ctx2.fillStyle = '#1b2026';
    ctx2.fillRect(8, 8, canvas.width - 16, canvas.height - 50);
    if (dead) ctx2.filter = 'grayscale(1) brightness(0.7)';
    if (image && image.complete && image.naturalWidth > 0) {
        const boxW = canvas.width - 16;
        const boxH = canvas.height - 50;
        const scale = Math.max(boxW / image.naturalWidth, boxH / image.naturalHeight);
        const w = image.naturalWidth * scale;
        const h = image.naturalHeight * scale;
        ctx2.drawImage(image, 8 + (boxW - w) / 2, 8 + (boxH - h) / 3, w, h);
    } else {
        ctx2.fillStyle = '#ffffff';
        ctx2.font = 'bold 96px Arial';
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillText(String(char.name || '?').charAt(0).toUpperCase(), canvas.width / 2, (canvas.height - 42) / 2);
    }
    ctx2.restore();

    // Nome in basso, sulla striscia colorata
    ctx2.fillStyle = '#ffffff';
    ctx2.font = 'bold 22px Arial';
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx2.shadowBlur = 4;
    ctx2.fillText(String(char.name || '').slice(0, 14), canvas.width / 2, canvas.height - 21);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

export function createStandee(char) {
    const group = new THREE.Group();

    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(20, 22, 5, 32),
        new THREE.MeshStandardMaterial({ color: char.color || '#7f8c8d', roughness: 0.5, metalness: 0.1 })
    );
    base.position.y = 2.5;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // La carta gira sul suo asse verticale per guardare sempre la telecamera
    const pivot = new THREE.Group();
    pivot.position.y = 5;
    const card = new THREE.Mesh(
        new THREE.PlaneGeometry(STANDEE_WIDTH, STANDEE_HEIGHT),
        new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7, alphaTest: 0.1 })
    );
    card.position.y = STANDEE_HEIGHT / 2;
    card.castShadow = true;
    card.userData.charId = char.id;
    pivot.add(card);
    group.add(pivot);

    // Anello di selezione / turno, a terra
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(24, 29, 40),
        new THREE.MeshBasicMaterial({ color: 0xf1c40f, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.8;
    ring.visible = false;
    group.add(ring);

    group.userData = { charId: char.id, card, pivot, base, ring, textureKey: null };
    return group;
}

// Aggiorna ritratto, colore e stato (morto, selezionato, di turno) di una pedina
export function updateStandee(standee, char, { selected, acting, dead }) {
    const data = standee.userData;
    const image = getCharacterTokenImage(char);
    const loaded = !!(image && image.complete && image.naturalWidth > 0);
    const key = `${char.token_url}|${char.color}|${char.name}|${dead}|${loaded}`;
    if (data.textureKey !== key) {
        data.card.material.map?.dispose();
        data.card.material.map = drawStandeeCard(char, image, dead);
        data.card.material.needsUpdate = true;
        data.base.material.color.set(dead ? '#3d3d3d' : (char.color || '#7f8c8d'));
        data.textureKey = key;
    }

    // Un NPC morto è steso a terra
    data.pivot.rotation.x = dead ? -Math.PI / 2 + 0.08 : 0;
    data.ring.visible = selected || acting;
    data.ring.material.color.set(acting ? 0xf1c40f : 0x5dade2);
}
