---
title: 'Navigazione Rassegne e gestione admin'
type: 'feature'
created: '2026-10-14'
status: 'done'
route: 'one-shot'
---

# Navigazione Rassegne e gestione admin

## Intent

**Problem:** Il catalogo pubblico delle rassegne esiste ma non è raggiungibile dalla navigazione principale; l’accesso admin alla gestione non è evidente dal catalogo.

**Approach:** Aggiungere Rassegne alla navigazione desktop e mobile, mantenere il layout mobile su una sola riga e mostrare agli admin un collegamento alla gestione già protetta.

## Suggested Review Order

**Navigazione**

- La voce condivisa alimenta sia il menu desktop sia la barra mobile.
  [Header.tsx:50](../../app/components/Header.tsx#L50)

- Il numero di colonne si adatta ai link presenti senza mandare voci a capo.
  [Header.tsx:152](../../app/components/Header.tsx#L152)

- La griglia mobile mantiene sei elementi su una riga come fallback CSS.
  [globals.css:616](../../app/globals.css#L616)

**Gestione admin**

- Il catalogo mostra il collegamento alla gestione soltanto agli admin autenticati.
  [page.tsx:21](../../app/rassegne/page.tsx#L21)
