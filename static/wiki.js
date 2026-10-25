// ==========================================
// WIKI DEL MONDO
// Il Master scrive le pagine, i giocatori le consultano.
// Le pagine segrete arrivano solo al Master (filtrate dal server).
// ==========================================

let wikiPages = [];
let wikiCurrentPageId = null;
let wikiEditingPageId = null;
// Dopo il salvataggio apre la pagina appena arrivata dal server
let wikiPendingSelectTitle = null;

const WIKI_DEFAULT_CATEGORY = 'Generale';
const WIKI_IMAGE_MAX_SIDE = 1200;

const wikiModal = document.getElementById('wiki-modal');
const wikiView = document.getElementById('wiki-view');
const wikiEditor = document.getElementById('wiki-editor');
const wikiPageList = document.getElementById('wiki-page-list');
const wikiSearch = document.getElementById('wiki-search');

// ==========================================
// UTILITÀ
// ==========================================

function escapeWikiHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isWikiOpen() {
    return wikiModal?.classList.contains('open');
}

function getWikiPage(id) {
    return wikiPages.find(page => page.id === id) || null;
}

function findWikiPageByTitle(title) {
    const wanted = String(title).trim().toLowerCase();
    return wikiPages.find(page => page.title.trim().toLowerCase() === wanted) || null;
}

// 📨 handout ricevuto (giocatore) o consegnato (Master), 🔒 segreta
function getWikiPageMarker(page) {
    if (page.handout) return '📨 ';
    if (!page.hidden) return '';
    return page.shared_with?.length ? '📨 ' : '🔒 ';
}

function getWikiCategories() {
    return [...new Set(wikiPages.map(page => page.category || WIKI_DEFAULT_CATEGORY))]
        .sort((a, b) => a.localeCompare(b, 'it'));
}

// ==========================================
// FORMATTAZIONE
// Il testo viene prima reso sicuro (escape), poi si applicano poche regole:
// # titoli, **grassetto**, *corsivo*, - elenchi e [[collegamenti]].
// ==========================================

function renderWikiInline(text) {
    return escapeWikiHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[\[(.+?)\]\]/g, (match, escapedTitle) => {
            const exists = wikiPages.some(
                page => escapeWikiHtml(page.title).trim().toLowerCase() === escapedTitle.trim().toLowerCase()
            );

            if (exists) {
                return `<a class="wiki-link" data-wiki-title="${escapedTitle}">${escapedTitle}</a>`;
            }

            // Il Master può creare la pagina mancante con un clic
            return isMaster
                ? `<a class="wiki-link wiki-link-missing" data-wiki-title="${escapedTitle}" title="Pagina inesistente: clicca per crearla">${escapedTitle}</a>`
                : `<span class="wiki-link-missing">${escapedTitle}</span>`;
        });
}

function renderWikiContent(content) {
    let html = '';
    let paragraph = [];
    let inList = false;

    const flushParagraph = () => {
        if (!paragraph.length) return;
        html += `<p>${paragraph.map(renderWikiInline).join('<br>')}</p>`;
        paragraph = [];
    };

    const closeList = () => {
        if (!inList) return;
        html += '</ul>';
        inList = false;
    };

    String(content || '').split('\n').forEach(rawLine => {
        const line = rawLine.trimEnd();
        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        const listItem = line.match(/^\s*[-*]\s+(.*)$/);

        if (heading) {
            flushParagraph();
            closeList();
            // h1 è il titolo della pagina: i titoli interni partono da h2
            const level = heading[1].length + 1;
            html += `<h${level}>${renderWikiInline(heading[2])}</h${level}>`;
        } else if (listItem) {
            flushParagraph();
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += `<li>${renderWikiInline(listItem[1])}</li>`;
        } else if (!line.trim()) {
            flushParagraph();
            closeList();
        } else {
            closeList();
            paragraph.push(line);
        }
    });

    flushParagraph();
    closeList();

    return html || '<p class="wiki-muted">Questa pagina è ancora vuota.</p>';
}

