// Client-side hybrid analysis: OpenCV.js preprocessing + Tesseract.js OCR + parsing
// Questo file viene caricato solo lato client.

import Tesseract from 'tesseract.js';
import { parseMultipleEvents } from './eventParsing';
import type { EventData } from '../types/event';

let opencvLoaded = false;

export async function loadOpenCV(): Promise<void> {
  if (opencvLoaded) return;
  if (typeof window === 'undefined') return;
  if ((window as any).cv) { opencvLoaded = true; return; }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.x/opencv.js';
    script.async = true;
    script.onload = () => {
      const cv = (window as any).cv;
      if (cv && cv['onRuntimeInitialized']) {
        cv['onRuntimeInitialized'] = () => { opencvLoaded = true; resolve(); };
      } else {
        // Alcune build sono già pronte
        opencvLoaded = true; resolve();
      }
    };
    script.onerror = (e) => reject(new Error('Failed to load OpenCV.js'));
    document.head.appendChild(script);
  });
}

function preprocessWithOpenCV(image: HTMLImageElement): HTMLCanvasElement | null {
  try {
    const cv = (window as any).cv;
    if (!cv) return null;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);

    const src = cv.imread(canvas);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    const denoised = new cv.Mat();
    cv.medianBlur(gray, denoised, 3);
    const thresh = new cv.Mat();
    cv.adaptiveThreshold(denoised, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 15);

    cv.imshow(canvas, thresh);
    src.delete(); gray.delete(); denoised.delete(); thresh.delete();
    return canvas;
  } catch (e) {
    console.warn('OpenCV preprocessing failed, fallback raw image', e);
    return null;
  }
}

export interface LocalAnalysisResult {
  engine: 'local';
  events: EventData[];
  rawText: string;
  elapsedMs: number;
  usedPreprocess: boolean;
}

export async function analyzeImageLocally(file: File): Promise<LocalAnalysisResult> {
  const start = performance.now();

  // Create object URL
  const url = URL.createObjectURL(file);
  try {
    await loadOpenCV();
    const img = await loadImage(url);
    const processedCanvas = preprocessWithOpenCV(img);
    const ocrInput = processedCanvas || img;

    // Convert canvas/image to blob for Tesseract
    const blob: Blob = await new Promise((resolve) => {
      if (ocrInput instanceof HTMLCanvasElement) {
        ocrInput.toBlob(b => resolve(b!), 'image/png');
      } else {
        // Image element: fetch again
        fetch(url).then(r => r.blob()).then(resolve);
      }
    });

    const { data: { text } } = await Tesseract.recognize(blob, 'ita');
    const events = parseMultipleEvents(text);
    return {
      engine: 'local',
      events,
      rawText: text,
      elapsedMs: Math.round(performance.now() - start),
      usedPreprocess: !!processedCanvas
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
