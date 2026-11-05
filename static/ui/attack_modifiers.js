// Bonus e malus all'attacco (Master).
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// BONUS / MALUS ALL'ATTACCO
// Ogni situazione (area mirata, copertura, altura...) ha un valore che il
// Master decide la prima volta; le volte dopo è già pronto e modificabile.
// ==========================================
let reviewModifiers = [];
let savedCustomModifiers = [];

function getModifiedAttackRoll() {
    const base = parseInt(document.getElementById('master-review-att-roll').value) || 0;
    return base + reviewModifiers
        .filter(m => m.applied && Number.isFinite(m.value))
        .reduce((sum, m) => sum + m.value, 0);
}

// Totale con i modificatori ed esito riproposto in base al tiro modificato
function updateReviewModifierTotal() {
    const base = parseInt(document.getElementById('master-review-att-roll').value) || 0;
    const total = getModifiedAttackRoll();
    const def = document.getElementById('master-review-def-roll').value;

    document.getElementById('review-modifier-total').textContent = total === base
        ? `🎲 Attacco ${base} · Difesa ${def}`
        : `🎲 Attacco ${base} → ${total} con modificatori · Difesa ${def}`;

    if (pendingMasterCombatResult) {
        document.getElementById('master-review-outcome').value =
            defaultCombatOutcome(pendingMasterCombatResult.reaction_type, total, def);
        syncReviewOutcome();
    }
}

function renderReviewModifiers() {
    const rows = document.getElementById('review-modifier-rows');
    rows.innerHTML = '';

    if (!reviewModifiers.length) {
        rows.innerHTML = '<div class="review-modifier-empty">Nessuna situazione particolare.</div>';
    }

    reviewModifiers.forEach(modifier => {
        const row = document.createElement('label');
        row.className = 'review-modifier-row';

        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = modifier.applied;
        check.title = 'Applica (togli la spunta per ignorarlo questa volta)';

        const name = document.createElement('span');
        name.className = 'review-modifier-name';
        name.textContent = modifier.label;

        const value = document.createElement('input');
        value.type = 'number';
        value.value = modifier.value ?? '';
        value.placeholder = '±';

        const tag = document.createElement('span');
        tag.className = 'review-modifier-tag';
        tag.textContent = modifier.saved === null || modifier.saved === undefined
            ? 'nuovo'
            : `salvato ${modifier.saved > 0 ? '+' : ''}${modifier.saved}`;
        tag.classList.toggle('new', modifier.saved === null || modifier.saved === undefined);

        check.addEventListener('change', () => {
            modifier.applied = check.checked && Number.isFinite(modifier.value);
            check.checked = modifier.applied;
            updateReviewModifierTotal();
        });

        // Scrivere un valore lo applica; svuotarlo lo toglie
        value.addEventListener('input', () => {
            const parsed = parseInt(value.value);
            modifier.value = Number.isFinite(parsed) ? parsed : null;
            modifier.applied = Number.isFinite(parsed);
            check.checked = modifier.applied;
            updateReviewModifierTotal();
        });

        row.append(check, name, value, tag);
        rows.appendChild(row);
    });

    updateReviewModifierTotal();
}

