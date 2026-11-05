"""Geometria degli esagoni (righe dispari spostate, coordinate cubiche).
"""



def cube_to_offset(q, r):
    col = q + (r - (r & 1)) // 2
    return col, r


def cube_round(q, r, s):
    rq, rr, rs = round(q), round(r), round(s)
    dq, dr, ds = abs(rq - q), abs(rr - r), abs(rs - s)
    if dq > dr and dq > ds:
        rq = -rr - rs
    elif dr > ds:
        rr = -rq - rs
    return rq, rr


def hex_line(x1, y1, x2, y2):
    """Esagoni attraversati andando in linea retta da (x1,y1) a (x2,y2), estremi inclusi."""
    a = offset_to_cube(int(x1), int(y1))
    b = offset_to_cube(int(x2), int(y2))
    steps = hex_distance(x1, y1, x2, y2)

    if steps == 0:
        return [(int(x1), int(y1))]

    line = []
    for i in range(steps + 1):
        t = i / steps
        # Piccola spinta per non cadere esattamente sui bordi tra due esagoni
        q = a[0] + (b[0] - a[0]) * t + 1e-6
        r = a[1] + (b[1] - a[1]) * t + 2e-6
        s = a[2] + (b[2] - a[2]) * t - 3e-6
        line.append(cube_to_offset(*cube_round(q, r, s)))
    return line


def offset_to_cube(col, row):
    """Conversione Odd-R identica a static/utils.js."""
    q = col - (row - (row & 1)) // 2
    r = row
    s = -q - r
    return q, r, s


def hex_distance(x1, y1, x2, y2):
    a = offset_to_cube(int(x1), int(y1))
    b = offset_to_cube(int(x2), int(y2))
    return max(
        abs(a[0] - b[0]),
        abs(a[1] - b[1]),
        abs(a[2] - b[2])
    )


def hex_key(col, row):
    return f"{col},{row}"
