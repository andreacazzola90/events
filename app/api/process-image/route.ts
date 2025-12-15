import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromImageSimple } from '../../lib/ocr-simple';
import { extractTextFromImage } from '../../lib/ocr';
import Groq from 'groq-sdk';

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

    let rawText = '';

    // Step 1: Extract text from image using OCR
    try {
      console.log('🔄 Trying simplified OCR approach...');
      rawText = await extractTextFromImageSimple(file);
      console.log('✅ Simplified OCR successful');
    } catch (simpleOcrError) {
      console.log('⚠️ Simplified OCR failed, trying Tesseract fallback...');
      
      try {
        rawText = await extractTextFromImage(file);
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
    console.log('🤖 Usando Groq AI per analizzare il testo estratto...');
    
    if (!process.env.GROQ_API_KEY) {
      console.error('GROQ_API_KEY non configurata');
      throw new Error('API non configurata correttamente');
    }

    const prompt = `Analizza attentamente il seguente testo estratto da un'immagine di un evento e estrai TUTTE le informazioni disponibili.

ISTRUZIONI IMPORTANTI:
1. Leggi TUTTO il testo con attenzione, non saltare nessuna riga
2. Il TITOLO dell'evento è solitamente il testo più grande o prominente
3. La DATA può essere in qualsiasi formato (DD/MM/YYYY, DD-MM-YYYY, "15 dicembre 2025", ecc.) - CONVERTILA sempre in formato YYYY-MM-DD
4. L'ORARIO può essere scritto come "ore 21:00", "h 21", "21:00", "dalle 20" - estrailo e formattalo come HH:MM
5. Il LUOGO può includere nome del locale, indirizzo, città - prendi TUTTO
6. Il PREZZO può essere "gratis", "free", "€10", "10 euro", "ingresso libero" - estrailo esattamente come scritto
7. L'ORGANIZZATORE può essere un nome, un'organizzazione, un promoter
8. La CATEGORIA dedotta dal tipo di evento (concerto, conferenza, mostra, festa, sport, teatro, cinema, ecc.)
9. La DESCRIZIONE deve includere tutti i dettagli rimanenti: artisti, programma, informazioni aggiuntive

TESTO DA ANALIZZARE:
${rawText}

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido in questo formato esatto (NON aggiungere testo prima o dopo):
{
  "title": "Titolo completo dell'evento",
  "description": "Descrizione dettagliata con tutti i dettagli trovati",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "location": "Luogo completo con indirizzo se disponibile",
  "organizer": "Nome organizzatore se presente",
  "category": "Categoria dell'evento",
  "price": "Prezzo o 'Gratis' se non specificato",
  "rawText": "${rawText.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"
}

IMPORTANTE: Se un campo non è trovato nel testo, usa una stringa vuota "", NON usare null o undefined.`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'Sei un assistente esperto nell\'analisi di informazioni sugli eventi. Estrai SEMPRE tutte le informazioni disponibili dal testo, anche se incomplete. Sii preciso e attento ai dettagli.'
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 1500,
    });

    const responseText = completion.choices[0]?.message?.content || '';
    console.log('🤖 Groq AI response:', responseText.substring(0, 300) + '...');

    // Parse JSON from response
    let eventData = null;
    const first = responseText.indexOf('{');
    const last = responseText.lastIndexOf('}');
    
    if (first === -1 || last === -1 || last <= first) {
      throw new Error('Groq AI non ha restituito un JSON valido. Riprova.');
    }
    
    const jsonStr = responseText.slice(first, last + 1);
    
    try {
      eventData = JSON.parse(jsonStr);
      console.log('✅ Dati evento estratti con successo:', eventData);
    } catch (err) {
      console.error('❌ Errore parsing JSON Groq:', err, 'Testo:', jsonStr);
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