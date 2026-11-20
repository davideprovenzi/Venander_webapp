// ==========================================
// SCAMBIO D'ATTACCO
// I due coinvolti tirano d20 + velocità/10 (pareggio = si ritira).
// Vince chi attacca: colpisce. Vince chi risponde di 5 o più: colpisce solo
// lui. Di meno: colpiscono entrambi (il Master decide i danni).
// Il Master conferma l'esito proposto dai tiri o ne sceglie un altro
// (regole in venander/exchange.py).
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

            const [attacker, defender] = ex.sides;
            const results = {
                attacker: `⚔️ Colpisce ${attacker.name}`,
                defender: `🛡️ Colpisce solo ${defender.name}`,
                both: '⚔️⚔️ Colpiscono entrambi'
            };

            const status = document.createElement('div');
            status.className = 'exchange-status';
            if (ex.proposed_result) {
                const margin = Math.abs((attacker.roll?.total || 0) - (defender.roll?.total || 0));
                status.textContent = `🏆 ${results[ex.proposed_result]} (scarto ${margin}).`;
            } else {
                status.textContent = 'In attesa dei tiri (in caso di pareggio si ritira).';
            }
            section.appendChild(status);

            // Il Master conferma l'esito dei dadi o ne sceglie un altro
            if (isMaster) {
                const actions = document.createElement('div');
                actions.className = 'exchange-actions';
                Object.entries(results).forEach(([result, label]) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = label;
                    btn.classList.toggle('suggested', ex.proposed_result === result);
                    btn.addEventListener('click', () => {
                        if (!ex.proposed_result && !confirm(`I tiri non sono finiti: decidere lo stesso "${label}"?`)) return;
                        socket.emit('exchange_decide', { exchange_id: ex.id, result });
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
