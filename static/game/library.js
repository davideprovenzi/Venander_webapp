// Strumenti del Master: libreria pedine NPC, scene, modelli NPC.
// Fa parte del client (static/game/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// NPC TOKEN LIBRARY
// ==========================================

window.npcTokenLibrary = [];
window.currentNpcTokenBase64 = "";

socket.on(
    'npc_token_library',
    (tokens) => {

        window.npcTokenLibrary =
            tokens || [];

        const select =
            document.getElementById(
                'npc-token-select'
            );

        if (!select) {
            return;
        }

        const oldValue =
            select.value;

        select.innerHTML = `
            <option value="">
                -- Nessuna pedina --
            </option>
        `;

        window.npcTokenLibrary
            .forEach(
                token => {

                    const option =
                        document.createElement(
                            'option'
                        );

                    option.value =
                        token.id;

                    option.textContent =
                        token.name;

                    select.appendChild(
                        option
                    );
                }
            );

        if (
            [
                ...select.options
            ].some(
                o =>
                    o.value ===
                    oldValue
            )
        ) {

            select.value =
                oldValue;
        }
    }
);

document.getElementById(
    'npc-token-file'
)?.addEventListener(
    'change',
    function(e) {

        const file =
            e.target.files[0];

        if (!file) {
            return;
        }

        if (
            file.type !==
            "image/png"
        ) {

            alert(
                "La pedina deve essere PNG."
            );

            return;
        }

        if (file.size > TOKEN_MAX_BYTES) {
            alert(`La pedina è troppo grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Massimo 5 MB.`);
            e.target.value = '';
            return;
        }

        const reader =
            new FileReader();

        reader.onload =
            function(event) {

                window.currentNpcTokenBase64 =
                    event.target.result;

                const preview =
                    document.getElementById(
                        'npc-token-preview'
                    );

                if (preview) {

                    preview.src =
                        window.currentNpcTokenBase64;

                    preview.style.display =
                        'inline-block';
                }
            };

        reader.readAsDataURL(
            file
        );
    }
);

document.getElementById(
    'npc-token-select'
)?.addEventListener(
    'change',
    function() {

        const tokenId =
            parseInt(
                this.value
            );

        const token =
            window.npcTokenLibrary.find(
                t =>
                    t.id ===
                    tokenId
            );

        if (!token) {

            window.currentNpcTokenBase64 =
                "";

            return;
        }

        window.currentNpcTokenBase64 =
            token.image_data;

        const preview =
            document.getElementById(
                'npc-token-preview'
            );

        if (preview) {

            preview.src =
                token.image_data;

            preview.style.display =
                'inline-block';
        }

        const npcName =
            document.getElementById(
                'npc-name'
            );

        if (npcName) {

            npcName.value =
                token.name;
        }
    }
);

document.getElementById(
    'save-npc-token-btn'
)?.addEventListener(
    'click',
    () => {

        if (
            !window.currentNpcTokenBase64
        ) {

            alert(
                "Carica prima una pedina."
            );

            return;
        }

        const npcNameInput =
            document.getElementById(
                'npc-name'
            );

        const name =
            npcNameInput
                ?.value
                .trim();

        if (!name) {

            alert(
                "Inserisci prima il nome del nemico."
            );

            return;
        }

        socket.emit(
            'save_npc_token',
            {
                name:
                    name,

                image_data:
                    window.currentNpcTokenBase64
            }
        );
    }
);

// Effetti e nomi cambiano con gli aggiornamenti dei personaggi: registrato
// in fondo al file così gira dopo il listener che aggiorna "characters".
socket.on('update_character', () => renderTurnOrderList());

// ==========================================
// SCENE (SOLO MASTER)
// Mappa, disegni e nebbia salvati con un nome. Cambiando scena
// il server salva prima quella aperta.
// ==========================================

let sceneState = { active_id: null, scenes: [] };

