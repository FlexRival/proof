#!/usr/bin/env bash
#
# Renderiza los iconos de la app desde `scripts/app-icons.html` a
# `assets/images/`.
#
#   bash scripts/render-app-icons.sh
#
# Usa el Chrome ya instalado en modo headless: no instala nada ni añade
# dependencias al proyecto (ni puppeteer ni playwright). Mismo enfoque que
# `render-instagram-slides.sh`.
#
# ⚠️ A diferencia de las láminas de Instagram, la salida de este script **sí
# está en git**: son los iconos que se empaquetan en el build. Aun así valen
# las mismas reglas — son ficheros **generados**, y quien manda es el HTML de
# al lado. Para cambiar la marca se toca `app-icons.html` y se vuelve a
# ejecutar esto; nunca se retoca el PNG a mano.
#
# La marca es la variante 3 de `instagram-logo.html` (anillo partido
# Power/Rival + monograma), que es la que eligió el equipo.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/scripts/app-icons.html"
OUT="$ROOT/assets/images"

# Chrome en las rutas habituales de Windows, macOS y Linux.
CHROME=""
for candidate in \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)"
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then CHROME="$candidate"; break; fi
done

if [ -z "$CHROME" ]; then
  echo "No encuentro Chrome. Instálalo o edita la lista de rutas de este script." >&2
  exit 1
fi

mkdir -p "$OUT"

# Dentro de file:// la ruta va en formato Windows cuando estamos en Git Bash.
SRC_URL="$SRC"
case "$SRC" in
  /c/*) SRC_URL="C:${SRC#/c}" ;;
esac

# id de lienzo | archivo de salida | lado en px | fondo transparente
#
# El lienzo del HTML mide siempre 1024 CSS px. Para sacar un PNG más pequeño
# se reduce el device scale factor en vez de tocar el CSS. --window-size es
# SIEMPRE 1024 porque va en px CSS y Chrome captura window-size x dsf: bajarlo
# no encoge la imagen, RECORTA el lienzo (así salió el favicon a 64x64 la
# primera vez). Con esto el favicon es
# literalmente el mismo dibujo, no una variante que se pueda desincronizar.
ASSETS="
icon|icon.png|1024|no
foreground|android-icon-foreground.png|1024|si
background|android-icon-background.png|1024|no
monochrome|android-icon-monochrome.png|1024|si
splash|splash-icon.png|1024|si
icon|favicon.png|256|no
"

count=0
while IFS='|' read -r id name px alpha; do
  [ -z "$id" ] && continue

  # 1024 CSS px de lienzo -> $px de imagen.
  dsf=$(awk -v p="$px" 'BEGIN { printf "%.6f", p / 1024 }')

  # Chrome pinta un fondo blanco opaco salvo que se le diga lo contrario.
  # 00000000 es ARGB: alfa 0, es decir, transparente de verdad.
  bg=()
  if [ "$alpha" = "si" ]; then bg=(--default-background-color=00000000); fi

  # --virtual-time-budget da margen a que baje Chakra Petch de Google Fonts
  # antes de disparar la captura; sin él la P sale con la tipografía del
  # sistema y el icono queda mal.
  "$CHROME" \
    --headless=new \
    --disable-gpu \
    --hide-scrollbars \
    --window-size=1024,1024 \
    --force-device-scale-factor="$dsf" \
    --virtual-time-budget=8000 \
    ${bg[@]+"${bg[@]}"} \
    --screenshot="$OUT/$name" \
    "file:///$SRC_URL?s=$id" >/dev/null 2>&1

  printf '  %-34s %sx%s%s\n' "$name" "$px" "$px" \
    "$([ "$alpha" = "si" ] && echo '  (transparente)' || echo '')"
  count=$((count + 1))
done <<< "$ASSETS"

echo "$count iconos en assets/images/"
