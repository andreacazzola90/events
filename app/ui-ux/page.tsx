import type { Metadata } from "next";
import { TransitionLink } from "../components/TransitionLink";

export const metadata: Metadata = {
  title: "Regole UI/UX",
  description: "Palette, tipografia, spaziatura e principi d'interazione di EventScanner.",
};

const palette = [
  { name: "Sfondo", value: "#f1eee7", variable: "--background" },
  { name: "Sfondo secondario", value: "#e8e4db", variable: "--background-secondary" },
  { name: "Superficie soft", value: "#faf7f2", variable: "--background-soft" },
  { name: "Testo", value: "#1d1d1b", variable: "--foreground" },
  { name: "Testo secondario", value: "#5f5b56", variable: "--foreground-muted" },
  { name: "Inchiostro soft", value: "#2b2a28", variable: "--ink-soft" },
  { name: "Accento", value: "#d65a38", variable: "--accent" },
  { name: "Accento forte", value: "#b84b2d", variable: "--accent-strong" },
  { name: "Accento soft", value: "#f4d9d3", variable: "--accent-soft" },
  { name: "Superficie", value: "rgba(255, 255, 255, 0.82)", variable: "--surface" },
  { name: "Superficie piena", value: "#ffffff", variable: "--surface-strong" },
  { name: "Bordo", value: "rgba(29, 29, 27, 0.12)", variable: "--line" },
];

const spacing = [
  ["1", "4 px"], ["2", "8 px"], ["3", "12 px"], ["4", "16 px"],
  ["5", "20 px"], ["6", "24 px"], ["8", "32 px"], ["10", "40 px"],
  ["12", "48 px"], ["16", "64 px"], ["20", "80 px"],
];

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
    <section className="grid gap-5 border-t border-black/15 py-8 md:grid-cols-[minmax(12rem,0.7fr)_1.3fr] md:gap-12 md:py-10">
      <div>
        <p className="section-kicker mb-2">{number} / Sistema</p>
        <h2 className="m-0 text-2xl font-black text-[#1d1d1b]">{title}</h2>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default function UiUxPage() {
  return (
    <main className="page-shell">
      <div className="editorial-container">
        <header className="mb-12 max-w-4xl md:mb-16">
          <p className="section-kicker mb-4">EventScanner / Design system</p>
          <h1 className="section-title mb-5">Regole UI/UX</h1>
          <p className="section-lead mb-6">
            La guida pratica per mantenere coerenti le pagine: colori, gerarchie,
            spazi, componenti e comportamento. I token principali sono definiti in
            <code className="mx-1 bg-black/5 px-1.5 py-0.5 text-sm">app/globals.css</code>.
          </p>
          <TransitionLink href="/versioni" className="industrial-link industrial-link-primary">
            Novità del prodotto <span aria-hidden="true">↗</span>
          </TransitionLink>
        </header>

        <RuleSection number="01" title="Palette">
            <p className="mb-5 text-sm leading-relaxed text-[#5f5b56]">
            Usa i neutrali caldi per le superfici e il terracotta per azioni,
            focus e dettagli in evidenza. Il fondo pagina aggiunge un gradiente
            molto tenue; il testo secondario non sostituisce quello principale
            per i contenuti essenziali.
          </p>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {palette.map((color) => (
              <div key={color.variable} className="flex items-center gap-3 border-t border-black/10 py-3">
                <span
                  aria-label={`${color.name}: ${color.value}`}
                  className="h-9 w-9 shrink-0 border border-black/15"
                  style={{ backgroundColor: color.value }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#1d1d1b]">{color.name}</span>
                  <span className="block truncate font-mono text-xs text-[#5f5b56]">
                    {color.value} · {color.variable}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </RuleSection>

        <RuleSection number="02" title="Tipografia">
          <div className="space-y-4 text-sm leading-relaxed text-[#5f5b56]">
            <p><strong className="text-[#1d1d1b]">Famiglia:</strong> Inter, caricata con <code>next/font</code>.</p>
            <p><strong className="text-[#1d1d1b]">Corpo:</strong> 16 px con interlinea 1.6; testo di supporto in grigio caldo.</p>
            <p><strong className="text-[#1d1d1b]">Titoli:</strong> peso deciso e gerarchia netta; usare dimensioni fluide per le intestazioni principali e dimensioni compatte nei pannelli.</p>
            <p className="mb-0"><strong className="text-[#1d1d1b]">Etichette:</strong> maiuscole, peso bold e tracking ampio per kicker e comandi brevi.</p>
          </div>
        </RuleSection>

        <RuleSection number="03" title="Spaziatura e layout">
          <p className="mb-5 text-sm leading-relaxed text-[#5f5b56]">
            Usa la scala <code>--space-*</code> per distanze ripetute. Il contenuto editoriale
            resta centrato entro 1320 px; il padding orizzontale e quello verticale
            si adattano al viewport.
          </p>
          <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-4">
            {spacing.map(([token, size]) => (
              <div key={token} className="flex items-center justify-between gap-2 border-t border-black/10 py-2 text-sm">
                <code className="text-[#1d1d1b]">--space-{token}</code>
                <span className="text-[#5f5b56]">{size}</span>
              </div>
            ))}
          </div>
        </RuleSection>

        <RuleSection number="04" title="Superfici e controlli">
          <ul className="m-0 list-none space-y-3 p-0 text-sm leading-relaxed text-[#5f5b56]">
            <li><strong className="text-[#1d1d1b]">Pannelli:</strong> fondo chiaro, bordo sottile e ombra contenuta; evita pannelli annidati e sezioni trasformate in card.</li>
            <li><strong className="text-[#1d1d1b]">Ombre:</strong> <code>--shadow-card</code> per superfici ripetute, <code>--shadow-soft</code> per elevazioni più ampie; usarle con moderazione.</li>
            <li><strong className="text-[#1d1d1b]">Angoli:</strong> tema squadrato, raggio zero; le forme circolari sono riservate a indicatori e spinner.</li>
            <li><strong className="text-[#1d1d1b]">Azioni:</strong> comandi primari ad alto contrasto; CTA editoriali in terracotta. Mantieni almeno 44 px di altezza per i pulsanti principali.</li>
            <li><strong className="text-[#1d1d1b]">Immagini:</strong> usa ritagli stabili e dimensioni definite per evitare salti nel layout.</li>
          </ul>
        </RuleSection>

        <RuleSection number="05" title="Motion e accessibilità">
          <ul className="m-0 list-none space-y-3 p-0 text-sm leading-relaxed text-[#5f5b56]">
            <li>Preferisci transizioni brevi e feedback leggibile; gli hover possono sollevare leggermente le card, senza spostare il layout.</li>
            <li>Rispetta <code>prefers-reduced-motion</code>: animazioni e transizioni vengono ridotte quasi a zero.</li>
            <li>Ogni link e controllo da tastiera mostra un focus visibile terracotta di 2 px con offset.</li>
            <li>Su mobile, impila le colonne, lascia respirare i controlli e verifica che nessun testo causi overflow orizzontale.</li>
          </ul>
        </RuleSection>
      </div>
    </main>
  );
}