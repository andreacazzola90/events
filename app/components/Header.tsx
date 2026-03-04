"use client";
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { TransitionLink } from './TransitionLink';

export default function Header() {
    const pathname = usePathname() || '';
    const [mobileOpen, setMobileOpen] = useState(false);
    const { data: session } = useSession();

    // Body scroll lock when mobile menu is open
    useEffect(() => {
        if (mobileOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [mobileOpen]);

    const navLinks = [
        { href: '/eventi', label: 'Eventi' },
        { href: '/mappa', label: 'Mappa' },
        { href: '/tutti-gli-eventi', label: 'Calendario' },
        { href: session ? '/account' : '/auth', label: 'Profilo' },
    ];

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 border-b border-black/10 backdrop-blur-sm">
                <div className="editorial-container h-16 flex items-center justify-between gap-6">
                    <TransitionLink href="/" className="flex items-baseline gap-2 no-underline hover:no-underline">
                        <span className="text-xl font-black tracking-tight text-black uppercase">EventScanner</span>
                        <span className="hidden sm:inline text-[11px] font-semibold tracking-[0.18em] uppercase text-black/50">Bologna</span>
                    </TransitionLink>

                    <nav className="hidden md:flex items-center gap-6">
                        {navLinks.map(link => {
                            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                            return (
                                <TransitionLink
                                    key={link.href}
                                    href={link.href}
                                    className={`text-[13px] uppercase tracking-[0.12em] font-bold transition-colors no-underline hover:no-underline ${isActive
                                        ? 'text-black'
                                        : 'text-black/55 hover:text-black'
                                        }`}
                                >
                                    {link.label}
                                </TransitionLink>
                            );
                        })}
                    </nav>

                    <div className="hidden md:block">
                        <TransitionLink
                            href="/crea"
                            className="inline-flex items-center px-4 py-2 border border-black text-black text-xs uppercase tracking-[0.14em] font-bold hover:bg-black hover:text-white transition-colors no-underline hover:no-underline"
                        >
                            Crea evento
                        </TransitionLink>
                    </div>

                    <button
                        className="md:hidden inline-flex items-center justify-center w-10 h-10 border border-black/20 text-black"
                        onClick={() => setMobileOpen(v => !v)}
                        aria-label="Menu"
                    >
                        {mobileOpen ? '×' : '≡'}
                    </button>
                </div>
            </header>

            {mobileOpen && (
                <div className="md:hidden fixed inset-0 z-100 bg-white pt-16">
                    <div className="editorial-container py-6 border-b border-black/10 flex justify-between items-center">
                        <span className="text-sm font-black uppercase tracking-[0.15em]">Menu</span>
                        <button
                            className="w-10 h-10 border border-black/20 text-black"
                            onClick={() => setMobileOpen(false)}
                        >
                            ×
                        </button>
                    </div>

                    <nav className="editorial-container py-8 flex flex-col gap-6">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                            return (
                                <TransitionLink
                                    key={link.href}
                                    href={link.href}
                                    className={`text-2xl font-black uppercase tracking-tight no-underline hover:no-underline ${isActive
                                        ? 'text-black'
                                        : 'text-black/50 hover:text-black'
                                        }`}
                                    onClick={() => setMobileOpen(false)}
                                >
                                    {link.label}
                                </TransitionLink>
                            );
                        })}

                        <TransitionLink
                            href="/crea"
                            className="mt-2 inline-flex items-center justify-center h-12 border border-black bg-black text-white text-sm uppercase tracking-[0.14em] font-bold no-underline hover:no-underline"
                            onClick={() => setMobileOpen(false)}
                        >
                            Crea evento
                        </TransitionLink>
                    </nav>
                </div>
            )}
        </>
    );
}
