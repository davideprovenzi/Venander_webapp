// --- MATEMATICA ESAGONALE (Pointy-topped, Odd-R offset) ---
const HEX_SIZE = 30; // Dimensione (raggio) dell'esagono
const HEX_W = Math.sqrt(3) * HEX_SIZE; // Larghezza esagono
const HEX_H = 2 * HEX_SIZE; // Altezza esagono

const HEX_CORNERS = Array.from(
    { length: 6 },
    (_, i) => {

        const angle =
            Math.PI / 180 *
            (60 * i - 30);

        return {
            x: HEX_SIZE * Math.cos(angle),
            y: HEX_SIZE * Math.sin(angle)
        };
    }
);

// Converte le coordinate della griglia (X,Y) in pixel esatti sulla mappa
function hexToPixel(col, row) {
    const x = HEX_W * (col + 0.5 * (row & 1)); // Sfalsa le righe dispari
    const y = HEX_SIZE * 1.5 * row;
    return { x, y };
}

// Converte i pixel del mouse nella coordinata (X,Y) della griglia
function pixelToHex(px, py) {
    const q = (Math.sqrt(3)/3 * px - 1/3 * py) / HEX_SIZE;
    const r = (2/3 * py) / HEX_SIZE;
    return cubeToOffset(cubeRound({q: q, r: r, s: -q-r}));
}

// Arrotonda il click per assicurarsi di prendere l'esagono giusto anche sui bordi
function cubeRound(cube) {
    let q = Math.round(cube.q), r = Math.round(cube.r), s = Math.round(cube.s);
    const q_diff = Math.abs(q - cube.q), r_diff = Math.abs(r - cube.r), s_diff = Math.abs(s - cube.s);
    if (q_diff > r_diff && q_diff > s_diff) q = -r - s;
    else if (r_diff > s_diff) r = -q - s;
    else s = -q - r;
    return {q, r, s};
}

function cubeToOffset(cube) {
    const col = cube.q + (cube.r - (cube.r & 1)) / 2;
    return { col: col, row: cube.r };
}

function offsetToCube(col, row) {
    const q = col - (row - (row & 1)) / 2;
    return { q: q, r: row, s: -q - row };
}

// Distanza perfetta (in esagoni) tra due punti
function hexDistance(x1, y1, x2, y2) {
    const a = offsetToCube(x1, y1);
    const b = offsetToCube(x2, y2);
    return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
}

// Rende sicuro un testo prima di inserirlo in un innerHTML
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Esagoni attraversati in linea retta, estremi inclusi.
// Stessa formula (e stesse piccole spinte) di hex_line in app.py,
// così client e server concordano su linea di vista e percorsi.
function hexLine(x1, y1, x2, y2) {
    const a = offsetToCube(x1, y1);
    const b = offsetToCube(x2, y2);
    const steps = hexDistance(x1, y1, x2, y2);

    if (steps === 0) return [{ col: x1, row: y1 }];

    const line = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        line.push(cubeToOffset(cubeRound({
            q: a.q + (b.q - a.q) * t + 1e-6,
            r: a.r + (b.r - a.r) * t + 2e-6,
            s: a.s + (b.s - a.s) * t - 3e-6
        })));
    }
    return line;
}
