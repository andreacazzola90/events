---
title: 'Compattare la UI mobile e PWA'
type: 'feature'
created: '2026-09-26'
status: 'done'
baseline_commit: 'cd75e8a4df019a21155b81b8df96b022e9b9a38a'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Su schermi piccoli, spaziature generose e contenuti verticali poco densi fanno scorrere troppo la pagina e lasciano spazio inutilizzato, soprattutto nelle viste degli eventi.

**Approach:** Rendere più compatte le viste mobile/PWA principali — home, navigazione, liste e calendario — con una gerarchia leggibile, controlli chiari e un linguaggio grafico minimale, monocromatico, industriale ed elegante. Mantenere invariati contenuti, funzioni e comportamento desktop.

## Boundaries & Constraints

**Always:** Conservare accessibilità, contrasto, target touch, contenuti e funzioni esistenti. Limitare le riduzioni di spaziatura ai breakpoint mobile; mantenere un ritmo tipografico leggibile e prevenire overflow orizzontale.

**Ask First:** Modifiche a funzionalità, struttura dei contenuti o look desktop.

**Never:** Rimuovere informazioni, controlli, immagini o funzionalità per guadagnare spazio; introdurre dipendenze o cambiare il comportamento dei filtri e della navigazione.

</frozen-after-approval>

## Code Map

- `app/globals.css` -- stili globali e breakpoint responsive condivisi, inclusa base PWA/safe-area.
- `app/page.tsx` -- gerarchia e spaziatura della home.
- `app/components/Header.tsx` -- barra e menu mobile condivisi.
- `app/components/EventList.tsx` -- filtri, card e griglie usati dalle viste evento.
- `app/eventi/page.tsx` -- pagina elenco completo.
- `app/tutti-gli-eventi/page.tsx` -- calendario mensile, celle e comandi.

## Tasks & Acceptance

**Execution:**
- [x] `app/globals.css`, `app/page.tsx` -- compattare padding e distanze verticali della home solo su mobile, conservando gerarchia e call-to-action.
- [x] `app/components/Header.tsx` -- ridurre gli spazi del menu mobile senza ridurre l’area interattiva dei controlli o alterarne la navigazione.
- [x] `app/components/EventList.tsx`, `app/eventi/page.tsx` -- rendere filtri e card più densi sui piccoli schermi, mantenendo testo leggibile, contenuti completi e controlli accessibili.
- [x] `app/tutti-gli-eventi/page.tsx` -- adattare spazi e comandi del calendario ai viewport stretti senza tagliare date o eventi.
- [x] `app/globals.css`, `app/page.tsx`, `app/components/Header.tsx`, `app/components/EventList.tsx`, `app/eventi/page.tsx`, `app/tutti-gli-eventi/page.tsx` -- verificare coerenza visiva, responsività e assenza di regressioni desktop.

**Acceptance Criteria:**
- Given un viewport mobile/PWA tra 320 e 430 px, when si visitano home, lista e calendario, then contenuti e controlli occupano lo spazio disponibile con spaziature più compatte, testo leggibile e senza overflow orizzontale.
- Given il menu mobile chiuso o aperto, when si usa la navigazione e si toccano i controlli, then etichette e aree interattive restano accessibili e le azioni esistenti funzionano.
- Given un viewport desktop, when si visualizzano le stesse pagine, then layout e spaziature desktop non subiscono variazioni intenzionali.
- Given date o descrizioni lunghe nelle card e nel calendario, when vengono renderizzate su mobile, then le informazioni restano raggiungibili e non si sovrappongono ad altri elementi.

## Verification

**Commands:**
- `npx eslint app/page.tsx app/components/Header.tsx app/eventi/page.tsx app/tutti-gli-eventi/page.tsx` -- superato.
- `npx eslint app/components/EventList.tsx` -- bloccato da un errore preesistente `react-hooks/immutability` su `filterEvents` prima della dichiarazione; non toccato dall'intervento.
- `npm run build` -- compilazione e TypeScript superati; raccolta dati interrotta perché `DATABASE_URL` non è configurata nell'ambiente.

**Manual checks:**
- Verificare home, menu, lista e calendario a 320 px e 390 px: leggibilità, densità, target touch e assenza di overflow.
- Controllo responsive a 320 px, 390 px e desktop; `git diff --check` superato.

## Suggested Review Order

**Fondazioni responsive**

- Le utility mobile limitano wrapping e target touch al solo breakpoint stretto.
  [`globals.css:723`](../../../app/globals.css#L723)

- La home riduce il ritmo verticale mantenendo inalterata la composizione desktop.
  [`page.tsx:5`](../../../app/page.tsx#L5)

**Navigazione e lista**

- Il menu compatta gli spazi mantenendo controlli mobili da 44 px.
  [`Header.tsx:109`](../../../app/components/Header.tsx#L109)

- Filtri e card preservano contenuti e leggibilità in una griglia più densa.
  [`EventList.tsx:373`](../../../app/components/EventList.tsx#L373)

- L’intestazione della raccolta applica la stessa densità solo sui piccoli viewport.
  [`page.tsx:4`](../../../app/eventi/page.tsx#L4)

**Calendario**

- I comandi del mese restano accessibili e compatti senza alterare il desktop.
  [`page.tsx:104`](../../../app/tutti-gli-eventi/page.tsx#L104)

- Le celle e gli eventi evitano sovrapposizioni nelle larghezze più strette.
  [`page.tsx:175`](../../../app/tutti-gli-eventi/page.tsx#L175)
