# 🧪 Test Cypress - Guida Rapida

## ✅ Setup Completato

Ho creato una suite completa di test Cypress per verificare il funzionamento dell'intelligenza artificiale nell'estrazione di dati eventi.

## 📁 Struttura File Creati

```
cypress/
├── e2e/
│   ├── create-event-via-link.cy.ts      # Test creazione evento da link
│   ├── create-event-via-image.cy.ts     # Test creazione evento da immagine
│   └── ai-integration.cy.ts              # Test integrazione completa AI
├── fixtures/
│   ├── testData.json                     # Dati di test
│   └── README.md                         # Guida per immagini di test
├── support/
│   ├── commands.ts                       # Comandi personalizzati
│   └── e2e.ts                           # Setup globale
├── .gitignore                           # Ignora file generati
└── README.md                            # Documentazione completa

cypress.config.ts                         # Configurazione Cypress
```

## 🚀 Come Eseguire i Test

### 1️⃣ Prima Esecuzione - Setup Immagini

**IMPORTANTE**: Prima di eseguire i test, devi aggiungere immagini di test:

1. Vai in `cypress/fixtures/`
2. Aggiungi due immagini:
   - `event-poster.png` - Un poster di evento con testo chiaro
   - `event-poster.jpg` - Versione JPEG

**Dove trovare immagini**:
- Screenshot da Dice.fm, Facebook Events, Eventbrite
- Assicurati che abbiano testo leggibile (titolo, data, ora, location)

### 2️⃣ Avvia il Server di Sviluppo

```bash
npm run dev
```

Il server deve essere in esecuzione su `http://localhost:3000`

### 3️⃣ Esegui i Test

**Modalità Interattiva** (consigliata per la prima volta):
```bash
npm run cypress:open
```
Questo aprirà l'interfaccia Cypress dove puoi:
- Vedere i test in esecuzione in tempo reale
- Ispezionare ogni step
- Debuggare eventuali problemi

**Modalità Headless** (per CI/CD):
```bash
# Esegui tutti i test
npm run test:e2e

# Test specifici
npm run test:e2e:link     # Solo test link
npm run test:e2e:image    # Solo test immagine
```

## 📊 Test Disponibili

### 🔗 Test 1: Creazione Evento da Link
**File**: `create-event-via-link.cy.ts`

**Cosa testa**:
- ✅ AI estrae correttamente dati da URL evento
- ✅ Gestione link non validi
- ✅ Gestione timeout
- ✅ Possibilità di modificare dati estratti
- ✅ Salvataggio evento nel database

**Durata**: ~20-30 secondi per test

### 📸 Test 2: Creazione Evento da Immagine
**File**: `create-event-via-image.cy.ts`

**Cosa testa**:
- ✅ OCR estrae testo dall'immagine
- ✅ AI struttura i dati estratti
- ✅ Supporto formati multipli (PNG, JPEG)
- ✅ Rifiuto file non immagine
- ✅ Preview immagine funzionante
- ✅ Modifica dati estratti
- ✅ Salvataggio evento con immagine

**Durata**: ~30-40 secondi per test

### 🔄 Test 3: Integrazione Completa
**File**: `ai-integration.cy.ts`

**Cosa testa**:
- ✅ Qualità estrazione AI (accuracy)
- ✅ Gestione errori
- ✅ Workflow completo utente
- ✅ Performance (tempo di elaborazione)
- ✅ Prevenzione duplicati
- ✅ Integrazione con Google Calendar

**Durata**: ~1-2 minuti totale

## 🎯 Interpretare i Risultati

### ✅ Test Passato
```
✓ should successfully create an event from a link using AI (15.2s)
```
- L'AI sta funzionando correttamente
- Dati estratti e salvati con successo

### ❌ Test Fallito
```
✗ should successfully create an event from a link using AI (timeout)
```

**Possibili cause**:
1. Server non in esecuzione
2. API AI/OCR non risponde
3. Credenziali API mancanti/scadute
4. Timeout troppo breve

**Come debuggare**:
- Controlla i log della console
- Guarda gli screenshot in `cypress/screenshots/`
- Verifica le variabili d'ambiente (`.env.local`)

## 📈 Metriche di Qualità AI

I test verificano:

1. **Tasso di estrazione campi**: Almeno 60% dei campi (3/5) devono essere estratti
2. **Tempo di elaborazione**:
   - Link: < 15 secondi
   - Immagine: < 30 secondi
3. **Formato dati**: Date in formato corretto, testo non vuoto

## 🔧 Personalizzazione Test

### Modificare Timeout
Se l'AI è lenta, aumenta i timeout in `cypress.config.ts`:

```typescript
defaultCommandTimeout: 15000, // aumenta a 20000
```

### Aggiungere Nuovi Test
Crea un nuovo file `.cy.ts` in `cypress/e2e/`:

```typescript
describe('Mio Test', () => {
  it('dovrebbe fare qualcosa', () => {
    cy.visit('/crea');
    // test code
  });
});
```

### Custom Commands
Usa i comandi in `cypress/support/commands.ts`:

```typescript
// Login (se implementato)
cy.login('email@test.com', 'password');

// Attendi creazione evento
cy.waitForEventCreation();
```

## 🐛 Troubleshooting

### Problema: "Cypress not found"
```bash
npm install --save-dev cypress
```

### Problema: Test timeout
- Aumenta timeout in configurazione
- Verifica che il server sia in esecuzione
- Controlla connessione internet (per API esterne)

### Problema: Immagini non trovate
- Assicurati di aver aggiunto immagini in `cypress/fixtures/`
- Verifica nomi file: `event-poster.png` e `event-poster.jpg`

### Problema: API keys mancanti
- Verifica `.env.local` abbia tutte le chiavi necessarie
- OCR.space, OpenAI, Groq, etc.

## 📝 Best Practices

1. **Esegui test regolarmente** dopo modifiche all'AI
2. **Usa immagini realistiche** per test accurati
3. **Monitora i tempi** di elaborazione
4. **Verifica accuratezza** estrazione dati
5. **Testa edge cases** (immagini sfocate, link rotti)

## 🎓 Prossimi Passi

1. Aggiungi immagini di test in `cypress/fixtures/`
2. Esegui `npm run cypress:open`
3. Lancia i test e osserva i risultati
4. Controlla i log per verificare l'accuratezza AI
5. Modifica i test secondo le tue esigenze

## 📚 Risorse

- [Cypress Docs](https://docs.cypress.io)
- [Best Practices](https://docs.cypress.io/guides/references/best-practices)
- README completo: `cypress/README.md`

---

**Happy Testing! 🚀**
