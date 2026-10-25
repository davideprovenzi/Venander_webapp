// ==========================================
// DISEGNI DEL MASTER
// Stato, tratti liberi, forme, gomma e sincronizzazione.
// Il rendering delle forme resta in renderer.js.
// ==========================================

let drawings = [];
let currentIconBase64 = null;

let isDrawingMode = false;
let isEraserMode = false;

// Tratto libero in corso (già dentro drawings) e forma in anteprima
let activeStroke = null;
let currentTempShape = null;
let isErasing = false;
let dragLastPos = null;

window.selectedDrawing = null;
window.draggingDrawing = null;
window.eraserCursor = null;

// Valori in pixel dello schermo: vengono divisi per lo zoom
const ERASER_RADIUS_PX = 12;
const SELECT_TOLERANCE_PX = 10;
const STROKE_MIN_STEP_PX = 2;

// Ogni quanto inviare ai giocatori il tratto mentre lo si disegna
const STROKE_SYNC_MS = 50;
let pendingStrokePoints = [];
let strokeSyncTimer = null;

// ==========================================
// UTILITÀ
// ==========================================

function newDrawingUid() {
    return (window.crypto && typeof window.crypto.randomUUID === 'function')
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDrawTool() {
    return document.getElementById('draw-tool-select')?.value || 'line';
}

function getDrawColor() {
    return document.getElementById('draw-color')?.value || '#000000';
}

function getDrawWidth(fallback) {
    return parseInt(document.getElementById('draw-width')?.value) || fallback;
}

// La punta "gomma" della penna arriva come tasto 5 (o bit 32 di buttons)
function isPenEraser(event) {
    return event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) !== 0);
}

// Con la penna la pressione arriva a ~120 eventi/sec: il browser li raggruppa,
// recuperarli tutti rende i tratti molto più fluidi.
function forEachCoalescedPos(event, callback) {
    const events = event.getCoalescedEvents?.() || [];
    (events.length ? events : [event]).forEach(e => callback(getWorldPos(e), e));
}

// Solo dati serializzabili: imageObj è una cache locale (Image) e non va spedita
function serializeDrawing(d) {
    return {
        uid: d.uid,
        type: d.type,
        sx: d.sx,
        sy: d.sy,
        ex: d.ex,
        ey: d.ey,
        c: d.c,
        w: d.w,
        img: d.img || null,
        points: d.points || null
    };
}

// ==========================================
// GEOMETRIA (selezione e gomma)
// ==========================================

function distToSegment(px, py, ax, ay, bx, by) {
    const lenSq = (bx - ax) ** 2 + (by - ay) ** 2;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / lenSq));
    return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
}

function hitTestDrawing(d, x, y, tolerance) {
    if (d.type === 'stroke') {
        const pts = d.points || [];
        if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y) <= tolerance + pts[0][2] / 2;
        for (let i = 1; i < pts.length; i++) {
            const [ax, ay] = pts[i - 1];
            const [bx, by, w] = pts[i];
            if (distToSegment(x, y, ax, ay, bx, by) <= tolerance + w / 2) return true;
        }
        return false;
    }

    if (d.type === 'rectangle') {
        return x >= Math.min(d.sx, d.ex) - tolerance && x <= Math.max(d.sx, d.ex) + tolerance &&
               y >= Math.min(d.sy, d.ey) - tolerance && y <= Math.max(d.sy, d.ey) + tolerance;
    }

    if (d.type === 'circle' || d.type === 'square' || d.type === 'triangle' || d.type === 'icon') {
        return Math.hypot(d.sx - x, d.sy - y) <= (d.w || 20) + tolerance;
    }

    // Vecchi segmenti 'line' (un pezzo di tratto ciascuno)
    return distToSegment(x, y, d.sx, d.sy, d.ex ?? d.sx, d.ey ?? d.sy) <= tolerance + (d.w || 3) / 2;
}

