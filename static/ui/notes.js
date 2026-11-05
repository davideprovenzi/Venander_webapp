// Appunti del giocatore e loro finestra.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// LOGICA APPUNTI E TRASCINAMENTO
// ==========================================
const notesPanel = document.getElementById('notes-panel');
const notesHeader = document.getElementById('notes-header');
let isDraggingNotes = false, dragNotesX = 0, dragNotesY = 0;

if (notesHeader && notesPanel) {
    notesHeader.addEventListener('mousedown', (e) => {
        isDraggingNotes = true;
        dragNotesX = e.clientX - notesPanel.getBoundingClientRect().left;
        dragNotesY = e.clientY - notesPanel.getBoundingClientRect().top;
        notesHeader.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDraggingNotes) return;
        notesPanel.style.left = (e.clientX - dragNotesX) + 'px';
        notesPanel.style.top = (e.clientY - dragNotesY) + 'px';
    });
    document.addEventListener('mouseup', () => { isDraggingNotes = false; notesHeader.style.cursor = 'grab'; });
}
// Apertura / Chiusura (Gestione sicura globale)
document.body.addEventListener('click', (e) => {
    // Intercetta il click sia sul bottone principale che sulla X del pannello
    if (e.target && (e.target.id === 'btn-toggle-notes' || e.target.id === 'notes-close-x')) {
        const panel = document.getElementById('notes-panel');
        const btn = document.getElementById('btn-toggle-notes');

        if (panel) {
            if (panel.style.display === 'none') {
                // APERTURA: Mostra il pannello e fai diventare rosso il bottone
                panel.style.display = 'block';
                if (btn) {
                    btn.innerHTML = '❌ Chiudi Appunti';
                    btn.style.background = '#e74c3c';
                }
            } else {
                // CHIUSURA: Nascondi il pannello e fai tornare normale il bottone
                panel.style.display = 'none';
                if (btn) {
                    btn.innerHTML = '📝 Appunti';
                    btn.style.background = '#f39c12';
                }
            }
        }
    }
});

// Salvataggio
document.getElementById('save-notes-btn')?.addEventListener('click', () => {
    const charId = isMaster ? selectedCharacterId : parseInt(document.getElementById('user-select')?.value);
    if (!charId) return;

    socket.emit('update_character_sheet', { char_id: charId, notes: document.getElementById('notes-textarea').value });

    const msg = document.getElementById('notes-saved-msg');
    msg.style.display = 'block';
    setTimeout(() => { msg.style.display = 'none'; }, 2000);
});

let pendingMasterCombatResult = null;

// Risultato tolto da un "Annulla" del Master: si chiude la revisione
socket.on('master_combat_result_cancelled', (data) => {
    if (pendingMasterCombatResult?.result_id !== data.result_id) return;
    pendingMasterCombatResult = null;
    document.getElementById('master-combat-review').style.display = 'none';
});

socket.on(
    'master_pending_combat_result',
    (data) => {

        if (!isMaster) return;

        pendingMasterCombatResult =
            data;

        const modal =
            document.getElementById(
                'master-combat-review'
            );

        const summary =
            document.getElementById(
                'master-review-summary'
            );

        summary.innerHTML = `

            <b>${escapeHtml(data.attacker_name)}</b>
            attacca
            <b>${escapeHtml(data.defender_name)}</b>

            <br>

            ⚔️ ${escapeHtml(data.weapon)}

            <br>

            🛡️ Reazione:
            <b>${escapeHtml(data.reaction_label || data.reaction_type)}</b>

            ${data.aim_label ? `<br>🎯 Mirato a: <b>${escapeHtml(data.aim_label)}</b>` : ''}

            ${
                describeAttackTerrain(data.attacker_id, data.defender_id)
                    .map(note => `<br>${note}`)
                    .join('')
            }

            ${
                data.distance !== null &&
                data.distance !== undefined

                ? `<br>📏 Distanza: ${data.distance} m`

                : ''
            }

            ${
                data.damage_formula

                ? `<br>💥 Formula: ${escapeHtml(data.damage_formula)}`

                : ''
            }
        `;

        document.getElementById(
            'master-review-att-roll'
        ).value =
            data.att_roll;

        document.getElementById(
            'master-review-def-roll'
        ).value =
            data.def_roll;

        // Danno totale: si divide con l'armatura (vedi splitReviewDamage)
        document.getElementById('master-review-total').value = data.damage ?? 0;

        // Nota libera: vuota, in chat vanno già esito e danno
        document.getElementById('master-review-message').value = '';

        // Armatura: si propone il pezzo dell'area mirata (o quello che ha parato)
        const armorSelect = document.getElementById('master-review-armor-slot');
        const pieces = data.armor_pieces || [];
        armorSelect.innerHTML = '';
        armorSelect.add(new Option('Nessuna armatura', ''));
        pieces.forEach(piece => armorSelect.add(new Option(`${piece.name} (${piece.hp}/${piece.max_hp})`, piece.slot)));
        armorSelect.value = data.armor_slot || '';
        document.getElementById('master-review-armor-row').style.display = pieces.length ? 'block' : 'none';

        document.getElementById('master-review-total').disabled = false;
        reviewDamageBeforeMiss = null;

        // Bonus/malus: quelli già decisi in passato partono applicati
        reviewModifiers = (data.modifiers || []).map(m => ({ ...m, saved: m.value, applied: m.value !== null }));
        savedCustomModifiers = data.custom_modifiers || [];
        const savedList = document.getElementById('review-modifier-saved');
        savedList.innerHTML = '';
        savedCustomModifiers.forEach(m => savedList.appendChild(new Option(m.label, m.label)));
        renderReviewModifiers();

        modal.style.display =
            'block';
    }
);

// Esito proposto dai tiri (stessa regola di default_combat_outcome in venander/attacks.py)
function defaultCombatOutcome(reaction, attRoll, defRoll) {
    const defended = Number(defRoll) >= Number(attRoll);
    if (reaction === 'Schivata') return defended ? 'schivato' : 'colpito';
    if (reaction === 'Parata') return defended ? 'parato' : 'parzialmente_parato';
    // Colpo mirato o nella zona minacciata: niente reazione al colpo
    if (reaction === 'Nessuna') return defended ? 'mancato' : 'colpito';
    return 'colpito';
}

const NON_HIT_OUTCOMES = ['parato', 'schivato', 'mancato'];
