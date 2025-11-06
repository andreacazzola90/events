# Deploy su Vercel - Configurazione

## ⚠️ IMPORTANTE: Configurazione delle variabili d'ambiente

**PRIMA** di fare il deploy su Vercel, devi configurare TUTTE le variabili d'ambiente necessarie nel dashboard di Vercel. La build fallirà se mancano le variabili richieste.

### Come configurare le variabili su Vercel:

1. Vai al dashboard di Vercel
2. Seleziona il tuo progetto
3. Vai su Settings → Environment Variables
4. Aggiungi tutte le variabili elencate sotto

## Configurazione delle variabili d'ambiente su Vercel

### Variabili Database
```
DATABASE_URL=your_database_url_here
POSTGRES_URL=your_postgres_url_here
POSTGRES_PRISMA_URL=your_postgres_prisma_url_here
POSTGRES_URL_NON_POOLING=your_postgres_url_non_pooling_here
POSTGRES_PASSWORD=your_postgres_password_here
POSTGRES_USER=your_postgres_user_here
POSTGRES_HOST=your_postgres_host_here
POSTGRES_DATABASE=your_postgres_database_here
```

### Variabili API Keys
```
OPENAI_API_KEY=your_openai_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

### Variabili NextAuth
```
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=https://your-app-name.vercel.app
```

### Variabili Supabase
```
SUPABASE_URL=your_supabase_url_here
SUPABASE_JWT_SECRET=your_supabase_jwt_secret_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

## Processo di Build

Il processo di build configurato include:

1. **Generazione client Prisma**: `prisma generate`
2. **Sincronizzazione database**: `prisma db push --accept-data-loss`
3. **Esecuzione seed**: `npm run seed`
4. **Build Next.js**: `next build`

### Note sulla build
- Il flag `--accept-data-loss` è necessario per Vercel per evitare prompt interattivi
- Il `postinstall` script assicura che il client Prisma sia sempre generato dopo l'installazione
- Il file `prisma.config.ts` è stato rimosso per evitare conflitti con Vercel

## Script disponibili

- `npm run build:vercel` - Build completa per Vercel
- `npm run seed` - Esegue solo il seed del database
- `npm run db:reset` - Reset completo del database + seed
- `npm run db:migrate` - Esegue le migrazioni in development
- `npm run db:deploy` - Esegue le migrazioni in production
- `npm run db:studio` - Apre Prisma Studio

## Note importanti

1. Il seed viene eseguito automaticamente durante la build su Vercel
2. Il database deve essere già configurato e accessibile
3. Tutte le variabili d'ambiente devono essere configurate prima del deploy
4. Il seed include utenti e eventi di esempio per testing
5. **Puppeteer configurato per Vercel** - Usa Chromium ottimizzato per serverless (vedi PUPPETEER_SETUP.md)

## Troubleshooting

### Errore: "Environment variable not found: DATABASE_URL"

Questo è il problema più comune. Soluzioni:

1. **Verifica nel dashboard Vercel**: Vai su Settings → Environment Variables e assicurati che `DATABASE_URL` sia configurata
2. **Redeploy**: Dopo aver aggiunto le variabili, fai un nuovo deploy
3. **Controlla il valore**: La DATABASE_URL deve essere completa e accessibile da Vercel

### Errore: "Prisma schema validation failed"

1. Verifica che tutte le variabili Prisma siano configurate:
   - `DATABASE_URL`
   - `POSTGRES_PRISMA_URL` (se usi Supabase)
2. Controlla che le URL del database siano corrette
3. Assicurati che il database sia raggiungibile dall'esterno

### Altri problemi comuni:

1. **Build timeout**: Se la build impiega troppo tempo, potrebbe essere un problema di connessione al database
2. **Seed fallisce**: Verifica che il database sia vuoto o che le tabelle esistano
3. **Missing API keys**: Controlla che tutte le chiavi API siano configurate correttamente

### Debug steps:

1. Controlla i log completi di build su Vercel
2. Verifica che tutte le variabili d'ambiente siano presenti
3. Testa la connessione al database localmente
4. Usa `npm run check-env` per verificare le variabili localmente