function renderSceneList() {
    const list = document.getElementById('scene-list');
    if (!list) return;

    list.innerHTML = '';

    if (!sceneState.scenes.length) {
        const empty = document.createElement('div');
        empty.className = 'scene-empty';
        empty.textContent = 'Nessuna scena salvata.';
        list.appendChild(empty);
        return;
    }

    sceneState.scenes.forEach(scene => {
        const isActive = scene.id === sceneState.active_id;

        const row = document.createElement('div');
        row.className = 'scene-row';
        row.classList.toggle('active', isActive);

        const name = document.createElement('button');
        name.type = 'button';
        name.className = 'scene-name';
        name.textContent = isActive ? `● ${scene.name}` : scene.name;
        name.title = isActive ? 'Scena aperta' : 'Apri questa scena';
        name.addEventListener('click', () => {
            if (isActive) return;
            if (confirm(`Aprire la scena "${scene.name}"?\nQuella attuale viene salvata in automatico.`)) {
                socket.emit('scene_load', { id: scene.id });
            }
        });

        const rename = document.createElement('button');
        rename.type = 'button';
        rename.className = 'scene-icon-btn';
        rename.textContent = '✏️';
        rename.title = 'Rinomina';
        rename.addEventListener('click', () => {
            const newName = prompt('Nuovo nome della scena:', scene.name);
            if (newName && newName.trim()) socket.emit('scene_rename', { id: scene.id, name: newName.trim() });
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'scene-icon-btn';
        remove.textContent = '🗑️';
        remove.title = 'Elimina scena';
        remove.addEventListener('click', () => {
            if (confirm(`Eliminare la scena "${scene.name}"? La mappa attuale non cambia.`)) {
                socket.emit('scene_delete', { id: scene.id });
            }
        });

        row.append(name, rename, remove);
        list.appendChild(row);
    });
}

function createScene(empty) {
    const input = document.getElementById('scene-name-input');
    const name = input?.value.trim();

    if (!name) {
        alert('Scrivi prima un nome per la scena.');
        input?.focus();
        return;
    }

    if (sceneState.scenes.some(scene => scene.name.toLowerCase() === name.toLowerCase())) {
        alert(`Esiste già una scena "${name}".`);
        return;
    }

    socket.emit('scene_create', { name, empty });
    input.value = '';
}

document.getElementById('scene-save-current-btn')?.addEventListener('click', () => createScene(false));
document.getElementById('scene-new-empty-btn')?.addEventListener('click', () => createScene(true));

socket.on('scene_list', (data) => {
    sceneState = {
        active_id: data?.active_id ?? null,
        scenes: Array.isArray(data?.scenes) ? data.scenes : []
    };
    renderSceneList();
});

// ==========================================
// MODELLI NPC (SOLO MASTER)
// Un NPC salvato come modello conserva statistiche, equipaggiamento,
// armi, abilità ed effetti. Scegliendolo nello spawn si compilano
// nome, HP, colore, descrizione e pedina (modificabili).
// ==========================================

let npcTemplates = [];

// Cartelle e preferiti: ⭐ in cima, poi le cartelle in ordine alfabetico, "Senza cartella" in fondo
const NO_FOLDER_LABEL = '📂 Senza cartella';

function getNpcTemplateFolders() {
    return [...new Set(npcTemplates.map(t => t.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'it'));
}

function renderNpcTemplateSelect() {
    const select = document.getElementById('npc-template-select');
    if (!select) return;

    const previous = select.value;
    const query = (document.getElementById('npc-template-search')?.value || '').trim().toLowerCase();
    const matches = t => !query || t.name.toLowerCase().includes(query) || (t.category || '').toLowerCase().includes(query);
    const visible = npcTemplates.filter(t => matches(t) || String(t.id) === previous);
    const byName = (a, b) => a.name.localeCompare(b.name, 'it');

    select.innerHTML = '<option value="">-- Nessun modello --</option>';
    const treeGroups = [];
    const addGroup = (label, templates, showFolder) => {
        if (!templates.length) return;
        treeGroups.push({ label, templates: [...templates].sort(byName), showFolder });
        const group = document.createElement('optgroup');
        group.label = label;
        templates.sort(byName).forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = showFolder && template.category ? `${template.name} · ${template.category}` : template.name;
            group.appendChild(option);
        });
        select.appendChild(group);
    };

    addGroup('⭐ Preferiti', visible.filter(t => t.favorite), true);
    getNpcTemplateFolders().forEach(folder => {
        addGroup(`📁 ${folder}`, visible.filter(t => !t.favorite && t.category === folder), false);
    });
    addGroup(NO_FOLDER_LABEL, visible.filter(t => !t.favorite && !t.category), false);

    // Suggerimenti delle cartelle esistenti
    const datalist = document.getElementById('npc-template-folders');
    if (datalist) {
        datalist.innerHTML = '';
        getNpcTemplateFolders().forEach(folder => datalist.appendChild(new Option(folder, folder)));
    }

    if (npcTemplates.some(t => String(t.id) === previous)) select.value = previous;
    renderNpcTemplateTree(treeGroups, !!query);
    updateNpcTemplateInfo();
}

// ------------------------------------------
// Elenco a cartelle: ogni cartella si apre e si chiude (ricordato in questo browser)
// ------------------------------------------
const NPC_FOLDERS_STORAGE_KEY = 'venander_npc_template_folders_closed';
let npcTemplateGroups = [];

function getClosedNpcFolders() {
    try {
        return new Set(JSON.parse(localStorage.getItem(NPC_FOLDERS_STORAGE_KEY) || '[]'));
    } catch (e) {
        return new Set();
    }
}

function setClosedNpcFolders(closed) {
    try {
        localStorage.setItem(NPC_FOLDERS_STORAGE_KEY, JSON.stringify([...closed]));
    } catch (e) { /* storage bloccato: si ricorda solo fino al ricaricamento */ }
}

function renderNpcTemplateTree(groups, searching) {
    npcTemplateGroups = groups;
    const tree = document.getElementById('npc-template-tree');
    const select = document.getElementById('npc-template-select');
    if (!tree || !select) return;

    const closed = getClosedNpcFolders();
    tree.innerHTML = '';
    if (!groups.length) {
        tree.textContent = npcTemplates.length ? 'Nessun modello trovato.' : 'Nessun modello salvato.';
        return;
    }

    groups.forEach(group => {
        // Cercando si apre tutto quello che corrisponde
        const isOpen = searching || !closed.has(group.label);
        const folder = document.createElement('div');
        folder.className = 'npc-folder';

        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'npc-folder-head';
        head.textContent = `${isOpen ? '▾' : '▸'} ${group.label} (${group.templates.length})`;
        head.title = isOpen ? 'Chiudi la cartella' : 'Apri la cartella';
        head.addEventListener('click', () => {
            const now = getClosedNpcFolders();
            if (now.has(group.label)) now.delete(group.label); else now.add(group.label);
            setClosedNpcFolders(now);
            renderNpcTemplateTree(npcTemplateGroups, searching);
        });
        folder.appendChild(head);

        if (isOpen) {
            group.templates.forEach(template => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'npc-folder-item';
                item.dataset.id = String(template.id);
                item.classList.toggle('active', String(template.id) === select.value);
                item.textContent = (template.favorite ? '⭐ ' : '') + template.name +
                    (group.showFolder && template.category ? ` · ${template.category}` : '');
                item.addEventListener('click', () => {
                    select.value = String(template.id);
                    select.dispatchEvent(new Event('change'));
                });
                folder.appendChild(item);
            });
        }
        tree.appendChild(folder);
    });
}

