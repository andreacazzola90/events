import Link from 'next/link';

export default function EstensionePage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl md:text-4xl font-bold mb-4">Installa estensione Chrome</h1>
      <p className="text-gray-300 mb-8">
        L’estensione è in modalità sviluppo e non può essere installata con un click dalla home.
        Va caricata manualmente in Chrome.
      </p>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Passi (2 minuti)</h2>
        <ol className="list-decimal list-inside space-y-3 text-gray-200">
          <li>Apri Chrome e vai su <span className="font-semibold">chrome://extensions</span></li>
          <li>Attiva <span className="font-semibold">Modalità sviluppatore</span> (in alto a destra)</li>
          <li>Clicca <span className="font-semibold">Load unpacked</span></li>
          <li>Seleziona la cartella del progetto: <span className="font-semibold">events/chrome-extension</span></li>
          <li>Apri il popup dell’estensione e imposta il tuo backend URL</li>
        </ol>
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-8">
        <h2 className="text-xl font-semibold mb-3">Dopo l’installazione</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-300">
          <li>Fai login nel popup con email/password del sito</li>
          <li>Carica una immagine oppure seleziona un’area della pagina</li>
          <li>Estrai i dati e crea l’evento</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        <a href="chrome://extensions" className="btn btn-primary">
          Apri chrome://extensions
        </a>
        <Link href="/" className="btn btn-outline">
          Torna alla home
        </Link>
      </div>
    </div>
  );
}
