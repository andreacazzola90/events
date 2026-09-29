export const releaseNotes = [
  {
    version: "0.3.4",
    date: "28 settembre 2026",
    title: "Contenuti principali più immediati su mobile",
    groups: [
      {
        label: "Eventi e home",
        items: [
          "Compattato l'hero mobile per mostrare prima la selezione eventi.",
          "Aggiunta la ricerca sempre visibile nella pagina Eventi; filtri avanzati raccolti nel pannello dedicato.",
          "Ridotte le descrizioni secondarie nelle card mobile per dare priorità a titolo, data e luogo.",
        ],
      },
      {
        label: "Creazione evento",
        items: [
          "Ridotti testi e spazi introduttivi per portare subito in vista caricamento locandina e importazione link.",
          "Semplificato e localizzato il picker immagini per fotocamera e galleria.",
        ],
      },
    ],
  },
  {
    version: "0.3.3",
    date: "28 settembre 2026",
    title: "Esperienza mobile app-like",
    groups: [
      {
        label: "Navigazione mobile",
        items: [
          "Aggiunta una barra inferiore persistente con accesso diretto a Eventi, Mappa, Crea, Calendario e Profilo.",
          "Introdotte icone outline essenziali con etichette sempre visibili e stati di selezione chiari.",
          "Adattati header, contenuti e footer alle safe area di iPhone e alle aree di navigazione Android.",
        ],
      },
      {
        label: "PWA e mappa",
        items: [
          "Reso azionabile il prompt di installazione PWA dal pulsante nell'header.",
          "Migliorata la leggibilità e la disposizione della legenda mappa sui telefoni.",
        ],
      },
    ],
  },
  {
    version: "0.3.2",
    date: "28 settembre 2026",
    title: "Caricamento più rapido delle pagine",
    groups: [
      {
        label: "Performance",
        items: [
          "Rimosso il geocoding remoto dal caricamento delle liste: gli eventi vengono geocodificati quando sono creati.",
          "La home richiede al server solo gli eventi dell'intervallo selezionato, invece di scaricare l'intera lista per filtrarli nel browser.",
          "La mappa riutilizza la cache CDN degli eventi e non forza più richieste uniche a ogni apertura.",
          "Abilitati AVIF e WebP e una cache di 24 ore per le immagini ottimizzate.",
        ],
      },
    ],
  },
  {
    version: "0.3.1",
    date: "28 settembre 2026",
    title: "Condivisione immagini da altre app",
    groups: [
      {
        label: "PWA e condivisione",
        items: [
          "Completato il flusso Web Share Target per ricevere screenshot e immagini Android.",
          "Le immagini condivise vengono conservate temporaneamente sul dispositivo e rimosse dopo il recupero, con scadenza automatica dopo 24 ore.",
          "Aggiornato il service worker per attivare la nuova gestione della condivisione.",
        ],
      },
    ],
  },
  {
    version: "0.3.0",
    date: "28 settembre 2026",
    title: "Navigazione, eventi e area personale",
    groups: [
      {
        label: "Navigazione",
        items: [
          "Rinnovato il menu mobile con apertura animata, collegamento attivo evidenziato e chiusura accessibile con Escape.",
          "Raffinati gli stati hover e focus della navigazione desktop.",
        ],
      },
      {
        label: "Eventi e calendario",
        items: [
          "Uniformate le card evento con accento terracotta, immagini animate e comparsa progressiva.",
          "Ridisegnato il calendario mensile con navigazione, giorno corrente ed eventi più leggibili anche su mobile.",
        ],
      },
      {
        label: "Profilo",
        items: [
          "Allineati profilo, schede account, eventi creati e preferiti al tema editoriale.",
          "Localizzate in italiano le principali etichette della pagina profilo.",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    date: "28 settembre 2026",
    title: "Sistema visivo e documentazione",
    groups: [
      {
        label: "UI/UX",
        items: [
          "Estesa la palette editoriale a dettaglio evento, mappa, creazione evento e accesso.",
          "Uniformati spaziature, superfici, bordi e stati interattivi delle pagine aggiornate.",
          "Aggiunte le regole UI/UX consultabili dal footer, con colori, tipografia, layout, motion e accessibilità.",
        ],
      },
      {
        label: "Navigazione e versioni",
        items: [
          "Aggiunti i collegamenti a Regole UI/UX e Novità e versioni nel footer.",
          "Mostrato nel footer il numero di versione letto dai metadati del progetto.",
          "Aggiunta la pagina con la cronologia delle novità del prodotto.",
        ],
      },
    ],
  },
] as const;