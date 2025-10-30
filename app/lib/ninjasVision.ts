import type { EventData } from '../types/event';
import { parseMultipleEvents } from './eventParsing';

const API_NINJAS_KEY = process.env.API_NINJAS_KEY;
const API_NINJAS_ENDPOINT = 'https://api.api-ninjas.com/v1/imagetotext';

async function compressImageBelow200KB(file: File): Promise<File> {
  const MAX_BYTES = 200 * 1024;
  const arrayBuffer = await file.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);
  // Se già sotto soglia torna subito
  if (buffer.length <= MAX_BYTES) return file;

  // Proviamo a usare sharp se disponibile
  let sharpLib: any;
  try {
    // dynamic import per non rompere build se sharp opzionale
    sharpLib = (await import('sharp')).default;
  } catch (e) {
    console.warn('sharp non disponibile, impossibile comprimere. Dimensione attuale:', buffer.length);
    return file; // fallback: restituisce originale (potrebbe fallire su piano free)
  }

  let quality = 80; // partenza
  // Usiamo ciclo riducendo qualità finché sotto soglia o qualità troppo bassa
  for (; quality >= 30; quality -= 10) {
    try {
      // Convertiamo tutto in JPEG progressivo per massima compressione
      const out = await sharpLib(buffer)
        .rotate() // correzione EXIF
        .jpeg({ quality, progressive: true, chromaSubsampling: '4:2:0' })
        .toBuffer();
      if (out.length <= MAX_BYTES) {
        return new File([out], file.name.replace(/\.(png|jpeg|jpg)$/i, '.jpg'), { type: 'image/jpeg' });
      }
      buffer = out; // aggiorna per tentativo successivo
    } catch (err) {
      console.warn('Errore tentativo compressione qualità', quality, err);
    }
  }

  // Ultimo tentativo: resize riducendo dimensioni se ancora troppo grande
  try {
    const meta = await sharpLib(buffer).metadata();
    if (meta.width && meta.height) {
      const scale = 0.5; // riduci a metà
      const resized = await sharpLib(buffer)
        .resize(Math.round(meta.width * scale))
        .jpeg({ quality: 40, progressive: true })
        .toBuffer();
      if (resized.length <= MAX_BYTES) {
        return new File([resized], file.name.replace(/\.(png|jpeg|jpg)$/i, '.jpg'), { type: 'image/jpeg' });
      }
      if (resized.length < buffer.length) {
        buffer = resized; // se riduce comunque, usa quella per invio
      }
    }
  } catch (e) {
    console.warn('Errore resize finale', e);
  }

  // Ritorna versione più compressa ottenuta anche se >200KB (ultima buffer)
  return new File([buffer], file.name.replace(/\.(png|jpeg|jpg)$/i, '.jpg'), { type: 'image/jpeg' });
}

// Analisi immagine usando API Ninjas OCR con compressione preventiva (<200KB se possibile)
export async function analyzeEventImageNinjas(imageFile: File): Promise<EventData[]> {
  if (!API_NINJAS_KEY) {
    throw new Error('API_NINJAS_KEY non configurata');
  }
  // Comprimi prima dell'invio (piano free richiede <=200KB)
  const compressed = await compressImageBelow200KB(imageFile);
  console.log('Dimensioni originali:', (await imageFile.arrayBuffer()).byteLength, 'Dimensioni compresse:', (await compressed.arrayBuffer()).byteLength);

  // Prepara form-data da inviare a API Ninjas
  const formData = new FormData();
  formData.append('image', compressed, compressed.name);

  const res = await fetch(API_NINJAS_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-Api-Key': API_NINJAS_KEY
    },
    body: formData
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API Ninjas error: ${res.status} ${txt}`);
  }

  // Risposta attesa: array di oggetti con {text, x1,y1,x2,y2} per ogni box
  let json: any;
  try {
    json = await res.json();
  } catch (e) {
    const txt = await res.text();
    throw new Error('Impossibile decodificare JSON OCR: ' + txt);
  }

  if (!Array.isArray(json)) {
    throw new Error('Formato risposta inatteso da API Ninjas (atteso array)');
  }

  const combinedText = json.map((b: any) => b.text).join('\n');

  const events = parseMultipleEvents(combinedText);
  return events.map(ev => ({
    ...ev,
    rawText: combinedText
  }));
}
