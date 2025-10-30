# Event Image Scanner (Groq Vision)

Applicazione Next.js che usa Groq Vision (modelli Llama 4 / Llama 3.x multimodali) per analizzare locandine di eventi ed estrarre dati strutturati: titolo, descrizione, data, orario, location, organizzatore, categoria, prezzo.

## 🚀 Funzionalità

- Vision multimodale Groq (immagine → JSON eventi)
- Estrazione multi-evento in un’unica chiamata
- Normalizzazione campi (date/time basate su prompt)
- Categorie evento (Musica, Sport, Cultura, Teatro, Cinema, Food & Drink, Feste, Bambini, Workshop, Altro)
- Editor revisione risultati
- Persistenza opzionale (Prisma) – se già presente

## 🧠 Modelli Utilizzati & Fallback

La chiamata tenta in ordine i seguenti modelli (puoi forzare con `GROQ_MODEL`):
1. `meta-llama/llama-4-scout-17b-16e-instruct`
2. `llama-3.3-70b-versatile`
3. `llama-3.1-8b-instant` (fallback testuale se multimodale non disponibile)

Se il modello forzato è decommissionato o assente, viene provato il successivo.

## 📋 Prerequisiti

- Node.js 18+
- npm o yarn
- Account Groq + API Key (https://console.groq.com/keys)

## ⚙️ Setup

1. **Installa dipendenze**:
```bash
npm install
```
2. **Configura Groq**:
```env
GROQ_API_KEY=la-tua-chiave-groq
```
3. **Database**:
```bash
npx prisma generate
npx prisma db push
```
4. **Avvio**:
```bash
npm run dev
```
5. (Opzionale) Test rapido autenticazione Groq:
```bash
curl -X POST https://api.groq.com/openai/v1/chat/completions \
   -H "Authorization: Bearer $GROQ_API_KEY" \
   -H "Content-Type: application/json" \
   -d '{"model":"meta-llama/llama-4-scout-17b-16e-instruct","messages":[{"role":"user","content":"Ciao"}]}'
```

## 🎯 Come Usare

1. Carica un'immagine (locandina / flyer)
2. L’immagine viene inviata alla route server che chiama Groq Vision
3. Ricevi array di eventi JSON
4. Modifica e salva

## 🏗️ Struttura del Progetto

```
app/
├── api/
│   ├── events/
│   └── process-image/     # Groq Vision endpoint
├── components/
├── lib/
│   ├── groqVision.ts      # Chiamata Groq Vision multimodale
├── types/
└── page.tsx
```

## 📝 Categorie Eventi Supportate

- 🎵 Musica | ⚽ Sport | 🎨 Cultura | 🎭 Teatro | 🎬 Cinema | 🍕 Food & Drink | 🎉 Feste | 👶 Bambini | 🎓 Workshop | 📌 Altro

## 💡 Note

- Usa immagini nitide (≥ 1000px lato maggiore) per migliori risultati.
- Il prompt forza output JSON pulito; eventuali code fence vengono rimossi.
- Ridimensiona immagini enormi (>5MB) per ridurre latenza.
<!-- Nota storica: compressione API Ninjas rimossa, ora non utilizzata. -->

## 🔧 Sviluppo

Fork → Branch → Commit → Push → Pull Request

---

## ❓ Troubleshooting

| Problema | Possibile Causa | Soluzione |
|----------|-----------------|-----------|
| 401 Groq | Chiave assente / scaduta | Verifica `GROQ_API_KEY` |
| Testo sporco OCR | Bassa risoluzione | Usa immagine più nitida |
| Nessun evento rilevato | Immagine poco leggibile / testo artistico | Prova a caricare versione più ad alta risoluzione |
| Categoria "Altro" frequente | Parole chiave non presenti | Aggiungi testo descrittivo |

<!-- Sezione OCR locale rimossa: ora focus solo su Groq Vision multimodale. -->
|----------|-------------|----------|--------|
| Server (Ninjas) | OCR remoto API Ninjas | Bounding boxes + qualità costante | Richiede chiave / rete |
| Locale | OpenCV preprocessing + Tesseract | Privacy, offline | Qualità dipende da immagine |

### Come funziona la pipeline locale
1. Caricamento dinamico `opencv.js` da CDN
2. Preprocessing: grayscale → median blur → adaptive threshold
3. OCR con `Tesseract.recognize`
4. Parsing multi-evento (euristiche) + classificazione per parole chiave

### Attivazione
Nel componente uploader seleziona: "Locale (OpenCV + Tesseract)" prima del drop.

### Consigli per risultati migliori
- Usa immagini ad alta risoluzione (≥ 1000px lato maggiore)
- Evita prospettiva inclinata (fai crop/manuale prima)
- Contrasto forte testo/sfondo => migliore OCR

## 📄 Licenza

Uso interno / da definire.
