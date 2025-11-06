"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserMenu from './UserMenu';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { TransitionLink } from './TransitionLink';


export default function Header() {
    const pathname = usePathname() || '';
    const [mobileOpen, setMobileOpen] = useState(false);
    const { data: session } = useSession();

    // Profilo: se loggato vai su /account, altrimenti su /auth
    const navLinks = [
        { href: '/', label: 'Eventi', icon: '🎵' },
        { href: session ? '/account' : '/auth', label: 'Profilo', icon: '👤', isProfile: true },
        { href: '/mappa', label: 'Mappa', icon: '🗺️' },
        { href: '/crea', label: 'Crea', icon: '✨' },
    ];

    return (
        <header className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-white/10">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                {/* Logo / Brand - Dice.fm Style */}
                <TransitionLink href="/" className="flex items-center gap-3 group">
                    <div className="w-10 h-10 rounded-full bg-linear-to-br from-pink-500 to-purple-600 flex items-center justify-center text-xl">
                        🎯
                    </div>
                    <span className="text-2xl font-bold gradient-text tracking-tight group-hover:scale-105 transition-transform">
                        EventScanner
                    </span>
                </TransitionLink>

                {/* Desktop Navigation - Dice Style */}
                <nav className="hidden md:flex items-center gap-8">
                    {navLinks.map(link => {
                        const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                        return (
                            <TransitionLink
                                key={link.href}
                                href={link.href}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${isActive
                                    ? 'bg-white/10 text-white border border-white/20'
                                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <span className="text-lg">{link.icon}</span>
                                {link.label}
                            </TransitionLink>
                        );
                    })}
                </nav>

                {/* CTA Button - Dice Style */}
                <div className="hidden md:block">
                    <TransitionLink
                        href="/crea"
                        className="inline-flex items-center gap-2 bg-linear-to-r from-pink-500 to-purple-600 text-white px-6 py-2 rounded-full font-semibold text-sm transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-pink-500/25"
                    >
                        ✨ Crea Evento
                    </TransitionLink>
                </div>

                {/* Mobile Hamburger - Dice Style */}
                <button
                    className="md:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 text-white focus:outline-none transition-all hover:bg-white/20"
                    onClick={() => setMobileOpen(v => !v)}
                    aria-label="Menu"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {mobileOpen ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        )}
                    </svg>
                </button>
            </div>

            {/* Mobile Menu - Dice Style */}
            {mobileOpen && (
                <div className="md:hidden absolute top-full left-0 right-0 glass-effect border-t border-white/10 animate-fadeInUp">
                    <nav className="p-6 space-y-4">
                        {navLinks.map(link => {
                            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                            return (
                                <TransitionLink
                                    key={link.href}
                                    href={link.href}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-base font-semibold transition-all duration-200 ${isActive
                                        ? 'bg-white/10 text-white border border-white/20'
                                        : 'text-gray-300 hover:text-white hover:bg-white/5'
                                        }`}
                                    onClick={() => setMobileOpen(false)}
                                >
                                    <span className="text-xl">{link.icon}</span>
                                    {link.label}
                                </TransitionLink>
                            );
                        })}

                        {/* Mobile CTA */}
                        <TransitionLink
                            href="/crea"
                            className="flex items-center justify-center gap-2 bg-linear-to-r from-pink-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold text-base transition-all duration-200 hover:scale-105 mt-4"
                            onClick={() => setMobileOpen(false)}
                        >
                            ✨ Crea Evento
                        </TransitionLink>
                    </nav>
                </div>
            )}
        </header>
    );
}
