import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

/**
 * Endpoint di test per verificare che Groq funzioni su Vercel
 * Accedi a: https://tuo-dominio.vercel.app/api/test-groq
 */
export async function GET(request: NextRequest) {
  try {
    console.log('=== TEST GROQ API ===');
    console.log('Environment:', process.env.VERCEL ? 'Vercel' : 'Local');
    console.log('GROQ_API_KEY configured:', !!process.env.GROQ_API_KEY);
    console.log('GROQ_API_KEY length:', process.env.GROQ_API_KEY?.length || 0);
    console.log('GROQ_API_KEY preview:', process.env.GROQ_API_KEY?.substring(0, 10) + '...');

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({
        success: false,
        error: 'GROQ_API_KEY non configurata',
        instructions: 'Vai su Vercel Dashboard → Settings → Environment Variables e aggiungi GROQ_API_KEY'
      }, { status: 500 });
    }

    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    console.log('Testing Groq API with simple prompt...');
    const startTime = Date.now();

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: 'Rispondi SOLO con questo JSON: {"status": "ok", "message": "Groq funziona correttamente"}',
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 100,
    });

    const duration = Date.now() - startTime;
    const responseText = completion.choices[0]?.message?.content || '';

    console.log('Groq response:', responseText);
    console.log('Response time:', duration + 'ms');

    return NextResponse.json({
      success: true,
      message: 'Groq API funziona correttamente!',
      environment: process.env.VERCEL ? 'Vercel' : 'Local',
      apiKeyConfigured: true,
      apiKeyLength: process.env.GROQ_API_KEY.length,
      responseTime: duration + 'ms',
      groqResponse: responseText,
      model: 'llama-3.3-70b-versatile'
    });

  } catch (error) {
    console.error('Test Groq failed:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Errore nel test di Groq API',
      environment: process.env.VERCEL ? 'Vercel' : 'Local',
      apiKeyConfigured: !!process.env.GROQ_API_KEY,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorDetails: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
