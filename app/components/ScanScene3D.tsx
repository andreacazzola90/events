'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Rocket } from 'lucide-react';
import type { BufferGeometry, Material, WebGLRenderer } from 'three';
import styles from './ScanScene3D.module.css';

interface ScanScene3DProps {
    message: string;
    loadingPhase: 'scan-image' | 'scan-link' | 'shared-image';
}

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const inertStates = new WeakMap<HTMLElement, { count: number; original: string | null }>();

function acquireInert(target: HTMLElement) {
    const state = inertStates.get(target);
    if (state) {
        state.count += 1;
    } else {
        inertStates.set(target, { count: 1, original: target.getAttribute('inert') });
        target.setAttribute('inert', '');
    }
}

function releaseInert(target: HTMLElement) {
    const state = inertStates.get(target);
    if (!state || --state.count > 0) return;
    if (state.original === null) target.removeAttribute('inert');
    else target.setAttribute('inert', state.original);
    inertStates.delete(target);
}

export default function ScanScene3D({ message, loadingPhase }: ScanScene3DProps) {
    const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
    const overlayRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const overlay = overlayRef.current;
        const canvas = canvasRef.current;
        if (!mounted || !overlay || !canvas) return;
        overlay.dataset.sceneState = 'loading';

        const header = document.querySelector<HTMLElement>('.site-header');
        const previousFocus = document.activeElement;
        const inertTargets = Array.from(document.querySelectorAll<HTMLElement>('body > main, body > footer'))
            .filter(target => !target.contains(header) && !target.contains(overlay));
        inertTargets.forEach(acquireInert);
        if (previousFocus instanceof HTMLElement && inertTargets.some(target => target.contains(previousFocus))) {
            previousFocus.blur();
        }

        const measureHeader = () => {
            const bottom = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
            overlay.style.top = `${bottom}px`;
        };
        measureHeader();
        const headerObserver = new ResizeObserver(measureHeader);
        if (header) headerObserver.observe(header);
        window.addEventListener('resize', measureHeader);
        window.visualViewport?.addEventListener('resize', measureHeader);

        let cancelled = false;
        let frame = 0;
        let renderer: WebGLRenderer | undefined;
        let sceneObserver: ResizeObserver | undefined;
        let removeMotionListener: (() => void) | undefined;
        let disposeShadow: (() => void) | undefined;
        const geometries = new Set<BufferGeometry>();
        const materials = new Set<Material>();
        const disposeScene = () => {
            cancelAnimationFrame(frame);
            sceneObserver?.disconnect();
            removeMotionListener?.();
            disposeShadow?.();
            disposeShadow = undefined;
            geometries.forEach(geometry => geometry.dispose());
            materials.forEach(material => material.dispose());
            geometries.clear();
            materials.clear();
            renderer?.dispose();
            renderer?.forceContextLoss();
            renderer = undefined;
        };
        const fallback = () => {
            overlay.dataset.sceneState = 'fallback';
            disposeScene();
        };
        const contextLost = (event: Event) => {
            event.preventDefault();
            fallback();
        };
        canvas.addEventListener('webglcontextlost', contextLost);

        void import('three').then(THREE => {
            if (cancelled) return;
            try {
                const scene = new THREE.Scene();
                scene.background = new THREE.Color('#f3f7f6');
                scene.fog = new THREE.Fog('#f3f7f6', 19, 38);
                renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                renderer.shadowMap.enabled = true;
                renderer.shadowMap.type = THREE.PCFShadowMap;
                renderer.toneMapping = THREE.ACESFilmicToneMapping;
                renderer.toneMappingExposure = 1.25;

                const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
                const geometry = <Geometry extends BufferGeometry>(value: Geometry) => {
                    geometries.add(value);
                    return value;
                };
                const material = (color: string, metalness = 0.1, roughness = 0.42) => {
                    const value = new THREE.MeshStandardMaterial({ color, metalness, roughness });
                    materials.add(value);
                    return value;
                };
                const porcelain = material('#ffffff', 0.18, 0.28);
                const coral = material('#ee735f', 0.22, 0.32);
                const teal = material('#168b84', 0.4, 0.27);
                const ink = material('#194440', 0.5, 0.22);
                const silver = material('#cbdad7', 0.65, 0.3);
                const floorMaterial = material('#e7efec', 0, 0.95);
                const mesh = (shape: BufferGeometry, surface: Material, parent: import('three').Object3D = scene) => {
                    const value = new THREE.Mesh(shape, surface);
                    value.castShadow = true;
                    value.receiveShadow = true;
                    parent.add(value);
                    return value;
                };

                scene.add(new THREE.HemisphereLight('#ffffff', '#b6d4cd', 3));
                const key = new THREE.DirectionalLight('#fff5ec', 4.5);
                disposeShadow = () => key.shadow.dispose();
                key.position.set(6, 10, 7);
                key.castShadow = true;
                key.shadow.mapSize.set(1024, 1024);
                key.shadow.camera.left = -7;
                key.shadow.camera.right = 7;
                key.shadow.camera.top = 8;
                key.shadow.camera.bottom = -7;
                key.shadow.normalBias = 0.04;
                scene.add(key);
                const rim = new THREE.DirectionalLight('#a9e3df', 2.5);
                rim.position.set(-5, 5, -4);
                scene.add(rim);

                const floor = mesh(geometry(new THREE.PlaneGeometry(200, 200)), floorMaterial);
                floor.rotation.x = -Math.PI / 2;
                floor.position.y = -0.18;
                floor.castShadow = false;
                const grid = new THREE.GridHelper(80, 80, '#bdceca', '#d2ded9');
                geometry(grid.geometry);
                const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
                gridMaterials.forEach(value => materials.add(value));
                grid.position.y = -0.17;
                scene.add(grid);

                const pad = mesh(geometry(new THREE.CylinderGeometry(2.6, 2.85, 0.3, 80)), porcelain);
                pad.position.y = 0;
                const padTop = mesh(geometry(new THREE.CylinderGeometry(2.3, 2.3, 0.04, 80)), teal);
                padTop.position.y = 0.17;
                const ring = mesh(geometry(new THREE.TorusGeometry(1.95, 0.035, 12, 100)), porcelain);
                ring.rotation.x = Math.PI / 2;
                ring.position.y = 0.21;
                for (let index = 0; index < 12; index += 1) {
                    const angle = index * Math.PI / 6;
                    const marker = mesh(geometry(new THREE.BoxGeometry(0.06, 0.035, 0.22)), silver);
                    marker.position.set(Math.sin(angle) * 2.5, 0.18, Math.cos(angle) * 2.5);
                    marker.rotation.y = angle;
                }

                const rocket = new THREE.Group();
                rocket.position.y = 2.8;
                rocket.rotation.z = -0.12;
                scene.add(rocket);
                mesh(geometry(new THREE.CylinderGeometry(0.63, 0.72, 2.2, 64)), porcelain, rocket);
                const nose = mesh(geometry(new THREE.ConeGeometry(0.63, 1.25, 64)), coral, rocket);
                nose.position.y = 1.725;
                const collar = mesh(geometry(new THREE.CylinderGeometry(0.73, 0.73, 0.18, 64)), teal, rocket);
                collar.position.y = -0.96;
                const nozzle = mesh(geometry(new THREE.CylinderGeometry(0.36, 0.5, 0.4, 48, 1, true)), ink, rocket);
                nozzle.position.y = -1.35;
                const portholeRim = mesh(geometry(new THREE.TorusGeometry(0.33, 0.075, 20, 64)), silver, rocket);
                portholeRim.position.set(0, 0.36, 0.64);
                const porthole = mesh(geometry(new THREE.SphereGeometry(0.29, 48, 32)), ink, rocket);
                porthole.scale.z = 0.3;
                porthole.position.set(0, 0.36, 0.69);
                const glint = mesh(geometry(new THREE.SphereGeometry(0.075, 20, 16)), porcelain, rocket);
                glint.scale.z = 0.2;
                glint.position.set(-0.09, 0.46, 0.78);
                const finShape = new THREE.Shape();
                finShape.moveTo(0.55, -0.15);
                finShape.lineTo(1.18, -1.35);
                finShape.lineTo(1.12, -1.64);
                finShape.lineTo(0.54, -1.06);
                finShape.closePath();
                const finGeometry = geometry(new THREE.ExtrudeGeometry(finShape, { depth: 0.13, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.04, bevelSegments: 3, steps: 1 }));
                finGeometry.translate(0, 0, -0.065);
                for (let index = 0; index < 3; index += 1) {
                    const fin = mesh(finGeometry, coral, rocket);
                    fin.rotation.y = index * Math.PI * 2 / 3;
                }
                const flame = mesh(geometry(new THREE.ConeGeometry(0.22, 0.65, 32)), material('#ffc685', 0, 0.6), rocket);
                flame.rotation.z = Math.PI;
                flame.position.y = -1.85;

                const orbit = new THREE.Group();
                orbit.position.y = 2.6;
                orbit.rotation.set(0.38, 0.1, -0.3);
                scene.add(orbit);
                const orbitLine = mesh(geometry(new THREE.TorusGeometry(3.35, 0.018, 8, 160)), silver, orbit);
                orbitLine.rotation.x = Math.PI / 2;
                const satellite = mesh(geometry(new THREE.OctahedronGeometry(0.19)), coral, orbit);
                satellite.position.x = 3.35;

                const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
                let elapsed = 0;
                let lastTime: number | undefined;
                const render = () => renderer?.render(scene, camera);
                const animate = (time: number) => {
                    if (cancelled || !renderer || motion.matches) return;
                    elapsed += lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, 0.05);
                    lastTime = time;
                    rocket.position.y = 2.8 + Math.sin(elapsed * 1.4) * 0.16;
                    rocket.rotation.y = Math.sin(elapsed * 0.45) * 0.25 - 0.12;
                    rocket.rotation.z = -0.12 + Math.sin(elapsed * 0.8) * 0.035;
                    flame.scale.y = 1 + Math.sin(elapsed * 9) * 0.14;
                    orbit.rotation.y = elapsed * 0.23;
                    satellite.rotation.y = elapsed;
                    render();
                    frame = requestAnimationFrame(animate);
                };
                const updateMotion = () => {
                    cancelAnimationFrame(frame);
                    lastTime = undefined;
                    overlay.dataset.reducedMotion = String(motion.matches);
                    if (motion.matches) {
                        rocket.position.y = 2.8;
                        rocket.rotation.set(0, -0.12, -0.12);
                        flame.scale.y = 1;
                        render();
                    } else {
                        frame = requestAnimationFrame(animate);
                    }
                };
                motion.addEventListener('change', updateMotion);
                removeMotionListener = () => motion.removeEventListener('change', updateMotion);
                const resize = () => {
                    if (!renderer) return;
                    const { width, height } = canvas.getBoundingClientRect();
                    if (width <= 0 || height <= 0) return;
                    renderer.setSize(width, height, false);
                    camera.aspect = width / height;
                    const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1));
                    const distance = 4.05 / Math.sin(halfFov);
                    camera.position.set(distance * 0.38, distance * 0.35 + 2, distance * 0.85);
                    camera.lookAt(0, 2.3, 0);
                    camera.far = distance + 60;
                    scene.fog = new THREE.Fog('#f3f7f6', distance + 9, distance + 28);
                    camera.updateProjectionMatrix();
                    render();
                };
                sceneObserver = new ResizeObserver(resize);
                sceneObserver.observe(canvas);
                resize();
                overlay.dataset.sceneState = 'ready';
                updateMotion();
            } catch {
                fallback();
            }
        }).catch(() => {
            if (!cancelled) fallback();
        });

        return () => {
            cancelled = true;
            disposeScene();
            canvas.removeEventListener('webglcontextlost', contextLost);
            headerObserver.disconnect();
            window.removeEventListener('resize', measureHeader);
            window.visualViewport?.removeEventListener('resize', measureHeader);
            inertTargets.forEach(releaseInert);
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected &&
                !document.querySelector('dialog[open]') &&
                (document.activeElement === document.body || document.activeElement === previousFocus)) {
                previousFocus.focus({ preventScroll: true });
            }
        };
    }, [mounted]);

    return mounted ? createPortal(
        <div ref={overlayRef} className={styles.overlay} data-scan-scene data-scene-state="loading" data-loading-phase={loadingPhase}
            onClick={event => event.stopPropagation()}
            onDragOver={event => { event.preventDefault(); event.stopPropagation(); }}
            onDrop={event => { event.preventDefault(); event.stopPropagation(); }}>
            <div className={styles.visual}>
                <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
                <div className={styles.fallback} aria-hidden="true">
                    <div className={styles.fallbackOrbit} />
                    <Rocket size={96} strokeWidth={1.2} />
                    <div className={styles.fallbackPad} />
                </div>
            </div>
            <div className={styles.status} role="status" aria-live="polite" aria-atomic="true" data-loading-phase={loadingPhase}>
                <span className={styles.statusMark} aria-hidden="true" />
                <p>{message}</p>
            </div>
        </div>,
        document.body,
    ) : null;
}