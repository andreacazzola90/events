# 🚀 Checklist Deploy Vercel

## Prima del Deploy

### 1. ✅ Verifica Locale
```bash
# Testa che tutto funzioni localmente
npm run check-env
npm run generate-safe
npm run seed
npm run build
```

### 2. 🔑 Configura Variabili su Vercel

Nel dashboard Vercel (Settings → Environment Variables), aggiungi:

**OBBLIGATORIE:**
- [ ] `DATABASE_URL`
- [ ] `NEXTAUTH_SECRET`
- [ ] `NEXTAUTH_URL` (https://your-app.vercel.app)

**API KEYS (opzionali ma raccomandati):**
- [ ] `OPENAI_API_KEY`
- [ ] `GROQ_API_KEY`

**SUPABASE (se applicabile):**
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_JWT_SECRET`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 3. 📋 Verifica Database
- [ ] Database accessibile dall'esterno
- [ ] URL di connessione corretta
- [ ] Permessi per creare/modificare tabelle

### 4. 🚀 Deploy

1. Push del codice su GitHub
2. Collegamento repository a Vercel
3. Deploy automatico

## In Caso di Errori

### "Environment variable not found: DATABASE_URL"
1. Verifica che `DATABASE_URL` sia configurata in Vercel
2. Controlla che il valore sia corretto
3. Fai un nuovo deploy

### "Build timeout"
1. Il database potrebbe non essere raggiungibile
2. Verifica la connessione
3. Controlla i log completi

### "Seed failed"
1. Normale al primo deploy se il database è vuoto
2. Controlla i log per errori specifici
3. Verifica le tabelle create

## Comandi Utili

```bash
# Test locale completo
npm run check-env && npm run build:vercel

# Solo generazione Prisma
npm run generate-safe

# Reset database locale
npm run db:reset

# Prisma Studio
npm run db:studio
```