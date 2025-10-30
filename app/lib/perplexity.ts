import type { EventData } from '../types/event';

// Integrazione Perplexity API (vision via chat completions). Alcuni modelli supportano immagini.
// Parametri personalizzabili via variabili ambiente.
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_ENDPOINT = process.env.PERPLEXITY_ENDPOINT || 'https://api.perplexity.ai/chat/completions';
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL || 'sonar-reasoning';

export async function analyzeEventImagePerplexity(imageFile: File): Promise<EventData[]> {
  if (!PERPLEXITY_API_KEY) throw new Error('PERPLEXITY_API_KEY non configurata');

  // Convert file to base64
  const bytes = await imageFile.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64 = buffer.toString('base64');

  const prompt = `Analizza questa immagine (locandina / volantino) e restituisci SOLO un JSON array senza testo aggiuntivo.
Ogni elemento dell'array rappresenta un evento.
Campi richiesti per ciascun evento:
title, description, date, time, location, organizer, category, price.
Regole:
- Se data non chiara lascia stringa vuota.
- time usa formato HH:MM se possibile.
- category scegli tra: Musica, Sport, Cultura, Teatro, Cinema, Food & Drink, Feste, Bambini, Workshop, Altro.
- Se più eventi presenti separali come elementi distinti.
Esempio output JSON:
[{"title":"Festival Jazz","description":"Serata jazz con artisti locali","date":"12/11/2025","time":"21:00","location":"Teatro Centrale","organizer":"Comune","category":"Musica","price":"Ingresso libero"}]`;

  const body = {
    model: PERPLEXITY_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image', image_base64: base64 }
        ]
      }
    ],
    temperature: 0.2,
    max_tokens: 800
  };

  const res = await fetch(PERPLEXITY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Perplexity API error: ${res.status} ${txt}`);
  }
  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content || '';
  if (!content) return [];

  // Rimuove code fences se presenti
  const cleaned = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();

  let events: any;
  try {
    events = JSON.parse(cleaned);
  } catch (e) {
    // Estrae blocco JSON principale
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      events = JSON.parse(match[0]);
    } else {
      // Se non è array prova oggetto singolo
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objMatch) {
        events = JSON.parse(objMatch[0]);
      } else {
        throw new Error('Formato risposta non JSON');
      }
    }
  }
  if (!Array.isArray(events)) events = [events];

  return events.map((ev: any): EventData => ({
    title: ev.title || '',
    description: ev.description || '',
    date: ev.date || '',
    time: ev.time || '',
    location: ev.location || '',
    organizer: ev.organizer || '',
    category: ev.category || 'Altro',
    price: ev.price || '',
    rawText: content,
    imageUrl: undefined
  }));
}