document.getElementById('npc-template-collapse-all')?.addEventListener('click', () => {
    setClosedNpcFolders(new Set(npcTemplateGroups.map(g => g.label)));
    renderNpcTemplateSelect();
});

document.getElementById('npc-template-expand-all')?.addEventListener('click', () => {
    setClosedNpcFolders(new Set());
    renderNpcTemplateSelect();
});

function selectedNpcTemplate() {
    return npcTemplates.find(t => String(t.id) === document.getElementById('npc-template-select')?.value) || null;
}

function updateNpcTemplateMetaControls() {
    const template = selectedNpcTemplate();
    const fav = document.getElementById('npc-template-fav-btn');
    const row = document.getElementById('npc-template-folder-row');
    const folder = document.getElementById('npc-template-folder');
    if (fav) {
        fav.textContent = template?.favorite ? '⭐' : '☆';
        fav.disabled = !template;
        fav.classList.toggle('active', !!template?.favorite);
    }
    if (row) row.style.display = template ? 'flex' : 'none';
    if (folder && template && document.activeElement !== folder) folder.value = template.category || '';
    const current = document.getElementById('npc-template-current');
    if (current) {
        current.textContent = template ? `${template.favorite ? '⭐ ' : ''}${template.name}` : 'Nessun modello scelto';
        current.classList.toggle('empty', !template);
    }
    // L'elenco a cartelle evidenzia quello scelto
    document.querySelectorAll('#npc-template-tree .npc-folder-item').forEach(item => {
        item.classList.toggle('active', !!template && item.dataset.id === String(template.id));
    });
}

document.getElementById('npc-template-search')?.addEventListener('input', renderNpcTemplateSelect);

// Azioni sui modelli con risposta del server: se non risponde (server avviato
// prima di questa funzione) il Master lo sa subito invece di non vedere nulla
function emitTemplateMeta(event, payload) {
    socket.timeout(10000).emit(event, payload, (timeoutError, reply) => {
        if (timeoutError) {
            alert('Il server non ha risposto: la modifica NON è stata salvata.\n' +
                  'Probabilmente il server va riavviato per avere questa funzione: ' +
                  'Ctrl+C nel suo terminale e di nuovo "python app.py", poi ricarica la pagina.');
            return;
        }
        if (reply?.error) alert(reply.error);
    });
}

