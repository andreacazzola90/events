# Test Images

Per eseguire i test Cypress, aggiungi le seguenti immagini in questa cartella:

## 📸 Immagini Richieste

### 1. event-poster.png
- **Tipo**: Immagine PNG di un poster evento
- **Dimensioni consigliate**: 800x1200px
- **Contenuto**: Deve includere testo chiaro con:
  - Titolo dell'evento
  - Data e ora
  - Location/luogo
  - (Opzionale) Organizzatore, prezzo, descrizione

### 2. event-poster.jpg
- **Tipo**: Versione JPEG dello stesso poster (o simile)
- **Scopo**: Testare il supporto per formati immagine diversi

## 🎯 Dove Trovare Immagini di Test

Puoi usare screenshot di eventi reali da:
- **Dice.fm**: Eventi musicali
- **Facebook Events**: Vari tipi di eventi
- **Eventbrite**: Eventi culturali/professionali
- **Instagram**: Post di eventi con testo chiaro

## 💡 Suggerimenti

1. **Testo leggibile**: Assicurati che il testo sia chiaro e ben visibile
2. **Contrasto**: Usa immagini con buon contrasto tra testo e sfondo
3. **Risoluzione**: Immagini troppo piccole potrebbero non funzionare bene con l'OCR
4. **Lingua**: Preferibilmente in italiano per coerenza con l'app

## 🔧 Esempio di Poster Evento

Un buon poster di test dovrebbe avere questa struttura:

```
┌─────────────────────────┐
│   FESTIVAL MUSICALE     │ ← Titolo
│                         │
│   📅 20 Dicembre 2025   │ ← Data
│   🕐 ore 21:00          │ ← Ora
│   📍 Teatro Comunale    │ ← Location
│       Schio (VI)        │
│                         │
│   Organizzato da:       │
│   Music Events Srl      │ ← Organizzatore
│                         │
│   Ingresso: €15         │ ← Prezzo
└─────────────────────────┘
```

## 📝 Note

- Una volta aggiunte le immagini, i test potranno essere eseguiti
- Le immagini non vengono committate su git (sono in .gitignore)
- Puoi usare qualsiasi immagine di evento reale
