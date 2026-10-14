---
title: 'Copertina a piena larghezza e categoria sovrapposta'
type: 'bugfix'
created: '2026-10-14'
status: 'done'
route: 'one-shot'
---

# Copertina a piena larghezza e categoria sovrapposta

## Intent

**Problem:** Su desktop una regola responsive limitava la copertina a 128 px; la categoria era nel corpo della scheda invece che dentro l'immagine.

**Approach:** Rimuovere il limite di larghezza, mantenere object-cover e spostare la categoria nell'angolo inferiore sinistro della copertina. Badge compatti sui piccoli schermi evitano sovrapposizioni con il prezzo. Verificati layout a 320, 390 e 1440 px, caricamento immagine, posizione categoria, separazione prezzo e titolo. ESLint e controllo diff superati; revisione mirata senza regressioni concrete. Nessun commit o pubblicazione.

## Suggested Review Order

1. [Stile della copertina](../../app/globals.css#L1047): larghezza completa a tutti i breakpoint.
2. [Badge e immagine](../../app/components/EventList.tsx#L726): categoria dentro la copertina, separata dal prezzo, con dimensioni responsive.