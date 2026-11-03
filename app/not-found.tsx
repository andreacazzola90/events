import type { Metadata } from 'next';
import Link from 'next/link';
import PageHeading from './components/PageHeading';

export const metadata: Metadata = {
  title: 'Pagina non trovata',
  robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
};

export default function NotFound() {
  return (
    <main className="page-shell">
      <div className="editorial-container py-12">
        <PageHeading
          kicker="404"
          title="Pagina non trovata"
          description="Questo contenuto non esiste o non e piu disponibile."
        />
        <Link href="/eventi" className="industrial-link industrial-link-outline">Eventi</Link>
      </div>
    </main>
  );
}