function getDrawingBounds(d) {
    if (d.type === 'stroke' && d.points?.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        d.points.forEach(([x, y, w]) => {
            minX = Math.min(minX, x - w / 2);
            minY = Math.min(minY, y - w / 2);
            maxX = Math.max(maxX, x + w / 2);
            maxY = Math.max(maxY, y + w / 2);
        });
        return { minX, minY, maxX, maxY };
    }

    if (d.type === 'rectangle' || d.type === 'line' || !d.type) {
        const half = d.type === 'rectangle' ? 0 : (d.w || 3) / 2;
        return {
            minX: Math.min(d.sx, d.ex) - half,
            minY: Math.min(d.sy, d.ey) - half,
            maxX: Math.max(d.sx, d.ex) + half,
            maxY: Math.max(d.sy, d.ey) + half
        };
    }

    const r = d.w || 20;
    return { minX: d.sx - r, minY: d.sy - r, maxX: d.sx + r, maxY: d.sy + r };
}

function findDrawingAt(x, y, tolerance) {
    // Al contrario, per prendere l'elemento più "sopra"
    for (let i = drawings.length - 1; i >= 0; i--) {
        if (hitTestDrawing(drawings[i], x, y, tolerance)) return drawings[i];
    }
    return null;
}

function translateDrawing(d, dx, dy) {
    d.sx += dx;
    d.sy += dy;
    d.ex = (d.ex ?? 0) + dx;
    d.ey = (d.ey ?? 0) + dy;
    if (d.points) d.points = d.points.map(([x, y, w]) => [x + dx, y + dy, w]);
}

// ==========================================
// STATO LOCALE
// ==========================================

function upsertDrawing(data) {
    const index = drawings.findIndex(d => d.uid === data.uid);
    if (index === -1) {
        drawings.push(data);
        return;
    }
    // Mantiene la cache Image locale dello sticker e aggiorna solo i dati sincronizzati.
    drawings[index] = { ...drawings[index], ...data, imageObj: drawings[index].imageObj };
}

function removeDrawings(uids) {
    const toRemove = new Set(uids);
    drawings = drawings.filter(d => !toRemove.has(d.uid));
    if (window.selectedDrawing && toRemove.has(window.selectedDrawing.uid)) window.selectedDrawing = null;
}

function deleteSelectedDrawing() {
    if (!window.selectedDrawing) return false;
    const uid = window.selectedDrawing.uid;
    removeDrawings([uid]);
    socket.emit('delete_drawings', { uids: [uid] });
    requestRender();
    return true;
}

// ==========================================
// TRATTO LIBERO
// ==========================================

function addStrokePoint(pos, event) {
    const pts = activeStroke.points;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last[0] - pos.x, last[1] - pos.y) < STROKE_MIN_STEP_PX / camera.zoom) return;

    // Con la penna lo spessore segue la pressione (0.5 = spessore impostato)
    const width = event.pointerType === 'pen'
        ? Math.max(1, Math.round(activeStroke.w * event.pressure * 2))
        : activeStroke.w;

    const point = [Math.round(pos.x * 10) / 10, Math.round(pos.y * 10) / 10, width];
    pts.push(point);
    pendingStrokePoints.push(point);

    if (!strokeSyncTimer) strokeSyncTimer = setTimeout(flushStrokeProgress, STROKE_SYNC_MS);
}

// Anteprima per i giocatori: non viene salvata, il tratto completo arriva a fine disegno
function flushStrokeProgress() {
    clearTimeout(strokeSyncTimer);
    strokeSyncTimer = null;
    if (!activeStroke || !pendingStrokePoints.length) return;

    socket.emit('draw_stroke_progress', {
        uid: activeStroke.uid,
        c: activeStroke.c,
        w: activeStroke.w,
        points: pendingStrokePoints
    });
    pendingStrokePoints = [];
}

