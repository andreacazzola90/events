# Debug Groq su Vercel

## Problema
Groq funziona in locale ma restituisce sempre lo stesso testo placeholder su Vercel.

## Come verificare se Groq funziona su Vercel

### 1. Controlla le variabili d'ambiente
Vai su **Vercel Dashboard** → **Progetto** → **Settings** → **Environment Variables**

Verifica che sia configurata:
```
GROQ_API_KEY = gsk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

(Usa la tua chiave API reale da `.env`)

**IMPORTANTE**: 
- Assicurati che sia configurata per **Production**, **Preview** e **Development**
- Se aggiungi/modifichi variabili, devi fare **REDEPLOY** del progetto

### 2. Controlla i log di Vercel

1. Vai su **Vercel Dashboard** → **Progetto** → **Deployments**
2. Clicca sull'ultimo deployment
3. Vai su **Functions** → Trova `/api/process-link` o `/api/process-image`
4. Clicca su **View Logs**

Cerca questi log diagnostici:

```
=== GROQ API CALL ===
Environment check:
- GROQ_API_KEY configured: true/false  ← Deve essere TRUE
- GROQ_API_KEY length: 64             ← Deve essere > 0
- Page text length: XXXX               ← Deve essere > 50
- Platform: Vercel                     ← Conferma che gira su Vercel
```

### 3. Possibili cause del problema

#### A. GROQ_API_KEY non configurata
**Sintomo**: `GROQ_API_KEY configured: false`

**Soluzione**:
1. Vai su Vercel Dashboard → Settings → Environment Variables
2. Aggiungi `GROQ_API_KEY` con il valore corretto
3. Seleziona tutti gli environment (Production, Preview, Development)
4. **REDEPLOY** il progetto

#### B. pageText è vuoto o troppo corto
**Sintomo**: `Page text length: 0` o `Page text length: 25`

**Cause possibili**:
- Browser automation (Puppeteer) non funziona su Vercel
- Timeout della funzione (10s su Free tier, 60s su Pro)
- Sito web blocca lo scraping

**Soluzioni**:
1. Verifica che lo scraping HTTP fallback funzioni
2. Controlla il log: `HTTP fallback scraping successful`
3. Se necessario, aumenta il timeout (upgrade a Vercel Pro)

#### C. Timeout della funzione
**Sintomo**: La richiesta si interrompe dopo 10 secondi

**Soluzione**:
- **Vercel Free**: Limite 10 secondi → Upgrade a Pro
- **Vercel Pro**: Limite 60 secondi → Già sufficiente
- Configura timeout in `vercel.json`:

```json
{
  "functions": {
    "app/api/process-link/route.ts": {
      "maxDuration": 60
    },
    "app/api/process-image/route.ts": {
      "maxDuration": 60
    }
  }
}
```

#### D. Groq restituisce sempre la stessa risposta
**Sintomo**: `Response preview:` mostra sempre lo stesso JSON

**Causa**: Il testo inviato a Groq è sempre lo stesso (placeholder o errore di scraping)

**Soluzione**:
1. Controlla `Page text preview:` nei log
2. Se è vuoto o generico → problema di scraping
3. Verifica che il sito web non blocchi Vercel IPs

### 4. Test manuale dell'API

Puoi testare l'API direttamente con curl:

```bash
# Test process-link
curl -X POST https://tuo-dominio.vercel.app/api/process-link \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.dice.fm/event/real-event-url"}'

# Test process-image
curl -X POST https://tuo-dominio.vercel.app/api/process-image \
  -F "image=@path/to/event-image.jpg"
```

### 5. Confronto Local vs Vercel

| Aspetto | Local | Vercel |
|---------|-------|--------|
| GROQ_API_KEY | Da `.env` | Da Dashboard Variables |
| Timeout | Illimitato | 10s (Free) / 60s (Pro) |
| Puppeteer | ✅ Funziona | ❌ Non disponibile |
| HTTP Scraping | ✅ Fallback | ✅ Metodo principale |
| Log visibili | Terminal | Dashboard → Functions |

### 6. Checklist completa

- [ ] `GROQ_API_KEY` configurata su Vercel Dashboard
- [ ] Variabile impostata per tutti gli environment (Prod, Preview, Dev)
- [ ] Redeploy fatto dopo aver aggiunto la variabile
- [ ] Log mostrano `GROQ_API_KEY configured: true`
- [ ] Log mostrano `Page text length: > 50`
- [ ] Groq API risponde (response length > 0)
- [ ] Response contiene JSON valido
- [ ] Timeout funzione configurato (vercel.json)
- [ ] Browser fallback HTTP funziona

### 7. Output atteso nei log

**Successo**:
```
=== GROQ API CALL ===
- GROQ_API_KEY configured: true
- GROQ_API_KEY length: 64
- Page text length: 2847
- Page text preview: Concert Title Date: December 20 Time: 21:00...
- Platform: Vercel
Calling Groq API with model: llama-3.3-70b-versatile
Groq API responded in 1250ms
=== GROQ RESPONSE ===
Response length: 345
Response preview: {"title":"Concert Title","date":"2025-12-20"...
```

**Errore**:
```
=== GROQ API CALL ===
- GROQ_API_KEY configured: false  ← PROBLEMA!
- GROQ_API_KEY length: 0          ← PROBLEMA!
- Page text length: 0             ← PROBLEMA!
```

## Contatti

Se il problema persiste dopo aver seguito questa guida:
1. Esporta i log completi da Vercel
2. Controlla il preview del pageText
3. Verifica che l'URL del sito web sia accessibile pubblicamente
