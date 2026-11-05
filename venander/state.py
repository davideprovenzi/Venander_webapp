"""Stato in memoria del processo: combattimento, attacchi in attesa, sessioni.

Si perde al riavvio del server. Le liste e i dizionari vanno modificati sul
posto (clear/update, [:] =), mai riassegnati: gli altri moduli li importano
e terrebbero la copia vecchia.

Scambio d'attacco: il difensore risponde attaccando, i due tirano d20 +
velocità/10 e chi vince attacca. Mira: per sparare bisogna prima mirare; la
mira resta finché qualcosa non la spezza.
"""



pending_attacks = {}

pending_combat_results = {}

master_sids = set()

client_roles = {}

client_character_ids = {}

combat_state = {
    "is_active": False,
    "turn_order": [],
    "current_index": 0,
    "epicenter": {"x": 0, "y": 0},
    "players_pa": {},  # Dizionario per memorizzare i PA dei giocatori
    "players_limbs":{},
    # Interruzioni da Minacciare in attesa: la prima è quella in corso
    "interrupts": []
}

# Aree minacciate. Separate da combat_state perché quelle degli NPC
# le vede solo il Master (combat_state viene inviato a tutti).
combat_threats = []

# Effetti delle superfici in attesa della decisione del Master
pending_surface_prompts = {}

# Riposo lungo in preparazione: {char_id: indice della fiala nello zaino, oppure None = rifiutata}
long_rest_choices = {}

pending_explosions = {}

pending_exchanges = {}

combat_aims = []