document.getElementById('npc-template-fav-btn')?.addEventListener('click', () => {
    const template = selectedNpcTemplate();
    if (template) emitTemplateMeta('set_npc_template_meta', { id: template.id, favorite: !template.favorite });
});

document.getElementById('npc-template-folder-save')?.addEventListener('click', () => {
    const template = selectedNpcTemplate();
    if (!template) return;
    emitTemplateMeta('set_npc_template_meta', { id: template.id, category: document.getElementById('npc-template-folder').value.trim() });
});

document.getElementById('npc-template-folder')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('npc-template-folder-save')?.click();
});

document.getElementById('npc-template-folder-rename')?.addEventListener('click', () => {
    const template = selectedNpcTemplate();
    if (!template?.category) {
        alert('Questo modello non è in una cartella: scrivi un nome e premi 💾 per crearne una.');
        return;
    }
    const count = npcTemplates.filter(t => t.category === template.category).length;
    const name = prompt(`Nuovo nome per la cartella "${template.category}" (${count} modelli). Vuoto = togli la cartella:`, template.category);
    if (name === null) return;
    emitTemplateMeta('rename_npc_template_category', { old: template.category, new: name.trim() });
});

function updateNpcTemplateInfo() {
    const info = document.getElementById('npc-template-info');
    const template = npcTemplates.find(t => String(t.id) === document.getElementById('npc-template-select')?.value);
    updateNpcTemplateMetaControls();
    if (!info) return;

    info.textContent = template
        ? `❤️ ${template.hp_max ?? '?'} HP · 🛡️ ${template.equipped} oggetti equipaggiati · ⚔️ ${template.weapons} armi. Clicca sulla mappa per piazzarlo.`
        : 'Salva un NPC come modello dal pannello "Selezione" per riusarne statistiche, equipaggiamento e armi.';
}

document.getElementById('npc-template-select')?.addEventListener('change', (e) => {
    const template = npcTemplates.find(t => String(t.id) === e.target.value);
    updateNpcTemplateInfo();
    if (!template) return;

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el && value !== undefined && value !== null) el.value = value;
    };

    setValue('npc-name', template.name);
    setValue('npc-hp', template.hp_max);
    setValue('npc-color', template.color);
    setValue('npc-description', template.lore);

    // Pedina del modello (si può sempre sceglierne un'altra)
    window.currentNpcTokenBase64 = template.token_url || '';
    const preview = document.getElementById('npc-token-preview');
    if (preview) {
        preview.src = template.token_url || '';
        preview.style.display = template.token_url ? 'inline-block' : 'none';
    }

    // Pronto a piazzarlo: basta cliccare sulla mappa
    document.getElementById('spawn-npc-btn')?.click();
});

document.getElementById('npc-template-delete-btn')?.addEventListener('click', () => {
    const select = document.getElementById('npc-template-select');
    const template = npcTemplates.find(t => String(t.id) === select?.value);

    if (!template) {
        alert('Scegli prima un modello da eliminare.');
        return;
    }

    if (confirm(`Eliminare il modello "${template.name}"? Gli NPC già in mappa non cambiano.`)) {
        socket.emit('delete_npc_template', { id: template.id });
    }
});

document.getElementById('btn-save-npc-template')?.addEventListener('click', () => {
    const char = characters.find(c => c.id === selectedCharacterId);
    if (!char) return;

    const name = prompt('Nome del modello:', char.name.replace(/\s+\d+$/, ''));
    if (!name || !name.trim()) return;

    const existing = npcTemplates.find(t => t.name.toLowerCase() === name.trim().toLowerCase());
    if (existing && !confirm(`Esiste già il modello "${existing.name}". Sovrascriverlo?`)) return;

    // Cartella: proposta quella che aveva già (o l'ultima usata); vuoto = nessuna
    const folders = getNpcTemplateFolders();
    const suggestion = existing?.category ?? window.lastNpcTemplateFolder ?? '';
    const folder = prompt(
        'Cartella del modello (vuoto = nessuna).' + (folders.length ? `\nCartelle esistenti: ${folders.join(', ')}` : ''),
        suggestion
    );
    if (folder === null) return;
    window.lastNpcTemplateFolder = folder.trim();

    socket.emit('save_npc_template', { char_id: char.id, name: name.trim(), category: folder.trim() });
});

socket.on('npc_template_list', (templates) => {
    npcTemplates = Array.isArray(templates) ? templates : [];
    renderNpcTemplateSelect();
});
