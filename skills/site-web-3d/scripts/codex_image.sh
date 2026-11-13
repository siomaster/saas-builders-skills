#!/usr/bin/env bash
# Génère une image avec ChatGPT via Codex CLI, en arrière-plan.
# Usage : codex_image.sh <dossier_projet> <chemin_relatif_sortie> "<prompt>" [image_reference]
# Le journal est écrit dans <dossier_projet>/.gen/<nom_sortie>.log
set -euo pipefail
PROJECT="$1"; OUT="$2"; PROMPT="$3"; REF="${4:-}"
mkdir -p "$PROJECT/.gen" "$PROJECT/$(dirname "$OUT")"
LOG="$PROJECT/.gen/$(basename "$OUT").log"
FULL="Utilise ton outil de génération d'images (image_gen) pour créer UNE seule image, puis copie le fichier généré exactement à ce chemin : $OUT . Ne fais rien d'autre (pas de lecture de fichiers inutile, pas de vérification). Réponds seulement avec le chemin. Image : $PROMPT"
ARGS=(exec --skip-git-repo-check -s workspace-write -C "$PROJECT" "$FULL")
if [ -n "$REF" ]; then
  # La référence doit être dans le projet (sandbox) ; le prompt passe AVANT -i (sinon -i l'avale)
  mkdir -p "$PROJECT/.gen/ref"
  cp "$REF" "$PROJECT/.gen/ref/$(basename "$REF")"
  ARGS+=(-i ".gen/ref/$(basename "$REF")")
fi
nohup codex "${ARGS[@]}" > "$LOG" 2>&1 < /dev/null &
echo "Génération lancée (pid $!) → $OUT · journal : $LOG"
