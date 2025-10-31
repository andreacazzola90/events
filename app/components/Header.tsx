"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import UserMenu from './UserMenu';

export default function Header() {
    const pathname = usePathname() || '';
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
                        className={
                            `font-medium transition ${pathname === '/' ? 'text-blue-600 underline underline-offset-4' : 'text-gray-700 hover:text-blue-600'}`
                        }
                    >
                        Eventi
                    </Link>
                    <Link
                        href="/mappa"
                        className={
                            `font-medium transition ${pathname.startsWith('/mappa') ? 'text-blue-600 underline underline-offset-4' : 'text-gray-700 hover:text-blue-600'}`
                        }
                    >
                        Mappa
                    </Link>
                    <Link
                        href="/crea"
                        className={
                            `px-4 py-2 rounded-lg font-medium transition ${pathname.startsWith('/crea') ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`
                        }
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
