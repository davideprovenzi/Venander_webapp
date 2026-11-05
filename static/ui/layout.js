// Chiusura delle schede, dock del Master e del giocatore, resoconto della sessione, banner del risultato.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// CHIUSURA SICURA E UNIVERSALE DELLE SCHEDE
// ==========================================
document.body.addEventListener('click', (e) => {
    // 1. Chiude la Scheda Giocatore cliccando la X
    if (e.target && e.target.id === 'close-modal') {
        const modal = document.getElementById('sheet-modal');
        if (modal) modal.style.display = 'none';
    }

    // 2. Chiude la Scheda Master cliccando la X
    if (e.target && e.target.id === 'close-edit-modal') {
        const modal = document.getElementById('edit-sheet-modal');
        if (modal) modal.style.display = 'none';
    }

    // 3. Chiude qualsiasi finestra cliccando sullo sfondo scuro (overlay)
    if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
    }
});

socket.on(
    'master_combat_error',
    (data) => {

        console.error(
            '[COMBAT MASTER]',
            data.message
        );

        alert(
            data.message
        );
    }
);

// ==========================================
// MASTER DOCK - REDESIGN COMPATTO
// ==========================================
(() => {
    const masterToolButtons = Array.from(
        document.querySelectorAll('.master-tool-btn[data-master-section]')
    );

    const masterToolSections = Array.from(
        document.querySelectorAll('#master-panel .master-tool-section')
    );

    const closeMasterToolsBtn = document.getElementById('btn-master-close-tools');
    const openSidequestToolBtn = document.getElementById('btn-master-open-sidequest');

    function closeMasterToolSections() {
        masterToolSections.forEach(section => {
            section.classList.remove('master-tool-section-active');
        });

        masterToolButtons.forEach(button => {
            button.classList.remove('master-tool-active');
        });
    }

    function openMasterToolSection(button, section) {
        const wasOpen = section.classList.contains('master-tool-section-active');
        closeMasterToolSections();

        if (wasOpen) return;

        section.classList.add('master-tool-section-active');
        button.classList.add('master-tool-active');

        // La dock sostituisce il primo livello di accordion:
        // quando si apre uno strumento, mostriamo subito il suo contenuto.
        const content = section.querySelector(':scope > .collapsible-content');
        const header = section.querySelector(':scope > .collapsible-header');

        if (content) content.style.display = 'block';

        if (header) {
            const icon = header.querySelector('span');
            if (icon) icon.innerText = '▼';
        }
    }

    masterToolButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (typeof isMaster !== 'undefined' && !isMaster) return;

            const sectionId = button.dataset.masterSection;
            const section = document.getElementById(sectionId);
            if (!section) return;

            openMasterToolSection(button, section);
        });
    });

    closeMasterToolsBtn?.addEventListener('click', () => {
        closeMasterToolSections();
    });

    openSidequestToolBtn?.addEventListener('click', () => {
        if (typeof isMaster !== 'undefined' && !isMaster) return;

        closeMasterToolSections();

        if (dicePanelContent) {
            dicePanelContent.style.display = 'flex';
        }

        if (diceToggleIcon) {
            diceToggleIcon.innerText = '▼';
        }

        if (dicePanelHeader) {
            dicePanelHeader.style.borderRadius = '6px 6px 0 0';
        }

        if (sidequestComposer) {
            sidequestComposer.style.display = 'block';
        }

        if (sidequestComposerBody) {
            sidequestComposerBody.style.display = 'block';
        }

        if (sidequestComposerToggleBtn) {
            sidequestComposerToggleBtn.setAttribute('aria-expanded', 'true');
        }

        if (sidequestComposerToggleIcon) {
            sidequestComposerToggleIcon.innerText = '▼';
        }

        sidequestTitle?.focus();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeMasterToolSections();
        }
    });

    window.closeMasterToolSections = closeMasterToolSections;
})();

// Riduzione completa della dock Master: resta visibile solo la corona.
(() => {
    const panel = document.getElementById('master-panel');
    const toggle = document.getElementById('btn-master-dock-toggle');

    toggle?.addEventListener('click', () => {
        if (!panel) return;

        const collapsed = panel.classList.toggle('master-dock-collapsed');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggle.title = collapsed
            ? 'Espandi strumenti Master'
            : 'Riduci strumenti Master';

        if (collapsed && typeof window.closeMasterToolSections === 'function') {
            window.closeMasterToolSections();
        }
    });
})();

