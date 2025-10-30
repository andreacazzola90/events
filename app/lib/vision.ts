import OpenAI from 'openai';
import { EventData } from '../types/event';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Analizza un'immagine di evento usando GPT-4 Vision
 * Identifica automaticamente uno o più eventi nell'immagine
 */
export async function analyzeEventImage(imageFile: File): Promise<EventData[]> {
  try {
    // Converti il file in base64 usando le API di Node.js
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');
    
    // Crea il prompt per GPT-4 Vision
    const prompt = `Analizza questa immagine di un volantino/locandina di evento.

ISTRUZIONI:
1. Identifica se l'immagine contiene UNO o PIÙ eventi
2. Per OGNI evento trovato, estrai le seguenti informazioni:
   - title: Il titolo/nome dell'evento
   - description: Una breve descrizione dell'evento (cosa succederà, chi parteciperà, etc.)
   - date: La data dell'evento (formato: GG/MM/AAAA o "GG Mese AAAA")
   - time: L'orario dell'evento (formato: HH:MM o "Ore HH:MM")
   - location: Il luogo/indirizzo dove si terrà l'evento
   - organizer: Chi organizza l'evento (se presente)
   - price: Il prezzo/costo (se presente, altrimenti "Gratis" o vuoto)
   - category: La categoria dell'evento tra queste opzioni:
     * "Musica" - concerti, dj set, performance musicali
     * "Sport" - eventi sportivi, partite, competizioni
     * "Cultura" - mostre, conferenze, presentazioni libri
     * "Teatro" - spettacoli teatrali, cabaret, stand-up comedy
     * "Cinema" - proiezioni, festival del cinema
     * "Food & Drink" - sagre, degustazioni, eventi gastronomici
     * "Feste" - feste, party, celebrazioni
     * "Bambini" - eventi per famiglie e bambini
     * "Workshop" - corsi, laboratori, seminari
     * "Altro" - se non rientra in nessuna categoria

3. Se ci sono più eventi nella stessa immagine (es. programma settimanale, calendario mensile), 
   crea un oggetto separato per ciascun evento

IMPORTANTE:
- Sii preciso nell'estrazione delle informazioni
- Se un campo non è presente nell'immagine, lascialo vuoto
- Per la categoria, scegli quella più appropriata
- Se vedi separatori visivi o date multiple, probabilmente sono eventi diversi

Rispondi SOLO con un JSON array nel seguente formato (senza markdown, senza spiegazioni):
[
  {
    "title": "Nome Evento",
    "description": "Descrizione evento",
    "date": "01/11/2025",
    "time": "21:00",
    "location": "Via Example 123, Roma",
    "organizer": "Nome Organizzatore",
    "category": "Musica",
    "price": "10€",
    "rawText": "Testo grezzo estratto dall'immagine"
  }
]`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Usa gpt-4o che ha capacità vision
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${imageFile.type};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
      temperature: 0.2, // Bassa temperatura per risposte più precise
    });

    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('Nessuna risposta ricevuta da GPT-4 Vision');
    }

    // Parse la risposta JSON
    let events: EventData[];
    try {
      // Rimuovi eventuali markdown code blocks
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      events = JSON.parse(cleanedContent);
      
      // Se non è un array, rendilo un array
      if (!Array.isArray(events)) {
        events = [events];
      }
    } catch (parseError) {
      console.error('Errore nel parsing della risposta:', content);
      throw new Error('Formato di risposta non valido da GPT-4 Vision');
    }

    // Valida e normalizza i dati
    return events.map(event => ({
      title: event.title || '',
      description: event.description || '',
      date: event.date || '',
      time: event.time || '',
      location: event.location || '',
      organizer: event.organizer || '',
      category: event.category || 'Altro',
      price: event.price || '',
      rawText: event.rawText || content,
      imageUrl: undefined,
    }));

  } catch (error) {
    console.error('Errore nell\'analisi dell\'immagine:', error);
    throw error;
  }
}

/**
 * Funzione legacy mantenuta per compatibilità
 * @deprecated Usa analyzeEventImage invece
 */
export async function extractTextFromImage(imageFile: File): Promise<string> {
  const events = await analyzeEventImage(imageFile);
  return events.map(e => e.rawText).join('\n\n---\n\n');
}

/**
 * Funzione legacy mantenuta per compatibilità
 * @deprecated Usa analyzeEventImage invece
 */
export function parseMultipleEvents(rawText: string): EventData[] {
  // Questa funzione non è più necessaria con GPT-4 Vision
  // ma la manteniamo per compatibilità
  return [{
    title: 'Evento',
    description: rawText,
    date: '',
    time: '',
    location: '',
    organizer: '',
    category: 'Altro',
    price: '',
    rawText: rawText,
    imageUrl: undefined,
  }];
}
