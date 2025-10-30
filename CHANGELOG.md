# Changelog

## [2.0.0] - 2025-10-30

### 🚀 Funzionalità Rivoluzionarie

#### Sostituzione OCR con GPT-4 Vision
- **Rimosso**: Sistema OCR basato su Tesseract.js e OCR.space
- **Aggiunto**: Integrazione GPT-4 Vision per analisi intelligente delle immagini
- **Benefici**: 
  - Comprensione semantica del contenuto
  - Categorizzazione automatica degli eventi
  - Migliore accuratezza nell'estrazione dei dati
  - Supporto per layout complessi e design creativi

#### Nuove Capacità AI
- ✅ Rilevamento automatico di eventi multipli nella stessa immagine
- ✅ Categorizzazione intelligente in 10 categorie predefinite
- ✅ Estrazione contestuale di tutte le informazioni dell'evento
- ✅ Comprensione del linguaggio naturale nei volantini

### 📦 Modifiche Tecniche

#### File Creati
- `app/lib/vision.ts` - Nuova libreria per GPT-4 Vision
- `.env.local` - File di configurazione per API keys
- `.env.example` - Template per configurazione
- `OPENAI_SETUP.md` - Guida completa alla configurazione
- `scripts/test-openai.mjs` - Script di verifica configurazione

#### File Modificati
- `app/api/process-image/route.ts` - Usa `analyzeEventImage()` invece di OCR
- `app/types/event.ts` - Aggiunto tipo `EventCategory` con categorie predefinite
- `app/components/ImageUploader.tsx` - UI aggiornata con branding GPT-4
- `README.md` - Documentazione completa aggiornata
- `package.json` - Aggiunto script `test:openai`

#### Dipendenze Aggiunte
- `openai@^6.7.0` - SDK ufficiale OpenAI
- `dotenv@^17.2.3` - Gestione variabili d'ambiente

### 🎨 Categorie Eventi Supportate

1. **Musica** - Concerti, DJ set, performance musicali
2. **Sport** - Eventi sportivi, partite, competizioni
3. **Cultura** - Mostre, conferenze, presentazioni
4. **Teatro** - Spettacoli teatrali, cabaret, comedy
5. **Cinema** - Proiezioni, festival cinematografici
6. **Food & Drink** - Sagre, degustazioni, eventi gastronomici
7. **Feste** - Party, celebrazioni, eventi sociali
8. **Bambini** - Eventi per famiglie e bambini
9. **Workshop** - Corsi, laboratori, seminari
10. **Altro** - Eventi generici o non categorizzati

### 💰 Considerazioni sui Costi

- Costo medio per analisi: ~$0.006 (meno di 1 centesimo)
- Con $10 di credito: ~1,600 analisi
- Modello utilizzato: `gpt-4o` (ottimizzato per vision)

### 🔧 Setup Richiesto

Per utilizzare la nuova versione:

1. Ottieni API key da [OpenAI Platform](https://platform.openai.com/api-keys)
2. Crea file `.env.local` con: `OPENAI_API_KEY=your-key`
3. Testa la configurazione: `npm run test:openai`
4. Avvia il server: `npm run dev`

### 📚 Documentazione

- [OPENAI_SETUP.md](./OPENAI_SETUP.md) - Guida completa alla configurazione
- [README.md](./README.md) - Documentazione generale del progetto

### ⚠️ Breaking Changes

- Richiede OPENAI_API_KEY configurata
- L'API di processo immagine ora restituisce sempre un array di eventi
- Le vecchie funzioni OCR sono deprecate ma mantenute per compatibilità

### 🐛 Bug Fix

- Risolto problema di parsing con eventi multipli
- Migliorata gestione degli errori nelle chiamate API
- Cleanup corretto delle URL temporanee delle immagini

---

## [1.0.0] - 2025-10-29

### Versione Iniziale
- Sistema OCR con Tesseract.js
- Rilevamento base di eventi singoli
- Editor eventi con salvataggio su database
- Integrazione Prisma per persistenza dati
