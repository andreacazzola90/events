"use client";
import { TransitionLink } from './TransitionLink';
import { useSession } from 'next-auth/react';

export default function Footer() {
    const { data: session } = useSession();

    const navLinks = [
        { href: '/eventi', label: 'Eventi', icon: '🎵' },
        { href: '/mappa', label: 'Mappa', icon: '🗺️' },
        { href: '/crea', label: 'Crea', icon: '✨' },
        { href: session ? '/account' : '/auth', label: 'Profilo', icon: '👤' },
    ];

    const companyLinks = [
        { href: '#', label: 'Chi Siamo' },
        { href: '#', label: 'Lavora con noi' },
        { href: '#', label: 'Blog' },
        { href: '#', label: 'Press Kit' },
    ];

    const legalLinks = [
        { href: '#', label: 'Privacy Policy' },
        { href: '#', label: 'Terms of Service' },
        { href: '#', label: 'Cookie Policy' },
        { href: '#', label: 'Dati Societari' },
    ];

    const socialLinks = [
        { icon: '📸', label: 'Instagram', href: '#' },
        { icon: '🐦', label: 'Twitter', href: '#' },
        { icon: '📘', label: 'Facebook', href: '#' },
        { icon: '🎵', label: 'TikTok', href: '#' },
    ];

    return (
        <footer className="bg-black border-t border-white/10 pt-20 pb-10 px-6 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-px bg-linear-to-r from-transparent via-pink-500/50 to-transparent"></div>

            <div className="max-w-7xl mx-auto relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-20">
                    {/* Brand Section */}
                    <div className="lg:col-span-2">
                        <TransitionLink href="/" className="flex items-center gap-3 mb-8 group">
                            <div className="w-12 h-12 rounded-full bg-linear-to-br from-pink-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg shadow-pink-500/20">
                                🎯
                            </div>
                            <span className="text-3xl font-bold gradient-text tracking-tighter group-hover:scale-105 transition-transform">
                                EventScanner
                            </span>
                        </TransitionLink>
                        <p className="text-gray-400 text-lg leading-relaxed mb-8 max-w-md">
                            La piattaforma definitiva per scoprire, scansionare e gestire i tuoi eventi preferiti.
                            Potenziata dall'intelligenza artificiale per non farti perdere mai il ritmo.
                        </p>
                        <div className="flex gap-4">
                            {socialLinks.map((social) => (
                                <a
                                    key={social.label}
                                    href={social.href}
                                    className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/20 hover:-translate-y-1 transition-all duration-300 group"
                                    aria-label={social.label}
                                >
                                    <span className="text-xl group-hover:scale-110 transition-transform">{social.icon}</span>
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Navigation */}
                    <div>
                        <h3 className="text-white font-bold mb-8 uppercase tracking-widest text-xs opacity-50">Esplora</h3>
                        <ul className="space-y-4">
                            {navLinks.map(link => (
                                <li key={link.href}>
                                    <TransitionLink
                                        href={link.href}
                                        className="text-gray-400 hover:text-white transition-colors flex items-center gap-3 group"
                                    >
                                        <span className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300 text-pink-500">•</span>
                                        {link.label}
                                    </TransitionLink>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Company */}
                    <div>
                        <h3 className="text-white font-bold mb-8 uppercase tracking-widest text-xs opacity-50">Società</h3>
                        <ul className="space-y-4">
                            {companyLinks.map(link => (
                                <li key={link.label}>
                                    <a href={link.href} className="text-gray-400 hover:text-white transition-colors flex items-center gap-3 group">
                                        <span className="opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300 text-purple-500">•</span>
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact & Info */}
                    <div>
                        <h3 className="text-white font-bold mb-8 uppercase tracking-widest text-xs opacity-50">Contatti</h3>
                        <div className="space-y-6">
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Supporto</p>
                                <a href="mailto:hello@eventscanner.ai" className="text-gray-300 hover:text-pink-500 transition-colors font-medium">
                                    hello@eventscanner.ai
                                </a>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Sede</p>
                                <p className="text-gray-300 leading-relaxed">
                                    Via dell'Innovazione, 42<br />
                                    36015 Schio (VI), Italia
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Newsletter Section */}
                <div className="bg-linear-to-r from-white/5 to-transparent border border-white/10 rounded-3xl p-8 md:p-12 mb-20 flex flex-col lg:flex-row items-center justify-between gap-8">
                    <div className="max-w-xl text-center lg:text-left">
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Resta nel giro</h2>
                        <p className="text-gray-400 text-lg">Iscriviti alla newsletter per ricevere in anteprima gli eventi più esclusivi della tua zona.</p>
                    </div>
                    <div className="flex w-full lg:w-auto gap-3">
                        <input
                            type="email"
                            placeholder="La tua email"
                            className="flex-1 lg:w-80 bg-black border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-pink-500/50 transition-colors"
                        />
                        <button className="bg-white text-black px-8 py-4 rounded-2xl font-bold hover:bg-pink-500 hover:text-white transition-all duration-300 active:scale-95 whitespace-nowrap">
                            Iscriviti
                        </button>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex flex-wrap justify-center md:justify-start gap-x-8 gap-y-4">
                        {legalLinks.map(link => (
                            <a key={link.label} href={link.href} className="text-gray-500 hover:text-white text-sm transition-colors">
                                {link.label}
                            </a>
                        ))}
                    </div>

                    <div className="flex flex-col items-center md:items-end gap-2">
                        <p className="text-gray-500 text-sm">
                            © {new Date().getFullYear()} EventScanner. Tutti i diritti riservati.
                        </p>
                        <div className="flex items-center gap-2 text-gray-600 text-xs">
                            <span>Made with</span>
                            <span className="text-pink-500 animate-pulse">❤️</span>
                            <span>in Schio</span>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}

