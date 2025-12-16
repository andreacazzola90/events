import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromImageSimple } from '../../lib/ocr-simple';
import { extractTextFromImage } from '../../lib/ocr';
import Groq from 'groq-sdk';
import sharp from 'sharp';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Compress image for OCR processing (max 1MB for OCR.space)
 */
async function compressImageForOCR(file: File): Promise<File> {
  const fileSizeKB = file.size / 1024;
  console.log(`📏 Original image size: ${fileSizeKB.toFixed(2)} KB`);
  
  // If already small enough, return as is
  if (fileSizeKB <= 900) {
    console.log('✅ Image size OK, no compression needed');
    return file;
  }
  
  console.log(`🗜️ Compressing image from ${fileSizeKB.toFixed(2)} KB...`);
  
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    
    // Calculate target dimensions (reduce by sqrt of size ratio)
    const compressionRatio = Math.sqrt(900 / fileSizeKB);
    const targetWidth = metadata.width ? Math.floor(metadata.width * compressionRatio) : undefined;
    
    // Compress with Sharp
    const compressedBuffer = await sharp(buffer)
      .resize(targetWidth, undefined, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: 85,
        progressive: true
      })
      .toBuffer();
    
    const compressedFile = new File([compressedBuffer], file.name, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    
    const newSizeKB = compressedFile.size / 1024;
    console.log(`✅ Compressed to ${newSizeKB.toFixed(2)} KB`);
    
    return compressedFile;
  } catch (error) {
    console.warn('⚠️ Compression failed, using original:', error);
    return file;
  }
}


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

    // Compress image if needed before OCR
    const processedFile = await compressImageForOCR(file);

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
- DESCRIZIONE: Crea una descrizione DETTAGLIATA e UNICA
  * Includi: artisti/ospiti, genere musicale/tipo, dettagli specifici, ospiti speciali
  * NON copiare l'intero testo grezzo
  * Esempio: "DJ set di techno con Marco Carola. Opening: Tale of Us. Musica elettronica underground."
- DATA e ORARIO: SPECIFICI per ogni evento
  * CONVERTI sempre in YYYY-MM-DD e HH:MM
  * Se manca l'anno, usa ${new Date().getFullYear()}
- LOCATION: Indirizzo completo (se uguale per tutti, ripetilo)
- PREZZO: Specifico per evento (se unico per tutti, applicalo a tutti)
- ORGANIZER: Se presente e condiviso, ripetilo
- CATEGORY: Dedotta dal tipo (musica/rock, musica/techno, teatro/commedia, sport/calcio, ecc.)

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
6. La CATEGORIA dedotta dal contesto (musica, arte, sport, cultura, teatro, cinema, conferenza, festa, ecc.)
7. Il PREZZO esatto come scritto (se non presente → "Gratis")
8. La DESCRIZIONE deve contenere tutti i dettagli rimanenti: artisti, lineup, informazioni aggiuntive

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
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 4000,
    });

    const groqDuration = Date.now() - groqStartTime;
    console.log(`Groq API responded in ${groqDuration}ms`);

    const responseText = completion.choices[0]?.message?.content || '';
    console.log('=== GROQ RESPONSE (IMAGE) ===');
    console.log('Response length:', responseText.length);
    console.log('Response preview:', responseText.substring(0, 300));
    console.log('Full response:', responseText);

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
      
      console.log('📤 Final eventData:', JSON.stringify(eventData, null, 2));
    } catch (err) {
      console.error('❌ ERRORE CRITICO nel parsing JSON!');
      console.error('❌ Errore:', err);
      console.error('❌ Tipo errore:', err instanceof Error ? err.message : 'Unknown');
      console.error('❌ JSON string completo:', jsonStr);
      console.error('❌ Lunghezza JSON:', jsonStr.length);
      console.error('❌ Prime 1000 caratteri:', jsonStr.substring(0, 1000));
      console.error('❌ Ultime 500 caratteri:', jsonStr.substring(jsonStr.length - 500));
      
      // Prova a identificare il problema specifico
      if (jsonStr.includes('```')) {
        console.error('⚠️ PROBLEMA: Il JSON contiene markdown code blocks (```)');
      }
      if (jsonStr.includes('\\n') && !jsonStr.includes('"rawText"')) {
        console.error('⚠️ PROBLEMA: Il JSON contiene newline escaped non gestiti');
      }
      
      throw new Error('Impossibile interpretare i dati dell\'evento. Riprova con un\'immagine più chiara.');
    }

    return NextResponse.json(eventData);
  } catch (error) {
    // Log dettagliato dell'errore
    console.error('Errore dettagliato:', error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process image' },
      { status: 500 }
    );
  }
}