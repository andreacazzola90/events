# 🔧 Fix Eventi Multipli - Descrizioni Uniche

## ❌ Problema Risolto

Quando caricavi un'immagine con **molti eventi**, venivano creati correttamente ma:
1. ❌ **Tutte le descrizioni erano uguali** (contenevano l'intero rawText)
2. ❌ **Informazioni incomplete** per ogni evento
3. ❌ Nessuna personalizzazione per evento specifico

## ✅ Soluzione Implementata

### 1. **Prompt Migliorato per Eventi Multipli**

Ho modificato `/app/api/process-image/route.ts` con un prompt che:

#### Prima ❌
```
"description": "tutto il testo dell'immagine",
"rawText": "tutto il testo dell'immagine duplicato"
```

#### Adesso ✅
```
"description": "Serata techno con DJ set di Marco Carola. Opening act elettronica.",
"rawText": ""  // vuoto per evitare duplicazione
```

### 2. **Rilevamento Automatico Eventi Multipli**

```typescript
// Rileva automaticamente se ci sono più eventi
const dateMatches = rawText.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g) || [];
const timeMatches = rawText.match(/\d{1,2}:\d{2}/g) || [];
const hasMultipleEvents = (dateMatches.length > 1 && timeMatches.length > 1);
```

### 3. **Istruzioni Specifiche a Groq**

Il nuovo prompt chiede esplicitamente:

```
REGOLE PER OGNI EVENTO:
- TITOLO: Deve essere UNICO e SPECIFICO per ogni evento
  (nome artista, nome spettacolo, tema specifico)
  
- DESCRIZIONE: Crea una descrizione DETTAGLIATA e UNICA per ogni evento
  * Includi: artisti/ospiti specifici, genere, dettagli particolari
  * NON copiare tutto il testo
  * Solo info rilevanti PER QUEL SPECIFICO EVENTO
  
- Ogni evento DEVE avere titolo e descrizione UNICI
- NON copiare l'intero rawText in ogni evento
```

### 4. **Token Aumentati**

```typescript
max_tokens: 4000  // era 1500 - ora può gestire molti eventi
```

### 5. **Gestione Array di Eventi**

Aggiornato il flusso completo:
- `process-image/route.ts` → Ritorna array se eventi multipli
- `ImageUploader.tsx` → Gestisce sia singolo che array
- `crea/page.tsx` → Processa correttamente entrambi i casi

## 🧪 Come Testare

1. **Carica un'immagine con più eventi** (es. locandina weekend, festival)
2. **Verifica che:**
   - ✅ Vengono rilevati tutti gli eventi
   - ✅ Ogni evento ha un **titolo unico**
   - ✅ Ogni evento ha una **descrizione specifica**
   - ✅ Date, orari, prezzi sono specifici per ogni evento
   - ✅ Nessuna duplicazione di rawText

## 📊 Esempio Output

### Input: Immagine con 3 eventi
```
WEEKEND MUSICALE
VEN 20 DIC - DJ Marco ore 22:00 - €15
SAB 21 DIC - Live Band Rock ore 21:00 - €20
DOM 22 DIC - Jazz Aperitivo ore 18:00 - Gratis
Club Milano, Via Roma 1
```

### Output: 3 Eventi Distinti
```json
{
  "eventCount": 3,
  "events": [
    {
      "title": "DJ Marco - Electronic Night",
      "description": "Serata elettronica con DJ set di Marco. Musica house e techno.",
      "date": "2025-12-20",
      "time": "22:00",
      "location": "Club Milano, Via Roma 1",
      "price": "€15"
    },
    {
      "title": "Live Band Rock",
      "description": "Concerto dal vivo con band rock. Serata dedicata al rock classico.",
      "date": "2025-12-21",
      "time": "21:00",
      "location": "Club Milano, Via Roma 1",
      "price": "€20"
    },
    {
      "title": "Jazz Aperitivo",
      "description": "Aperitivo domenicale con musica jazz dal vivo. Atmosfera rilassata.",
      "date": "2025-12-22",
      "time": "18:00",
      "location": "Club Milano, Via Roma 1",
      "price": "Gratis"
    }
  ]
}
```

## 🎯 Benefici

1. ✅ **Descrizioni uniche** per ogni evento
2. ✅ **Informazioni complete** (titolo, descrizione, data, ora, luogo, prezzo)
3. ✅ **Nessuna duplicazione** di rawText
4. ✅ **Rilevamento automatico** eventi multipli
5. ✅ **Gestione fino a 10+ eventi** con max_tokens aumentati
6. ✅ **Frontend aggiornato** per visualizzare correttamente tutti gli eventi

## 🔍 File Modificati

1. `/app/api/process-image/route.ts` - Prompt e logica migliorati
2. `/app/components/ImageUploader.tsx` - Gestione array eventi
3. `/app/crea/page.tsx` - Processamento eventi multipli

## 💡 Note Tecniche

- Il sistema message di Groq ora enfatizza: **"Per eventi multipli, crea descrizioni UNICHE per ogni evento"**
- Il rawText viene lasciato vuoto per eventi multipli per evitare duplicazioni
- Il rilevamento è basato su pattern (date, orari, sezioni di testo)
- Supporta vari layout: verticale, griglia, timeline, lineup

## 🚀 Pronto all'Uso

Ora puoi caricare immagini con **qualsiasi numero di eventi** e ottenere informazioni complete e uniche per ciascuno! 🎉
