'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type AnimationEvent } from 'react';
import { createPortal } from 'react-dom';
import { ROCKET_STAGE_LABELS, type RocketStage } from '../../lib/event-autopilot';

interface RocketLaunchAnimationProps {
    stage: RocketStage;
    message?: string;
    messageSequence?: string[];
    compact?: boolean;
    fullscreen?: boolean;
    loadingPhase?: string;
    onLaunchEnd?: () => void;
}

const subscribeToMount = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const inertStates = new WeakMap<HTMLElement, { count: number; original: string | null }>();

function changeInertCount(target: HTMLElement, amount: 1 | -1) {
    const state = inertStates.get(target);
    if (amount === 1) {
        if (state) state.count += 1;
        else {
            inertStates.set(target, { count: 1, original: target.getAttribute('inert') });
            target.setAttribute('inert', '');
        }
        return;
    }

    if (!state || --state.count > 0) return;
    if (state.original === null) target.removeAttribute('inert');
    else target.setAttribute('inert', state.original);
    inertStates.delete(target);
}

const subscribeToReducedMotion = (notify: () => void) => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.addEventListener) {
        preference.addEventListener('change', notify);
        return () => preference.removeEventListener('change', notify);
    }
    preference.addListener(notify);
    return () => preference.removeListener(notify);
};
const getReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function RocketLaunchAnimation({
    stage,
    message,
    messageSequence,
    compact = false,
    fullscreen = false,
    loadingPhase,
    onLaunchEnd,
}: RocketLaunchAnimationProps) {
    const mounted = useSyncExternalStore(subscribeToMount, getClientSnapshot, getServerSnapshot);
    const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, getReducedMotion, () => false);
    const overlayRef = useRef<HTMLDivElement>(null);
    const messageSequenceKey = messageSequence?.join('\u0000');
    const messages = useMemo(() => {
        const sequence = messageSequenceKey?.split('\u0000').filter(Boolean) ?? [];
        return sequence.length ? sequence : [message ?? ROCKET_STAGE_LABELS[stage]];
    }, [message, messageSequenceKey, stage]);
    const [messageIndex, setMessageIndex] = useState(0);
    const [sceneBeat, setSceneBeat] = useState(0);

    useEffect(() => setMessageIndex(0), [messages]);

    const waiting = !compact && stage !== 'launch' && stage !== 'stopped';
    useEffect(() => {
        if (!waiting) return;
        const interval = window.setInterval(() => {
            if (!reducedMotion) setSceneBeat(beat => (beat + 1) % 3);
            setMessageIndex(index => (index + 1) % messages.length);
        }, 3000);
        return () => window.clearInterval(interval);
    }, [loadingPhase, messages.length, reducedMotion, stage, waiting]);

    useEffect(() => {
        const overlay = overlayRef.current;
        if (!fullscreen || !mounted || !overlay) return;

        const header = document.querySelector<HTMLElement>('.site-header');
        const previousFocus = document.activeElement;
        const inertTargets = Array.from(document.querySelectorAll<HTMLElement>('body > main, body > footer'))
            .filter(target => !target.contains(header) && !target.contains(overlay));
        inertTargets.forEach(target => changeInertCount(target, 1));
        if (previousFocus instanceof HTMLElement && inertTargets.some(target => target.contains(previousFocus))) {
            previousFocus.blur();
        }

        const measureHeader = () => {
            overlay.style.top = `${Math.max(0, header?.getBoundingClientRect().height ?? 64)}px`;
        };
        measureHeader();
        const layoutMeasure = window.requestAnimationFrame(measureHeader);
        const headerObserver = header ? new ResizeObserver(measureHeader) : null;
        if (header) headerObserver?.observe(header);
        window.addEventListener('scroll', measureHeader, { passive: true });
        window.addEventListener('resize', measureHeader);
        window.visualViewport?.addEventListener('resize', measureHeader);

        return () => {
            window.cancelAnimationFrame(layoutMeasure);
            headerObserver?.disconnect();
            window.removeEventListener('scroll', measureHeader);
            window.removeEventListener('resize', measureHeader);
            window.visualViewport?.removeEventListener('resize', measureHeader);
            inertTargets.forEach(target => changeInertCount(target, -1));
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected &&
                !document.querySelector('dialog[open]') &&
                (document.activeElement === document.body || document.activeElement === previousFocus)) {
                previousFocus.focus({ preventScroll: true });
            }
        };
    }, [fullscreen, mounted]);

    const handleAnimationEnd = (event: AnimationEvent<SVGGElement>) => {
        if (stage === 'launch' && event.animationName === 'rocket-liftoff') onLaunchEnd?.();
    };

    const scene = (
        <div
            className={`rocket-scene${compact ? ' rocket-scene-compact' : ''}${fullscreen ? ' rocket-scene-fullscreen' : ''}`}
            role="status"
            aria-live="polite"
            data-rocket-stage={stage}
            data-loading-phase={loadingPhase}
            data-event-animation="2d"
            data-reduced-motion={String(reducedMotion)}
            data-scene-beat={sceneBeat}
        >
            <svg className="rocket-scene-art" viewBox="0 0 260 170" aria-hidden="true" focusable="false">
                <g className="rocket-scene-details">
                    <circle data-scene-detail="0" cx="38" cy="48" r="3" />
                    <path data-scene-detail="1" d="M58 25v8m-4-4h8" />
                    <circle data-scene-detail="2" cx="225" cy="42" r="4" />
                </g>
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
            <p className="rocket-scene-message">{messages[messageIndex] ?? message ?? ROCKET_STAGE_LABELS[stage]}</p>
        </div>
    );

    if (!fullscreen) return scene;
    if (!mounted) return null;

    return createPortal(
        <div
            ref={overlayRef}
            className="rocket-scene-overlay"
            data-loading-scene
            data-loading-phase={loadingPhase}
            onClick={event => event.stopPropagation()}
            onDragOver={event => { event.preventDefault(); event.stopPropagation(); }}
            onDrop={event => { event.preventDefault(); event.stopPropagation(); }}
        >
            {scene}
        </div>,
        document.body,
    );
}