function finishStroke() {
    flushStrokeProgress();

    const pts = activeStroke.points;
    if (pts.length) {
        activeStroke.sx = pts[0][0];
        activeStroke.sy = pts[0][1];
        activeStroke.ex = pts[pts.length - 1][0];
        activeStroke.ey = pts[pts.length - 1][1];
        socket.emit('draw_item', serializeDrawing(activeStroke));
    } else {
        removeDrawings([activeStroke.uid]);
    }

    activeStroke = null;
    pendingStrokePoints = [];
    render();
}

// ==========================================
// GOMMA
// Cancella interi tratti/forme toccati (come una gomma vettoriale).
// ==========================================

function eraseAt(pos) {
    const radius = ERASER_RADIUS_PX / camera.zoom;
    const hits = drawings.filter(d => hitTestDrawing(d, pos.x, pos.y, radius)).map(d => d.uid);
    if (!hits.length) return;

    removeDrawings(hits);
    socket.emit('delete_drawings', { uids: hits });
}

// ==========================================
// INPUT DAL CANVAS (chiamati da control.js)
// Restituiscono true se l'evento è stato gestito dal disegno.
// ==========================================

function drawingPointerDown(event, pos) {
    if (!isMaster || !isDrawingMode) return false;

    if (isEraserMode || isPenEraser(event)) {
        isErasing = true;
        window.eraserCursor = pos;
        eraseAt(pos);
        render();
        return true;
    }

    const tool = getDrawTool();

    // Strumento "Manina" per spostare e selezionare
    if (tool === 'select') {
        window.selectedDrawing = findDrawingAt(pos.x, pos.y, SELECT_TOLERANCE_PX / camera.zoom);
        if (window.selectedDrawing) {
            window.draggingDrawing = window.selectedDrawing;
            dragLastPos = pos;
            canvas.style.cursor = 'grabbing';
        }
        render(); // Ridisegna per mostrare il contorno di selezione
        return true;
    }

    if (tool === 'line') {
        activeStroke = { uid: newDrawingUid(), type: 'stroke', c: getDrawColor(), w: getDrawWidth(3), points: [] };
        drawings.push(activeStroke);
        addStrokePoint(pos, event);
        render();
        return true;
    }

    if (tool === 'icon' && !currentIconBase64) {
        alert("Carica un'icona!");
        return true;
    }

    currentTempShape = {
        uid: newDrawingUid(),
        type: tool,
        sx: pos.x,
        sy: pos.y,
        ex: pos.x,
        ey: pos.y,
        c: getDrawColor(),
        w: getDrawWidth(20),
        img: tool === 'icon' ? currentIconBase64 : null
    };
    return true;
}

function drawingPointerMove(event, pos) {
    if (!isMaster || !isDrawingMode) return false;

    if (isEraserMode || isErasing) window.eraserCursor = pos;

    if (isErasing) {
        forEachCoalescedPos(event, p => eraseAt(p));
        render();
        return true;
    }

    if (window.draggingDrawing) {
        translateDrawing(window.draggingDrawing, pos.x - dragLastPos.x, pos.y - dragLastPos.y);
        dragLastPos = pos;
        render();
        return true;
    }

    if (activeStroke) {
        forEachCoalescedPos(event, (p, e) => addStrokePoint(p, e));
        render();
        return true;
    }

    if (currentTempShape) {
        if (currentTempShape.type === 'rectangle') {
            // Il rettangolo traccia dall'inizio alla fine
            currentTempShape.ex = pos.x;
            currentTempShape.ey = pos.y;
        } else {
            const dragSize = Math.hypot(pos.x - currentTempShape.sx, pos.y - currentTempShape.sy);
            if (dragSize > 5) currentTempShape.w = dragSize;
        }
        render();
        return true;
    }

    // Aggiorna solo il cursore della gomma
    if (window.eraserCursor) render();
    return false;
}

