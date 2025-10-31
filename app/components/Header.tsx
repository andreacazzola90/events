"use client";
import Link from 'next/link';
import UserMenu from './UserMenu';

export default function Header() {
    return (
        <header className="w-full bg-white border-b border-gray-200 shadow-sm">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
                {/* Logo / Brand */}
                <Link href="/" className="flex items-center gap-2">
                    <div className="text-2xl font-bold text-blue-600">
                        📅 EventScanner
                    </div>
                </Link>

                {/* Navigation */}
                <nav className="hidden md:flex items-center gap-6">
                    <Link
                        href="/"
                        className="text-gray-700 hover:text-blue-600 font-medium transition"
                    >
                        Eventi
                    </Link>
                    <Link
                        href="/crea"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
                    >
                        + Crea Evento
                    </Link>
                </nav>

                {/* User Menu */}
                <UserMenu />
            </div>
        </header>
    );
}