// ==========================================
// ELENCO PAGINE
// ==========================================

function renderWikiPageList() {
    if (!wikiPageList) return;

    const search = wikiSearch?.value.trim().toLowerCase() || '';

    const filtered = wikiPages.filter(page =>
        !search ||
        `${page.title} ${page.category} ${page.content}`.toLowerCase().includes(search)
    );

    wikiPageList.innerHTML = '';

    const homeButton = document.createElement('button');
    homeButton.type = 'button';
    homeButton.className = 'wiki-page-item wiki-home-item';
    homeButton.classList.toggle('active', wikiCurrentPageId === null && !wikiEditor.classList.contains('open'));
    homeButton.textContent = '🏠 Indice';
    homeButton.addEventListener('click', () => showWikiPage(null));
    wikiPageList.appendChild(homeButton);

    if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'wiki-muted wiki-list-empty';
        empty.textContent = search ? 'Nessun risultato.' : 'Ancora nessuna pagina.';
        wikiPageList.appendChild(empty);
        return;
    }

    getWikiCategories().forEach(category => {
        const pages = filtered
            .filter(page => (page.category || WIKI_DEFAULT_CATEGORY) === category)
            .sort((a, b) => a.title.localeCompare(b.title, 'it'));

        if (!pages.length) return;

        const header = document.createElement('div');
        header.className = 'wiki-list-category';
        header.textContent = `${category} (${pages.length})`;
        wikiPageList.appendChild(header);

        pages.forEach(page => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'wiki-page-item';
            item.classList.toggle('active', page.id === wikiCurrentPageId);
            item.classList.toggle('secret', !!page.hidden);
            item.textContent = `${getWikiPageMarker(page)}${page.title}`;
            item.addEventListener('click', () => showWikiPage(page.id));
            wikiPageList.appendChild(item);
        });
    });
}

// ==========================================
// LETTURA
// ==========================================

function renderWikiHome() {
    const categories = getWikiCategories();
    const visibleCount = wikiPages.filter(page => !page.hidden).length;

    let html = '<h1>📖 Il mondo di Venander</h1>';

    if (!wikiPages.length) {
        html += isMaster
            ? '<p class="wiki-muted">Il wiki è vuoto. Crea la prima pagina con <b>＋ Nuova pagina</b>.</p>'
            : '<p class="wiki-muted">Il Master non ha ancora scritto nulla. Torna più tardi!</p>';
        wikiView.innerHTML = html;
        return;
    }

    html += `<p class="wiki-muted">${visibleCount} pagine consultabili${isMaster ? ` · ${wikiPages.length - visibleCount} segrete` : ''}.</p>`;
    html += '<div class="wiki-category-grid">';

    categories.forEach(category => {
        const pages = wikiPages
            .filter(page => (page.category || WIKI_DEFAULT_CATEGORY) === category)
            .sort((a, b) => a.title.localeCompare(b.title, 'it'));

        html += `<section class="wiki-category-card"><h3>${escapeWikiHtml(category)}</h3><ul>`;
        pages.forEach(page => {
            html += `<li><a class="wiki-link" data-wiki-id="${page.id}">${getWikiPageMarker(page)}${escapeWikiHtml(page.title)}</a></li>`;
        });
        html += '</ul></section>';
    });

    html += '</div>';
    wikiView.innerHTML = html;
}

