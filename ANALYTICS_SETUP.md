# Google Analytics & Google Tag Manager Setup Guide

## Configurazione Variabili d'Ambiente

Nel file `.env`, aggiungi le seguenti variabili:

```env
# Google Analytics & GTM Configuration
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXXX
```

## Come ottenere i codici

### Google Analytics 4 (GA4)

1. Vai su [Google Analytics](https://analytics.google.com/)
2. Crea una proprietà per il tuo sito
3. Vai su "Amministrazione" > "Stream dati" > "Web"
4. Copia il "MEASUREMENT ID" (formato: G-XXXXXXXXXX)
5. Inseriscilo in `NEXT_PUBLIC_GA_MEASUREMENT_ID`

### Google Tag Manager (GTM)

1. Vai su [Google Tag Manager](https://tagmanager.google.com/)
2. Crea un nuovo contenitore per il tuo sito
3. Copia l'ID del contenitore (formato: GTM-XXXXXXXX)
4. Inseriscilo in `NEXT_PUBLIC_GTM_ID`

## Eventi Tracciati Automaticamente

### Navigazione
- **Visualizzazioni pagina**: Automatic page tracking
- **Ricerche**: Search events con termini e risultati
- **Azioni utente**: Click, navigation, ecc.

### Eventi Specifici dell'App
- **event_view**: Quando un utente visualizza un evento
- **event_create**: Quando viene creato un nuovo evento
- **event_edit**: Quando viene modificato un evento
- **search**: Ricerca eventi con risultati

### Parametri Tracciati per gli Eventi
- `event_id`: ID dell'evento
- `event_title`: Titolo dell'evento
- `event_category`: Categoria dell'evento
- `event_location`: Location dell'evento
- `event_date`: Data dell'evento
- `event_price`: Prezzo dell'evento
- `search_term`: Termine di ricerca
- `search_category`: Categoria ricerca
- `search_results_count`: Numero risultati

## Tag GTM Consigliati

### 1. GA4 Configuration Tag
- **Type**: Google Analytics: GA4 Configuration
- **Measurement ID**: {{GA4_MEASUREMENT_ID}} (variable)
- **Trigger**: All Pages

### 2. GA4 Event Tag per Eventi Custom
- **Type**: Google Analytics: GA4 Event
- **Configuration Tag**: GA4 Configuration
- **Event Name**: {{Event}} (built-in variable)
- **Event Parameters**: 
  - event_id: {{event_id}}
  - event_title: {{event_title}}
  - event_category: {{event_category}}
- **Trigger**: Custom Event (event_view, event_create, ecc.)

### 3. Enhanced Ecommerce per Eventi (Opzionale)
- **Type**: Google Analytics: GA4 Event
- **Event Name**: view_item
- **Event Parameters**:
  - item_id: {{event_id}}
  - item_name: {{event_title}}
  - item_category: {{event_category}}
  - price: {{event_price}}

## Variabili GTM Consigliate

### Data Layer Variables
- `event_id` (Data Layer Variable)
- `event_title` (Data Layer Variable)
- `event_category` (Data Layer Variable)
- `event_location` (Data Layer Variable)
- `search_term` (Data Layer Variable)
- `search_results_count` (Data Layer Variable)

### Built-in Variables da Attivare
- Page URL
- Page Title
- Click URL
- Click Text
- Form Classes
- Form ID

## Test e Debug

### Verifica Implementazione
1. Apri le Developer Tools del browser
2. Vai alla tab "Console"
3. Digita `dataLayer` per vedere gli eventi tracciati
4. Usa Google Tag Assistant per verificare i tag

### GTM Preview Mode
1. Nel GTM, clicca su "Preview"
2. Inserisci l'URL del sito
3. Naviga nel sito per testare i trigger

### GA4 Real-time Reports
1. In Google Analytics, vai su "Reports" > "Real-time"
2. Naviga nel sito per vedere gli eventi in tempo reale

## Privacy e GDPR

### Cookie Consent (da implementare)
```javascript
// Esempio di implementazione consent
gtag('consent', 'default', {
  'analytics_storage': 'denied',
  'ad_storage': 'denied'
});

// Dopo il consenso utente
gtag('consent', 'update', {
  'analytics_storage': 'granted',
  'ad_storage': 'granted'
});
```

### Anonymize IP (già implementato)
L'IP viene automaticamente anonimizzato in GA4.

## Performance

### Lazy Loading
I script GA e GTM vengono caricati in modo asincrono per non impattare le performance.

### Bundle Size
L'implementazione aggiunge circa 50KB al bundle (GA + GTM scripts).