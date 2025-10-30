# Configurazione GPT-4 Vision API

Questo progetto utilizza GPT-4 Vision di OpenAI per analizzare automaticamente le immagini di eventi.

## 🔑 Come Ottenere una API Key OpenAI

1. **Crea un account OpenAI**
   - Vai su [https://platform.openai.com/signup](https://platform.openai.com/signup)
   - Registrati con email o account Google/Microsoft

2. **Aggiungi credito al tuo account**
   - Vai su [https://platform.openai.com/account/billing](https://platform.openai.com/account/billing)
   - Aggiungi un metodo di pagamento
   - Ricarica almeno $5-10 per iniziare

3. **Genera una API Key**
   - Vai su [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - Clicca su "Create new secret key"
   - Dai un nome alla chiave (es. "Event Scanner App")
   - **IMPORTANTE**: Copia la chiave immediatamente, non potrai più vederla!

4. **Configura la chiave nel progetto**
   ```bash
   # Crea il file .env.local nella root del progetto
   echo "OPENAI_API_KEY=sk-proj-your-actual-key-here" > .env.local
   ```

## 💰 Costi Stimati

GPT-4 Vision (gpt-4o) ha i seguenti costi:

- **Input**: ~$2.50 per 1M tokens (~$0.0025 per 1K tokens)
- **Output**: ~$10.00 per 1M tokens (~$0.01 per 1K tokens)

### Stima per analisi evento:
- Immagine tipica: ~1000 tokens di input
- Risposta JSON: ~300 tokens di output
- **Costo per analisi**: ~$0.006 (meno di 1 centesimo!)

Con $10 di credito puoi analizzare circa **1,600 immagini di eventi**.

## 🔒 Sicurezza

- ❌ **MAI** committare il file `.env.local` su Git
- ✅ Il file è già incluso in `.gitignore`
- 🔄 Usa `.env.example` come riferimento per altri sviluppatori
- 🔐 Rigenera la chiave se accidentalmente la esponi pubblicamente

## 🧪 Testing

Per verificare che tutto funzioni:

1. Assicurati che `.env.local` sia configurato correttamente
2. Avvia il server: `npm run dev`
3. Carica un'immagine di test
4. Controlla la console per eventuali errori di API key

## ❌ Troubleshooting

### Errore: "Incorrect API key provided"
- Verifica che la chiave sia corretta in `.env.local`
- Controlla che non ci siano spazi extra
- Riavvia il server dopo aver modificato `.env.local`

### Errore: "You exceeded your current quota"
- Il tuo account OpenAI non ha credito sufficiente
- Aggiungi credito su [https://platform.openai.com/account/billing](https://platform.openai.com/account/billing)

### Errore: "Rate limit exceeded"
- Hai fatto troppe richieste in breve tempo
- Aspetta 1-2 minuti prima di riprovare
- Considera di aumentare il rate limit sul tuo account OpenAI

## 📚 Risorse Utili

- [OpenAI Platform](https://platform.openai.com/)
- [GPT-4 Vision Documentation](https://platform.openai.com/docs/guides/vision)
- [Pricing Information](https://openai.com/pricing)
- [Usage Dashboard](https://platform.openai.com/usage)
