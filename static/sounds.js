// ==========================================
// SUONI DEGLI NPC
// Il Master registra (o carica) un suono per un modello NPC. Quando un NPC
// con quel suono compare agli occhi dei giocatori (spawnato in vista,
// rivelato dal Master, uscito dalla nebbia o da dietro un muro) lo si sente.
// "Solo Master": lo sente solo il Master. Ognuno può mettere i suoni in muto.
// ==========================================
const SOUND_MAX_SECONDS = 8;
const SOUND_MAX_BYTES = 1_000_000;
const SOUND_REPEAT_COOLDOWN_MS = 5000;   // rientra e riesce dalla nebbia: niente raffica
const SOUND_STORAGE_KEY = 'venander_npc_sounds_on';

// ------------------------------------------
// Muto / attivo (per browser, non condiviso)
// ------------------------------------------
let soundsOn = true;
try {
    soundsOn = localStorage.getItem(SOUND_STORAGE_KEY) !== '0';
} catch (e) { /* storage bloccato: restano attivi */ }

function syncSoundButtons() {
    document.querySelectorAll('.sound-toggle-btn').forEach(btn => {
        btn.querySelector('.master-tool-icon').textContent = soundsOn ? '🔊' : '🔇';
        btn.classList.toggle('master-tool-active', soundsOn);
    });
}

document.querySelectorAll('.sound-toggle-btn').forEach(btn => btn.addEventListener('click', () => {
    soundsOn = !soundsOn;
    try { localStorage.setItem(SOUND_STORAGE_KEY, soundsOn ? '1' : '0'); } catch (e) { /* niente */ }
    syncSoundButtons();
    statusBar.innerText = soundsOn ? '🔊 Suoni degli NPC attivi.' : '🔇 Suoni degli NPC in muto.';
}));
syncSoundButtons();

function playSound(url) {
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = 0.8;
    // Il browser blocca l'audio finché non si è cliccato sulla pagina almeno una volta
    audio.play().catch(() => {});
}

// ------------------------------------------
// Chi "compare": stessa regola con cui i giocatori vedono le pedine
// (non nascosto né invisibile, esagono scoperto dalla nebbia, linea di vista)
// ------------------------------------------
function npcSeenByPlayers(npc) {
    if (npc.role !== 'npc' || npc.is_hidden || npc.is_invisible) return false;
    if (window.fowEnabled && !window.revealedHexes.has(`${npc.x},${npc.y}`)) return false;
    if (!hasAnySightBlocker()) return true;
    return characters.some(char =>
        char.role === 'player' && !char.is_hidden && hasLineOfSight(char.x, char.y, npc.x, npc.y)
    );
}

(() => {
    let known = null;                 // id -> visto adesso (null finché non arriva la mappa)
    const lastPlayed = {};

    function check() {
        if (typeof characters === 'undefined' || !Array.isArray(characters)) return;
        const npcs = characters.filter(c => c.role === 'npc');

        // Primo giro: chi è già in mappa non suona
        if (known === null) {
            if (!npcs.length && !characters.length) return;
            known = new Map(npcs.map(npc => [npc.id, npcSeenByPlayers(npc)]));
            return;
        }

        const now = Date.now();
        const next = new Map();
        npcs.forEach(npc => {
            const seen = npcSeenByPlayers(npc);
            next.set(npc.id, seen);
            const before = known.get(npc.id) ?? false;   // appena spawnato = prima non c'era
            if (!seen || before) return;

            const sound = npc.spawn_sound;
            if (!sound?.url || !soundsOn) return;
            if (sound.scope === 'master' && !isMaster) return;
            if (now - (lastPlayed[npc.id] || 0) < SOUND_REPEAT_COOLDOWN_MS) return;
            lastPlayed[npc.id] = now;
            playSound(sound.url);
        });
        known = next;
    }

    setInterval(check, 300);
})();

