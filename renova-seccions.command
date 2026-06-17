#!/bin/bash
# renova-seccions.command — Força la renovació diària de TOTES les seccions del
# diari i en deixa l'informe a renova-seccions.log.
#
# L'executa launchd (com.sergi.bondiari-seccions) cada dia a les 6:30 obrint
# aquest fitxer amb Terminal (launchd no pot llegir ~/Documents; Terminal sí).
# També el pots executar tu amb doble clic per forçar-ho ara.

cd "$(dirname "$0")"

echo "──────── $(date '+%d-%m-%Y %H:%M') ────────" >> renova-seccions.log
node scripts/renova-seccions.mjs >> renova-seccions.log 2>&1
echo "" >> renova-seccions.log

echo "Fet. L'informe és a renova-seccions.log. Pots tancar la finestra."
