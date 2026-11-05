// Fucina del Master: modulo dell'arma, libreria, consegna diretta a un giocatore.
// Fa parte dell'interfaccia (static/ui/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

function refreshSidequestTargetOptions() {
    if (!sidequestTarget) return;

    const previousValue = sidequestTarget.value || 'all';
    sidequestTarget.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '🌐 Tutti i giocatori';
    sidequestTarget.appendChild(allOption);

    (characters || [])
        .filter(char => char.role === 'player')
        .forEach(char => {
            const option = document.createElement('option');
            option.value = String(char.id);
            option.textContent = `👤 ${char.name}`;
            sidequestTarget.appendChild(option);
        });

    if ([...sidequestTarget.options].some(opt => opt.value === previousValue)) {
        sidequestTarget.value = previousValue;
    }
}
window.refreshSidequestTargetOptions = refreshSidequestTargetOptions;

function forgeFieldValue(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const value = String(el.value ?? '').trim();
    return value === '' ? null : value;
}

function forgeNumberValue(id) {
    const raw = forgeFieldValue(id);
    if (raw === null) return null;
    const value = Number(String(raw).replace(',', '.'));
    return Number.isFinite(value) ? value : null;
}

function formatForgedWeaponSummary(weapon) {
    if (!weapon) return '';

    const damage = weapon.damage ?? '?';
    const speed = weapon.attack_speed ?? '?';
    const hands = weapon.hands ?? 1;
    const targeting = weapon.targeting || 'Melee';
    const license = weapon.license_name ? ` • 🔒 ${weapon.license_name}` : '';

    return `🔨 ${weapon.name} • ${damage} HP • Vel. ${speed} • ${hands} mano/i • ${targeting}${license}`;
}

function forgedDefinitionToDraft(definition) {
    if (!definition || typeof definition !== 'object') return null;

    const weapon = definition.weapon || {};
    const equipment = definition.equipment || {};
    const text = definition.text || {};
    const ranges = Array.isArray(weapon.range_bands_m) ? weapon.range_bands_m : [];
    const maluses = Array.isArray(weapon.range_malus) ? weapon.range_malus : [];

    return {
        name: definition.name || '',
        brand: definition.brand || '',
        value_eur: equipment.cost_eur ?? null,
        description: text.description || '',
        damage: weapon.damage ?? 0,
        damage_type: weapon.damage_type || '',
        characteristic: weapon.characteristic || 'DES',
        hp: equipment.hp ?? 100,
        action_cost: weapon.action_cost ?? 0,
        attack_speed: weapon.attack_speed ?? null,
        hands: weapon.hands ?? 1,
        targeting: weapon.targeting || 'Melee',
        ammo: weapon.ammo || '',
        ammo_qty: weapon.ammo_qty ?? null,
        base_malus: weapon.base_malus ?? null,
        aim_time: weapon.aim_time ?? null,
        range_1: ranges[0] ?? null,
        range_malus_1: maluses[0] ?? null,
        range_2: ranges[1] ?? null,
        range_malus_2: maluses[1] ?? null,
        range_3: ranges[2] ?? null,
        range_malus_3: maluses[2] ?? null,
        weight: equipment.weight ?? 0,
        harmonization: equipment.harmonization ?? 0,
        license_name: weapon.license_name || ''
    };
}

function masterForgeFieldValue(suffix) {
    const el = document.getElementById(`master-forge-weapon-${suffix}`);
    if (!el) return null;
    const value = String(el.value ?? '').trim();
    return value === '' ? null : value;
}

function masterForgeNumberValue(suffix) {
    const raw = masterForgeFieldValue(suffix);
    if (raw === null) return null;
    const value = Number(String(raw).replace(',', '.'));
    return Number.isFinite(value) ? value : null;
}

