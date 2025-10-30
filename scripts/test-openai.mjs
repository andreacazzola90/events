/**
 * Script per testare la configurazione di OpenAI API
 * 
 * Esegui con: node scripts/test-openai.mjs
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Carica variabili d'ambiente
dotenv.config({ path: '.env.local' });

const apiKey = process.env.OPENAI_API_KEY;

console.log('🔍 Verifica configurazione OpenAI...\n');

if (!apiKey) {
    console.error('❌ ERRORE: OPENAI_API_KEY non trovata in .env.local');
    console.error('📝 Crea il file .env.local con:');
    console.error('   OPENAI_API_KEY=sk-proj-your-key-here\n');
    process.exit(1);
}

if (apiKey === 'your_openai_api_key_here' || apiKey === 'sk-proj-your-actual-key-here') {
    console.error('❌ ERRORE: Devi sostituire la chiave API di esempio con la tua chiave reale');
    console.error('📝 Ottieni una chiave da: https://platform.openai.com/api-keys\n');
    process.exit(1);
}

console.log('✅ API Key trovata:', apiKey.slice(0, 15) + '...' + apiKey.slice(-4));

// Test connessione
const openai = new OpenAI({ apiKey });

console.log('🔌 Test connessione con OpenAI...\n');

try {
    // Test semplice con GPT-4
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'user',
                content: 'Rispondi solo con "OK" se ricevi questo messaggio.',
            },
        ],
        max_tokens: 10,
    });

    const answer = response.choices[0]?.message?.content;

    if (answer) {
        console.log('✅ Connessione riuscita!');
        console.log('📊 Risposta:', answer);
        console.log('💰 Tokens usati:', response.usage?.total_tokens);
        console.log('\n🎉 Configurazione completata con successo!');
        console.log('💡 Ora puoi avviare il server con: npm run dev\n');
    } else {
        console.error('❌ Risposta vuota da OpenAI');
        process.exit(1);
    }
} catch (error) {
    console.error('❌ ERRORE nella connessione:', error.message);

    if (error.code === 'invalid_api_key') {
        console.error('🔑 La chiave API non è valida');
        console.error('📝 Verifica la chiave su: https://platform.openai.com/api-keys\n');
    } else if (error.code === 'insufficient_quota') {
        console.error('💳 Credito insufficiente sul tuo account OpenAI');
        console.error('💰 Aggiungi credito su: https://platform.openai.com/account/billing\n');
    }

    process.exit(1);
}