document.getElementById('review-modifier-add-btn')?.addEventListener('click', () => {
    const nameInput = document.getElementById('review-modifier-name');
    const valueInput = document.getElementById('review-modifier-value');
    const label = nameInput.value.trim();
    if (!label) return;

    // Una situazione già usata in passato riprende il suo valore
    const known = savedCustomModifiers.find(m => m.label.toLowerCase() === label.toLowerCase());
    const typed = parseInt(valueInput.value);
    const value = Number.isFinite(typed) ? typed : (known ? known.value : null);
    const key = known ? known.key : `custom_${label.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

    if (reviewModifiers.some(m => m.key === key)) return;

    reviewModifiers.push({ key, label: known ? known.label : label, value, saved: known ? known.value : null, applied: value !== null });
    nameInput.value = '';
    valueInput.value = '';
    renderReviewModifiers();
});
let reviewDamageBeforeMiss = null;

// Parato / Schivato / Mancato: danno a 0 (e si ripristina se si torna a un colpo)
function syncReviewOutcome() {
    const outcome = document.getElementById('master-review-outcome').value;
    const totalInput = document.getElementById('master-review-total');
    const missed = NON_HIT_OUTCOMES.includes(outcome);

    if (missed && !totalInput.disabled) {
        reviewDamageBeforeMiss = totalInput.value;
        totalInput.value = 0;
    } else if (!missed && totalInput.disabled && reviewDamageBeforeMiss !== null) {
        totalInput.value = reviewDamageBeforeMiss;
    }

    totalInput.disabled = missed;
    document.getElementById('master-review-damage').disabled = missed;
    document.getElementById('master-review-armor-damage').disabled = missed;
    splitReviewDamage();
}

// Metà del danno all'armatura che copre il colpo (il punto dispari al personaggio),
// fino a quanta durabilità le resta; senza armatura tutto al personaggio
function splitReviewDamage() {
    const total = Math.max(0, parseInt(document.getElementById('master-review-total').value) || 0);
    const slot = document.getElementById('master-review-armor-slot').value;
    const piece = (pendingMasterCombatResult?.armor_pieces || []).find(p => p.slot === slot);
    const armorShare = piece ? Math.min(Math.floor(total / 2), Math.max(0, piece.hp)) : 0;

    document.getElementById('master-review-armor-damage').value = armorShare;
    document.getElementById('master-review-damage').value = total - armorShare;
}

document.getElementById('master-review-total')?.addEventListener('input', splitReviewDamage);
document.getElementById('master-review-armor-slot')?.addEventListener('change', splitReviewDamage);

document.getElementById('master-review-outcome')?.addEventListener('change', syncReviewOutcome);

// I tiri cambiati a mano ripropongono l'esito
['master-review-att-roll', 'master-review-def-roll'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
        if (!pendingMasterCombatResult) return;
        updateReviewModifierTotal();
    });
});

document.getElementById(
    'master-review-publish'
)?.addEventListener(
    'click',
    () => {

        if (
            !pendingMasterCombatResult
        ) {
            return;
        }

        const attRoll =
            parseInt(
                document.getElementById(
                    'master-review-att-roll'
                ).value
            );

        const defRoll =
            parseInt(
                document.getElementById(
                    'master-review-def-roll'
                ).value
            );

        const damage =
            parseInt(
                document.getElementById(
                    'master-review-damage'
                ).value
            );

        const message =
            document.getElementById(
                'master-review-message'
            ).value.trim();

        if (
            !Number.isFinite(attRoll) ||
            !Number.isFinite(defRoll) ||
            !Number.isFinite(damage)
        ) {

            alert(
                "Controlla tiro attacco, tiro difesa e danno."
            );

            return;
        }

        socket.emit(
            'master_publish_combat_result',
            {

                result_id:
                    pendingMasterCombatResult.result_id,

                att_roll:
                    attRoll,

                def_roll:
                    defRoll,

                damage:
                    Math.max(
                        0,
                        damage
                    ),

                message:
                    message,

                outcome:
                    document.getElementById('master-review-outcome').value,

                // Bonus/malus applicati: il server li ricorda per la prossima volta
                modifiers:
                    reviewModifiers.map(({ key, label, value, applied }) => ({ key, label, value, applied })),

                armor_slot:
                    document.getElementById('master-review-armor-slot').value || null,

                armor_damage:
                    parseInt(document.getElementById('master-review-armor-damage').value) || 0
            }
        );

        document.getElementById(
            'master-combat-review'
        ).style.display =
            'none';

        pendingMasterCombatResult =
            null;
    }
);

document.getElementById(
    'master-review-cancel'
)?.addEventListener(
    'click',
    () => {

        if (
            !pendingMasterCombatResult
        ) {
            return;
        }

        socket.emit(
            'master_discard_combat_result',
            {
                result_id:
                    pendingMasterCombatResult.result_id
            }
        );

        document.getElementById(
            'master-combat-review'
        ).style.display =
            'none';

        pendingMasterCombatResult =
            null;
    }
);