function renderWikiPage(page) {
    const backlinks = wikiPages.filter(other =>
        other.id !== page.id &&
        other.content.toLowerCase().includes(`[[${page.title.toLowerCase()}]]`)
    );

    let html = `<div class="wiki-page-category">${escapeWikiHtml(page.category || WIKI_DEFAULT_CATEGORY)}</div>`;
    html += `<h1>${escapeWikiHtml(page.title)}</h1>`;

    if (isMaster) {
        const sharedNames = (page.shared_with || [])
            .map(id => characters.find(c => c.id === id)?.name)
            .filter(Boolean);

        html += `
            <div class="wiki-page-actions">
                ${page.hidden ? `<span class="wiki-secret-badge">🔒 Segreta${sharedNames.length ? `, consegnata a ${escapeWikiHtml(sharedNames.join(', '))}` : ': la vede solo il Master'}</span>` : ''}
                <button class="wiki-btn" type="button" data-wiki-action="edit">✏️ Modifica</button>
                <button class="wiki-btn" type="button" data-wiki-action="share">📨 Consegna a…</button>
                <button class="wiki-btn" type="button" data-wiki-action="toggle-hidden">${page.hidden ? '👁️ Rivela ai giocatori' : '🔒 Nascondi'}</button>
                <button class="wiki-btn wiki-btn-danger" type="button" data-wiki-action="delete">🗑️ Elimina</button>
            </div>
            <div id="wiki-share-panel" class="wiki-share-panel"></div>`;
    } else if (page.handout) {
        html += '<div class="wiki-page-actions"><span class="wiki-handout-badge">📨 Il Master ha consegnato questa pagina a te</span></div>';
    }

    if (page.image) {
        html += `<img class="wiki-page-image" src="${escapeWikiHtml(page.image)}" alt="">`;
    }

    html += `<div class="wiki-content">${renderWikiContent(page.content)}</div>`;

    if (backlinks.length) {
        html += '<div class="wiki-backlinks"><b>Citata in:</b> ';
        html += backlinks
            .map(other => `<a class="wiki-link" data-wiki-id="${other.id}">${escapeWikiHtml(other.title)}</a>`)
            .join(', ');
        html += '</div>';
    }

    wikiView.innerHTML = html;
}

function renderWiki() {
    if (!wikiModal) return;

    wikiModal.classList.toggle('wiki-is-master', !!isMaster);

    const page = getWikiPage(wikiCurrentPageId);
    if (!page) wikiCurrentPageId = null;

    if (page) {
        renderWikiPage(page);
    } else {
        renderWikiHome();
    }

    renderWikiPageList();
}

// Chiede conferma prima di perdere una pagina in modifica
function confirmDiscardWikiEdit() {
    return !wikiEditor.classList.contains('open') || confirm('Uscire senza salvare le modifiche?');
}

function showWikiPage(pageId) {
    if (!confirmDiscardWikiEdit()) return;
    closeWikiEditor();
    wikiCurrentPageId = pageId;
    renderWiki();
    wikiView.scrollTop = 0;
}

function openWiki() {
    if (!wikiModal) return;
    wikiModal.classList.add('open');
    document.querySelectorAll('.wiki-open-btn').forEach(btn => btn.classList.remove('wiki-has-news'));
    renderWiki();
    wikiSearch?.focus();
}

function closeWiki() {
    if (!confirmDiscardWikiEdit()) return;
    closeWikiEditor();
    wikiModal?.classList.remove('open');
}

// Clic su collegamenti e pulsanti della pagina
wikiView?.addEventListener('click', (event) => {
    const link = event.target.closest('.wiki-link');

    if (link) {
        if (link.dataset.wikiId) {
            showWikiPage(Number(link.dataset.wikiId));
            return;
        }

        const target = findWikiPageByTitle(link.dataset.wikiTitle);
        if (target) {
            showWikiPage(target.id);
        } else if (isMaster) {
            openWikiEditor(null, { title: link.dataset.wikiTitle });
        }
        return;
    }

    const page = getWikiPage(wikiCurrentPageId);
    const action = event.target.closest('[data-wiki-action]')?.dataset.wikiAction;
    if (!page || !action || !isMaster) return;

    if (action === 'edit') {
        openWikiEditor(page);
    } else if (action === 'share') {
        toggleWikiSharePanel(page);
    } else if (action === 'send-share') {
        const chosen = [...document.querySelectorAll('#wiki-share-panel input[type="checkbox"]:checked:not(:disabled)')]
            .map(input => Number(input.value));
        if (!chosen.length) {
            alert('Scegli almeno un giocatore.');
            return;
        }
        socket.emit('wiki_share_page', { id: page.id, char_ids: chosen });
    } else if (action === 'toggle-hidden') {
        socket.emit('wiki_save_page', { ...page, hidden: !page.hidden });
    } else if (action === 'delete' && confirm(`Eliminare definitivamente "${page.title}"?`)) {
        socket.emit('wiki_delete_page', { id: page.id });
    }
});

