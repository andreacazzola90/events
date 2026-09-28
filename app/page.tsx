import EventList from "./components/EventList";
import Link from "next/link";
import HomeMotion from "./components/HomeMotion";

export default function Home() {
  return (
    <main className="min-h-screen">
      <HomeMotion>
        <section className="home-hero">
          <div className="editorial-container">
            <div className="home-hero-top" data-hero-reveal>
              <span className="section-kicker">EventScanner / Alto Vicentino</span>
              <span className="section-kicker">La città, fuori programma — 001</span>
            </div>
            <div className="home-hero-grid">
              <div>
                <p className="home-overline" data-hero-reveal>Il tuo prossimo posto è qui.</p>
                <h1 className="home-headline" data-hero-reveal>
                  ESCI.<br />
                  <span>SCOPRI.</span><br />
                  VIVI.
                </h1>
              </div>
              <div className="home-hero-aside" data-hero-reveal>
                <span className="home-crosshair" aria-hidden="true">+</span>
                <p>
                  Concerti, mostre, incontri e posti da scoprire. Tutto quello
                  che succede intorno a te, senza rumore di fondo.
                </p>
                <div className="home-hero-actions">
                  <Link href="/eventi" className="industrial-link industrial-link-primary">
                    Esplora gli eventi <span aria-hidden="true">↗</span>
                  </Link>
                  <Link href="/mappa" className="industrial-link industrial-link-outline">
                    Apri la mappa <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </div>
            </div>
            <div className="home-hero-bottom" data-hero-reveal>
              <span>Schio / Thiene / Valdagno / Vicenza</span>
              <a href="#in-evidenza" className="home-scroll-link">
                Scorri per esplorare <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
        </section>

        <section id="in-evidenza" className="home-events">
          <div className="editorial-container">
            <div className="home-section-heading" data-scroll-reveal>
              <div>
                <p className="section-kicker">01 / Il programma</p>
                <h2>Trova il tuo <em>momento.</em></h2>
              </div>
              <p>Una selezione aggiornata ogni giorno.<br />Scegli quando, al resto pensiamo noi.</p>
            </div>
            <EventList mode="quick" />
            <div className="home-section-end" data-scroll-reveal>
              <span>Non finisce qui.</span>
              <Link href="/tutti-gli-eventi" className="industrial-link industrial-link-outline">
                Calendario completo <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </section>

        <section className="home-outro" data-scroll-reveal>
          <div className="editorial-container home-outro-inner">
            <div>
              <p className="section-kicker">02 / Fai parte della scena</p>
              <h2>Succede qualcosa?<br /><em>Fallo sapere.</em></h2>
            </div>
            <Link href="/crea" className="industrial-link industrial-link-light">
              Crea un evento <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>
      </HomeMotion>
    </main>
  );
}
