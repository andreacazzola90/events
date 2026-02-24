import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromImageSimple } from '../../lib/ocr-simple';
import { extractTextFromImage } from '../../lib/ocr';
import Groq from 'groq-sdk';
import { compressImage } from '../../lib/image-utils';
import { groupEventsByDate } from '../../../lib/event-utils';
import { buildEventExtractionHints } from '../../../lib/event-hints';
import type { EventData } from '../../types/event';
import { extensionCorsPreflight, withExtensionCors } from '../../../lib/extension-cors';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});


export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');

    if (!file || !(file instanceof File)) {
      return withExtensionCors(
        NextResponse.json(
          { error: 'No image file provided' },
          { status: 400 }
        ),
        request
      );
    }

    // Convert File to Buffer
    // Log per debug
    console.log('Ricevuto file:', file.name, 'Size:', file.size, 'Type:', file.type);

    // Compress image only as fallback variant (keep original first for better OCR on small text)
    const compressedFile = await compressImage(file, 1024 * 1024);

    let rawText = '';
    let lastOcrError: unknown = null;
    const ocrCandidates: File[] = [file];
    const isCompressedDifferent = compressedFile.size !== file.size || compressedFile.type !== file.type;
    if (isCompressedDifferent) {
      ocrCandidates.push(compressedFile);
    }

    // Step 1: Extract text from image using OCR (original first, compressed fallback)
    for (const [index, candidateFile] of ocrCandidates.entries()) {
      const variantLabel = index === 0 ? 'original' : 'compressed';
      console.log(`🔄 OCR attempt on ${variantLabel} image (size: ${candidateFile.size} bytes)`);

      try {
        const simpleText = await extractTextFromImageSimple(candidateFile);
        if (simpleText && simpleText.trim().length >= 10) {
          rawText = simpleText;
          console.log(`✅ Simplified OCR successful on ${variantLabel} image`);
          break;
        }

        console.log(`⚠️ Simplified OCR returned little/no text on ${variantLabel} image, trying fallback OCR...`);
        const fallbackText = await extractTextFromImage(candidateFile);
        if (fallbackText && fallbackText.trim().length >= 10) {
          rawText = fallbackText;
          console.log(`✅ Fallback OCR successful on ${variantLabel} image`);
          break;
        }
      } catch (candidateError) {
        lastOcrError = candidateError;
        console.warn(`⚠️ OCR failed on ${variantLabel} image:`, candidateError);
      }
    }
    
    console.log('📝 Testo estratto dall\'immagine:', rawText.substring(0, 200) + '...');

    // Verifica che ci sia testo estratto
    if (!rawText || rawText.trim().length < 10) {
      if (lastOcrError) {
        console.warn('Ultimo errore OCR registrato:', lastOcrError);
      }
      throw new Error('Nessun testo leggibile trovato nell\'immagine. Prova con uno screenshot più ravvicinato e ben contrastato (testo più grande), oppure ritaglia solo la zona del volantino.');
    }

    // Step 2: Build heuristic hints to aiutare Groq a riconoscere date/orari/prezzi
    const heuristicHints = buildEventExtractionHints(rawText);

    // Step 3: Use Groq AI to parse the extracted text into structured event data
    console.log('=== GROQ API CALL (IMAGE) ===');
    console.log('Environment check:');
    console.log('- GROQ_API_KEY configured:', !!process.env.GROQ_API_KEY);
    console.log('- GROQ_API_KEY length:', process.env.GROQ_API_KEY?.length || 0);
    console.log('- Raw text length:', rawText.length);
    console.log('- Raw text preview:', rawText.slice(0, 200).replace(/\s+/g, ' '));
    console.log('- Platform:', process.env.VERCEL ? 'Vercel' : 'Local');
    
    if (!process.env.GROQ_API_KEY) {
      console.error('❌ GROQ_API_KEY non configurata!');
      throw new Error('API non configurata correttamente - GROQ_API_KEY mancante');
    }

    // Determina se ci sono eventi multipli analizzando il testo in modo intelligente
    const textSections = rawText.split(/\n\n+/).filter(s => s.trim().length > 0);
    const dateMatches = rawText.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g) || [];
    const uniqueDates = [...new Set(dateMatches)];
    const timeMatches = rawText.match(/\d{1,2}:\d{2}/g) || [];
    
    // Cerca indicatori di eventi multipli
    const lowerText = rawText.toLowerCase();
    const hasLineup = lowerText.includes('lineup') || lowerText.includes('line up') || lowerText.includes('line-up');
    const hasProgramma = lowerText.includes('programma') || lowerText.includes('program');
    const hasMultipleDays = lowerText.includes('giorno 1') || lowerText.includes('day 1') || 
                           lowerText.includes('sabato') && lowerText.includes('domenica');
    const hasVsOrWith = (rawText.match(/\s+vs\s+/gi) || []).length > 0 || 
                       (rawText.match(/\s+with\s+/gi) || []).length > 0 ||
                       (rawText.match(/\s+&\s+/g) || []).length > 2;
    
    // Rileva cicli/rassegne: date diverse + stesso orario ripetuto
    const hasCyclePattern = uniqueDates.length >= 3 && timeMatches.length >= 3;
    
    // Rileva titoli in maiuscolo ripetuti (tipico di rassegne)
    const upperCaseTitles = rawText.match(/^[A-Z\s]{3,}$/gm) || [];
    const hasMultipleTitles = upperCaseTitles.length >= 3;
    
    // Cerca parole chiave di cicli
    const hasCiclo = lowerText.includes('ciclo') || lowerText.includes('rassegna') || 
                     lowerText.includes('stagione') || lowerText.includes('incontri');
    
    // Determina se ci sono eventi multipli
    const hasMultipleEvents = (dateMatches.length > 1 && timeMatches.length > 1) || 
                             textSections.length > 5 ||
                             hasLineup || 
                             hasProgramma ||
                             hasMultipleDays ||
                             (hasVsOrWith && (dateMatches.length > 1 || timeMatches.length > 2)) ||
                             hasCyclePattern ||
                             (hasCiclo && uniqueDates.length >= 2) ||
                             hasMultipleTitles;
    
    console.log('🔍 Analisi eventi multipli:', {
      dateMatches: dateMatches.length,
      uniqueDates: uniqueDates.length,
      timeMatches: timeMatches.length,
      textSections: textSections.length,
      upperCaseTitles: upperCaseTitles.length,
      hasLineup,
      hasProgramma,
      hasMultipleDays,
      hasVsOrWith,
      hasCyclePattern,
      hasCiclo,
      hasMultipleTitles,
      conclusion: hasMultipleEvents ? 'EVENTI MULTIPLI' : 'EVENTO SINGOLO'
    });

    const currentDate = new Date().toISOString().split('T')[0];

    const prompt = hasMultipleEvents ? 
    // PROMPT PER EVENTI MULTIPLI
    `Sei un esperto analista di eventi. Questo contenuto contiene MULTIPLI EVENTI. Analizza attentamente ed estrai TUTTI gli eventi presenti.

PASSO 1 - IDENTIFICAZIONE:
Prima di tutto, CONTA quanti eventi distinti vedi. Cerca:
- Nomi di artisti/band diversi
- Date diverse (anche se stesso orario e luogo - tipico di CICLI/RASSEGNE)
- Orari diversi nello stesso giorno
- Titoli di spettacoli/concerti diversi
- Divisioni visive (linee, box, sezioni ripetute)
- CICLI/RASSEGNE: eventi con date diverse ma stesso luogo/orario (es: "I Sabati dell'Arte")

ATTENZIONE CICLI E RASSEGNE:
Se vedi parole come "ciclo", "rassegna", "stagione", "incontri", "appuntamenti":
- OGNI DATA è un EVENTO SEPARATO
- Anche se hanno stesso orario e luogo
- Esempio: "29 novembre - Cleopatra", "6 dicembre - Ritratti", "13 dicembre - Giuditta" = 3 EVENTI

ATTENZIONE A TESTI TECNICI:
Se vedi testi come "#event_description" o simili, il contenuto che segue è la DESCRIZIONE dell'evento precedente, NON un nuovo evento.

PASSO 2 - ESTRAZIONE DETTAGLIATA:
Per OGNI evento identificato, estrai TUTTE le informazioni disponibili:

ISTRUZIONI CRITICHE:
1. NON raggruppare eventi diversi insieme
2. OGNI evento DEVE avere il suo titolo unico
3. Se vedi "Artista A vs Artista B" o "Artista A & Artista B" nello stesso slot, è UN evento
4. Se vedi artisti in slot orari diversi, sono eventi SEPARATI
5. Se non sei sicuro, preferisci creare più eventi separati piuttosto che meno

REGOLE PER OGNI EVENTO:
- TITOLO: Deve essere UNICO e SPECIFICO (nome artista/band, titolo spettacolo)
  * Evita titoli generici come "Evento", "Concerto" da soli.
  * Se nel testo vedi sia il nome del locale che dell'artista, usa come titolo la parte più specifica (di solito artista/spettacolo) e lascia il locale solo in "location".
  * Esempi CORRETTI: "Marco Carola DJ Set", "Teatro: Amleto", "Rock Night con The Beatles"
  * Esempi SBAGLIATI: "Evento 1", "Concerto", "Spettacolo"
- DESCRIZIONE: Crea una descrizione DETTAGLIATA e UNICA (MINIMO 100 CARATTERI)
  * Includi: artisti/ospiti, genere musicale/tipo, dettagli specifici, ospiti speciali, contesto
  * Se il testo originale è breve, elabora il contesto o aggiungi dettagli generici pertinenti al tipo di evento
  * NON copiare l'intero testo grezzo
  * FORMATTAZIONE: Usa più righe e, quando ci sono elenchi (programma orari, punti elenco), trasformali in lista puntata con una riga per elemento.
    - Esempio: "- 16:00 Apertura porte", "- 17:00 Concerto principale", "- 19:00 Afterparty".
  * Esempio: "DJ set di techno con Marco Carola.\n- Opening: Tale of Us\n- Musica elettronica underground\n- Serata imperdibile per gli amanti del genere"
- DATA e ORARIO: SPECIFICI per ogni evento
  * CONVERTI sempre in YYYY-MM-DD e HH:MM
  * Se manca l'anno, usa ${new Date().getFullYear()}
- LOCATION: Indirizzo completo (se uguale per tutti, ripetilo)
- ORGANIZER: Identifica chi organizza l'evento.
  * Cerca frasi come: "organizzato da", "organizzata da", "a cura di", "presentato da", "in collaborazione con", "con il patrocinio di".
  * Fai attenzione a nomi di associazioni/enti: "Associazione ...", "ASD ...", "APS ...", "Pro Loco ...", "Comune di ...", "Cineforum Altovicentino", "Visit Schio", "Azienda ...", "Azienda Agricola ...", "Società Agricola ...", "Agriturismo ...", ecc.
  * Se non trovi niente di esplicito, ma c'è un nome di associazione o ente vicino al titolo o in fondo al volantino, usa quello come organizer.
  * Usa anche gli INDIZI ESTRATTI AUTOMATICAMENTE: se nella sezione "RIGHE CHE SEMBRANO ORGANIZZATORI" trovi un nome (es. "Azienda Borelle"), usalo per il campo "organizer" e NON per il campo "location", anche se contiene un toponimo.
- CATEGORY: Suggerisci una di queste se appropriata: musica, nightlife, cultura, cibo, sport, famiglia, teatro, festa, passeggiata, altro.
  * Altrimenti usa una categoria specifica in italiano (es. "conferenza", "workshop", "mercato", "festival").
  * NON inventare categorie troppo lunghe o complesse. Usa 1-2 parole.
  * Cerca parole chiave nel testo per scegliere la categoria (es. "concerto", "dj set" → musica/nightlife; "spettacolo teatrale" → teatro; "degustazione", "cena" → cibo; "laboratorio bambini" → famiglia, ecc.).
- PREZZO: Se l'evento è gratuito (es. "gratis", "ingresso libero"), usa SEMPRE il termine "Gratuito". Se c'è un prezzo, indicalo (es. "10€"). Se è a offerta, usa "Offerta Libera". Se non trovi NESSUNA informazione sul prezzo, usa la stringa "non definito, ma speriamo gratis".

ANALISI DEL LAYOUT:
- Eventi in lista verticale (uno sotto l'altro)
- Eventi in griglia (affiancati)
- Eventi su giorni diversi di un festival
- Lineup con più artisti/slot orari
- Ogni evento può avere sottotitoli, ospiti, info specifiche

GESTIONE DATE:
- Data corrente di riferimento: ${currentDate}
- Se vedi "domani", "questo sabato", "prossimo weekend", calcolale rispetto a questa data
- Converti SEMPRE in formato YYYY-MM-DD

INDIZI ESTRATTI AUTOMATICAMENTE (POSSONO CONTENERE ERRORI, USALI SOLO COME GUIDA):
${heuristicHints}

TESTO ORIGINALE DA ANALIZZARE (OCR GREZZO):
${rawText}

Rispondi SOLO con JSON array valido (senza markdown, senza testo aggiuntivo):
{
  "eventCount": 2,
  "events": [
    {
      "title": "Nome specifico evento 1",
      "description": "Descrizione dettagliata e unica per evento 1 con info specifiche",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "location": "Luogo completo",
      "organizer": "Organizzatore",
      "category": "Categoria specifica",
      "price": "Prezzo",
      "sourceUrl": "URL trovato nel testo (se presente)",
      "rawText": ""
    },
    {
      "title": "Nome specifico evento 2",
      "description": "Descrizione dettagliata e unica per evento 2 con info specifiche",
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "location": "Luogo completo",
      "organizer": "Organizzatore",
      "category": "Categoria specifica",
      "price": "Prezzo",
      "sourceUrl": "URL trovato nel testo (se presente)",
      "rawText": ""
    }
  ]
}

IMPORTANTE: 
- Se c'è UN SOLO evento, restituisci eventCount: 1 con un solo oggetto nell'array
- Ogni evento DEVE avere titolo e descrizione UNICI e SPECIFICI
- NON copiare l'intero rawText in ogni evento - lascia rawText vuoto
- Se un campo (tranne rawText) non è trovato, usa la stringa "non trovato"
- NON usare null o undefined
- Estrai TUTTE le informazioni: se vedi prezzi diversi, date diverse, orari diversi, usali per gli eventi corrispondenti`
    : 
    // PROMPT PER SINGOLO EVENTO
    `Sei un esperto analista di eventi. Analizza ATTENTAMENTE il seguente contenuto e estrai TUTTE le informazioni disponibili.

REGOLE FONDAMENTALI:
1. Leggi TUTTO il testo senza saltare nessuna parte
2. Il TITOLO è il testo più grande, prominente o in grassetto
3. La DATA può essere in qualsiasi formato - CONVERTILA sempre in YYYY-MM-DD
   Esempi: "15 dicembre 2025" → "2025-12-15", "15/12/25" → "2025-12-15"
4. L'ORARIO può essere: "21:00", "h 21", "ore 21", "dalle 20:00 alle 23:00"
   - Formato output: "HH:MM" o "HH:MM-HH:MM" per range
5. Il LUOGO deve includere: nome locale + via/indirizzo + città (tutto quello che trovi)
6. La CATEGORIA: Suggerisci una di queste se appropriata: musica, nightlife, cultura, cibo, sport, famiglia, teatro, festa, passeggiata, altro. Altrimenti usa una categoria specifica (es. "conferenza", "workshop").
7. Il PREZZO: Se l'evento è gratuito (es. "gratis", "ingresso libero"), usa SEMPRE il termine "Gratuito". Se c'è un prezzo, indicalo (es. "10€"). Se è a offerta, usa "Offerta Libera". Se non trovi NESSUNA informazione sul prezzo, usa la stringa "non definito, ma speriamo gratis".
8. La DESCRIZIONE deve contenere tutti i dettagli rimanenti: artisti, lineup, informazioni aggiuntive.
  - DEVE ESSERE LUNGA ALMENO 100 CARATTERI.
  - Se il testo è breve, elabora il contesto, descrivi il tipo di evento o aggiungi dettagli pertinenti.
  - FORMATTAZIONE: se nel testo ci sono elenchi (es. programma con orari, punti elenco, voci separate da ritorni a capo), trasformali in una lista puntata su più righe nel campo "description", ad esempio:
    "Programma:\n- 16:00 Apertura porte\n- 17:00 Concerto principale\n- 19:00 Afterparty".
9. L'ORGANIZZATORE (organizer):
  - Cerca frasi come: "organizzato da", "organizzata da", "a cura di", "presentato da", "in collaborazione con", "con il patrocinio di".
  - Fai attenzione a nomi di associazioni/enti: "Associazione ...", "ASD ...", "APS ...", "Pro Loco ...", "Comune di ...", "Cineforum Altovicentino", "Visit Schio", "Azienda ...", "Azienda Agricola ...", "Società Agricola ...", "Agriturismo ...", ecc.
  - Usa anche gli INDIZI ESTRATTI AUTOMATICAMENTE: se nella sezione "RIGHE CHE SEMBRANO ORGANIZZATORI" trovi un nome (es. "Azienda Borelle"), mettilo in "organizer" e NON in "location", anche se compare insieme a un indirizzo.

ANALISI SEMANTICA:
- Identifica il contesto (è un concerto? una mostra? una conferenza?)
- Cerca indizi visivi (loghi, stili grafici, parole chiave)
- Inferisci informazioni mancanti dal contesto quando possibile
- Il testo potrebbe contenere errori OCR: correggi automaticamente (es: "O"→"0", "I"→"1" in date/orari)

GESTIONE DATE:
- Data corrente di riferimento: ${currentDate}
- Se vedi "domani", "questo sabato", "prossimo weekend", calcolale rispetto a questa data
- Converti SEMPRE in formato YYYY-MM-DD

INDIZI ESTRATTI AUTOMATICAMENTE (POSSONO CONTENERE ERRORI, USALI SOLO COME GUIDA):
${heuristicHints}

TESTO ORIGINALE DA ANALIZZARE (OCR GREZZO):
${rawText}

Rispondi SOLO con JSON valido (senza markdown, senza testo aggiuntivo):
{
  "title": "",
  "description": "",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "location": "",
  "organizer": "",
  "category": "",
  "price": "",
  "sourceUrl": "",
  "rawText": "${rawText.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
}

IMPORTANTE: 
- Se un campo (tranne rawText) non è trovato nel testo, usa la stringa "non trovato"
- NON usare null o undefined
- Il campo rawText deve essere sempre presente`;

    console.log('Calling Groq API with model: llama-3.3-70b-versatile');
    const groqStartTime = Date.now();

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `Sei un assistente AI esperto in analisi ed estrazione di informazioni da eventi.

CAPACITÀ:
- Comprensione del linguaggio naturale in italiano e inglese
- Riconoscimento di pattern di date, orari, prezzi
- Inferenza di informazioni da contesto visivo e testuale
- Gestione di formati multipli (poster, volantini, flyer)

REGOLE:
- Sii ESTREMAMENTE preciso nell'estrazione
- Per eventi multipli, crea descrizioni UNICHE per ogni evento
- NON inventare informazioni non presenti nel testo
- Usa il contesto per inferire solo quando c'è alta probabilità
- Formatta SEMPRE le date in YYYY-MM-DD
- Formatta SEMPRE gli orari in HH:MM
- Restituisci SOLO JSON valido, senza markdown o testo aggiuntivo`
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.1-8b-instant',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 5000,
    });

    const groqDuration = Date.now() - groqStartTime;
    console.log(`Groq API responded in ${groqDuration}ms`);

      const responseText = completion.choices[0]?.message?.content || '';
    console.log('=== GROQ RESPONSE ===');
    console.log('Response length:', responseText.length);

    // Parse JSON from response - cerca anche array JSON
    let eventData: EventData | { events: EventData[] } | null = null;
    let first = responseText.indexOf('{');
    let last = responseText.lastIndexOf('}');
    
    // Se non trova oggetto, cerca array
    if (first === -1 || last === -1 || last <= first) {
      first = responseText.indexOf('[');
      last = responseText.lastIndexOf(']');
    }
    
    if (first === -1 || last === -1 || last <= first) {
      console.error('❌ No valid JSON found in response');
      console.log('Raw response:', responseText);
      throw new Error('Groq AI non ha restituito un JSON valido. Riprova.');
    }
    
    const jsonStr = responseText.slice(first, last + 1);
    console.log('🔍 Extracted JSON string (first 500 chars):', jsonStr.substring(0, 500));
    
    try {
      const parsedData = JSON.parse(jsonStr);
      console.log('📦 Parsed data structure:', JSON.stringify(parsedData, null, 2));
      
      // Normalizza sempre in array di eventi
      let eventsArray: EventData[] = [];
      if (parsedData.events && Array.isArray(parsedData.events)) {
        eventsArray = parsedData.events as EventData[];
      } else {
        eventsArray = [parsedData as EventData];
      }

      // Raggruppa per data: più incontri nello stesso giorno → unico evento
      const grouped = groupEventsByDate(eventsArray);
      console.log('📊 Grouping by date completed:', {
        originalCount: eventsArray.length,
        groupedCount: grouped.length,
      });

      // Riconverti in struttura eventData (singolo o array)
      if (grouped.length === 1) {
        eventData = grouped[0];
        console.log('📤 Returning single grouped event');
      } else {
        eventData = { events: grouped };
        console.log(`📤 Returning ${grouped.length} grouped events as array`);
      }
      
    // ... (previous code)

      // ... (previous code)

      console.log('📤 Final eventData (Pre-Verification):', JSON.stringify(eventData, null, 2));

      // Capture Groq Raw Data (before verification)
      const groqRawData = JSON.parse(JSON.stringify(eventData));
      let googleRawData = null;

      // ----------------------------------------------------------------
      // STEP 3: GOOGLE SEARCH VERIFICATION
      // ----------------------------------------------------------------
      if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CX) {
        console.log('🌍 Starting Google Search Verification...');
        const { googleSearch } = await import('../../../lib/google-search');

        // Helper function to verify a single event
        const verifyEvent = async (event: any) => {
          try {
            const query = `${event.title} ${event.location} ${event.date} event`;
            const searchResults = await googleSearch(query);

            if (searchResults.length > 0) {
              console.log(`✅ Found ${searchResults.length} search results for "${event.title}"`);
              
              const verificationPrompt = `
              Sei un esperto fact-checker di eventi.
              
              DATI ESTRATTI DALL'IMMAGINE:
              ${JSON.stringify(event, null, 2)}
              
              RISULTATI RICERCA GOOGLE (FONTI ESTERNE):
              ${JSON.stringify(searchResults, null, 2)}
              
              COMPITO:
              Verifica e correggi i dati dell'evento usando le fonti esterne.
              
              REGOLE:
              1. Se i risultati di ricerca confermano i dati, MANTIENILI.
              2. Se i risultati forniscono dettagli mancanti (es. indirizzo completo, orario preciso, prezzo), AGGIUNGILI.
              3. Se i risultati CONTRADDICONO i dati (es. data sbagliata, luogo diverso), CORREGGI i dati usando la fonte più affidabile (es. ticketone, sito ufficiale, facebook page).
              4. Se i risultati non c'entrano nulla, MANTIENI i dati originali.
              5. La CATEGORIA deve rimanere una di: music, nightlife, culture, food, sport, family, theater, party, walk, other.
              6. Estrai il link più pertinente all'evento (es. pagina ufficiale, TicketOne, evento Facebook) dai risultati di ricerca e inseriscilo nel campo "sourceUrl".
              
              Rispondi SOLO con il JSON corretto dell'evento (senza markdown).
              `;

              const verificationCompletion = await groq.chat.completions.create({
                messages: [
                  { role: 'system', content: 'Sei un assistente AI che verifica dati di eventi. Rispondi SEMPRE con un oggetto JSON valido.' },
                  { role: 'user', content: verificationPrompt }
                ],
                model: 'llama-3.3-70b-versatile',
                response_format: { type: 'json_object' },
                temperature: 0.1,
              });

              const verifiedJsonStr = verificationCompletion.choices[0]?.message?.content || '';
              const first = verifiedJsonStr.indexOf('{');
              const last = verifiedJsonStr.lastIndexOf('}');
              
              if (first !== -1 && last !== -1) {
                try {
                  const verifiedEvent = JSON.parse(verifiedJsonStr.slice(first, last + 1));
                  console.log('✨ Event verified and updated:', verifiedEvent.title);
                  return { verifiedEvent, searchResults };
                } catch (pError) {
                  console.warn('⚠️ Failed to parse verification JSON:', pError);
                  console.log('Raw verification response:', verifiedJsonStr);
                }
              }
            } else {
              console.log('⚠️ No search results found, skipping verification.');
            }
          } catch (err) {
            console.error('❌ Verification failed for event:', event.title, err);
          }
          return { verifiedEvent: event, searchResults: [] }; // Return original if verification fails
        };

        // Verify all events
        if (eventData && 'events' in eventData && Array.isArray(eventData.events)) {
          console.log(`🔍 Verifying ${eventData.events.length} events...`);
          const verificationResults = await Promise.all(eventData.events.map(verifyEvent));
          eventData.events = verificationResults.map((r: { verifiedEvent: EventData; searchResults: unknown[] }) => r.verifiedEvent);
          googleRawData = verificationResults.map((r: { verifiedEvent: EventData; searchResults: unknown[] }) => ({
            event: r.verifiedEvent.title,
            searchResults: r.searchResults,
            verifiedData: r.verifiedEvent
          }));
        } else if (eventData) {
          console.log('🔍 Verifying single event...');
          const result = await verifyEvent(eventData as EventData);
          eventData = result.verifiedEvent;
          googleRawData = {
            searchResults: result.searchResults,
            verifiedData: result.verifiedEvent
          };
        }
        
        console.log('✅ Google Verification Complete');
      } else {
        console.log('ℹ️ Skipping Google Verification (Keys missing)');
      }

      // Normalizza eventi finali
      let finalEvents: EventData[] = [];
      if (eventData && 'events' in eventData && Array.isArray(eventData.events)) {
        finalEvents = eventData.events as EventData[];
      } else if (eventData) {
        finalEvents = [eventData as EventData];
      }

      // Utility per normalizzare URL in forma assoluta quando possibile
      const normalizeUrl = (value?: string): string | undefined => {
        if (!value) return value;
        const trimmed = value.trim();
        if (!trimmed) return undefined;

        // Evita di toccare path puramente relativi (es. "/evento/123")
        if (trimmed.startsWith('/') && !/^\/\//.test(trimmed)) {
          return trimmed;
        }

        const forceHttpsWww = (input: string): string => {
          try {
            // Aggiungi protocollo di default se manca
            let urlStr = input;
            if (/^\/\//.test(urlStr)) {
              urlStr = `https:${urlStr}`;
            } else if (!/^https?:\/\//i.test(urlStr)) {
              urlStr = `https://${urlStr}`;
            }

            const u = new URL(urlStr);
            u.protocol = 'https:';
            if (!u.hostname.toLowerCase().startsWith('www.')) {
              u.hostname = `www.${u.hostname}`;
            }
            return u.toString();
          } catch {
            // Fallback molto semplice se non è parsabile ma contiene un dominio
            if (/[a-z0-9-]+\.[a-z]{2,}/i.test(input)) {
              const cleaned = input.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
              return `https://www.${cleaned}`;
            }
            return input;
          }
        };

        // Già assoluto o dominio: forziamo https://www.
        if (/^https?:\/\//i.test(trimmed) || /^\/\//.test(trimmed) || /^www\./i.test(trimmed) || /[a-z0-9-]+\.[a-z]{2,}/i.test(trimmed)) {
          return forceHttpsWww(trimmed);
        }

        return trimmed;
      };

      // Se manca la URL di origine (o è chiaramente relativa), prova a ricavarla dai risultati Google
      if (googleRawData) {
        if (Array.isArray(googleRawData)) {
          finalEvents = finalEvents.map((event, index) => {
            const current = event.sourceUrl?.trim();
            const isRelative = current ? !/^([a-z][a-z0-9+.-]*:)?\/\//i.test(current) && !/^www\./i.test(current) : false;
            if (current && !isRelative) return { ...event, sourceUrl: normalizeUrl(current) };
            const firstResult: any = googleRawData[index]?.searchResults?.[0];
            const link = firstResult?.link as string | undefined;
            return link ? { ...event, sourceUrl: normalizeUrl(link) } : event;
          });
        } else if (googleRawData.searchResults) {
          const firstResult: any = googleRawData.searchResults[0];
          const link = firstResult?.link as string | undefined;
          const current = finalEvents[0]?.sourceUrl?.trim();
          const isRelative = current ? !/^([a-z][a-z0-9+.-]*:)?\/\//i.test(current) && !/^www\./i.test(current) : false;
          if (link && finalEvents[0] && (!current || isRelative)) {
            finalEvents[0] = { ...finalEvents[0], sourceUrl: normalizeUrl(link) };
          } else if (current) {
            finalEvents[0] = { ...finalEvents[0], sourceUrl: normalizeUrl(current) };
          }
        }
      }

      // Fallback aggiuntivo: se dopo la verifica Google alcuni eventi non hanno ancora un URL affidabile,
      // prova una nuova ricerca usando il testo del JSON (titolo/organizzatore/luogo/descrizione)
      if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CX) {
        const eventsNeedingUrl = finalEvents.filter(event => {
          const current = event.sourceUrl?.trim();
          if (!current) return true;
          const isRelative = !/^([a-z][a-z0-9+.-]*:)?\/\//i.test(current) && !/^www\./i.test(current);
          return isRelative;
        });

        if (eventsNeedingUrl.length > 0) {
          console.log('🌍 Additional URL search for events without sourceUrl...');
          const { googleSearch: secondaryGoogleSearch } = await import('../../../lib/google-search');

          for (const event of eventsNeedingUrl) {
            try {
              const descSnippet = (event.description || '').replace(/\s+/g, ' ').slice(0, 160);
              const parts = [event.title, event.organizer, event.location, descSnippet].filter(Boolean) as string[];
              const query = parts.join(' ');
              if (!query || query.trim().length < 5) continue;

              const results = await secondaryGoogleSearch(query);
              if (results.length > 0) {
                // Scegli il risultato più probabile (al momento il primo è sufficiente)
                const best = results[0];
                event.sourceUrl = normalizeUrl(best.link) || event.sourceUrl;
                console.log('🔗 Added sourceUrl from secondary search for event:', event.title, '→', best.link);
              }
            } catch (e) {
              console.warn('⚠️ Secondary URL search failed for event:', event.title, e);
            }
          }
        }
      }

      // Normalizza i campi mancanti: usa placeholder "non trovato" (tranne prezzo e rawText)
      finalEvents = finalEvents.map(event => {
        const normalized: EventData = { ...event } as EventData;

        const normalize = (value: string | undefined) =>
          value && value.trim().length > 0 ? value : 'non trovato';

        normalized.title = normalize(normalized.title);
        normalized.description = normalize(normalized.description);
        normalized.date = normalize(normalized.date);
        normalized.time = normalize(normalized.time);
        normalized.location = normalize(normalized.location);
        normalized.organizer = normalize(normalized.organizer);
        normalized.category = normalize(normalized.category);

        // Normalizza URL (se presente) in forma assoluta quando possibile
        if (normalized.sourceUrl) {
          normalized.sourceUrl = normalizeUrl(normalized.sourceUrl) || normalized.sourceUrl;
        }

        // Prezzo: usa il messaggio "non definito, ma speriamo gratis" se mancante
        normalized.price = event.price && event.price.trim().length > 0
          ? event.price
          : 'non definito, ma speriamo gratis';

        // rawText può rimanere vuoto se non disponibile

        return normalized;
      });

      // Construct final response with debug info
      const response = {
        events: finalEvents,
        debug: {
          ocrRaw: rawText,
          groqRaw: groqRawData,
          googleRaw: googleRawData
        }
      };

      return withExtensionCors(NextResponse.json(response), request);

    } catch (err) {
      // ... (error handling)
      console.error('❌ ERRORE CRITICO nel parsing JSON!', err);
      throw new Error('Impossibile interpretare i dati dell\'evento.');
    }
  } catch (error) {
    console.error('Errore dettagliato:', error);
    return withExtensionCors(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to process image' },
        { status: 500 }
      ),
      request
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return extensionCorsPreflight(request);
}