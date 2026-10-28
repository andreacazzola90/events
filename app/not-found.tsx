import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pagina non trovata',
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
};

export default function NotFound() {
  return (
    <main className="page-shell">
      <div className="editorial-container py-12">
        <p className="section-kicker mb-4">404</p>
        <h1 className="section-title mb-5">Pagina non trovata</h1>
        <p className="section-lead mb-6">Questo contenuto non esiste o non e piu disponibile.</p>
        <Link href="/eventi" className="industrial-link industrial-link-outline">Eventi</Link>
      </div>
    </main>
  );
}