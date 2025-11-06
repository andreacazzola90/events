#!/usr/bin/env node

// Script per verificare che tutte le variabili d'ambiente necessarie siano configurate
// Carica le variabili dal file .env se presente
require('dotenv').config();

console.log('🔍 Checking environment variables...');

const requiredVars = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
];

const optionalVars = [
    'OPENAI_API_KEY',
    'GROQ_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_JWT_SECRET',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
];

let hasErrors = false;

console.log('📋 Required variables:');
requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
        console.error(`❌ Missing required variable: ${varName}`);
        hasErrors = true;
    } else {
        console.log(`✅ ${varName}: ${value.length > 20 ? value.substring(0, 20) + '...' : value}`);
    }
});

console.log('\n📋 Optional variables:');
optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
        console.warn(`⚠️  Optional variable not set: ${varName}`);
    } else {
        console.log(`✅ ${varName}: ${value.length > 20 ? value.substring(0, 20) + '...' : value}`);
    }
});

if (hasErrors) {
    console.error('\n❌ Missing required environment variables. Please configure them in Vercel dashboard or .env file.');
    console.log('\n📖 See VERCEL_DEPLOY.md for configuration instructions.');
    process.exit(1);
}

console.log('\n✅ All required environment variables are configured!');