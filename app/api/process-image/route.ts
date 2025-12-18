import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromImageSimple } from '../../lib/ocr-simple';
import { extractTextFromImage } from '../../lib/ocr';
import Groq from 'groq-sdk';
import { compressImage } from '../../lib/image-utils';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});


export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    // Log per debug
    console.log('Ricevuto file:', file.name, 'Size:', file.size, 'Type:', file.type);

    // Compress image if needed before OCR (max 1024KB)
    const processedFile = await compressImage(file, 1024 * 1024);

    let rawText = '';

    // Step 1: Extract text from image using OCR
    try {
      console.log('🔄 Trying simplified OCR approach...');
      rawText = await extractTextFromImageSimple(processedFile);
      console.log('✅ Simplified OCR successful');
    } catch (simpleOcrError) {
      console.log('⚠️ Simplified OCR failed, trying Tesseract fallback...');
      
      try {
        rawText = await extractTextFromImage(processedFile);
        console.log('✅ Tesseract OCR successful');
      } catch (tesseractError) {
        console.error('❌ Both OCR methods failed:', {
          simple: simpleOcrError instanceof Error ? simpleOcrError.message : simpleOcrError,
          tesseract: tesseractError instanceof Error ? tesseractError.message : tesseractError
        });
        throw simpleOcrError;
      }
    }
    
    console.log('📝 Testo estratto dall\'immagine:', rawText.substring(0, 200) + '...');

    // Verifica che ci sia testo estratto
    if (!rawText || rawText.trim().length < 10) {
      throw new Error('Nessun testo leggibile trovato nell\'immagine. Assicurati che l\'immagine contenga testo chiaro e ben visibile.');
    }

    // Step 2: Use Groq AI to parse the extracted text into structured event data
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
  * Esempi CORRETTI: "Marco Carola DJ Set", "Teatro: Amleto", "Rock Night con The Beatles"
  * Esempi SBAGLIATI: "Evento 1", "Concerto", "Spettacolo"
- DESCRIZIONE: Crea una descrizione DETTAGLIATA e UNICA (MINIMO 100 CARATTERI)
  * Includi: artisti/ospiti, genere musicale/tipo, dettagli specifici, ospiti speciali, contesto
  * Se il testo originale è breve, elabora il contesto o aggiungi dettagli generici pertinenti al tipo di evento
  * NON copiare l'intero testo grezzo
  * Esempio: "DJ set di techno con Marco Carola. Opening: Tale of Us. Musica elettronica underground. Una serata imperdibile per gli amanti del genere..."
- DATA e ORARIO: SPECIFICI per ogni evento
  * CONVERTI sempre in YYYY-MM-DD e HH:MM
  * Se manca l'anno, usa ${new Date().getFullYear()}
- LOCATION: Indirizzo completo (se uguale per tutti, ripetilo)
- ORGANIZER: Se presente e condiviso, ripetilo
- CATEGORY: Suggerisci una di queste se appropriata: musica, nightlife, cultura, cibo, sport, famiglia, teatro, festa, passeggiata, altro.
  * Altrimenti usa una categoria specifica in italiano (es. "conferenza", "workshop", "mercato", "festival").
  * NON inventare categorie troppo lunghe o complesse. Usa 1-2 parole.
- PREZZO: Se l'evento è gratuito (es. "gratis", "ingresso libero"), usa SEMPRE il termine "Gratuito". Se c'è un prezzo, indicalo (es. "10€"). Se è a offerta, usa "Offerta Libera". Se non trovi NESSUNA informazione sul prezzo, lascia il campo VUOTO ("").

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

CONTENUTO DA ANALIZZARE:
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
- Se un campo non è trovato, usa "" (stringa vuota)
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
7. Il PREZZO: Se l'evento è gratuito (es. "gratis", "ingresso libero"), usa SEMPRE il termine "Gratuito". Se c'è un prezzo, indicalo (es. "10€"). Se è a offerta, usa "Offerta Libera". Se non trovi NESSUNA informazione sul prezzo, lascia il campo VUOTO ("").
8. La DESCRIZIONE deve contenere tutti i dettagli rimanenti: artisti, lineup, informazioni aggiuntive.
   - DEVE ESSERE LUNGA ALMENO 100 CARATTERI.
   - Se il testo è breve, elabora il contesto, descrivi il tipo di evento o aggiungi dettagli pertinenti.

ANALISI SEMANTICA:
- Identifica il contesto (è un concerto? una mostra? una conferenza?)
- Cerca indizi visivi (loghi, stili grafici, parole chiave)
- Inferisci informazioni mancanti dal contesto quando possibile
- Il testo potrebbe contenere errori OCR: correggi automaticamente (es: "O"→"0", "I"→"1" in date/orari)

GESTIONE DATE:
- Data corrente di riferimento: ${currentDate}
- Se vedi "domani", "questo sabato", "prossimo weekend", calcolale rispetto a questa data
- Converti SEMPRE in formato YYYY-MM-DD

CONTENUTO DA ANALIZZARE:
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
- Se un campo non è trovato nel testo, usa "" (stringa vuota)
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
    let eventData = null;
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
      
      // Gestisci sia evento singolo che eventi multipli
      if (parsedData.events && Array.isArray(parsedData.events)) {
        // Eventi multipli
        console.log(`✅ Estratti ${parsedData.eventCount} eventi`);
        console.log('Eventi estratti:', parsedData.events.map((e: { title: string }) => e.title));
        
        // Se c'è un solo evento, ritorna come oggetto singolo
        // Se ci sono più eventi, ritorna con formato {events: [...]}
        if (parsedData.events.length === 1) {
          eventData = parsedData.events[0];
          console.log('📤 Returning single event from array');
        } else {
          eventData = { events: parsedData.events };
          console.log(`📤 Returning ${parsedData.events.length} events as array`);
        }
      } else {
        // Evento singolo (formato vecchio)
        eventData = parsedData;
        console.log('✅ Dati evento singolo estratti con successo');
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
        if (eventData.events && Array.isArray(eventData.events)) {
          console.log(`🔍 Verifying ${eventData.events.length} events...`);
          const verificationResults = await Promise.all(eventData.events.map(verifyEvent));
          eventData.events = verificationResults.map(r => r.verifiedEvent);
          googleRawData = verificationResults.map(r => ({
            event: r.verifiedEvent.title,
            searchResults: r.searchResults,
            verifiedData: r.verifiedEvent
          }));
        } else {
          console.log('🔍 Verifying single event...');
          const result = await verifyEvent(eventData);
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

      // Construct final response with debug info
      const response = {
        events: eventData.events || [eventData],
        debug: {
          ocrRaw: rawText,
          groqRaw: groqRawData,
          googleRaw: googleRawData
        }
      };

      return NextResponse.json(response);

    } catch (err) {
      // ... (error handling)
      console.error('❌ ERRORE CRITICO nel parsing JSON!', err);
      throw new Error('Impossibile interpretare i dati dell\'evento.');
    }
  } catch (error) {
    console.error('Errore dettagliato:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process image' },
      { status: 500 }
    );
  }
}