// ==========================================
// DOCK GIOCATORE - STESSO STILE DELLA DOCK MASTER
// ==========================================
(() => {
    const panel = document.getElementById('player-panel');
    const toggle = document.getElementById('btn-player-dock-toggle');
    const buttons = Array.from(
        document.querySelectorAll('.player-tool-btn[data-player-action]')
    );

    const equipPanelEl = document.getElementById('equipped-panel');
    const gadgetPanelEl = document.getElementById('gadget-panel');

    if (!panel) return;

    function isPlayerSession() {
        const value = userSelect?.value;
        return !!value && value !== '0' && value !== 'master';
    }

    function isPanelVisible(el) {
        return !!el && !el.classList.contains('player-dock-hidden') && el.style.display !== 'none';
    }

    // Allinea lo stato "attivo" dei bottoni con i pannelli realmente aperti.
    function syncPlayerDock() {
        const states = {
            equip: isPanelVisible(equipPanelEl),
            gadget: isPanelVisible(gadgetPanelEl),
            notes: isPanelVisible(document.getElementById('notes-panel')),
            chat: dicePanelContent?.style.display !== 'none'
        };

        buttons.forEach(button => {
            const action = button.dataset.playerAction;
            button.classList.toggle('master-tool-active', !!states[action]);
        });
    }

    let wasPlayerMode = null;

    function updatePlayerMode() {
        const playerMode = isPlayerSession();
        document.body.classList.toggle('player-mode', playerMode);

        // Il Master gestisce le doll con la selezione: niente pannelli nascosti dalla dock.
        if (!playerMode) {
            equipPanelEl?.classList.remove('player-dock-hidden');
            gadgetPanelEl?.classList.remove('player-dock-hidden');
        } else if (wasPlayerMode !== true) {
            // Il giocatore parte con armi e gadget chiusi: si aprono dalla dock
            equipPanelEl?.classList.add('player-dock-hidden');
            gadgetPanelEl?.classList.add('player-dock-hidden');
        }

        wasPlayerMode = playerMode;
        syncPlayerDock();
    }

    const actions = {
        sheet: () => document.getElementById('sheet-btn')?.click(),
        equip: () => equipPanelEl?.classList.toggle('player-dock-hidden'),
        gadget: () => gadgetPanelEl?.classList.toggle('player-dock-hidden'),
        notes: () => document.getElementById('btn-toggle-notes')?.click(),
        chat: () => dicePanelHeader?.click(),
        center: () => document.getElementById('center-cam-btn')?.click(),
        rename: () => document.getElementById('rename-btn')?.click()
    };

    buttons.forEach(button => {
        button.addEventListener('click', () => {
            if (!isPlayerSession()) return;

            actions[button.dataset.playerAction]?.();
            syncPlayerDock();
        });
    });

    toggle?.addEventListener('click', () => {
        const collapsed = panel.classList.toggle('player-dock-collapsed');
        toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggle.title = collapsed ? 'Espandi strumenti' : 'Riduci strumenti';
    });

    // Appunti e chat si possono chiudere anche dai loro pannelli.
    document.addEventListener('click', () => requestAnimationFrame(syncPlayerDock));

    userSelect?.addEventListener('change', updatePlayerMode);
    updatePlayerMode();
})();

