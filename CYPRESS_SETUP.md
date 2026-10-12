# 🎯 Cypress Test Suite - Setup Completo

## ✅ Installazione Completata

Ho creato una suite completa di test E2E con Cypress per verificare il funzionamento dell'intelligenza artificiale nell'app Events.

## 📦 Cosa è stato installato

```json
{
  "devDependencies": {
    "cypress": "^15.7.1",
    "@cypress/webpack-dev-server": "^5.4.1"
  }
}
```

## 📁 File Creati

### Configurazione
- ✅ `cypress.config.ts` - Configurazione Cypress
- ✅ `package.json` - Aggiunti script npm per test

### Test Files (cypress/e2e/)
- ✅ `create-event-via-link.cy.ts` - Test creazione evento da link (4 scenari)
- ✅ `create-event-via-image.cy.ts` - Test creazione evento da immagine (7 scenari)
- ✅ `ai-integration.cy.ts` - Test integrazione AI completa (15 scenari)

### Support Files
- ✅ `cypress/support/commands.ts` - Comandi personalizzati
- ✅ `cypress/support/e2e.ts` - Setup globale

### Fixtures & Docs
- ✅ `cypress/fixtures/testData.json` - Dati di test
- ✅ `cypress/fixtures/README.md` - Guida immagini
- ✅ `cypress/fixtures/IMAGES_SETUP.md` - Setup immagini dettagliato
- ✅ `cypress/README.md` - Documentazione completa
- ✅ `TESTING.md` - Guida rapida root

## 🚀 Script NPM Aggiunti

```bash
# Apri Cypress UI
npm run cypress:open

# Esegui tutti i test
npm run test:e2e

# Test specifici
npm run test:e2e:link     # Solo creazione da link
npm run test:e2e:image    # Solo creazione da immagine
```

## 📊 Copertura Test

### Test Creazione da Link (4 scenari)
1. ✅ Creazione evento con successo da URL
2. ✅ Gestione link non validi
3. ✅ Gestione timeout AI
4. ✅ Modifica dati estratti dall'AI

### Test Creazione da Immagine (7 scenari)
1. ✅ Estrazione OCR da PNG
2. ✅ Supporto formato JPEG
3. ✅ Rifiuto file non immagine
4. ✅ Modifica dati estratti
5. ✅ Preview immagine
6. ✅ Verifica campi chiave estratti
7. ✅ Salvataggio con immagine

### Test Integrazione AI (15 scenari)
- Verifica qualità estrazione
- Test performance
- Gestione errori
- Workflow completi
- Prevenzione duplicati

## ⚙️ Prossimi Passi

### 1. Aggiungi Immagini di Test

**IMPORTANTE**: I test richiedono 2 immagini in `cypress/fixtures/`:

```
cypress/fixtures/
├── event-poster.png   ← AGGIUNGI QUESTA
└── event-poster.jpg   ← AGGIUNGI QUESTA
```

**Come ottenerle**:
- Screenshot da Dice.fm, Facebook Events, Eventbrite
- Crea con Canva usando template "event poster"
- Usa qualsiasi poster evento con testo chiaro

**Requisiti minimi**:
- Dimensione: min 600x800px (consigliato 800x1200px)
- Contenuto: Titolo, data, ora, location
- Formato: PNG e JPEG
- Testo leggibile e chiaro

### 2. Avvia il Server

```bash
npm run dev
```

Assicurati che sia in esecuzione su `http://localhost:3000`

### 3. Esegui i Test

**Prima volta** (consigliato):
```bash
npm run cypress:open
```
- Scegli "E2E Testing"
- Seleziona browser (Chrome consigliato)
- Clicca su un test per eseguirlo
- Osserva l'esecuzione in tempo reale

**Da terminale**:
```bash
npm run test:e2e
```

## 📈 Cosa Verificano i Test

### Qualità AI
- ✅ Tasso estrazione campi ≥ 60% (3/5 campi)
- ✅ Formato date corretto (YYYY-MM-DD)
- ✅ Testo non vuoto nei campi estratti

### Performance
- ✅ Elaborazione link < 15 secondi
- ✅ Elaborazione immagine < 30 secondi
- ✅ Salvataggio evento < 5 secondi

### Affidabilità
- ✅ Gestione errori di rete
- ✅ Timeout API
- ✅ Input non validi
- ✅ Formati file errati

## 🐛 Troubleshooting

### Test falliscono con timeout
**Soluzione**: Aumenta timeout in `cypress.config.ts`
```typescript
defaultCommandTimeout: 20000  // era 10000
```

### "Immagini non trovate"
**Soluzione**: Aggiungi `event-poster.png` e `event-poster.jpg` in `cypress/fixtures/`

### API non risponde
**Soluzione**: Verifica `.env.local` abbia le API keys:
- `OCR_SPACE_API_KEY`
- `OPENAI_API_SECRET_KEY`
- `GROQ_API_SECRET_KEY`

### Server non raggiungibile
**Soluzione**: Verifica che `npm run dev` sia in esecuzione

## 📚 Documentazione

- **Guida completa**: `cypress/README.md`
- **Guida rapida**: `TESTING.md` (questo file)
- **Setup immagini**: `cypress/fixtures/IMAGES_SETUP.md`

## 🎓 Esempio Esecuzione

```bash
# Terminal 1: Avvia server
npm run dev

# Terminal 2: Esegui test
npm run cypress:open

# Oppure esegui in headless
npm run test:e2e
```

**Output atteso**:
```
  Event Creation via Link
    ✓ should successfully create an event from a link using AI (15.2s)
    ✓ should display error for invalid link (2.1s)
    ✓ should handle AI processing timeout gracefully (35.0s)
    ✓ should allow editing AI-generated event data (12.5s)

  Event Creation via Image Upload
    ✓ should successfully create an event from an image using OCR and AI (28.3s)
    ✓ should handle multiple image formats (JPEG) (25.7s)
    ✓ should reject non-image files (1.8s)
    ...

  26 passing (3m 45s)
```

## 🎯 Obiettivi Test

1. **Verificare AI funziona** ✅
   - Estrae dati da link
   - Estrae dati da immagini OCR
   - Struttura dati correttamente

2. **Garantire qualità** ✅
   - Almeno 60% campi estratti
   - Tempi ragionevoli
   - Gestione errori

3. **Automatizzare verifiche** ✅
   - Test ripetibili
   - CI/CD ready
   - Report automatici

## 🚀 Ready to Test!

Tutto è pronto! Segui i 3 passi:

1. ✅ Aggiungi immagini in `cypress/fixtures/`
2. ✅ Avvia server con `npm run dev`
3. ✅ Esegui `npm run cypress:open`

**Buon testing! 🎉**
