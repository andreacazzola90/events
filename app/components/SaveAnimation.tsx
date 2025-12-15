'use client';

import Lottie from 'lottie-react';
import { useEffect, useState } from 'react';

interface SaveAnimationProps {
    status: 'saving' | 'success' | 'hidden';
    onComplete?: () => void;
}

export default function SaveAnimation({ status, onComplete }: SaveAnimationProps) {
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        if (status === 'success') {
            setShowSuccess(true);
            // Dopo 2 secondi, chiama onComplete per nascondere l'animazione
            const timer = setTimeout(() => {
                onComplete?.();
            }, 2000);
            return () => clearTimeout(timer);
        } else {
            setShowSuccess(false);
        }
    }, [status, onComplete]);

    if (status === 'hidden') return null;

    // Animazione "Saving..." - cerchio che ruota
    const savingAnimation = {
        "v": "5.7.4",
        "fr": 30,
        "ip": 0,
        "op": 90,
        "w": 400,
        "h": 400,
        "nm": "Saving",
        "ddd": 0,
        "assets": [],
        "layers": [
            {
                "ddd": 0,
                "ind": 1,
                "ty": 4,
                "nm": "Circle",
                "sr": 1,
                "ks": {
                    "o": { "a": 0, "k": 100 },
                    "r": { "a": 1, "k": [{ "t": 0, "s": [0], "e": [360] }, { "t": 90 }] },
                    "p": { "a": 0, "k": [200, 200] },
                    "a": { "a": 0, "k": [0, 0] },
                    "s": { "a": 0, "k": [100, 100] }
                },
                "ao": 0,
                "shapes": [
                    {
                        "ty": "gr",
                        "it": [
                            {
                                "ty": "el",
                                "p": { "a": 0, "k": [0, 0] },
                                "s": { "a": 0, "k": [100, 100] }
                            },
                            {
                                "ty": "st",
                                "c": { "a": 0, "k": [0.2, 0.6, 1, 1] },
                                "o": { "a": 0, "k": 100 },
                                "w": { "a": 0, "k": 10 }
                            },
                            {
                                "ty": "tr",
                                "p": { "a": 0, "k": [0, 0] },
                                "a": { "a": 0, "k": [0, 0] },
                                "s": { "a": 0, "k": [100, 100] },
                                "r": { "a": 0, "k": 0 },
                                "o": { "a": 0, "k": 100 }
                            }
                        ]
                    }
                ],
                "ip": 0,
                "op": 90,
                "st": 0
            }
        ]
    };

    // Animazione "Success!" - cerchio con checkmark
    const successAnimation = {
        "v": "5.7.4",
        "fr": 30,
        "ip": 0,
        "op": 60,
        "w": 400,
        "h": 400,
        "nm": "Success",
        "ddd": 0,
        "assets": [],
        "layers": [
            {
                "ddd": 0,
                "ind": 1,
                "ty": 4,
                "nm": "Circle",
                "sr": 1,
                "ks": {
                    "o": { "a": 0, "k": 100 },
                    "r": { "a": 0, "k": 0 },
                    "p": { "a": 0, "k": [200, 200] },
                    "a": { "a": 0, "k": [0, 0] },
                    "s": {
                        "a": 1, "k": [
                            { "t": 0, "s": [0, 0], "e": [120, 120] },
                            { "t": 20, "s": [120, 120], "e": [100, 100] },
                            { "t": 30 }
                        ]
                    }
                },
                "ao": 0,
                "shapes": [
                    {
                        "ty": "gr",
                        "it": [
                            {
                                "ty": "el",
                                "p": { "a": 0, "k": [0, 0] },
                                "s": { "a": 0, "k": [100, 100] }
                            },
                            {
                                "ty": "fl",
                                "c": { "a": 0, "k": [0.2, 0.8, 0.4, 1] },
                                "o": { "a": 0, "k": 100 }
                            },
                            {
                                "ty": "tr",
                                "p": { "a": 0, "k": [0, 0] },
                                "a": { "a": 0, "k": [0, 0] },
                                "s": { "a": 0, "k": [100, 100] },
                                "r": { "a": 0, "k": 0 },
                                "o": { "a": 0, "k": 100 }
                            }
                        ]
                    }
                ],
                "ip": 0,
                "op": 60,
                "st": 0
            }
        ]
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
            <div className="flex flex-col items-center justify-center space-y-6">
                {!showSuccess ? (
                    <>
                        {/* Animazione Saving */}
                        <div className="relative w-64 h-64">
                            <Lottie
                                animationData={savingAnimation}
                                loop={true}
                                autoplay={true}
                            />
                            {/* Icona Database overlay */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-7xl animate-pulse">💾</div>
                            </div>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-white animate-pulse">
                                Salvataggio in corso...
                            </p>
                            <p className="text-sm text-gray-400 mt-2">
                                L'evento sta per essere aggiunto al database
                            </p>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Animazione Success */}
                        <div className="relative w-64 h-64">
                            <Lottie
                                animationData={successAnimation}
                                loop={false}
                                autoplay={true}
                            />
                            {/* Checkmark overlay */}
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="text-8xl animate-bounce-slow">✓</div>
                            </div>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-bold text-green-400 animate-bounce-slow">
                                Evento Creato! 🎉
                            </p>
                            <p className="text-sm text-gray-300 mt-2">
                                L'evento è stato salvato con successo
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
