// Configurazione per caricare le variabili d'ambiente
// Questo file assicura che dotenv sia caricato prima di Prisma

import dotenv from 'dotenv';

// Carica le variabili d'ambiente dal file .env
dotenv.config();

// Verifica che DATABASE_URL sia impostata
if (!process.env.DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL not found in environment variables');
  
  // Durante la build su Vercel, potrebbe non essere ancora disponibile
  if (process.env.VERCEL || process.env.CI) {
    console.log('🏗️ Running in CI/Vercel environment, DATABASE_URL should be provided by deployment platform');
  } else {
    console.error('❌ DATABASE_URL is required for local development');
    console.log('📖 Please copy .env.example to .env and configure your database URL');
  }
}

export default {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://placeholder',
};