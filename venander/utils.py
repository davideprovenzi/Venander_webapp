"""Pulizia dei valori che arrivano dai moduli del browser.
"""



def _clean_int(value, default=None, minimum=None, maximum=None):
    if value in (None, ""):
        return default
    try:
        number = int(float(str(value).replace(",", ".")))
    except (TypeError, ValueError):
        return default
    if minimum is not None:
        number = max(minimum, number)
    if maximum is not None:
        number = min(maximum, number)
    return number


def _clean_float(value, default=None, minimum=None):
    if value in (None, ""):
        return default
    try:
        number = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return default
    if minimum is not None:
        number = max(minimum, number)
    return number


def _raw_text(raw, key, default=""):
    """Testo di un campo del modulo: null/None vale come vuoto (mai la parola "None")."""
    value = raw.get(key, default)
    return default if value is None else str(value)


def format_number(value):
    return f"{value:g}"
