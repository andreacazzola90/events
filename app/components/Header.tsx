"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserMenu from './UserMenu';
import { useState } from 'react';
import { useSession } from 'next-auth/react';

const navLinks = [
    { href: '/', label: 'Eventi', icon: '🗂️' },
    { href: '/auth', label: 'Profilo', icon: '👤', isProfile: true },
    { href: '/mappa', label: 'Mappa', icon: '🗺️' },
    { href: '/crea', label: 'Crea Evento', icon: '➕' },
];

export default function Header() {
    const pathname = usePathname() || '';
    const [mobileOpen, setMobileOpen] = useState(false);
    const { data: session } = useSession();
    const [showProfile, setShowProfile] = useState(false);

    return (
        <header className="w-full bg-white border-b border-gray-200 shadow-sm">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between md:justify-between flex-row-reverse md:flex-row">
                {/* Logo / Brand */}
                <Link href="/" className="flex items-center gap-2">
                    <div className="text-2xl font-bold text-blue-600">📅 EventScanner</div>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-6">
                    {navLinks.map(link => {
                        const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                        if (link.isProfile) {
                            return (
                                <button
                                    key={link.href}
                                    type="button"
                                    className={`relative flex flex-col items-center group text-2xl transition ${isActive ? 'text-blue-600' : 'text-gray-700 hover:text-blue-600'}`}
                                    aria-label={link.label}
                                    onClick={() => {
                                        if (session) setShowProfile(v => !v);
                                        else window.location.href = '/auth';
                                    }}
                                >
                                    <span className={isActive ? 'bg-blue-100 rounded-full px-2 py-1' : ''}>{link.icon}</span>
                                    <span className="absolute left-1/2 -translate-x-1/2 mt-8 px-2 py-1 rounded bg-gray-900 text-white text-xs opacity-0 group-hover:opacity-100 pointer-events-none z-10 whitespace-nowrap">
                                        {link.label}
                                    </span>
                                    {showProfile && session && (
                                        <div className="absolute top-12 right-0 bg-white border rounded shadow-lg p-4 z-50 min-w-[200px] text-left">
                                            <div className="mb-2 font-semibold text-blue-700">Profilo</div>
                                            <div className="text-sm text-gray-800 mb-1">{session.user?.name || session.user?.email}</div>
                                            <div className="text-xs text-gray-500 mb-2">{session.user?.email}</div>
                                            <button
                                                onClick={() => { setShowProfile(false); window.location.href = '/api/auth/signout'; }}
                                                className="mt-2 w-full bg-red-500 text-white rounded px-3 py-1 hover:bg-red-600 text-sm"
                                            >Logout</button>
                                        </div>
                                    )}
                                </button>
                            );
                        }
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`relative flex flex-col items-center group text-2xl transition ${isActive ? 'text-blue-600' : 'text-gray-700 hover:text-blue-600'}`}
                                aria-label={link.label}
                            >
                                <span className={isActive ? 'bg-blue-100 rounded-full px-2 py-1' : ''}>{link.icon}</span>
                                <span className="absolute left-1/2 -translate-x-1/2 mt-8 px-2 py-1 rounded bg-gray-900 text-white text-xs opacity-0 group-hover:opacity-100 pointer-events-none z-10 whitespace-nowrap">
                                    {link.label}
                                </span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Mobile Hamburger */}
                <button
                    className="md:hidden flex items-center text-3xl text-blue-600 focus:outline-none"
                    onClick={() => setMobileOpen(v => !v)}
                    aria-label="Apri menu"
                >
                    {mobileOpen ? '✖️' : '☰'}
                </button>

                {/* User Menu sempre visibile */}
                {/* <div className="ml-4">
                    <UserMenu />
                </div> */}
            </div>

            {/* Mobile Menu */}
            {mobileOpen && (
                <nav className="md:hidden bg-white border-t border-gray-200 shadow-lg px-4 py-2 flex flex-col gap-2 z-50 items-end justify-end text-right">
                    {navLinks.map(link => {
                        const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`flex items-center gap-3 text-lg py-2 px-2 rounded transition ${isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-blue-50'}`}
                                aria-label={link.label}
                                onClick={() => setMobileOpen(false)}
                            >
                                <span className={`text-2xl ${isActive ? 'bg-blue-100 rounded-full px-2 py-1' : ''}`}>{link.icon}</span>
                                <span>{link.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            )}
        </header>
    );
}
