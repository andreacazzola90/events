"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserMenu from './UserMenu';
import { useState } from 'react';
import { useSession } from 'next-auth/react';


export default function Header() {
    const pathname = usePathname() || '';
    const [mobileOpen, setMobileOpen] = useState(false);
    const { data: session } = useSession();
    const [showProfile, setShowProfile] = useState(false);

    // Profilo: se loggato vai su /account, altrimenti su /auth
    const navLinks = [
        { href: '/', label: 'Eventi' },
        { href: session ? '/account' : '/auth', label: 'Profilo', isProfile: true },
        { href: '/mappa', label: 'Mappa' },
        { href: '/crea', label: 'Crea Evento' },
    ];

    return (
        <header className="w-full bg-linear-to-r from-primary via-accent to-secondary shadow-card">
            <div className="container mx-auto px-8 py-6 flex items-center justify-between md:justify-between flex-row-reverse md:flex-row gap-8">
                {/* Logo / Brand */}
                <Link href="/" className="flex items-center gap-2 group">
                    <div className="text-3xl md:text-4xl font-extrabold text-white drop-shadow-lg tracking-tight transition-transform group-hover:scale-105">📅 EventScanner</div>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-14">
                    {navLinks.map(link => {
                        const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                        if (link.isProfile) {
                            return (
                                <div key={link.href} className="relative">
                                    <Link
                                        href={link.href}
                                        className={`px-6 py-2 text-lg font-bold bg-transparent border-none text-white transition-all duration-200 ${isActive ? 'underline underline-offset-8' : 'opacity-80 hover:opacity-100'}`}
                                        aria-label={link.label}
                                    >
                                        {link.label}
                                    </Link>
                                </div>
                            );
                        }
                        return (
                            <div key={link.href} className="relative">
                                <Link
                                    href={link.href}
                                    className={`px-6 py-2 text-lg font-bold bg-transparent border-none text-white transition-all duration-200 ${isActive ? 'underline underline-offset-8' : 'opacity-80 hover:opacity-100'}`}
                                    aria-label={link.label}
                                >
                                    {link.label}
                                </Link>
                            </div>
                        );
                    })}
                </nav>

                {/* Mobile Hamburger */}
                <button
                    className="md:hidden flex items-center text-4xl text-white drop-shadow-lg focus:outline-none transition-transform hover:scale-110 ml-4"
                    onClick={() => setMobileOpen(v => !v)}
                    aria-label="Apri menu"
                >
                    {mobileOpen ? '✖️' : '☰'}
                </button>
            </div>

            {/* Mobile Menu */}
            {mobileOpen && (
                <nav className="md:hidden bg-linear-to-r from-primary via-accent to-secondary border-t border-primary/30 shadow-2xl px-6 py-8 flex flex-col gap-8 z-50 items-end justify-end text-right animate-fadeIn">
                    {navLinks.map(link => {
                        const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`w-full text-right px-6 py-4 text-xl font-bold bg-transparent border-none text-white transition-all duration-200 ${isActive ? 'underline underline-offset-8' : 'opacity-80 hover:opacity-100'}`}
                                aria-label={link.label}
                                onClick={() => setMobileOpen(false)}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                </nav>
            )}
        </header>
    );
}
