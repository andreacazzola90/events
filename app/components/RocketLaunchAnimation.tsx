'use client';

import type { AnimationEvent } from 'react';
import { ROCKET_STAGE_LABELS, type RocketStage } from '../../lib/event-autopilot';

interface RocketLaunchAnimationProps {
    stage: RocketStage;
    message?: string;
    compact?: boolean;
    loadingPhase?: string;
    onLaunchEnd?: () => void;
}

export default function RocketLaunchAnimation({ stage, message, compact = false, loadingPhase, onLaunchEnd }: RocketLaunchAnimationProps) {
    const handleAnimationEnd = (event: AnimationEvent<SVGGElement>) => {
        if (stage === 'launch' && event.animationName === 'rocket-liftoff') onLaunchEnd?.();
    };

    return (
        <div
            className={`rocket-scene${compact ? ' rocket-scene-compact' : ''}`}
            role="status"
            aria-live="polite"
            data-rocket-stage={stage}
            data-loading-phase={loadingPhase}
        >
            <svg className="rocket-scene-art" viewBox="0 0 260 170" aria-hidden="true" focusable="false">
                <line className="rocket-ground" x1="10" y1="150" x2="250" y2="150" />
                <path className="rocket-fuse" d="M104 128 C 124 150, 146 150, 166 146" />
                <g className="rocket-pad">
                    <rect x="150" y="142" width="60" height="8" />
                    <path d="M212 150 V70 M212 90 H200 M212 115 H202" />
                </g>
                <g className="rocket-smoke">
                    <circle cx="160" cy="148" r="10" />
                    <circle cx="200" cy="148" r="12" />
                    <circle cx="180" cy="152" r="9" />
                </g>
                <g className="rocket" onAnimationEnd={handleAnimationEnd}>
                    <path className="rocket-flame" d="M170 136 Q180 176 190 136 Z" />
                    <path className="rocket-part rocket-part-fins" d="M165 112 L150 140 L166 134 Z M195 112 L210 140 L194 134 Z" />
                    <path className="rocket-part rocket-part-body" d="M180 52 C196 68 198 100 196 136 L164 136 C162 100 164 68 180 52 Z" />
                    <circle className="rocket-part rocket-part-window" cx="180" cy="92" r="8" />
                </g>
                <g className="rocket-kid">
                    <circle className="rocket-kid-skin" cx="82" cy="96" r="12" />
                    <path className="rocket-kid-hair" d="M70 94 Q72 80 84 82 Q94 82 94 92 Q86 86 78 90 Z" />
                    <path className="rocket-kid-shirt" d="M72 108 H92 L94 132 H70 Z" />
                    <path className="rocket-kid-legs" d="M76 132 L74 150 M88 132 L90 150" />
                    <g className="rocket-kid-arm rocket-kid-arm-back">
                        <line x1="74" y1="112" x2="64" y2="126" />
                    </g>
                    <g className="rocket-kid-arm rocket-kid-arm-front">
                        <line x1="90" y1="112" x2="104" y2="122" />
                        <path className="rocket-kid-wrench" d="M104 122 L114 112 M111 109 L117 115" />
                        <g className="rocket-kid-match">
                            <line x1="104" y1="122" x2="104" y2="110" />
                            <circle className="rocket-kid-spark" cx="104" cy="108" r="3" />
                        </g>
                    </g>
                    <text className="rocket-kid-thought" x="96" y="78">?</text>
                </g>
            </svg>
            <p className="rocket-scene-message">{message ?? ROCKET_STAGE_LABELS[stage]}</p>
        </div>
    );
}
