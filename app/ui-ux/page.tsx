import type { Metadata } from "next";
import { TransitionLink } from "../components/TransitionLink";
import PageHeading from "../components/PageHeading";
import { publicPageMetadata } from "../../lib/seo-metadata";

export const metadata: Metadata = publicPageMetadata({
  path: '/ui-ux',
  title: "Design system",
  description: "Palette, tipografia, spaziatura e principi d'interazione di EventScanner.",
});

const palette = [
  ["Sfondo", "--background"],
  ["Sfondo secondario", "--background-secondary"],
  ["Sfondo morbido", "--background-soft"],
  ["Testo", "--foreground"],
  ["Testo secondario", "--foreground-muted"],
  ["Inchiostro morbido", "--ink-soft"],
  ["Accento", "--accent"],
  ["Accento forte", "--accent-strong"],
  ["Accento per testo su fondo scuro", "--accent-ink"],
  ["Accento morbido", "--accent-soft"],
  ["Superficie", "--surface"],
  ["Superficie piena", "--surface-strong"],
  ["Bordo", "--line"],
];

const spacing = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20];

function RuleSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-5 border-t border-[var(--line)] py-8 md:grid-cols-[minmax(12rem,0.7fr)_1.3fr] md:gap-12 md:py-10">
      <div>
        <p className="section-kicker mb-2">{number} / Sistema</p>
        <h2 className="m-0 text-2xl font-black">{title}</h2>
      </div>
      <div className="min-w-0 text-sm leading-relaxed text-[var(--foreground-muted)]">{children}</div>
    </section>
  );
}

export default function UiUxPage() {
  return (
    <main className="page-shell">
      <div className="editorial-container">
        <PageHeading
          className="max-w-4xl"
          kicker="EventScanner / Design system"
          title="Design system"
          description={
            <>
            La guida pratica per mantenere coerenti le pagine: colori, gerarchie,
            spazi, componenti e comportamento. I token principali sono definiti in
            <code className="mx-1 bg-[var(--background-soft)] px-1.5 py-0.5 text-sm">app/globals.css</code>.
            </>
          }
          action={
          <TransitionLink href="/versioni" className="industrial-link industrial-link-primary">
            Novità del prodotto <span aria-hidden="true">↗</span>
          </TransitionLink>
          }
        />

        <RuleSection number="01" title="Palette">
          <p className="mb-5">
            Il sistema effettivo è scuro: superfici carbone leggermente differenziate,
            testo avorio e terracotta per azioni, focus e dettagli in evidenza.
            Il testo secondario non sostituisce quello principale per i contenuti
            essenziali; errori e conferme mantengono colori semantici distinti.
          </p>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {palette.map(([name, token]) => (
              <div key={token} className="flex items-center gap-3 border-t border-[var(--line)] py-3">
                <span
                  aria-hidden="true"
                  className="h-9 w-9 shrink-0 border border-[var(--line)]"
                  style={{ backgroundColor: `var(${token})` }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-[var(--foreground)]">{name}</span>
                  <code className="block break-all text-xs">{token}</code>
                </span>
              </div>
            ))}
          </div>
        </RuleSection>

        <RuleSection number="02" title="Tipografia">
          <div className="space-y-4">
            <p><strong className="text-[var(--foreground)]">Famiglia:</strong> Inter, caricata con <code>next/font</code>.</p>
            <p><strong className="text-[var(--foreground)]">Corpo:</strong> 16 px con interlinea 1.6; testo di supporto in grigio caldo.</p>
            <p><strong className="text-[var(--foreground)]">Titoli:</strong> usa <code>PageHeading</code> per il titolo principale, con gerarchia fluida.</p>
            <p className="mb-0"><strong className="text-[var(--foreground)]">Etichette:</strong> usa <code>section-kicker</code> per le sovraintestazioni.</p>
          </div>
        </RuleSection>

        <RuleSection number="03" title="Spaziatura e layout">
          <p className="mb-5">
            Usa la scala <code>--space-*</code> per distanze ripetute. Il contenuto editoriale
            usa la larghezza disponibile con gutter fluidi; intestazioni e spazi
            verticali si adattano al viewport.
          </p>
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-4">
            {spacing.map((step) => (
              <div key={step} className="border-t border-[var(--line)] py-2">
                <code className="text-[var(--foreground)]">--space-{step}</code>
                <span aria-hidden="true" className="mt-1 block h-1 max-w-full bg-[var(--accent)]" style={{ width: `var(--space-${step})` }} />
              </div>
            ))}
          </div>
        </RuleSection>

        <RuleSection number="04" title="Superfici e controlli">
          <div className="surface-panel space-y-4 p-5">
            <p className="m-0"><code>surface-panel</code> raggruppa contenuti correlati. Usa <code>btn</code> per i comandi e <code>industrial-link</code> per i collegamenti editoriali. Mantieni almeno 44 px per le azioni principali.</p>
            <div className="flex flex-wrap gap-3">
              <TransitionLink href="/eventi" className="btn btn-primary">Sfoglia gli eventi</TransitionLink>
              <TransitionLink href="/mappa" className="btn btn-outline">Apri la mappa</TransitionLink>
            </div>
            <p className="m-0">Usa ritagli stabili e dimensioni esplicite per le immagini. La mappa e i dialoghi operativi possono avere superfici dedicate, ma conservano focus, etichette e feedback coerenti.</p>
          </div>
        </RuleSection>

        <RuleSection number="05" title="Motion e accessibilità">
          <ul className="m-0 list-none space-y-3 p-0">
            <li>Preferisci transizioni brevi e feedback leggibile; gli hover possono sollevare leggermente le card, senza spostare il layout.</li>
            <li>Per le attese usa <code>LoadingAnimation</code> con un messaggio contestuale e un annuncio <code>role="status"</code>; le scansioni mantengono animazione e messaggi dedicati.</li>
            <li>Rispetta <code>prefers-reduced-motion</code>: gli indicatori diventano statici e le animazioni decorative si fermano.</li>
            <li>Ogni link e controllo da tastiera mostra un focus visibile terracotta di 2 px con offset.</li>
            <li>Su mobile, impila le colonne, lascia respirare i controlli e verifica che nessun testo causi overflow orizzontale.</li>
            <li>Un file ricevuto non è un evento pubblicato: durante l’elaborazione l’utente può navigare, e l’esito deve distinguere pubblicazione, revisione ed errore.</li>
          </ul>
          <div className="surface-panel mt-4 space-y-2 p-4">
            <p className="m-0"><strong className="text-[var(--foreground)]">Attesa:</strong> Caricamento del calendario…</p>
            <p className="m-0"><strong className="text-[var(--foreground)]">Vuoto:</strong> Nessun evento per questa data.</p>
            <p className="m-0"><strong className="text-[var(--foreground)]">Errore:</strong> Non è stato possibile caricare il calendario. Riprova.</p>
          </div>
        </RuleSection>
      </div>
    </main>
  );
}