// ==========================================
// HANDOUT
// Il Master consegna una pagina (anche segreta) a giocatori scelti:
// a loro appare come popup e resta nel loro wiki.
// ==========================================

function toggleWikiSharePanel(page) {
    const panel = document.getElementById('wiki-share-panel');
    if (!panel) return;

    if (panel.classList.toggle('open') === false) return;

    const players = characters.filter(c => c.role === 'player');
    const alreadyShared = new Set(page.shared_with || []);

    let html = '<div class="wiki-share-title">Consegna questa pagina a:</div>';

    if (!players.length) {
        html += '<div class="wiki-muted">Nessun personaggio giocante.</div>';
    } else {
        players.forEach(player => {
            const shared = alreadyShared.has(player.id) || !page.hidden;
            html += `
                <label class="wiki-share-option">
                    <input type="checkbox" value="${player.id}" ${shared ? 'checked disabled' : ''}>
                    ${escapeWikiHtml(player.name)}${shared ? ' <span class="wiki-muted">(la vede già)</span>' : ''}
                </label>`;
        });
        html += '<button class="wiki-btn wiki-btn-primary" type="button" data-wiki-action="send-share">📨 Consegna e mostra</button>';
    }

    panel.innerHTML = html;
}

socket.on('wiki_handout', (data) => {
    openWiki();
    showWikiPage(data.id);
    if (typeof statusBar !== 'undefined') statusBar.innerText = '📨 Il Master ti ha consegnato una pagina del wiki.';
});

// ==========================================
// MODIFICA (SOLO MASTER)
// ==========================================

const wikiEditFields = {
    title: document.getElementById('wiki-edit-title'),
    category: document.getElementById('wiki-edit-category'),
    hidden: document.getElementById('wiki-edit-hidden'),
    imageUrl: document.getElementById('wiki-edit-image-url'),
    imageFile: document.getElementById('wiki-edit-image-file'),
    imagePreview: document.getElementById('wiki-edit-image-preview'),
    content: document.getElementById('wiki-edit-content')
};

// Immagine caricata dal PC (data URI), separata dal campo URL
let wikiEditImageData = null;

function updateWikiImagePreview() {
    const src = wikiEditImageData || wikiEditFields.imageUrl.value.trim();
    wikiEditFields.imagePreview.src = src || '';
    wikiEditFields.imagePreview.classList.toggle('visible', !!src);
}

function openWikiEditor(page, preset = {}) {
    if (!isMaster) return;

    wikiEditingPageId = page?.id ?? null;
    wikiEditImageData = page?.image?.startsWith('data:') ? page.image : null;

    wikiEditFields.title.value = page?.title ?? preset.title ?? '';
    wikiEditFields.category.value = page?.category ?? getWikiPage(wikiCurrentPageId)?.category ?? '';
    // Le nuove pagine nascono segrete: il Master decide quando rivelarle
    wikiEditFields.hidden.checked = page ? !!page.hidden : true;
    wikiEditFields.imageUrl.value = page?.image && !wikiEditImageData ? page.image : '';
    wikiEditFields.imageFile.value = '';
    wikiEditFields.content.value = page?.content ?? '';

    const datalist = document.getElementById('wiki-category-options');
    datalist.innerHTML = '';
    getWikiCategories().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        datalist.appendChild(option);
    });

    updateWikiImagePreview();
    wikiEditor.classList.add('open');
    wikiView.classList.add('hidden');
    renderWikiPageList();
    wikiEditFields.title.focus();
}

function closeWikiEditor() {
    wikiEditor?.classList.remove('open');
    wikiView?.classList.remove('hidden');
    wikiEditingPageId = null;
}