function readMasterForgeDraft() {
    const name = masterForgeFieldValue('name');
    const damage = masterForgeNumberValue('damage');
    const speed = masterForgeNumberValue('speed');

    if (!name) {
        alert("Inserisci il nome dell'arma.");
        return null;
    }
    if (damage === null || damage < 0) {
        alert('Inserisci un danno valido.');
        return null;
    }
    if (speed === null || speed <= 0) {
        alert("Inserisci una velocità d'attacco valida.");
        return null;
    }

    return {
        name,
        brand: masterForgeFieldValue('brand'),
        value_eur: masterForgeNumberValue('value'),
        description: masterForgeFieldValue('description'),
        damage,
        damage_type: masterForgeFieldValue('damage-type'),
        characteristic: masterForgeFieldValue('characteristic') || 'DES',
        hp: masterForgeNumberValue('hp') ?? 100,
        action_cost: masterForgeNumberValue('action-cost') ?? 0,
        attack_speed: speed,
        hands: masterForgeNumberValue('hands') ?? 1,
        targeting: masterForgeFieldValue('targeting') || 'Melee',
        ammo: masterForgeFieldValue('ammo'),
        ammo_qty: masterForgeNumberValue('ammo-qty'),
        base_malus: masterForgeNumberValue('base-malus'),
        aim_time: masterForgeNumberValue('aim-time'),
        range_1: masterForgeNumberValue('range-1'),
        range_malus_1: masterForgeNumberValue('malus-1'),
        range_2: masterForgeNumberValue('range-2'),
        range_malus_2: masterForgeNumberValue('malus-2'),
        range_3: masterForgeNumberValue('range-3'),
        range_malus_3: masterForgeNumberValue('malus-3'),
        weight: masterForgeNumberValue('weight') ?? 0,
        harmonization: masterForgeNumberValue('harmonization') ?? 0,
        license_name: masterForgeFieldValue('license')
    };
}

function setMasterForgeField(suffix, value) {
    const el = document.getElementById(`master-forge-weapon-${suffix}`);
    if (!el) return;
    el.value = value === null || value === undefined ? '' : String(value);
}

function populateMasterForgeForm(draft) {
    const data = draft || {};
    setMasterForgeField('name', data.name || '');
    setMasterForgeField('brand', data.brand || '');
    setMasterForgeField('value', data.value_eur ?? '');
    setMasterForgeField('description', data.description || '');
    setMasterForgeField('damage', data.damage ?? '');
    setMasterForgeField('damage-type', data.damage_type || '');
    setMasterForgeField('characteristic', data.characteristic || 'DES');
    setMasterForgeField('hp', data.hp ?? 100);
    setMasterForgeField('action-cost', data.action_cost ?? 0);
    setMasterForgeField('speed', data.attack_speed ?? '');
    setMasterForgeField('hands', data.hands ?? 1);
    setMasterForgeField('targeting', data.targeting || 'Melee');
    setMasterForgeField('ammo', data.ammo || '');
    setMasterForgeField('ammo-qty', data.ammo_qty ?? '');
    setMasterForgeField('base-malus', data.base_malus ?? '');
    setMasterForgeField('aim-time', data.aim_time ?? '');
    setMasterForgeField('range-1', data.range_1 ?? '');
    setMasterForgeField('malus-1', data.range_malus_1 ?? '');
    setMasterForgeField('range-2', data.range_2 ?? '');
    setMasterForgeField('malus-2', data.range_malus_2 ?? '');
    setMasterForgeField('range-3', data.range_3 ?? '');
    setMasterForgeField('malus-3', data.range_malus_3 ?? '');
    setMasterForgeField('weight', data.weight ?? 0);
    setMasterForgeField('harmonization', data.harmonization ?? 0);
    setMasterForgeField('license', data.license_name || '');
}

function resetMasterForgeEditor() {
    masterForgeEditingId = null;
    populateMasterForgeForm(null);
    if (masterForgeEditLabel) masterForgeEditLabel.textContent = 'Nuova arma';
    if (masterForgeSaveBtn) masterForgeSaveBtn.textContent = '💾 Salva nella Fucina';
}