// ==========================================
// RESOCONTO DELLA SESSIONE
// Esporta la chat (dadi, combattimento, messaggi) vista da questo browser
// dall'apertura della pagina: come file o come pagina segreta del wiki.
// ==========================================
(() => {
    const downloadBtn = document.getElementById('btn-chat-download');
    const wikiBtn = document.getElementById('btn-chat-to-wiki');

    // Una riga per messaggio: "Nome: testo"
    function getChatLogLines() {
        return Array.from(chatLog?.children || [])
            .map(entry => {
                const name = entry.querySelector('strong')?.textContent.trim() || '';
                const full = entry.textContent.replace(/\s+/g, ' ').trim();
                const text = name && full.startsWith(name) ? full.slice(name.length).trim() : full;
                return { name, text };
            })
            .filter(line => line.text && line.text !== 'Inizio sessione');
    }

    function getSessionLabel() {
        const now = new Date();
        return now.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    downloadBtn?.addEventListener('click', () => {
        const lines = getChatLogLines();
        if (!lines.length) {
            alert('La chat è ancora vuota.');
            return;
        }

        const body = lines.map(line => (line.name ? `${line.name}: ${line.text}` : line.text)).join('\n');
        const blob = new Blob([`Resoconto Venander - ${getSessionLabel()}\n\n${body}\n`], { type: 'text/plain;charset=utf-8' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `resoconto-${new Date().toISOString().slice(0, 10)}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
    });

    wikiBtn?.addEventListener('click', () => {
        if (!isMaster) return;

        const lines = getChatLogLines();
        if (!lines.length) {
            alert('La chat è ancora vuota.');
            return;
        }

        const title = `Resoconto ${getSessionLabel()}`;
        if (!confirm(`Salvare la chat come pagina segreta "${title}" nel wiki?`)) return;

        socket.emit('wiki_save_page', {
            title,
            category: 'Resoconti',
            hidden: true,
            content: lines.map(line => (line.name ? `- **${line.name}**: ${line.text}` : `- ${line.text}`)).join('\n')
        });

        statusBar.innerText = `📖 Resoconto salvato nel wiki (segreto): "${title}".`;
    });

    // Il pulsante del wiki è solo per il Master
    function syncChatExportButtons() {
        if (wikiBtn) wikiBtn.style.display = isMaster ? 'inline-block' : 'none';
    }

    userSelect?.addEventListener('change', () => setTimeout(syncChatExportButtons, 0));
    // Il ruolo può essere ripristinato dopo il caricamento: ricontrolla all'apertura della chat
    document.getElementById('dice-panel-header')?.addEventListener('click', syncChatExportButtons);
    syncChatExportButtons();
})();

// ==========================================
// COLONNA DESTRA: CHAT IN ALTO, PANNELLO DEL TURNO IN BASSO
// La chat aperta si accorcia per non coprire il pannello del turno
// (finché il pannello non viene trascinato altrove).
// ==========================================
(() => {
    const chatContent = document.getElementById('dice-panel-content');
    const chatPanel = document.getElementById('dice-panel');
    const actionPanel = document.getElementById('combat-action-panel');
    const actionHeader = document.getElementById('action-header');
    if (!chatContent || !chatPanel || !actionPanel) return;

    const DEFAULT_HEIGHT = 0.75;   // come prima: 75% dello schermo
    const MIN_HEIGHT = 160;
    const GAP = 12;

    function fitChatToActionPanel() {
        const panelVisible = actionPanel.style.display !== 'none' && actionPanel.offsetParent !== null;
        let height = window.innerHeight * DEFAULT_HEIGHT;

        if (panelVisible && actionPanel.dataset.dragged !== '1') {
            const chatTop = chatContent.getBoundingClientRect().top || chatPanel.getBoundingClientRect().bottom;
            const free = actionPanel.getBoundingClientRect().top - chatTop - GAP;
            height = Math.max(MIN_HEIGHT, Math.min(height, free));
        }

        chatContent.style.height = `${Math.round(height)}px`;
    }

    // Spostato a mano: da lì in poi la chat torna alla sua altezza normale
    actionHeader?.addEventListener('mousedown', () => {
        actionPanel.dataset.dragged = '1';
    });

    new ResizeObserver(fitChatToActionPanel).observe(actionPanel);
    new MutationObserver(fitChatToActionPanel).observe(actionPanel, { attributes: true, attributeFilter: ['style'] });
    new MutationObserver(fitChatToActionPanel).observe(chatContent, { attributes: true, attributeFilter: ['style'] });
    window.addEventListener('resize', fitChatToActionPanel);
    fitChatToActionPanel();
})();

// ==========================================
// BANNER DEL RISULTATO
// Dopo la revisione del Master, tutti vedono per qualche secondo esito,
// HP persi e danno all'armatura, sotto la barra dei turni.
// ==========================================
(() => {
    const banner = document.getElementById('combat-banner');
    if (!banner) return;

    const BANNER_MS = 4000;
    let hideTimer = null;

    socket.on('combat_banner', (data) => {
        const parts = [
            `⚔️ <b>${escapeHtml(data.defender)}</b>`,
            `<span class="combat-banner-outcome">${escapeHtml(data.outcome.toUpperCase())}</span>`
        ];
        if (data.aim) parts.push(`🎯 ${escapeHtml(data.aim)}`);
        if (data.hit) parts.push(`<span class="combat-banner-hp">-${data.damage} HP</span>`);
        if (data.armor) {
            parts.push(`<span class="combat-banner-armor">🛡️ ${escapeHtml(data.armor.name)} -${data.armor.damage}</span>`);
        }

        banner.innerHTML = parts.join(' · ');
        banner.classList.toggle('miss', !data.hit);
        banner.classList.add('show');

        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => banner.classList.remove('show'), BANNER_MS);
    });
})();
