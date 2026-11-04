// ==========================================
// SCAMBIO D'ATTACCO
// I due coinvolti tirano d20 + velocità/10 (pareggio = si ritira).
// Il Master vede i tiri e conferma chi vince, oppure decide lui.
// Chi vince attacca, chi perde riceve il normale popup di difesa.
// ==========================================
(() => {
    const modal = document.getElementById('exchange-modal');
    const body = document.getElementById('exchange-body');
    if (!modal || !body) return;

    let exchanges = [];

    function controls(charId) {
        return isMaster || parseInt(userSelect?.value) === charId;
    }

    function render() {
        const mine = exchanges.filter(ex => isMaster || ex.sides.some(side => controls(side.char_id)));
        body.innerHTML = '';
        if (!mine.length) {
            modal.classList.remove('open');
            return;
        }

        mine.forEach(ex => {
            const section = document.createElement('div');
            section.className = 'exchange-item';

            ex.sides.forEach((side, index) => {
                const row = document.createElement('div');
                row.className = 'exchange-side';
                row.classList.toggle('winner', ex.proposed_winner === side.char_id);

                const who = document.createElement('div');
                who.innerHTML = `<b>${escapeHtml(side.name)}</b> ${index === 0 ? '(attacca)' : '(scambio)'}<br>` +
                    `<small>${escapeHtml(side.weapon || '')} · Vel ${side.speed} → +${Math.floor(side.speed / 10)}</small>`;
                row.appendChild(who);

                const roll = document.createElement('div');
                roll.className = 'exchange-roll';
                if (side.roll) {
                    roll.innerHTML = `🎲 ${side.roll.die} + ${side.roll.bonus} = <b>${side.roll.total}</b>`;
                } else if (controls(side.char_id)) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = '🎲 Tira';
                    btn.addEventListener('click', () => socket.emit('exchange_roll', { exchange_id: ex.id, char_id: side.char_id }));
                    roll.appendChild(btn);
                } else {
                    roll.textContent = '⏳ deve tirare…';
                }
                row.appendChild(roll);
                section.appendChild(row);
            });

            const status = document.createElement('div');
            status.className = 'exchange-status';
            const proposed = ex.sides.find(side => side.char_id === ex.proposed_winner);
            status.textContent = proposed
                ? `🏆 Vince ${proposed.name}: attacca, l'altro si difende.`
                : 'In attesa dei tiri (in caso di pareggio si ritira).';
            section.appendChild(status);

            // Il Master conferma l'esito dei dadi o decide lui chi attacca
            if (isMaster) {
                const actions = document.createElement('div');
                actions.className = 'exchange-actions';
                ex.sides.forEach(side => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = `⚔️ Attacca ${side.name}`;
                    btn.classList.toggle('suggested', ex.proposed_winner === side.char_id);
                    btn.addEventListener('click', () => {
                        if (!proposed && !confirm(`I tiri non sono finiti: far vincere ${side.name} lo stesso?`)) return;
                        socket.emit('exchange_decide', { exchange_id: ex.id, winner_id: side.char_id });
                    });
                    actions.appendChild(btn);
                });
                section.appendChild(actions);
            }
            body.appendChild(section);
        });
        modal.classList.add('open');
    }

    socket.on('exchanges_update', (data) => {
        exchanges = Array.isArray(data) ? data : [];
        render();
    });

    // Cambio di personaggio: si ricontrolla chi deve vedere il popup
    userSelect?.addEventListener('change', render);
})();
