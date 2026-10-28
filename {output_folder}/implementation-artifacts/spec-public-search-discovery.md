---
title: 'Indicizzabilita pubblica, eventi strutturati e condivisione social'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_commit: 'a58324aaee8995b5988c87310151ea4f7f5f3eb8'
context: []
---

<frozen-after-approval reason="Utente richiede ottimizzazione completa e delega le decisioni in sua assenza">

## Intent

**Problem:** Dominio SEO fisso, canonical ereditati dalla home, sitemap incompleta e assenza di dati Event strutturati rendono meno affidabile la scoperta delle pagine pubbliche da motori e chatbot.

**Approach:** Unificare dominio configurabile, canonical per pagina, metadati social, JSON-LD veritiero e discovery server-rendered. Aggiornare sitemap, robots e un indice llms.txt accessibile senza JavaScript, senza promettere indicizzazione, rich result o citazioni AI.

## Boundaries & Constraints

**Always:** Indicizzabili solo pagine e dati pubblici. Account, autenticazione, amministrazione, cron, bozze, API operative e modifica eventi esclusi dalla ricerca. Conservare permessi e controlli esistenti: robots non e autenticazione. Fonte dominio NEXT_PUBLIC_SITE_URL; in assenza mantenere events-scanner.vercel.app, non migrare arbitrariamente il sito. Date e prezzi devono riflettere esclusivamente i dati disponibili. JSON-LD escapato per prevenire script injection. Canonical identico a URL di sitemap e condivisione. Anteprime social con immagine pubblica o fallback coerente.

**Ask First:** Cambio del dominio definitivo, nuove credenziali Search Console/Bing/Vercel, pubblicazione, deploy, mutazioni dati, generazione o arricchimento AI dei contenuti.

**Never:** Rendere pubbliche aree private, inventare orari/prezzi/luoghi/organizzatori o recensioni, creare pagine doorway o keyword stuffing, presentare llms.txt come standard che garantisce ranking. Nessuna modifica a segreti o schema DB. Non annullare modifiche preesistenti a versione e immagini.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pagina pubblica | Home, elenchi, mappa, rassegne, estensione, novita | Titolo/descrizione/canonical distinti e link accessibili | Nessun canonical ereditato erroneamente dalla home |
| Evento | Record esistente | HTML leggibile, Event e breadcrumb, OG/Twitter coerenti | Omettere campi sconosciuti |
| Slug alternativo | ID valido con titolo vecchio | URL canonico attuale senza duplicati | Redirect permanente se appropriato |
| Data incompleta | Data valida senza ora, prezzo generico | Data senza ora inventata, nessuna offerta numerica inventata | Non dichiarare idoneita rich result se mancano requisiti |
| Contenuto ostile | Testo con chiusura script | JSON-LD serializzato sicuro | Nessuna esecuzione HTML |
| Rassegna privata | Non pubblicata | Nessuna voce in sitemap o discovery | Non esporre titolo o dati |
| Crawler | Google/Bing e crawler ricerca AI | Robots, sitemap e contenuti pubblici accessibili | Nessun bypass autenticazione |
| Preview | Ambiente Vercel non produzione | noindex per evitare copie pubbliche | Non cambiare canonical dominio produzione |
| DB non disponibile | Discovery dinamica | Fallback statico documentato | Nessun errore con segreti nei log |

</frozen-after-approval>

## Code Map

- `lib/site-url.ts`: origine HTTPS unica configurabile.
- `app/layout.tsx` e layout/pagine pubbliche: metadati ereditati e override per route.
- `app/events/[slug]/page.tsx`: scheda evento pubblica, canonical e dati strutturati.
- `app/sitemap.ts`, `public/robots.txt`: discovery attuale da aggiornare.
- Nuova route llms.txt e helper SEO: descrizione pubblica e dati machine-readable.
- `lib/seo.test.mjs`: regressioni URL, metadati e serializzazione.

## Tasks & Acceptance

**Execution:**
- [x] Unificare dominio, canonical e metadati delle pagine pubbliche; escludere aree private.
- [x] Aggiungere JSON-LD Event/breadcrumb e anteprime social coerenti senza inventare dati.
- [x] Rendere reperibili elenchi ed eventi tramite HTML/link server-rendered, conservando l'esperienza interattiva.
- [x] Aggiornare sitemap, crawler e llms.txt includendo soltanto rassegne pubblicate.
- [x] Verificare HTML, JSON-LD, status, test, tipi e lint; documentare Search Console e limiti.

