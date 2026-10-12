# Facebook Authentication Setup

## Come ottenere i cookies di Facebook per l'autenticazione

### Metodo 1: Esportazione Manuale dei Cookies

1. **Accedi a Facebook** nel tuo browser
2. **Apri Developer Tools** (F12 o Cmd+Option+I)
3. **Vai alla tab "Application" o "Storage"**
4. **Trova "Cookies" → "https://www.facebook.com"**
5. **Copia tutti i cookies importanti** (vedi lista sotto)

### Cookies Importanti per Facebook:
- `c_user` - User ID
- `xs` - Session token
- `datr` - Device identifier
- `sb` - Secure browsing token
- `fr` - Facebook tracking
- `wd` - Window dimensions

### Metodo 2: Estrazione Automatica con JavaScript

Esegui questo script nella console di Facebook (dopo aver fatto login):

```javascript
// Copia questo codice nella console del browser su facebook.com
copy(JSON.stringify(document.cookie.split(';').map(cookie => {
  const [name, value] = cookie.split('=').map(s => s.trim());
  return {
    name,
    value,
    domain: '.facebook.com',
    path: '/'
  };
}).filter(cookie => cookie.name && cookie.value)));
```

Questo copierà i cookies in formato JSON negli appunti.

### Setup nel .env

#### Opzione A: JSON Format (Raccomandato)
```bash
FACEBOOK_COOKIES_SECRET_KEY='[{"name":"c_user","value":"123456789","domain":".facebook.com","path":"/"},{"name":"xs","value":"your_xs_token","domain":".facebook.com","path":"/"}]'
```

#### Opzione B: Browser Cookie Format
```bash
FACEBOOK_COOKIES_SECRET_KEY="c_user=123456789; xs=your_xs_token; datr=your_datr_token"
```

#### Opzione C: Credenziali (meno sicuro)
```bash
FACEBOOK_EMAIL="your-email@example.com"
FACEBOOK_PASSWORD_SECRET_KEY="your-password"
```

## Importante

### Sicurezza
- ⚠️ **Non condividere mai i tuoi cookies** - sono come la tua password
- ⚠️ **I cookies scadono** - dovrai aggiornarli periodicamente
- ⚠️ **Usa credenziali separate** se possibile (account secondario)

### Limitazioni Facebook
- Facebook può rilevare attività automatizzata anche con cookies validi
- L'accesso a eventi privati richiede inviti specifici
- Facebook può richiedere verifiche aggiuntive (captcha, 2FA)

### Risoluzione Problemi

#### Cookies Scaduti
```bash
# Sintomi: Login fallisce anche con cookies
# Soluzione: Ri-esporta i cookies dopo un nuovo login
```

#### 2FA Attivato
```bash
# Sintomi: Login richiede codice di verifica
# Soluzione: Usa app passwords o disabilita 2FA temporaneamente
```

#### Captcha Richiesto
```bash
# Sintomi: Facebook mostra captcha
# Soluzione: Completa il captcha manualmente, poi ri-esporta cookies
```

## Testing

Puoi testare la configurazione con:

```bash
curl -X POST http://localhost:3000/api/process-link \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.facebook.com/events/123456789"}'
```

I log dovrebbero mostrare:
- `🍪 Setting Facebook cookies for authentication...`
- `✅ Facebook login successful via cookies`