// Le foto grandi vengono ridotte per non appesantire il database
function readWikiImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const scale = Math.min(1, WIKI_IMAGE_MAX_SIDE / Math.max(img.width, img.height));
                if (scale === 1 && file.size < 400_000) {
                    resolve(reader.result);
                    return;
                }
                const canvasEl = document.createElement('canvas');
                canvasEl.width = Math.round(img.width * scale);
                canvasEl.height = Math.round(img.height * scale);
                canvasEl.getContext('2d').drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
                resolve(canvasEl.toDataURL('image/jpeg', 0.85));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

wikiEditFields.imageFile?.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
        wikiEditImageData = await readWikiImage(file);
        wikiEditFields.imageUrl.value = '';
        updateWikiImagePreview();
    } catch {
        alert("Impossibile leggere l'immagine.");
    }
});

wikiEditFields.imageUrl?.addEventListener('input', () => {
    wikiEditImageData = null;
    updateWikiImagePreview();
});

document.getElementById('wiki-edit-image-clear')?.addEventListener('click', () => {
    wikiEditImageData = null;
    wikiEditFields.imageUrl.value = '';
    wikiEditFields.imageFile.value = '';
    updateWikiImagePreview();
});

wikiEditor?.addEventListener('submit', (event) => {
    event.preventDefault();

    const title = wikiEditFields.title.value.trim();
    if (!title) return;

    const duplicate = findWikiPageByTitle(title);
    if (duplicate && duplicate.id !== wikiEditingPageId) {
        alert(`Esiste già una pagina "${duplicate.title}".`);
        return;
    }

    wikiPendingSelectTitle = title;

    socket.emit('wiki_save_page', {
        id: wikiEditingPageId,
        title,
        category: wikiEditFields.category.value.trim() || WIKI_DEFAULT_CATEGORY,
        hidden: wikiEditFields.hidden.checked,
        image: wikiEditImageData || wikiEditFields.imageUrl.value.trim() || null,
        content: wikiEditFields.content.value
    });

    closeWikiEditor();
});

document.getElementById('wiki-edit-cancel')?.addEventListener('click', () => {
    closeWikiEditor();
    renderWiki();
});

document.getElementById('wiki-new-btn')?.addEventListener('click', () => openWikiEditor(null));

// ==========================================
// APERTURA / CHIUSURA
// ==========================================

document.querySelectorAll('.wiki-open-btn').forEach(btn => btn.addEventListener('click', openWiki));
document.getElementById('wiki-close-btn')?.addEventListener('click', closeWiki);
wikiSearch?.addEventListener('input', renderWikiPageList);

wikiModal?.addEventListener('click', (event) => {
    if (event.target === wikiModal) closeWiki();
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isWikiOpen()) closeWiki();
});

// ==========================================
// SOCKET
// ==========================================

socket.on('wiki_list', (pages) => {
    wikiPages = Array.isArray(pages) ? pages : [];
    if (isWikiOpen()) renderWiki();
});

socket.on('wiki_page_saved', (page) => {
    const index = wikiPages.findIndex(existing => existing.id === page.id);
    if (index === -1) {
        wikiPages.push(page);
    } else {
        wikiPages[index] = page;
    }

    if (wikiPendingSelectTitle && page.title === wikiPendingSelectTitle) {
        wikiPendingSelectTitle = null;
        wikiCurrentPageId = page.id;
    }

    if (isWikiOpen()) {
        // Non interrompe il Master mentre sta scrivendo
        if (wikiEditor.classList.contains('open')) {
            renderWikiPageList();
        } else {
            renderWiki();
        }
    } else if (!isMaster) {
        // Segnala ai giocatori che c'è qualcosa di nuovo da leggere
        document.querySelectorAll('.wiki-open-btn').forEach(btn => btn.classList.add('wiki-has-news'));
    }
});

socket.on('wiki_page_removed', (data) => {
    wikiPages = wikiPages.filter(page => page.id !== data.id);
    if (wikiCurrentPageId === data.id) wikiCurrentPageId = null;
    if (isWikiOpen() && !wikiEditor.classList.contains('open')) renderWiki();
});
