---
title: 'Fallback NVIDIA dopo esaurimento quota Groq'
type: 'feature'
created: '2026-10-28'
status: 'done'
route: 'one-shot'
---

# Fallback NVIDIA dopo esaurimento quota Groq

## Intent

**Problem:** Il crop selezionava solo Groq per default, quindi una quota esaurita terminava il tentativo anche con una chiave NVIDIA disponibile. L'utente richiede il fallback proposto e la verifica delle chiavi Vercel.

**Approach:** Default del crop e dello script diagnostico `groq,nvidia`, preservando gli override espliciti. Dopo errori di servizio o quota il provider gia fallito viene saltato anche nella verifica successiva. NVIDIA usa JSON schema normalizzato 0..1 e ragionamento disattivato solo in modalita JSON. Nessun fallback su rifiuti privacy; validatore e soglie invariati. Nessun nuovo provider a pagamento, segreto modificato, commit o deployment.

**Verifica:** 49 test media/vision passati, TypeScript ed ESLint puliti; revisione indipendente senza rilievi. Prova NVIDIA reale su locandina sintetica: localizzazione circa 1,4 secondi, verifica circa 3,7 secondi, crop 677x1126. Le prime prove avevano rivelato troncamento e coordinate non normalizzate; il protocollo finale impone le stesse unita originali senza conversioni euristiche. `lib/poster-crop.ts` non ha modifiche nette.

**Vercel:** impossibile leggere le variabili remote in questa sessione: nessun collegamento `.vercel`, CLI, token o autenticazione salvata disponibile. Le chiavi Groq e NVIDIA risultano presenti soltanto nell'ambiente locale. In Production e Preview verificare `GROQ_API_SECRET_KEY`, `NVIDIA_API_SECRET_KEY` e `AI_VISION_CROP_PROVIDERS=groq,nvidia` (oppure nessun override). I modelli hanno default e i relativi override sono facoltativi. Un precedente override `groq` impedisce il fallback anche dopo questo aggiornamento. Eseguire un nuovo deployment dopo avere aggiornato le variabili. Non dichiarata verificata la presenza delle chiavi online; non richiederne i valori in chat.

## Suggested Review Order

- Ordine predefinito indipendente del crop, con override preservato.
  [route.ts](../../app/api/crop-image/route.ts)
- Schema NVIDIA e ragionamento disattivato solo nel JSON del crop.
  [vision-ai.ts](../../lib/vision-ai.ts)
- Regresso quota Groq, verifica NVIDIA e soglie normalizzate invariate.
  [event-media.test.mjs](../../lib/event-media.test.mjs)
- Configurazione richiesta su Vercel e limiti della verifica remota.
  [OPENAI_SETUP.md](../../OPENAI_SETUP.md)