// ------------------------------------------
// Master: suono del modello NPC (registra, carica, ascolta, togli)
// ------------------------------------------
(() => {
    const box = document.getElementById('npc-template-sound');
    const select = document.getElementById('npc-template-select');
    if (!box || !select) return;

    let recorder = null;
    let stopTimer = null;

    function selectedTemplate() {
        return (typeof npcTemplates !== 'undefined' ? npcTemplates : [])
            .find(t => String(t.id) === select.value) || null;
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // Invio con risposta del server: se non risponde (server avviato prima di questa
    // funzione, o caduto) il Master lo sa subito invece di non vedere nulla
    function emitSound(payload, okMessage) {
        const head = box.querySelector('.npc-sound-head');
        if (head && payload.data_url) head.textContent = '⏳ Salvataggio del suono…';
        socket.timeout(15000).emit('set_template_sound', payload, (timeoutError, reply) => {
            if (timeoutError) {
                alert('Il server non ha risposto e il suono NON è stato salvato.\n' +
                      'Probabilmente il server va riavviato per avere questa funzione: ' +
                      'Ctrl+C nel suo terminale e di nuovo "python app.py".');
                render();
                return;
            }
            if (reply?.error) {
                alert(`Suono non salvato: ${reply.error}`);
                render();
                return;
            }
            if (okMessage) statusBar.innerText = okMessage;
        });
    }

    async function sendSound(template, blob) {
        if (blob.size > SOUND_MAX_BYTES) {
            alert(`Il suono è troppo grande (${Math.round(blob.size / 1000)} KB): massimo ${SOUND_MAX_BYTES / 1000} KB.`);
            return;
        }
        const dataUrl = await blobToDataUrl(blob);
        emitSound({
            template_id: template.id,
            data_url: dataUrl,
            scope: box.querySelector('.npc-sound-scope')?.value || 'all',
            apply_to_spawned: !!box.querySelector('.npc-sound-apply')?.checked
        }, `🔊 Suono di "${template.name}" salvato.`);
    }

    async function startRecording(template, button) {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            alert('Questo browser non può registrare qui. Serve aprire il gioco da localhost (o https); in alternativa carica un file.');
            return;
        }
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            alert('Microfono non disponibile o permesso negato.');
            return;
        }

        const chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = () => {
            clearTimeout(stopTimer);
            stream.getTracks().forEach(track => track.stop());
            recorder = null;
            const blob = new Blob(chunks, { type: (chunks[0]?.type || 'audio/webm').split(';')[0] });
            render();
            if (!blob.size) return;
            // Prima di salvarlo il Master lo riascolta
            const url = URL.createObjectURL(blob);
            playSound(url);
            setTimeout(() => {
                if (confirm('Salvare questa registrazione come suono del modello?')) sendSound(template, blob);
                URL.revokeObjectURL(url);
            }, 300);
        };
        recorder.start();
        button.textContent = `⏹ Stop (max ${SOUND_MAX_SECONDS}s)`;
        button.classList.add('recording');
        stopTimer = setTimeout(() => recorder?.state === 'recording' && recorder.stop(), SOUND_MAX_SECONDS * 1000);
    }

    function render() {
        box.innerHTML = '';
        const template = selectedTemplate();
        if (!template || !isMaster) {
            box.style.display = 'none';
            return;
        }
        box.style.display = 'block';
        const sound = template.sound;

        const head = document.createElement('div');
        head.className = 'npc-sound-head';
        head.textContent = sound ? '🔊 Suono di comparsa: registrato' : '🔈 Nessun suono di comparsa';
        box.appendChild(head);

        const row = document.createElement('div');
        row.className = 'npc-sound-row';

        const record = document.createElement('button');
        record.type = 'button';
        record.textContent = '🎙️ Registra';
        record.title = `Registra dal microfono (massimo ${SOUND_MAX_SECONDS} secondi)`;
        record.addEventListener('click', () => {
            if (recorder?.state === 'recording') recorder.stop();
            else startRecording(template, record);
        });

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'audio/*';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (file) sendSound(template, file);
            fileInput.value = '';
        });
        const upload = document.createElement('button');
        upload.type = 'button';
        upload.textContent = '📁 Carica';
        upload.title = 'Carica un file audio (mp3, ogg, wav, webm, m4a, max 1 MB)';
        upload.addEventListener('click', () => fileInput.click());

        row.append(record, upload, fileInput);

        if (sound) {
            const listen = document.createElement('button');
            listen.type = 'button';
            listen.textContent = '▶';
            listen.title = 'Ascolta';
            listen.addEventListener('click', () => playSound(sound.url));

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '🗑️';
            remove.title = 'Togli il suono dal modello';
            remove.addEventListener('click', () => {
                if (confirm(`Togliere il suono dal modello "${template.name}"?`)) {
                    emitSound({ template_id: template.id, remove: true }, `🔈 Suono di "${template.name}" tolto.`);
                }
            });
            row.append(listen, remove);
        }
        box.appendChild(row);

        const scope = document.createElement('select');
        scope.className = 'npc-sound-scope';
        scope.add(new Option('👥 Lo sentono tutti', 'all'));
        scope.add(new Option('🎩 Solo il Master', 'master'));
        scope.value = sound?.scope || 'all';
        scope.addEventListener('change', () => {
            if (sound) emitSound({ template_id: template.id, scope: scope.value });
        });
        box.appendChild(scope);

        const apply = document.createElement('label');
        apply.className = 'npc-sound-apply-row';
        apply.innerHTML = '<input type="checkbox" class="npc-sound-apply"> vale anche per gli NPC già in mappa';
        box.appendChild(apply);
    }

    select.addEventListener('change', render);
    socket.on('npc_template_list', () => setTimeout(render, 0));
    render();
})();