**Acceptance Criteria:**
- Given una pagina evento valida, when viene letta senza eseguire JavaScript, then testo, URL e dati strutturati sono disponibili.
- Given elenco pubblico e sitemap, when un crawler segue gli URL, then trova schede canoniche senza richiedere accesso utente.
- Given area privata o anteprima, when si leggono le direttive, then non viene proposta per l'indice pubblico.
- Given dati incompleti, when si produce il markup, then nessuna informazione viene fabbricata per soddisfare uno schema.

## Spec Change Log

## Verification

- Test Node focalizzati per URL, metadati, date, dati strutturati, robots e sitemap.
- TypeScript, lint mirato e controlli HTML via HTTP con crawler user-agent.
- Nessuna build completa sul server dev attivo, nessuna scrittura DB o deploy.
- Dopo deploy reale: Google Rich Results Test, Search Console, Bing Webmaster Tools e verificatori social richiedono verifica esterna; non dichiararli eseguiti localmente.

**Risultati:** 76 test Node focalizzati passati, otto test Cypress del calendario passati, TypeScript ed ESLint di tutti i file modificati puliti. HTTP locale con user agent Twitterbot: robots/sitemap/llms/immagine PNG 1200x630 rispondono 200; home, eventi, calendario, mappa, rassegne e versioni hanno canonical distinti. Home contiene quattro link evento, elenco 80, calendario 12 e fallback mappa 90 nei dati correnti senza eseguire JavaScript. Evento pubblico esistente risponde 200 con WebSite, Event e BreadcrumbList e immagine social propria. Auth e crea noindex; slug alternativo 308 verso il canonical; schede e URL mancanti 404 con noindex Google esplicito; API con header noindex. Browser controllato a larghezze 1440 e 390 senza overflow orizzontale; calendario verificato anche a 320/375/430. Nessuna scrittura DB o deploy, screenshot Cypress solo in directory temporanea.

**Limiti:** dominio definitivo non confermato dall'utente, quindi fallback preesistente conservato e override NEXT_PUBLIC_SITE_URL documentato. Record privi di indirizzo fisico preciso o altri requisiti Google non sono automaticamente idonei ai rich result; i dati mancanti non vengono inventati. La sitemap singola ha limite di 50.000 URL, con avviso e necessita di suddivisione prima di superarlo. llms.txt e supplementare e non garantisce citazioni o ranking.

## Review Findings

Tre revisioni indipendenti completate: critica del diff, casi limite e audit dei requisiti. Correzioni locali verificate:
- Normalizzazione in lettura delle date storiche supportate prima del filtro; fino a 2.000 candidati letti e 200 risultati mostrati, senza mutazioni.
- Fallimento del caricamento distinto dall'elenco vuoto, preservando il normale errore del refresh client.
- HTML noindex scansabile anche per URL gia scoperti, senza cambiare autenticazione; API operative escluse dal crawling.
- Timestamp malformati rifiutati e segnaposto non trovato omessi dai dati strutturati.
- Giorno iniziale condiviso per elenchi e calendario; calcolo della griglia stabile anche nel cambio domenica/lunedi.
- Fallback 404 con direttive esplicite per Google, senza index ereditato.

Controllate le fonti ufficiali Google Search Central su Event e funzionalita AI e i controlli crawler OpenAI. Entrambi i domini gia citati nel progetto rispondono HTTP 200: questa evidenza non determina quale debba essere il dominio preferito; nessuna migrazione o impostazione remota applicata.

## Suggested Review Order

- Dominio unico configurabile, metadata per route e serializzazione JSON-LD sicura.
	[site-url.ts](../../lib/site-url.ts)
	[seo-metadata.ts](../../lib/seo-metadata.ts)
- Dati evento veritieri, date e prezzi conservativi, slug canonico e redirect.
	[event-seo.ts](../../lib/event-seo.ts)
	[page.tsx](../../app/events/[slug]/page.tsx)
- Discovery pubblica, sitemap, noindex leggibile e indice supplementare AI.
	[sitemap.ts](../../app/sitemap.ts)
	[robots.ts](../../app/robots.ts)
	[route.ts](../../app/llms.txt/route.ts)
- Link evento nell'HTML iniziale e stato stabile server/browser.
	[public-event-list.ts](../../lib/public-event-list.ts)
	[EventList.tsx](../../app/components/EventList.tsx)
	[PublicEventsProvider.tsx](../../app/components/PublicEventsProvider.tsx)
- Regressioni e controlli da eseguire sul dominio dopo il deploy.
	[event-seo.test.mjs](../../lib/event-seo.test.mjs)
	[public-event-list.test.mjs](../../lib/public-event-list.test.mjs)
	[DEPLOY_RUNBOOK.md](../../docs/DEPLOY_RUNBOOK.md)