import Groq from 'groq-sdk';
import type { EventData } from '../types/event';
import { parseMultipleEvents } from './eventParsing';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Prompt instructions for consistent JSON output
const PROMPT = `Analizza questa immagine (locandina evento). Estrai tutti gli eventi presenti e restituisci SOLO JSON.
Schema array JSON di eventi:
[
  {
    "title": "string",
    "description": "string",
    "date": "string",
    "time": "string",
    "location": "string",
    "organizer": "string",
    "category": "string",
    "price": "string"
  }
]
Regole:
- Usa italiano.
- Se campo non disponibile lascia stringa vuota.
- date: preferisci formato GG/MM/AAAA se possibile.
- time: HH:MM.
- category: una tra Musica, Sport, Cultura, Teatro, Cinema, Food & Drink, Feste, Bambini, Workshop, Altro.
NON aggiungere testo fuori dal JSON.`;

export async function analyzeEventImageGroq(file: File): Promise<EventData[]> {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY non configurata');

  const bytes = await file.arrayBuffer();
  const b64 = Buffer.from(bytes).toString('base64');

  const model = process.env.GROQ_MODEL || 'llama-3.2-11b-vision-preview';
  // Lista modelli vision più recenti (ordine preferenza). Alcuni nomi possono cambiare.
  const envModelRaw = process.env.GROQ_MODEL?.trim();
  const candidateModels: string[] = [
    envModelRaw && envModelRaw.length > 0 ? envModelRaw : 'meta-llama/llama-4-scout-17b-16e-instruct',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant'
  ];

  let lastError: any;
  let response;
  for (const model of candidateModels) {
    try {
      response = await groq.chat.completions.create({
        model: model as any,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:${file.type};base64,${b64}` } }
            ]
          }
        ]
      });
      // Se funziona, break
      console.log('Groq model utilizzato:', model);
      break;
    } catch (err: any) {
      lastError = err;
      if (err?.error?.code === 'model_decommissioned' || err?.error?.code === 'model_not_found') {
        console.warn(`Modello non disponibile/decommissioned: ${model}. Provo prossimo...`);
        continue;
      }
      // Errori diversi: fermiamo
      throw err;
    }
  }
  if (!response) {
    throw new Error('Nessun modello Groq vision disponibile. Ultimo errore: ' + (lastError?.error?.message || lastError));
  }
  const content = response.choices?.[0]?.message?.content?.trim() || '';
  if (!content) return [];

  const cleaned = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  let raw: any;
  try {
    raw = JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) raw = JSON.parse(match[0]);
  else throw new Error('Risposta Groq non parseable in JSON');
  }
  if (!Array.isArray(raw)) raw = [raw];

  return raw.map((ev: any): EventData => ({
    title: ev.title || '',
    // Se manca la descrizione, genera un riassunto descrittivo
    description: ev.description && ev.description.trim().length > 0
      ? ev.description
      : generateDescription(ev),
    date: ev.date || '',
    time: ev.time || '',
    location: ev.location || '',
    // Se manca l'organizzatore, metti "pubblico"
    organizer: ev.organizer && ev.organizer.trim().length > 0 ? ev.organizer : 'pubblico',
    category: ev.category || 'Altro',
    // Se manca il prezzo, metti "Libero"
    price: ev.price && ev.price.trim().length > 0 ? ev.price : 'Libero',
    rawText: content,
    imageUrl: undefined
  }));

// Genera una descrizione riassuntiva se mancante
function generateDescription(ev: any): string {
  let parts = [];
  if (ev.title) parts.push(ev.title);
  if (ev.date || ev.time) parts.push(`Quando: ${[ev.date, ev.time].filter(Boolean).join(' ')}`);
  if (ev.location) parts.push(`Dove: ${ev.location}`);
  if (ev.category) parts.push(`Categoria: ${ev.category}`);
  if (ev.organizer) parts.push(`Organizzatore: ${ev.organizer}`);
  if (ev.price) parts.push(`Prezzo: ${ev.price}`);
  if (parts.length === 0) return 'Evento senza dettagli.';
  return parts.join('. ') + '.';
}
}
