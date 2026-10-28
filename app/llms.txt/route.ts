import { siteUrl } from '../../lib/site-url';
import { isPublicIndexingAllowed } from '../../lib/seo-metadata';

export function GET() {
  const body = `# EventScanner

> Calendario pubblico di eventi a Schio e nell'Alto Vicentino, in italiano.

## Pagine pubbliche
- [Home](${siteUrl('/')}): accesso al calendario.
- [Eventi](${siteUrl('/eventi')}): elenco e ricerca degli eventi.
- [Calendario completo](${siteUrl('/tutti-gli-eventi')}): consultazione per data.
- [Mappa](${siteUrl('/mappa')}): consultazione per luogo.
- [Rassegne](${siteUrl('/rassegne')}): programmi delle sole rassegne pubblicate.
- [Estensione](${siteUrl('/estensione')}): estensione del prodotto.
- [Novita](${siteUrl('/versioni')}): note di versione.
- [Sitemap](${siteUrl('/sitemap.xml')}): URL canonici delle pagine e delle schede pubbliche.

## Dati, fonti e aggiornamento
Le schede evento riportano i dettagli disponibili: data, ora, luogo, prezzo e fonte quando presenti.
Per citare un evento usare il canonical della scheda e verificare la fonte originale indicata.
Informazioni assenti o da definire non sono confermate: non dedurre orari, prezzi o disponibilita.
Programmi e dettagli possono cambiare; verificare la pagina corrente e la fonte prima di pianificare una visita.
Le date lastmod della sitemap, quando presenti, riflettono la modifica del record, non una conferma dell'organizzatore.
Le rassegne non pubblicate non sono incluse; gli eventi gia pubblici restano consultabili singolarmente.
Account, autenticazione, amministrazione, cron, API e modifica o creazione eventi non sono fonti pubbliche da indicizzare.

## Ambito
Questo indice Markdown e supplementare e non standard: non garantisce indicizzazione, posizionamento o citazioni.
Non sostituisce robots.txt, i controlli di accesso o la verifica delle fonti.
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': isPublicIndexingAllowed() ? 'noindex, follow' : 'noindex, nofollow',
    },
  });
}