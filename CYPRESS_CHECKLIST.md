# ✅ Checklist Setup Cypress

## Prima di Eseguire i Test

### 1. ✅ Installazione Cypress
- [x] Cypress installato (`cypress@15.7.1`)
- [x] Configurazione creata (`cypress.config.ts`)
- [x] Script npm aggiunti in `package.json`

### 2. 📸 Immagini di Test (IMPORTANTE!)
- [ ] `event-poster.png` aggiunta in `cypress/fixtures/`
- [ ] `event-poster.jpg` aggiunta in `cypress/fixtures/`

**Come fare**:
```bash
# Vai nella cartella fixtures
cd cypress/fixtures

# Aggiungi le tue immagini qui
# - Possono essere screenshot di eventi reali
# - O poster creati con Canva/Figma
# Leggi IMAGES_SETUP.md per dettagli
```

### 3. 🔑 Variabili d'Ambiente
Verifica che `.env.local` contenga:
- [ ] `OCR_SPACE_API_KEY` (per OCR)
- [ ] `OPENAI_API_KEY` (per AI)
- [ ] `GROQ_API_KEY` (opzionale, per AI alternativo)
- [ ] `DATABASE_URL` (per Prisma)

### 4. 🗄️ Database
- [ ] Database connesso e funzionante
- [ ] Tabella `events` esiste
- [ ] Prisma migrations eseguite

### 5. 🚀 Server di Sviluppo
- [ ] Server avviato con `npm run dev`
- [ ] Accessibile su `http://localhost:3000`
- [ ] Pagina `/crea` carica correttamente

## Esecuzione Test

### Opzione A: UI Interattiva (Prima Volta)
```bash
npm run cypress:open
```
1. Scegli "E2E Testing"
2. Seleziona browser (Chrome consigliato)
3. Clicca su un test per eseguirlo
4. Osserva esecuzione in tempo reale

### Opzione B: Headless (Automatico)
```bash
npm run test:e2e              # Tutti i test
npm run test:e2e:link         # Solo test link
npm run test:e2e:image        # Solo test immagine
```

## Verifica Risultati

### ✅ Test Passati
Se vedi questo output, tutto funziona:
```
✓ should successfully create an event from a link using AI
✓ should successfully create an event from an image using OCR and AI
```

### ⚠️ Warning Comuni (Normali)
- "Request timeout" → API lenta, normale per AI
- "No image found" → Aggiungi immagini in fixtures
- "Connection refused" → Server non in esecuzione

### ❌ Errori da Risolvere
- "Cypress not found" → `npm install`
- "API key missing" → Controlla `.env.local`
- "Database error" → Verifica connessione DB

## Metriche di Successo

I test verificano che:
- ✅ **Estrazione Link**: AI estrae almeno 3/5 campi (60%)
- ✅ **Estrazione Immagine**: OCR + AI estrae testo e struttura
- ✅ **Performance Link**: < 15 secondi
- ✅ **Performance Immagine**: < 30 secondi
- ✅ **Salvataggio**: Eventi salvati correttamente in DB

## Struttura Test Creati

```
26 Test Totali:
├── create-event-via-link.cy.ts (4 test)
│   ├── Creazione successo
│   ├── Link non valido
│   ├── Timeout gestito
│   └── Editing dati
│
├── create-event-via-image.cy.ts (7 test)
│   ├── OCR PNG
│   ├── OCR JPEG
│   ├── Rifiuto non-immagine
│   ├── Editing dati
│   ├── Preview immagine
│   └── Verifica campi
│
└── ai-integration.cy.ts (15 test)
    ├── Qualità AI (2 test)
    ├── Error handling (3 test)
    ├── User workflow (2 test)
    └── Performance (2 test)
```

## Quick Start (Veloce)

```bash
# 1. Aggiungi immagini
cp tua-immagine.png cypress/fixtures/event-poster.png
cp tua-immagine.jpg cypress/fixtures/event-poster.jpg

# 2. Avvia server (terminal 1)
npm run dev

# 3. Esegui test (terminal 2)
npm run cypress:open

# 4. Seleziona un test e guarda!
```

## Prossimi Passi Dopo i Test

1. **Se tutto passa** ✅
   - L'AI funziona correttamente
   - Puoi fare deploy con confidenza
   - Considera aggiungere più test edge case

2. **Se alcuni falliscono** ⚠️
   - Controlla i log per capire il problema
   - Guarda screenshot in `cypress/screenshots/`
   - Leggi `TESTING.md` per troubleshooting

3. **Migliora i Test** 🚀
   - Aggiungi test per casi specifici
   - Testa con più immagini diverse
   - Aggiungi test per altre funzionalità

## Risorse

- 📖 **Documentazione completa**: `cypress/README.md`
- 🚀 **Guida rapida**: `TESTING.md`
- 🖼️ **Setup immagini**: `cypress/fixtures/IMAGES_SETUP.md`
- ✅ **Questa checklist**: `CYPRESS_CHECKLIST.md`

## Supporto

Se hai problemi:
1. Leggi la sezione Troubleshooting in `TESTING.md`
2. Controlla i log di Cypress
3. Verifica connessioni API
4. Controlla variabili d'ambiente

---

**Tutto pronto! Buon testing! 🎉**

Ultima modifica: 15 Dicembre 2025
