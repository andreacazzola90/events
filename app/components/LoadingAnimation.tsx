'use client';

import { useEffect, useState } from 'react';
import Lottie from 'lottie-react';

interface LoadingAnimationProps {
    message?: string;
}

export default function LoadingAnimation({ message = "Analyzing your event..." }: LoadingAnimationProps) {
    const [dots, setDots] = useState('');

    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => prev.length >= 3 ? '' : prev + '.');
        }, 500);
        return () => clearInterval(interval);
    }, []);

    // Animazione Lottie inline (AI Robot analyzing)
    const lottieAnimation = {
        "v": "5.7.4",
        "fr": 30,
        "ip": 0,
        "op": 90,
        "w": 400,
        "h": 400,
        "nm": "AI Analysis",
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
                    "s": { "a": 1, "k": [{ "t": 0, "s": [80, 80], "e": [120, 120] }, { "t": 45, "s": [120, 120], "e": [80, 80] }, { "t": 90 }] }
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
                                "c": { "a": 0, "k": [0.94, 0.31, 0.42, 1] },
                                "o": { "a": 0, "k": 100 },
                                "w": { "a": 0, "k": 8 }
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

    return (
        <div className="flex flex-col items-center justify-center space-y-6 py-12">
            {/* Animated Character with Lottie */}
            <div className="relative w-64 h-64">
                <Lottie
                    animationData={lottieAnimation}
                    loop={true}
                    autoplay={true}
                />

                {/* Emoji overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-7xl animate-pulse">🤖</div>
                </div>
            </div>

            {/* Loading bar */}
            <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-linear-to-r from-pink-500 via-purple-500 to-blue-500 animate-loading-bar"></div>
            </div>

            {/* Message */}
            <div className="text-center space-y-2">
                <p className="text-xl font-semibold text-white">
                    {message}{dots}
                </p>
                <p className="text-sm text-gray-400">
                    AI is extracting event details 🧠
                </p>
            </div>

            {/* Fun facts carousel */}
            <FunFacts />
        </div>
    );
}

function FunFacts() {
    const facts = [
        "💡 Did you know? Our AI can read multiple events at once!",
        "🎯 Tip: Clear images work better for text extraction",
        "🚀 Processing thousands of characters per second...",
        "🎨 Detecting dates, times, and locations automatically",
        "⚡ Using advanced OCR technology",
        "🌟 Making event creation effortless for you",
    ];

    const [currentFact, setCurrentFact] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentFact(prev => (prev + 1) % facts.length);
        }, 3000);
        return () => clearInterval(interval);
    }, [facts.length]);

    return (
        <div className="mt-4 h-8">
            <p className="text-sm text-gray-500 animate-fade-in">
                {facts[currentFact]}
            </p>
        </div>
    );
}
