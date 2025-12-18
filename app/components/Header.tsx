"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserMenu from './UserMenu';
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

    // Profilo: se loggato vai su /account, altrimenti su /auth
    const navLinks = [
        { href: '/eventi', label: 'Eventi', icon: '🎵' },
        { href: session ? '/account' : '/auth', label: 'Profilo', icon: '👤', isProfile: true },
        { href: '/mappa', label: 'Mappa', icon: '🗺️' },
        { href: '/crea', label: 'Crea', icon: '✨' },
    ];

    return (
        <>
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
                        className="md:hidden flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 text-white focus:outline-none transition-all hover:bg-white/20 border border-white/10"
                        onClick={() => setMobileOpen(v => !v)}
                        aria-label="Menu"
                    >
                        <div className="relative w-6 h-5">
                            <span className={`absolute left-0 w-full h-0.5 bg-white rounded-full transition-all duration-300 ${mobileOpen ? 'top-2 rotate-45' : 'top-0'}`}></span>
                            <span className={`absolute left-0 top-2 w-full h-0.5 bg-white rounded-full transition-all duration-300 ${mobileOpen ? 'opacity-0' : 'opacity-100'}`}></span>
                            <span className={`absolute left-0 w-full h-0.5 bg-white rounded-full transition-all duration-300 ${mobileOpen ? 'top-2 -rotate-45' : 'top-4'}`}></span>
                        </div>
                    </button>
                </div>
            </header>

            {/* Mobile Menu - Full Screen Solid Overlay */}
            {mobileOpen && (
                <div className="md:hidden fixed inset-0 z-[100] bg-black flex flex-col animate-fade-in-simple">
                    {/* Mobile Menu Header (to keep the logo and close button visible) */}
                    <div className="h-16 px-6 flex items-center justify-between border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-linear-to-br from-pink-500 to-purple-600 flex items-center justify-center text-xl">
                                🎯
                            </div>
                            <span className="text-2xl font-bold text-white tracking-tight">
                                EventScanner
                            </span>
                        </div>
                        <button
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-white border border-white/20"
                            onClick={() => setMobileOpen(false)}
                        >
                            <div className="relative w-6 h-5">
                                <span className="absolute left-0 w-full h-0.5 bg-white rounded-full top-2 rotate-45"></span>
                                <span className="absolute left-0 w-full h-0.5 bg-white rounded-full top-2 -rotate-45"></span>
                            </div>
                        </button>
                    </div>

                    <nav className="flex-1 flex flex-col justify-center p-8 space-y-4">
                        {navLinks.map((link, index) => {
                            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                            return (
                                <TransitionLink
                                    key={link.href}
                                    href={link.href}
                                    className={`flex items-center gap-6 px-6 py-5 rounded-2xl text-2xl font-black transition-all duration-300 ${isActive
                                        ? 'text-white border border-white/20'
                                        : 'text-gray-400 hover:text-white'
                                        }`}
                                    style={{ animationDelay: `${index * 50}ms` }}
                                    onClick={() => setMobileOpen(false)}
                                >
                                    <span className="text-3xl w-14 h-14 rounded-xl flex items-center justify-center">{link.icon}</span>
                                    {link.label}
                                </TransitionLink>
                            );
                        })}

                        {/* Mobile CTA */}
                        <TransitionLink
                            href="/crea"
                            className="flex items-center justify-center gap-3 bg-linear-to-r from-pink-500 to-purple-600 text-white px-8 py-6 rounded-2xl font-black text-2xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] mt-8"
                            onClick={() => setMobileOpen(false)}
                        >
                            ✨ Crea Evento
                        </TransitionLink>
                    </nav>

                    {/* Footer info in menu */}
                    <div className="p-8 border-t border-white/5 text-center">
                        <p className="text-gray-500 font-medium tracking-wide">EventScanner © 2025</p>
                    </div>
                </div>
            )}
        </>
    );
}
