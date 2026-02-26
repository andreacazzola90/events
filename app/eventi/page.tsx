'use client';

import EventList from '../components/EventList';
import { TransitionLink } from '../components/TransitionLink';

export default function EventiPage() {
    return (
        <main className="min-h-screen py-12">
            <div className="max-w-7xl mx-auto px-6">
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">Eventi</h1>
                    <p className="text-xl text-gray-400">
                        Seleziona il periodo e scopri una prima selezione di eventi.
                    </p>
                    <div className="mt-6">
                        <TransitionLink href="/tutti-gli-eventi" className="btn btn-outline">
                            Vai a tutti gli eventi
                        </TransitionLink>
                    </div>
                </div>

                <div className="animate-fadeInUp">
                    <EventList mode="quick" />
                </div>
            </div>
        </main>
    );
}
