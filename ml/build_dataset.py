# -*- coding: utf-8 -*-
"""
FASE 1 - Construccion del dataset de entrenamiento.

Como todavia no hay datos reales de estudiantes (el piloto aun no se aplica),
el dataset se construye a partir de CONOCIMIENTO EXPERTO: para cada carrera se
define un "perfil CHASIDE tipico" (que tan probable es que quien rinde en esa
carrera responda "Si" en cada una de las 7 areas), tomando como base los rasgos
caracteristicos de cada area que trae el propio manual CHASIDE. Luego se simulan
estudiantes alrededor de ese perfil (ruido individual + sesgo de "decir si a todo").

Cada estudiante sintetico = 7 puntajes enteros (0..14, cuantos "Si" tuvo en cada
area) + la carrera que lo origino (etiqueta).

LIMITACION (se declara tambien en la tesis): los perfiles los define el investigador
con criterio experto; no son datos empiricos. Con el piloto real se valida/reentrena.

Uso:  python build_dataset.py
Salida: data/dataset.csv, data/career_profiles.json
"""
import json
import os
import re

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_JS = os.path.join(HERE, "..", "js", "data.js")
OUT_DIR = os.path.join(HERE, "data")
os.makedirs(OUT_DIR, exist_ok=True)

AREAS = ["C", "H", "A", "S", "I", "D", "E"]
ITEMS_PER_AREA = 14           # 10 de interes + 4 de aptitud por area (CHASIDE)
SAMPLES_PER_CAREER = 50
SEED = 2026

# Niveles de afinidad de una carrera con un area (probabilidad de responder "Si")
P, S, T = 0.85, 0.62, 0.45    # primaria, secundaria, terciaria
BASE = 0.25                    # areas sin relacion con la carrera

# Perfil tipico por carrera: {area: nivel}. Areas no listadas = BASE.
PROFILES = {
    # C - Administrativas y Contables
    "Administración de Empresas": {"C": P, "H": S},
    "Contabilidad": {"C": P, "E": T, "I": T},
    "Marketing": {"C": P, "A": S, "H": S},
    "Negocios Internacionales": {"C": P, "H": S, "D": T},
    "Economía": {"C": P, "E": S, "H": T},
    "Administración Bancaria y Financiera": {"C": P, "E": S},
    "Recursos Humanos": {"C": P, "H": S, "S": T},
    # H - Humanisticas y Sociales
    "Derecho": {"H": P, "C": S, "D": T},
    "Educación": {"H": P, "S": S, "A": T},
    "Psicología": {"H": P, "S": S, "E": T},
    "Trabajo Social": {"H": P, "S": S, "C": T},
    "Ciencias de la Comunicación": {"H": P, "A": S, "C": T},
    "Sociología": {"H": P, "E": S, "C": T},
    "Ciencias Políticas": {"H": P, "C": S, "D": T},
    # A - Artisticas
    "Diseño Gráfico": {"A": P, "I": T, "C": T},
    "Arquitectura": {"A": P, "I": S, "E": T},
    "Diseño de Modas": {"A": P, "C": S, "H": T},
    "Artes Escénicas": {"A": P, "H": S, "S": T},
    "Música": {"A": P, "H": T, "E": T},
    "Comunicación Audiovisual": {"A": P, "H": S, "I": T},
    "Publicidad": {"A": P, "C": S, "H": S},
    # S - Medicina y Ciencias de la Salud
    "Medicina Humana": {"S": P, "E": S, "H": T},
    "Enfermería": {"S": P, "H": S},
    "Obstetricia": {"S": P, "H": S, "E": T},
    "Odontología": {"S": P, "A": T, "E": T},
    "Tecnología Médica": {"S": P, "E": S, "I": T},
    "Nutrición y Dietética": {"S": P, "E": S, "H": T},
    "Terapia Física y Rehabilitación": {"S": P, "H": S, "D": T},
    # I - Ingenieria y Computacion
    "Ingeniería de Sistemas": {"I": P, "C": S, "E": T},
    "Ingeniería Civil": {"I": P, "E": S, "C": T},
    "Ingeniería Industrial": {"I": P, "C": S, "E": T},
    "Ingeniería Electrónica": {"I": P, "E": S},
    "Ciencias de la Computación": {"I": P, "E": S, "C": T},
    "Ingeniería Mecatrónica": {"I": P, "E": S, "D": T},
    "Ciencia de Datos": {"I": P, "E": S, "C": S},
    # D - Defensa y Seguridad
    "Ciencias Militares": {"D": P, "I": T, "H": T},
    "Ciencias Navales": {"D": P, "I": S, "E": T},
    "Ciencias Aeronáuticas": {"D": P, "I": S, "E": T},
    "Ciencias Policiales": {"D": P, "H": S, "C": T},
    "Seguridad y Gestión de Riesgos": {"D": P, "C": S, "I": T},
    # E - Ciencias Exactas y Agrarias
    "Matemática": {"E": P, "I": S, "C": T},
    "Física": {"E": P, "I": S},
    "Química": {"E": P, "S": S, "I": T},
    "Biología": {"E": P, "S": S},
    "Agronomía": {"E": P, "I": T, "C": T},
    "Ingeniería Ambiental": {"E": P, "I": S, "S": T},
    "Ingeniería Zootecnista": {"E": P, "S": S, "C": T},
}


def load_careers():
    """Lee el catalogo de carreras (nombre + area principal) desde js/data.js."""
    raw = open(DATA_JS, encoding="utf-8").read()
    body = raw[raw.index("{"): raw.rindex("}") + 1]
    return json.loads(body)["careers"]


def main():
    careers = load_careers()
    names = [c["name"] for c in careers]

    # Consistencia: cada carrera del catalogo debe tener perfil, y viceversa
    missing = [n for n in names if n not in PROFILES]
    extra = [n for n in PROFILES if n not in names]
    assert not missing and not extra, f"perfiles faltantes={missing} sobrantes={extra}"
    # El area principal declarada en el catalogo debe coincidir con el nivel P
    for c in careers:
        prim = [a for a, v in PROFILES[c["name"]].items() if v == P]
        assert prim == [c["area"]], f"{c['name']}: area principal {prim} != {c['area']}"

    rng = np.random.default_rng(SEED)
    rows = []
    for c in careers:
        prof = PROFILES[c["name"]]
        proto = np.array([prof.get(a, BASE) for a in AREAS])
        for _ in range(SAMPLES_PER_CAREER):
            acquiescence = rng.normal(0, 0.07)              # sesgo de "decir si a todo"
            p = proto + acquiescence + rng.normal(0, 0.09, size=len(AREAS))
            p = np.clip(p, 0.02, 0.98)
            counts = rng.binomial(ITEMS_PER_AREA, p)         # 0..14 por area
            rows.append(list(counts) + [c["name"], c["area"]])

    df = pd.DataFrame(rows, columns=AREAS + ["carrera", "area_principal"])
    df.to_csv(os.path.join(OUT_DIR, "dataset.csv"), index=False, encoding="utf-8")

    with open(os.path.join(OUT_DIR, "career_profiles.json"), "w", encoding="utf-8") as f:
        json.dump(
            {n: {a: PROFILES[n].get(a, BASE) for a in AREAS} for n in names},
            f, ensure_ascii=False, indent=2,
        )

    print(f"Dataset: {len(df)} estudiantes sinteticos, {len(names)} carreras, "
          f"{SAMPLES_PER_CAREER} por carrera, semilla={SEED}")
    print(df[AREAS].describe().loc[["mean", "std", "min", "max"]].round(2).to_string())


if __name__ == "__main__":
    main()