function drawingPointerUp() {
    if (isErasing) {
        isErasing = false;
        if (!isEraserMode) window.eraserCursor = null;
        render();
        return true;
    }

    if (activeStroke) {
        finishStroke();
        return true;
    }

    if (currentTempShape) {
        drawings.push(currentTempShape);
        socket.emit('draw_item', serializeDrawing(currentTempShape));
        currentTempShape = null;
        render();
        return true;
    }

    if (window.draggingDrawing) {
        socket.emit('update_drawing', serializeDrawing(window.draggingDrawing));
        window.draggingDrawing = null;
        dragLastPos = null;
        canvas.style.cursor = 'pointer';
        return true;
    }

    return false;
}

function drawingPointerLeave() {
    if (!window.eraserCursor) return;
    window.eraserCursor = null;
    render();
}

// ==========================================
// SOCKET
// ==========================================

socket.on('init_drawings', (serverDrawings) => {
    drawings = serverDrawings || [];
    window.selectedDrawing = null;
    requestRender();
});

socket.on('draw_item', (data) => {
    upsertDrawing(data);
    requestRender();
});

socket.on('drawing_updated', (data) => {
    upsertDrawing(data);
    requestRender();
});

// Tratto del Master ancora in corso
socket.on('draw_stroke_progress', (data) => {
    let stroke = drawings.find(d => d.uid === data.uid);
    if (!stroke) {
        stroke = { uid: data.uid, type: 'stroke', c: data.c, w: data.w, points: [] };
        drawings.push(stroke);
    }
    stroke.points = stroke.points.concat(data.points || []);
    requestRender();
});

socket.on('drawing_deleted', (data) => {
    removeDrawings(data.uids || [data.uid]);
    requestRender();
});

socket.on('clear_lines', () => {
    drawings = [];
    window.selectedDrawing = null;
    requestRender();
});

// ==========================================
// PANNELLO DISEGNO
// ==========================================

const toggleDrawBtn = document.getElementById('toggle-draw-btn');
const eraserBtn = document.getElementById('eraser-btn');

function setDrawingMode(enabled) {
    isDrawingMode = enabled;
    if (toggleDrawBtn) {
        toggleDrawBtn.innerText = enabled ? "Disegno ON" : "Disegno OFF";
        toggleDrawBtn.style.background = enabled ? "#d4efdf" : "#eee";
    }
    if (!enabled) {
        setEraserMode(false);
        window.selectedDrawing = null;
        requestRender();
    }
}

function setEraserMode(enabled) {
    isEraserMode = enabled;
    if (eraserBtn) {
        eraserBtn.innerText = enabled ? "Gomma ON" : "Gomma OFF";
        eraserBtn.style.background = enabled ? "#f39c12" : "#eee";
    }
    // La gomma ha senso solo in modalità disegno
    if (enabled && !isDrawingMode) setDrawingMode(true);
    if (!enabled) {
        window.eraserCursor = null;
        requestRender();
    }
}

toggleDrawBtn?.addEventListener('click', () => setDrawingMode(!isDrawingMode));
eraserBtn?.addEventListener('click', () => setEraserMode(!isEraserMode));

document.getElementById('clear-draw-btn')?.addEventListener('click', () => {
    if (confirm("Cancellare tutto lo scenario?")) socket.emit('clear_drawings');
});

document.getElementById('delete-selected-draw-btn')?.addEventListener('click', () => {
    if (!deleteSelectedDrawing()) {
        alert("Seleziona prima un disegno o uno sticker con lo strumento '🖐️ Seleziona e Sposta'!");
    }
});

document.getElementById('draw-tool-select')?.addEventListener('change', (e) => {
    const iconSection = document.getElementById('icon-upload-section');
    if (iconSection) iconSection.style.display = e.target.value === 'icon' ? 'block' : 'none';
    // Scegliere uno strumento significa voler disegnare, non cancellare
    setEraserMode(false);
});

document.getElementById('icon-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => { currentIconBase64 = evt.target.result; };
    reader.readAsDataURL(file);
});

// Canc / Backspace eliminano il disegno selezionato
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && isMaster && isDrawingMode) {
        deleteSelectedDrawing();
    }
});
