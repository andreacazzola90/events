'use client';

import { useState } from 'react';

interface DebugInfo {
    ocrRaw?: string;
    groqRaw?: any;
    googleRaw?: any;
}

interface DebugInfoDisplayProps {
    debugInfo: DebugInfo;
}

export default function DebugInfoDisplay({ debugInfo }: DebugInfoDisplayProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (!debugInfo) return null;

    return (
        <div className="w-full max-w-6xl mx-auto px-6 mb-8">
            <div className="glass-effect rounded-2xl border border-white/10 overflow-hidden">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors"
                >
                    <span className="font-mono text-sm text-gray-400">🛠️ Debug Information (OCR / AI / Verification)</span>
                    <span className="text-gray-400">{isOpen ? '▼' : '▶'}</span>
                </button>

                {isOpen && (
                    <div className="p-6 space-y-6 bg-black/40">
                        {/* OCR Raw Text */}
                        {debugInfo.ocrRaw && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">1. OCR Output (Raw Text)</h3>
                                <pre className="bg-black/50 p-4 rounded-lg text-xs text-gray-300 overflow-x-auto font-mono border border-white/5">
                                    {debugInfo.ocrRaw}
                                </pre>
                            </div>
                        )}

                        {/* Groq Raw JSON */}
                        {debugInfo.groqRaw && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider">2. Groq AI Output (Initial Extraction)</h3>
                                <pre className="bg-black/50 p-4 rounded-lg text-xs text-green-300 overflow-x-auto font-mono border border-white/5">
                                    {JSON.stringify(debugInfo.groqRaw, null, 2)}
                                </pre>
                            </div>
                        )}

                        {/* Google Verification JSON */}
                        {debugInfo.googleRaw && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wider">3. Google Verification Output</h3>
                                <pre className="bg-black/50 p-4 rounded-lg text-xs text-yellow-300 overflow-x-auto font-mono border border-white/5">
                                    {JSON.stringify(debugInfo.googleRaw, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
