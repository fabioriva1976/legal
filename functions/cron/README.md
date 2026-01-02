# Funzioni Cron

Questa directory contiene le funzioni Cloud schedulate (cron jobs) per operazioni automatiche.

## scaricaLeggiNormattiva

Funzione cron che scarica automaticamente leggi da Normattiva e le salva nel database Firestore.

### Configurazione

- **Schedule**: Ogni giorno alle 2:00 AM (cron: `0 2 * * *`)
- **Timezone**: Europe/Rome
- **Region**: europe-west1

### Funzionamento

1. Scarica leggi dal sito [Normattiva](https://www.normattiva.it/) usando l'API pubblica
2. Estrae i metadati (titolo, tipo, data, numero, descrizione)
3. Salva i dati nella collezione Firestore `leggi`

### Struttura Dati Firestore

Collezione: `leggi`

```javascript
{
  urn: "urn:nir:stato:decreto.legge:2023-12-29;215",
  titolo: "DECRETO-LEGGE 30 dicembre 2023, n. 215",
  tipo: "Decreto Legge",
  data: Timestamp,
  numero: "215",
  descrizione: "Disposizioni urgenti in materia di termini normativi. (23G00227)",
  url: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2023-12-29;215",
  htmlContent: "...", // Prime 50KB del contenuto HTML
  dataDownload: Timestamp,
  stato: "scaricato"
}
```

L'ID del documento è l'URN con caratteri `:` e `;` sostituiti da `_`.

### API Normattiva

Il sistema utilizza l'endpoint pubblico di Normattiva:

```
https://www.normattiva.it/uri-res/N2Ls?<URN>
```

Dove `<URN>` è l'identificatore univoco della legge, esempio:
- `urn:nir:stato:decreto.legge:2023-12-29;215`

Formato URN: `urn:nir:stato:<tipo>:<data>;<numero>`

### Test

Per testare la funzione localmente:

```bash
# Test solo download (senza DB)
cd functions
node test-download-only.js

# Test completo (con DB - richiede emulatore Firestore)
node test-scarica-leggi.js
```

### Deploy

La funzione viene automaticamente deployata con:

```bash
firebase deploy --only functions:scaricaLeggiNormattiva
```

### Monitoraggio

Visualizza i log della funzione:

```bash
firebase functions:log --only scaricaLeggiNormattiva
```

Oppure nella console Firebase: [Cloud Functions Logs](https://console.firebase.google.com/project/legal-816fa/functions/logs)

### Sviluppi Futuri

Attualmente la funzione scarica una sola legge di prova. Possibili miglioramenti:

1. Aggiungere endpoint API per scaricare liste di leggi recenti
2. Implementare ricerca per tipo/anno/materia
3. Aggiungere sistema di sincronizzazione incrementale
4. Implementare parsing avanzato del testo XML/HTML
5. Aggiungere notifiche per nuove leggi scaricate
6. Implementare sistema di caching intelligente

### Riferimenti

- [Normattiva OpenData](https://dati.normattiva.it/)
- [Documentazione API Normattiva](https://dati.normattiva.it/assets/come_fare_per/API_Normattiva_OpenData.pdf)
- [Firebase Scheduled Functions](https://firebase.google.com/docs/functions/schedule-functions)
