#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js er ikke installeret. Hent 'LTS' fra https://nodejs.org og dobbeltklik på denne fil igen."
  open https://nodejs.org
  read -p "Tryk Enter for at lukke..."
  exit 1
fi
if [ ! -d node_modules/ws ]; then
  echo "Installerer spillet - det tager under et minut første gang..."
  npm install --omit=dev || { echo "Installationen gik galt. Tjek at du er på internettet, og prøv igen."; read -p "Tryk Enter..."; exit 1; }
fi
echo "DUSKHOLD starter. Spillet åbner i din browser om et øjeblik. Luk dette vindue for at stoppe serveren."
OPEN_BROWSER=1 node server.js
read -p "Tryk Enter for at lukke..."
