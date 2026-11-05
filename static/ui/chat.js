// Chat e dadi: messaggi, destinatari, risultati dei tiri.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// CHAT E DADI
// ==========================================
const chatLog = document.getElementById('chat-log');
const chatStatus = document.getElementById('chat-status');
const dicePanelHeader = document.getElementById('dice-panel-header');
const dicePanelContent = document.getElementById('dice-panel-content');
const diceToggleIcon = document.getElementById('dice-toggle-icon');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('btn-send-chat');
const chatCompose = document.getElementById('chat-compose');
let chatRecipient = document.getElementById('chat-recipient');
const sidequestComposer = document.getElementById('sidequest-composer');
const sidequestComposerToggleBtn = document.getElementById('btn-toggle-sidequest-composer');
const sidequestComposerBody = document.getElementById('sidequest-composer-body');
const sidequestComposerToggleIcon = document.getElementById('sidequest-composer-toggle-icon');
const sidequestTarget = document.getElementById('sidequest-target');
const sidequestTitle = document.getElementById('sidequest-title');
const sidequestDescription = document.getElementById('sidequest-description');
const sidequestCost = document.getElementById('sidequest-cost');
const sendSidequestBtn = document.getElementById('btn-send-sidequest');
const sidequestForgeToggleBtn = document.getElementById('btn-toggle-sidequest-forge');
const sidequestForgeForm = document.getElementById('sidequest-forge-form');
const sidequestForgeSummary = document.getElementById('sidequest-forged-summary');
const sidequestForgeBtn = document.getElementById('btn-forge-sidequest-weapon');
const sidequestForgeRemoveBtn = document.getElementById('btn-remove-sidequest-weapon');
const sidequestForgeLibrary = document.getElementById('sidequest-forge-library');
const sidequestForgeAttachTemplateBtn = document.getElementById('btn-attach-forge-template');
const openMasterForgeBtn = document.getElementById('btn-open-master-forge');
const openMasterForgePanelBtn = document.getElementById('btn-open-master-forge-panel');
const masterForgeModal = document.getElementById('master-forge-modal');
const masterForgeList = document.getElementById('master-forge-list');
const masterForgeEditLabel = document.getElementById('master-forge-edit-label');
const closeMasterForgeBtn = document.getElementById('btn-close-master-forge');
const masterForgeNewBtn = document.getElementById('btn-master-forge-new');
const masterForgeSaveBtn = document.getElementById('btn-master-forge-save');
const masterForgeAttachBtn = document.getElementById('btn-master-forge-attach');
const sidequestStore = new Map();
const masterForgeStore = new Map();
let pendingSidequestWeapon = null;
let masterForgeEditingId = null;

// --- 1. APERTURA E CHIUSURA TENDINA ---
sidequestComposerToggleBtn?.addEventListener('click', () => {
    if (!sidequestComposerBody) return;

    const isOpen = sidequestComposerBody.style.display !== 'none';
    sidequestComposerBody.style.display = isOpen ? 'none' : 'block';
    sidequestComposerToggleBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');

    if (sidequestComposerToggleIcon) {
        sidequestComposerToggleIcon.innerText = isOpen ? '▶' : '▼';
    }
});

dicePanelHeader?.addEventListener('click', () => {
    if (dicePanelContent.style.display === 'none') {
        dicePanelContent.style.display = 'flex';
        diceToggleIcon.innerText = '▼';
        dicePanelHeader.style.borderRadius = '6px 6px 0 0';
        chatLog.scrollTop = chatLog.scrollHeight; // Scrolla in basso quando si apre
    } else {
        dicePanelContent.style.display = 'none';
        diceToggleIcon.innerText = '▶';
        dicePanelHeader.style.borderRadius = '6px';
    }
});

function ensureChatRecipientSelect() {
    if (chatRecipient || !chatCompose) return chatRecipient;

    const recipientRow = document.createElement('div');
    recipientRow.id = 'chat-recipient-row';
    recipientRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';

    const label = document.createElement('span');
    label.textContent = 'A:';
    label.style.cssText = 'font-size:11px;font-weight:bold;color:#7f8c8d;white-space:nowrap;';

    chatRecipient = document.createElement('select');
    chatRecipient.id = 'chat-recipient';
    chatRecipient.style.cssText = 'flex:1;min-width:0;padding:6px;border:1px solid #bdc3c7;border-radius:4px;background:#fff;';

    recipientRow.appendChild(label);
    recipientRow.appendChild(chatRecipient);
    chatCompose.insertBefore(recipientRow, chatCompose.firstChild);

    chatRecipient.addEventListener('change', () => {
        updateChatStatus();
    });

    return chatRecipient;
}

function refreshChatRecipientOptions() {
    const select = ensureChatRecipientSelect();
    if (!select) return;

    const previousValue = select.value || 'all';
    const myCharId = Number.parseInt(userSelect?.value || '', 10);

    select.innerHTML = '';

    const globalOption = document.createElement('option');
    globalOption.value = 'all';
    globalOption.textContent = '🌐 Tutti';
    select.appendChild(globalOption);

    if (!isMaster) {
        const masterOption = document.createElement('option');
        masterOption.value = 'master';
        masterOption.textContent = '👑 Master';
        select.appendChild(masterOption);
    }

    (characters || [])
        .filter(char => char.role === 'player')
        .filter(char => isMaster || Number(char.id) !== myCharId)
        .forEach(char => {
            const option = document.createElement('option');
            option.value = `player:${char.id}`;
            option.textContent = `👤 ${char.name}`;
            select.appendChild(option);
        });

    if ([...select.options].some(opt => opt.value === previousValue)) {
        select.value = previousValue;
    } else {
        select.value = 'all';
    }
}

