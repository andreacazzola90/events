# Cypress E2E Tests per Event Scanner

Questa cartella contiene i test end-to-end per verificare il corretto funzionamento dell'intelligenza artificiale nell'estrazione di dati eventi.

## 📋 Test Disponibili

### 1. **create-event-via-link.cy.ts**
Testa la creazione di eventi tramite link analizzando URL di eventi.

**Scenari testati:**
- ✅ Creazione evento da link con successo
- ✅ Gestione link non validi
- ✅ Gestione timeout AI
- ✅ Modifica dati estratti dall'AI

### 2. **create-event-via-image.cy.ts**
Testa la creazione di eventi tramite upload di immagini usando OCR e AI.

**Scenari testati:**
- ✅ Creazione evento da immagine PNG
- ✅ Gestione formati multipli (JPEG, PNG)
- ✅ Rifiuto file non immagini
- ✅ Modifica dati estratti dall'OCR
- ✅ Verifica preview immagine
- ✅ Verifica estrazione campi chiave (titolo, data, ora, location)

## 🚀 Come Eseguire i Test

### Prerequisiti
1. Assicurati che il server di sviluppo sia in esecuzione:
   ```bash
   npm run dev
   ```

2. Assicurati di avere immagini di test nella cartella `cypress/fixtures/`:
   - `event-poster.png` - Immagine di un poster evento
   - `event-poster.jpg` - Versione JPEG dello stesso poster

### Esecuzione Interattiva (Cypress UI)
```bash
npx cypress open
```
Poi seleziona "E2E Testing" e scegli il test da eseguire.

### Esecuzione Headless (CI/CD)
```bash
# Esegui tutti i test
npx cypress run

# Esegui un singolo test
npx cypress run --spec "cypress/e2e/create-event-via-link.cy.ts"
npx cypress run --spec "cypress/e2e/create-event-via-image.cy.ts"
```

## 📸 Immagini di Test

Per eseguire i test con immagini, devi aggiungere file immagine reali nella cartella `cypress/fixtures/`.

### Esempio di poster evento da usare:
Puoi usare screenshot di eventi veri da:
- Dice.fm
- Facebook Events
- Eventbrite
- O qualsiasi poster evento con testo chiaro

### Formato consigliato:
- **Dimensione**: 800x1200px circa
- **Formato**: PNG o JPEG
- **Contenuto**: Deve includere:
  - Titolo evento chiaro
  - Data e ora
  - Location
  - (Opzionale) Prezzo, organizzatore, descrizione

## 🔧 Configurazione

La configurazione di Cypress si trova in `cypress.config.ts`:

```typescript
{
  baseUrl: 'http://localhost:3000',
  viewportWidth: 1280,
  viewportHeight: 720,
  defaultCommandTimeout: 10000,
  video: false,
  screenshotOnRunFailure: true
}
```

## 🎯 Custom Commands

Comandi personalizzati disponibili (definiti in `cypress/support/commands.ts`):

```typescript
// Login (se necessario per test autenticati)
cy.login('email@example.com', 'password');

// Attendi creazione evento
cy.waitForEventCreation();
```

## 📊 Report dei Test

Dopo l'esecuzione, i risultati saranno disponibili:
- **Screenshot**: `cypress/screenshots/` (in caso di fallimento)
- **Video**: `cypress/videos/` (se abilitato)
- **Console**: Output diretto nel terminale

## 🐛 Debug

Per debug dettagliato:

1. Usa `cy.log()` per logging personalizzato
2. Usa `cy.pause()` per fermare l'esecuzione
3. Apri DevTools in Cypress UI per ispezione real-time
4. Controlla i log delle intercettazioni API

## ✨ Best Practices

1. **Aspetta caricamenti**: L'AI può richiedere 10-30 secondi
2. **Usa timeout personalizzati**: `{ timeout: 40000 }` per chiamate AI
3. **Verifica intercettazioni**: Controlla sempre lo status code delle API
4. **Test isolati**: Ogni test deve essere indipendente
5. **Cleanup**: Considera di cancellare eventi di test dopo l'esecuzione

## 📝 Aggiungere Nuovi Test

Per aggiungere un nuovo test:

1. Crea un file `.cy.ts` in `cypress/e2e/`
2. Usa la struttura:
   ```typescript
   describe('Nome Test Suite', () => {
     beforeEach(() => {
       cy.visit('/pagina');
     });

     it('dovrebbe fare qualcosa', () => {
       // test code
     });
   });
   ```

## 🔗 Risorse

- [Documentazione Cypress](https://docs.cypress.io)
- [Best Practices](https://docs.cypress.io/guides/references/best-practices)
- [API Reference](https://docs.cypress.io/api/table-of-contents)
