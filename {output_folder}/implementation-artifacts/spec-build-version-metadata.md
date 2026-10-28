---
title: 'Versione per commit e data della build del deploy'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_commit: 'd84226f4edcb8e2127a0ed6d093bb7d660483a9e'
context: []
---

<frozen-after-approval reason="Utente conferma e delega le decisioni in sua assenza; adottati default espliciti">

## Intent

**Problem:** Footer e pagina versioni mostrano soltanto il numero statico del progetto. Non identificano il commit in esecuzione e non indicano quando e stata costruita la versione distribuita.

**Approach:** Mostrare versione base piu hash del commit, ad esempio 0.3.4+abcdef1, e data/ora della build nel fuso Europe/Rome. Acquisire i dati durante la build, non durante la visita. Etichetta esplicita Build del deploy: non e l'istante esatto del completamento Vercel.

## Boundaries & Constraints

**Always:** Fonte unica dei metadati per footer e pagina versioni. Preferire VERCEL_GIT_COMMIT_SHA e usare Git locale come fallback. Congelare il timestamp della build in compilazione. Preservare cronologia release, stili e modifiche preesistenti. Assenza dati dichiarata, mai data fittizia.

**Ask First:** Aggiunta di credenziali Vercel, hook che creano commit o cambiano package.json, pubblicazione o deploy effettivo.

**Never:** Incrementare silenziosamente la versione semantica, creare commit aggiuntivi, mostrare la data corrente come ultimo deploy, esporre segreti. Nessuna modifica ai dati applicativi o alle copertine.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nuovo commit | Stessa release, SHA diverso | Versione visibile diversa | Nessuna modifica al manifest |
| Build Vercel | SHA fornito dal provider | Precedenza sul checkout locale | Validare formato prima di esporlo |
| Build locale | Checkout Git disponibile | SHA locale e timestamp build | Nessun comando Git al rendering |
| Sviluppo | Nessuna build distribuita | Stato sviluppo senza data deploy | Nessuna data corrente fittizia |
| Dati assenti | Git non disponibile o SHA invalido | Versione base, data eventualmente non disponibile | Build non bloccata |
| Fuso orario | Data estate/inverno | Ora italiana corretta con indicazione del fuso | Stesso risultato server/client |

</frozen-after-approval>

## Code Map

- `next.config.ts`: acquisizione metadati pubblici in fase build.
- `lib/build-info.ts`: versione e formattazione condivise.
- `app/layout.tsx`, `app/components/Footer.tsx`: versione e timestamp nel footer.
- `app/versioni/page.tsx`: stessi dati sopra la cronologia release invariata.
- `lib/build-info.test.mjs`: regressioni pure e configurazione build con dipendenze simulate.
- `docs/DEPLOY_RUNBOOK.md`: formato, date e fallback documentati.

## Tasks & Acceptance

**Execution:**
- [x] `next.config.ts` -- generare metadati una volta per build; nessuna dipendenza da API o segreti nuovi.
- [x] `lib/build-info.ts`, `lib/build-info.test.mjs` -- validare versione per commit, fuso italiano, fallback e timestamp stabile.
- [x] `app/layout.tsx`, `app/components/Footer.tsx`, `app/versioni/page.tsx` -- mostrare informazioni coerenti senza cambiare la cronologia release.
- [x] `docs/DEPLOY_RUNBOOK.md` -- documentare automazione e differenza tra build e completamento deploy.

**Acceptance Criteria:**
- Given due commit distinti, when vengono compilati, then il suffisso della versione cambia senza intervento manuale.
- Given la stessa build, when si aprono footer e pagina versioni anche dopo riavvio, then commit e timestamp rimangono identici.
- Given sviluppo locale senza build, when si consulta la versione, then non viene inventata una data di ultimo deploy.

## Spec Change Log

## Verification

- Test Node mirati per metadati e configurazione build.
- TypeScript ed ESLint dei file modificati.
- Browser desktop/mobile: footer e pagina versioni coerenti, nessun overflow.
- Nessun commit, installazione, nuova credenziale o deploy di prova.

**Risultati:** 11 test Node passati, TypeScript ed ESLint puliti. Configurazione caricata anche attraverso Next/Sentry reali: SHA corrente rilevato, timestamp generato in build e non reinserito in runtime. Controllo browser desktop/mobile eseguito senza overflow. Nessuna build completa o deploy online avviato; nessun incremento del numero release o modifica alla cronologia.

**Revisione:** tre controlli indipendenti completati (critica del diff, casi limite e audit di accettazione), senza difetti azionabili. L'integrazione con un artefatto di produzione compilato e riavviato resta da verificare al prossimo deploy reale; non viene dichiarata provata dalla sola simulazione.

## Suggested Review Order

- Metadati creati durante la build e preservati durante l'avvio.
	[next.config.ts](../../next.config.ts)
- Versione legata al commit e formattazione stabile Europe/Rome.
	[build-info.ts](../../lib/build-info.ts)
- Informazioni condivise dal layout al footer.
	[layout.tsx](../../app/layout.tsx)
- Versione corrente e data senza modificare la cronologia.
	[page.tsx](../../app/versioni/page.tsx)
- Test di configurazione, fallback e rendering delle due viste.
	[build-info.test.mjs](../../lib/build-info.test.mjs)