window.refreshChatRecipientOptions = refreshChatRecipientOptions;

function updateChatStatus() {
    refreshChatRecipientOptions();

    if (chatStatus) {
        const target = chatRecipient?.value || 'all';
        const targetText = chatRecipient?.selectedOptions?.[0]?.textContent || '🌐 Tutti';

        if (target === 'all') {
            chatStatus.innerText = isMaster ? 'Master • Globale' : 'Globale';
            chatStatus.style.color = isMaster ? '#f1c40f' : '#1abc9c';
        } else {
            chatStatus.innerText = `🔒 ${targetText.replace(/^👤\s*|^👑\s*/, '')}`;
            chatStatus.style.color = '#f1c40f';
        }
    }

    if (sidequestComposer) {
        sidequestComposer.style.display = isMaster ? 'block' : 'none';
    }

    refreshSidequestTargetOptions();
    refreshSidequestCards();
}

// --- 2. RICEZIONE MESSAGGI E DADI DAL SERVER ---
socket.on('dice_result', (data) => {
    const div = document.createElement('div');
    div.style.padding = '8px 10px'; div.style.borderRadius = '5px'; div.style.lineHeight = '1.4';
    if (data.is_master_roll) { div.style.background = '#fadbd8'; div.style.borderLeft = '4px solid #c0392b'; div.style.color = '#c0392b'; }
    else { div.style.background = '#e8f8f5'; div.style.borderLeft = '4px solid #1abc9c'; div.style.color = '#2c3e50'; }
    // Il nome è testo semplice; il messaggio è HTML composto dal server
    div.innerHTML = `<strong style="display:block; font-size:13px; margin-bottom:2px;">${escapeHtml(data.name)}</strong>${data.message}`;
    chatLog.appendChild(div);

    // Auto-apertura se arriva un messaggio e la tendina è chiusa
    if (dicePanelContent && dicePanelContent.style.display === 'none') {
        dicePanelContent.style.display = 'flex';
        diceToggleIcon.innerText = '▼';
        dicePanelHeader.style.borderRadius = '6px 6px 0 0';
    }

    chatLog.scrollTop = chatLog.scrollHeight;
});

// --- 3. CHAT TESTUALE E SIDEQUEST ---
function ensureChatOpen() {
    if (!dicePanelContent) return;
    if (dicePanelContent.style.display === 'none') {
        dicePanelContent.style.display = 'flex';
        if (diceToggleIcon) diceToggleIcon.innerText = '▼';
        if (dicePanelHeader) dicePanelHeader.style.borderRadius = '6px 6px 0 0';
    }
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
}

function appendChatMessage(data) {
    if (!chatLog) return;

    const div = document.createElement('div');
    div.style.padding = '8px 10px';
    div.style.borderRadius = '5px';
    div.style.lineHeight = '1.4';
    div.dataset.chatChannel = data.is_private ? 'private' : 'global';

    if (data.is_system) {
        div.style.background = '#fef9e7';
        div.style.borderLeft = '4px solid #f1c40f';
        div.style.color = '#7d6608';
    } else if (data.is_private) {
        div.style.background = '#fff8e1';
        div.style.borderLeft = '4px solid #f39c12';
        div.style.color = '#5d4037';
    } else if (data.is_master) {
        div.style.background = '#f5eef8';
        div.style.borderLeft = '4px solid #8e44ad';
        div.style.color = '#512e5f';
    } else {
        div.style.background = '#ebf5fb';
        div.style.borderLeft = '4px solid #3498db';
        div.style.color = '#2c3e50';
    }

    const privateLabel = data.is_private
        ? `<div style="font-size:10px;font-weight:bold;color:#b9770e;margin-bottom:3px;">🔒 PRIVATO • ${data.private_route || data.target_label || ''}</div>`
        : '';

    div.innerHTML = `${privateLabel}<strong style="display:block;font-size:13px;margin-bottom:2px;">${data.name}</strong>${data.message}`;
    chatLog.appendChild(div);
    ensureChatOpen();
}

socket.on('chat_message', appendChatMessage);
socket.on('chat_error', data => alert(data?.message || 'Errore chat.'));

function sendChatMessage() {
    const message = chatInput?.value.trim();
    if (!message) return;

    const target = chatRecipient?.value || 'all';

    socket.emit('chat_message', {
        message,
        target
    });

    chatInput.value = '';
}

sendChatBtn?.addEventListener('click', sendChatMessage);
chatInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
    }
});

// Mantiene aggiornata la lista dei destinatari quando cambiano i personaggi.
socket.on('init_state', () => {
    setTimeout(refreshChatRecipientOptions, 0);
});

socket.on('update_character', () => {
    setTimeout(refreshChatRecipientOptions, 0);
});

socket.on('character_deleted', () => {
    setTimeout(refreshChatRecipientOptions, 0);
});