function attachForgeDraftToSidequest(draft) {
    if (!draft) return;
    pendingSidequestWeapon = { ...draft };

    if (sidequestForgeSummary) {
        sidequestForgeSummary.textContent =
            `✅ Allegata dalla Fucina: ${formatForgedWeaponSummary(pendingSidequestWeapon)}`;
        sidequestForgeSummary.style.display = 'block';
    }
}

function refreshMasterForgeSelect() {
    if (!sidequestForgeLibrary) return;

    const previous = sidequestForgeLibrary.value;
    sidequestForgeLibrary.innerHTML = '';

    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = masterForgeStore.size
        ? '-- Seleziona un modello --'
        : '-- Nessun modello salvato --';
    sidequestForgeLibrary.appendChild(empty);

    [...masterForgeStore.values()]
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'))
        .forEach(template => {
            const option = document.createElement('option');
            option.value = String(template.id);
            option.textContent = template.name || `Arma #${template.id}`;
            sidequestForgeLibrary.appendChild(option);
        });

    if ([...sidequestForgeLibrary.options].some(opt => opt.value === previous)) {
        sidequestForgeLibrary.value = previous;
    }
}

function renderMasterForgeLibrary() {
    refreshMasterForgeSelect();
    if (!masterForgeList) return;

    masterForgeList.innerHTML = '';
    const templates = [...masterForgeStore.values()]
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'));

    if (!templates.length) {
        const empty = document.createElement('em');
        empty.style.cssText = 'font-size:12px;color:#777;text-align:center;padding:15px;';
        empty.textContent = 'Nessun modello salvato.';
        masterForgeList.appendChild(empty);
        return;
    }

    templates.forEach(template => {
        const draft = forgedDefinitionToDraft(template.definition);
        const row = document.createElement('div');
        row.style.cssText = 'padding:7px;border:1px solid #e0b27a;border-radius:5px;background:#fffaf4;';

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:bold;color:#784212;font-size:12px;';
        title.textContent = template.name || `Arma #${template.id}`;
        row.appendChild(title);

        const summary = document.createElement('div');
        summary.style.cssText = 'font-size:10px;color:#7f5539;margin-top:3px;line-height:1.3;';
        summary.textContent = formatForgedWeaponSummary(draft);
        row.appendChild(summary);

        const buttons = document.createElement('div');
        buttons.style.cssText = 'display:flex;gap:4px;margin-top:6px;';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.textContent = 'Modifica';
        editBtn.style.cssText = 'flex:1;padding:4px;border:0;border-radius:3px;background:#2980b9;color:white;cursor:pointer;font-size:10px;';
        editBtn.addEventListener('click', () => {
            masterForgeEditingId = Number(template.id);
            populateMasterForgeForm(draft);
            if (masterForgeEditLabel) masterForgeEditLabel.textContent = `Modifica: ${template.name}`;
            if (masterForgeSaveBtn) masterForgeSaveBtn.textContent = '💾 Salva modifiche';
        });

        const attachBtn = document.createElement('button');
        attachBtn.type = 'button';
        attachBtn.textContent = '📜 Allega';
        attachBtn.style.cssText = 'flex:1;padding:4px;border:0;border-radius:3px;background:#7d3c98;color:white;cursor:pointer;font-size:10px;';
        attachBtn.addEventListener('click', () => {
            attachForgeDraftToSidequest(draft);
            if (sidequestForgeLibrary) sidequestForgeLibrary.value = String(template.id);
            if (masterForgeModal) masterForgeModal.style.display = 'none';
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.textContent = '🗑';
        deleteBtn.style.cssText = 'padding:4px 7px;border:0;border-radius:3px;background:#c0392b;color:white;cursor:pointer;font-size:10px;';
        deleteBtn.addEventListener('click', () => {
            if (!confirm(`Eliminare "${template.name}" dalla Fucina? Le task già create non verranno modificate.`)) return;
            socket.emit('master_forge_delete', { template_id: template.id });
            if (masterForgeEditingId === Number(template.id)) resetMasterForgeEditor();
        });

        buttons.appendChild(editBtn);
        buttons.appendChild(attachBtn);
        buttons.appendChild(deleteBtn);
        row.appendChild(buttons);
        masterForgeList.appendChild(row);
    });
}

openMasterForgeBtn?.addEventListener('click', () => {
    if (!isMaster || !masterForgeModal) return;
    masterForgeModal.style.display = 'flex';
    refreshMasterForgeGiveTargets();
    socket.emit('master_forge_request');
});

openMasterForgePanelBtn?.addEventListener('click', () => {
    if (!isMaster || !masterForgeModal) return;
    masterForgeModal.style.display = 'flex';
    refreshMasterForgeGiveTargets();
    socket.emit('master_forge_request');
});

closeMasterForgeBtn?.addEventListener('click', () => {
    if (masterForgeModal) masterForgeModal.style.display = 'none';
});

masterForgeModal?.addEventListener('click', event => {
    if (event.target === masterForgeModal) masterForgeModal.style.display = 'none';
});

masterForgeNewBtn?.addEventListener('click', () => {
    resetMasterForgeEditor();
});

masterForgeSaveBtn?.addEventListener('click', () => {
    if (!isMaster) return;
    const weapon = readMasterForgeDraft();
    if (!weapon) return;

    socket.emit('master_forge_save', {
        template_id: masterForgeEditingId,
        weapon
    });
});

// Consegna diretta dalla Fucina: l'arma va tra le Armi del giocatore scelto
function refreshMasterForgeGiveTargets() {
    const select = document.getElementById('master-forge-give-target');
    if (!select) return;
    const previous = select.value;
    select.innerHTML = '<option value="">-- Giocatore --</option>';
    (characters || []).filter(c => c.role === 'player').forEach(c => select.add(new Option(c.name, c.id)));
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
}

document.getElementById('btn-master-forge-give')?.addEventListener('click', () => {
    if (!isMaster) return;
    const charId = parseInt(document.getElementById('master-forge-give-target')?.value);
    if (!charId) {
        alert("Scegli il giocatore che riceve l'arma.");
        return;
    }
    const weapon = readMasterForgeDraft();
    if (!weapon) return;
    const charName = sidequestPlayerName(charId);
    if (!confirm(`Dare "${weapon.name}" a ${charName}? Finisce subito tra le sue Armi.`)) return;

    socket.timeout(10000).emit('master_forge_give', { char_id: charId, weapon }, (timeoutError, reply) => {
        if (timeoutError) {
            alert("Il server non ha risposto: l'arma NON è stata consegnata. Probabilmente va riavviato.");
            return;
        }
        if (reply?.error) {
            alert(reply.error);
            return;
        }
        statusBar.innerText = `🎁 ${reply.name} consegnata a ${charName}.`;
    });
});

masterForgeAttachBtn?.addEventListener('click', () => {
    const weapon = readMasterForgeDraft();
    if (!weapon) return;
    attachForgeDraftToSidequest(weapon);
    if (masterForgeModal) masterForgeModal.style.display = 'none';
});

sidequestForgeAttachTemplateBtn?.addEventListener('click', () => {
    const templateId = Number(sidequestForgeLibrary?.value || 0);
    const template = masterForgeStore.get(templateId);
    if (!template) {
        alert('Seleziona prima un modello dalla Fucina.');
        return;
    }
    attachForgeDraftToSidequest(forgedDefinitionToDraft(template.definition));
});

socket.on('master_forge_library', templates => {
    masterForgeStore.clear();
    (templates || []).forEach(template => {
        masterForgeStore.set(Number(template.id), template);
    });
    renderMasterForgeLibrary();
});

socket.on('master_forge_error', data => {
    alert(data?.message || 'Operazione Fucina non riuscita.');
});
