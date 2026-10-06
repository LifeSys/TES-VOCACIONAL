# -*- coding: utf-8 -*-
"""
Pone un número de versión nuevo (?v=AAAAMMDDHHMM) a los .js y .css que cargan las páginas.

Así, después de publicar un cambio, los navegadores descargan los archivos nuevos en lugar de
usar los que tenían guardados (sin tener que presionar Ctrl + F5).

Uso (antes de hacer commit + push de cualquier cambio en js/ o css/):
    python herramientas/version.py
"""
import datetime
import glob
import os
import re

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
VERSION = datetime.datetime.now().strftime("%Y%m%d%H%M")
PATRON = re.compile(r'((?:src|href)="(?:js|css)/[\w.-]+\.(?:js|css))(?:\?v=\w+)?"')

for ruta in sorted(glob.glob(os.path.join(RAIZ, "*.html"))):
    texto = open(ruta, encoding="utf-8").read()
    nuevo, n = PATRON.subn(lambda m: m.group(1) + "?v=" + VERSION + '"', texto)
    if n:
        open(ruta, "w", encoding="utf-8", newline="").write(nuevo)
        print(f"{os.path.basename(ruta)}: {n} archivos -> v={VERSION}")
