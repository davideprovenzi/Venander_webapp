// Mappa: sfondo, modifica, caricamento e salvataggio; PA, fine turno, nebbia del Master.
// Fa parte del client (static/game/): i file condividono le variabili globali
// e vanno caricati nell'ordine di templates/index.html.

// ==========================================
// MAPPA
// ==========================================

socket.on(
    'map_update',
    (data) => {

        const oldUrl =
            currentMapUrl;

        currentMapUrl =
            data.map_url;

        mapScale =
            data.map_scale ||
            1.0;

        mapDx =
            data.map_dx ||
            0;

        mapDy =
            data.map_dy ||
            0;

        window.fowEnabled =
            data.fow_enabled ||
            false;

        window.revealedHexes =
            new Set(
                data.revealed_hexes ||
                []
            );

        window.fowVersion =
            (window.fowVersion || 0) + 1;

        const fowBtn =
            document.getElementById(
                'btn-toggle-fow'
            );

        if (fowBtn) {

            fowBtn.innerText =
                window.fowEnabled

                    ? "☁️ Disattiva Fog of War"

                    : "☁️ Attiva Fog of War";

            fowBtn.style.background =
                window.fowEnabled

                    ? "#27ae60"

                    : "#8e44ad";
        }

        if (currentMapUrl) {

            if (
                currentMapUrl !== oldUrl ||
                !bgImage
            ) {

                bgImage =
                    new Image();

                bgImage.onload =
                    () => {

                        requestRender();
                    };

                bgImage.src =
                    currentMapUrl;

            } else {

                requestRender();
            }

        } else {

            bgImage =
                null;

            requestRender();
        }
    }
);

// ==========================================
// MODIFICA MAPPA
// ==========================================

window.isEditingMap = false;
window.mapDragAction = null;

window.mapStartParams = {
    dx: 0,
    dy: 0,
    scale: 1
};

window.mapMouseStart = {
    x: 0,
    y: 0
};

document.getElementById(
    'toggle-map-edit-btn'
)?.addEventListener(
    'click',
    () => {

        if (
            !isMaster ||
            !bgImage
        ) {

            alert(
                "Carica prima una mappa per poterla modificare!"
            );

            return;
        }

        window.isEditingMap =
            !window.isEditingMap;

        const btn =
            document.getElementById(
                'toggle-map-edit-btn'
            );

        if (
            window.isEditingMap
        ) {

            btn.style.background =
                '#e74c3c';

            btn.innerText =
                '✅ Fine Modifica Sfondo';

            canvas.style.cursor =
                'move';

        } else {

            btn.style.background =
                '#8e44ad';

            btn.innerText =
                '📐 Modalità Muovi e Ridimensiona';

            canvas.style.cursor =
                'pointer';

            socket.emit(
                'set_map',
                {
                    url:
                        currentMapUrl,

                    scale:
                        mapScale,

                    dx:
                        mapDx,

                    dy:
                        mapDy
                }
            );
        }

        requestRender();
    }
);

// ==========================================
// CARICAMENTO MAPPA
// ==========================================

document.getElementById(
    'map-file-input'
)?.addEventListener(
    'change',
    (e) => {

        if (!isMaster) {
            return;
        }

        const file =
            e.target.files[0];

        if (!file) {
            return;
        }

        const reader =
            new FileReader();

        reader.onload =
            function(evt) {

                socket.emit(
                    'set_map',
                    {
                        url:
                            evt.target.result,

                        scale:
                            1.0,

                        dx:
                            0,

                        dy:
                            0
                    }
                );

                const scaleInput =
                    document.getElementById(
                        'map-scale'
                    );

                const dxInput =
                    document.getElementById(
                        'map-dx'
                    );

                const dyInput =
                    document.getElementById(
                        'map-dy'
                    );

                if (scaleInput) {

                    scaleInput.value =
                        "1.0";
                }

                if (dxInput) {

                    dxInput.value =
                        "0";
                }

                if (dyInput) {

                    dyInput.value =
                        "0";
                }
            };

        reader.readAsDataURL(
            file
        );
    }
);

// ==========================================
// SALVA MAPPA MANUALMENTE
// ==========================================

document.getElementById(
    'set-map-btn'
)?.addEventListener(
    'click',
    () => {

        if (!isMaster) {
            return;
        }

        const scale =
            parseFloat(
                document.getElementById(
                    'map-scale'
                ).value
            ) || 1.0;

        const dx =
            parseInt(
                document.getElementById(
                    'map-dx'
                ).value
            ) || 0;

        const dy =
            parseInt(
                document.getElementById(
                    'map-dy'
                ).value
            ) || 0;

        socket.emit(
            'set_map',
            {
                url:
                    currentMapUrl,

                scale:
                    scale,

                dx:
                    dx,

                dy:
                    dy
            }
        );
    }
);

document.getElementById(
    'clear-map-btn'
)?.addEventListener(
    'click',
    () => {

        if (!isMaster) {
            return;
        }

        const input =
            document.getElementById(
                'map-file-input'
            );

        if (input) {

            input.value =
                "";
        }

        socket.emit(
            'set_map',
            {
                url: ""
            }
        );
    }
);

// ==========================================
// PA
// ==========================================

socket.on(
    'sync_pa',
    (data) => {

        window.playersPa[
            data.char_id
        ] =
            data.pa;

        // Valore autorevole del server per il personaggio di turno
        const currentActor =
            combatState.turn_order?.[combatState.current_index];

        if (currentActor && Number(currentActor.id) === Number(data.char_id)) {
            window.currentPaMov = data.pa;
            const paEl = document.getElementById('ui-pa-mov');
            if (paEl) paEl.innerText = data.pa;
        }

        renderTurnOrderList();
        requestRender();
    }
);

// ==========================================
// FINE TURNO
// ==========================================

document.getElementById(
    'btn-next-turn'
)?.addEventListener(
    'click',
    () => {

        if (!isMaster) {

            if (
                confirm(
                    "Vuoi davvero terminare il tuo turno? (Verranno applicati eventuali danni e scalati gli effetti)"
                )
            ) {

                socket.emit(
                    'next_turn'
                );
            }

        } else {

            socket.emit(
                'next_turn'
            );
        }
    }
);

// ==========================================
// FOG OF WAR MASTER
// ==========================================

window.toggleFogOfWar =
    function() {

        const turningOn =
            !window.fowEnabled;

        socket.emit(
            'toggle_global_fow',
            {
                enabled:
                    turningOn
            }
        );

        if (turningOn) {

            let initialHexes =
                [];

            characters.forEach(
                c => {

                    if (
                        c.role !==
                        'master'
                        &&
                        !c.is_hidden
                    ) {

                        // Solo ciò che la pedina vede davvero (muri e fumo bloccano)
                        initialHexes.push(
                            ...getHexesInRadius(
                                c.x,
                                c.y,
                                VISION_RADIUS
                            ).filter(h => {
                                const [col, row] = h.split(',').map(Number);
                                return hasLineOfSight(c.x, c.y, col, row);
                            })
                        );
                    }
                }
            );

            const uniqueHexes =
                [
                    ...new Set(
                        initialHexes
                    )
                ];

            if (
                uniqueHexes.length >
                0
            ) {

                socket.emit(
                    'reveal_hexes',
                    {
                        hexes:
                            uniqueHexes
                    }
                );
            }
        }
    };

socket.on(
    'update_fow_hexes',
    (data) => {

        if (
            window.fowEnabled
        ) {

            window.revealedHexes =
                new Set(
                    data
                );

            window.fowVersion =
                (window.fowVersion || 0) + 1;

            requestRender();
        }
    }
);
