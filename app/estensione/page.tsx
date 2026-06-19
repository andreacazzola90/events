import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Installa estensione Chrome o PWA",
  description:
    "Installa EventScanner come estensione Chrome o come app PWA sul tuo telefono. Aggiungi facilmente eventi da Schio e dall'Alto Vicentino in pochi clic.",
  keywords: [
    "eventscanner estensione chrome",
    "eventscanner pwa",
    "aggiungere eventi schio",
    "eventi alto vicentino app",
  ],
  alternates: {
    canonical: "https://events-scanner.vercel.app/estensione",
  },
  openGraph: {
    title: "Installa EventScanner | Estensione Chrome o PWA",
    description:
      "Aggiungi eventi da Schio e dall'Alto Vicentino in pochi clic con l'estensione Chrome o l'app PWA di EventScanner.",
    url: "https://events-scanner.vercel.app/estensione",
  },
};

export default function EstensionePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 md:py-14">
      <h1 className="text-3xl md:text-5xl font-bold mb-4 text-black">
        Installa estensione Chrome o PWA
      </h1>
      <p className="text-black/70 mb-8 text-base md:text-lg">
        Qui trovi i passaggi per installare EventScanner sul browser (estensione
        Chrome) oppure come app sul telefono/desktop (PWA), e come usarlo per
        creare eventi in pochi minuti.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-6">
          <h2 className="text-xl font-semibold mb-4 text-black">
            Opzione 1: Estensione Chrome
          </h2>
          <ol className="list-decimal list-inside space-y-3 text-black/75">
            <li>
              Apri Chrome e vai su{" "}
              <span className="font-semibold text-black">
                chrome://extensions
              </span>
            </li>
            <li>
              Attiva{" "}
              <span className="font-semibold text-black">
                Modalita sviluppatore
              </span>{" "}
              in alto a destra
            </li>
            <li>
              Clicca{" "}
              <span className="font-semibold text-black">Load unpacked</span>
            </li>
            <li>
              Seleziona la cartella{" "}
              <span className="font-semibold text-black">
                events/chrome-extension
              </span>
            </li>
            <li>
              Apri il popup dell&apos;estensione e imposta backend URL + login
            </li>
          </ol>
        </div>

        <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-6">
          <h2 className="text-xl font-semibold mb-4 text-black">
            Opzione 2: PWA (app installabile)
          </h2>
          <ol className="list-decimal list-inside space-y-3 text-black/75">
            <li>Apri EventScanner da Chrome, Edge o Safari</li>
            <li>
              Premi{" "}
              <span className="font-semibold text-black">Installa app</span> dal
              prompt o dal menu del browser
            </li>
            <li>
              Su iPhone: condividi e scegli{" "}
              <span className="font-semibold text-black">
                Aggiungi alla schermata Home
              </span>
            </li>
            <li>Apri la nuova app e fai login con il tuo account</li>
            <li>
              Da app puoi creare eventi, salvare preferiti e usare la
              condivisione immagini
            </li>
          </ol>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-3 text-black">
          Come funziona dopo l&apos;installazione
        </h2>
        <ul className="list-disc list-inside space-y-2 text-black/75">
          <li>Fai login una volta sola (estensione o PWA)</li>
          <li>Carica una immagine o una locandina evento</li>
          <li>Il sistema estrae data, luogo, titolo e dettagli principali</li>
          <li>Controlla i campi e conferma la creazione evento</li>
          <li>
            Puoi modificare l&apos;evento in seguito dalla tua area account
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        <a href="chrome://extensions" className="btn btn-primary">
          Apri chrome://extensions
        </a>
        <Link href="/crea" className="btn btn-outline">
          Vai a Crea evento
        </Link>
        <Link href="/" className="btn btn-outline">
          Torna alla home
        </Link>
      </div>
    </div>
  );
}
