const { logger } = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios = require("axios");

/**
 * Funzione cron schedulata per scaricare leggi da Normattiva
 * Eseguita ogni giorno alle 2:00 AM (Europe/Rome)
 */
exports.scaricaLeggiNormattiva = onSchedule(
  {
    schedule: "0 2 * * *", // Ogni giorno alle 2:00 AM
    timeZone: "Europe/Rome",
    region: "europe-west1",
  },
  async (event) => {
    logger.info("Avvio scaricamento leggi da Normattiva");

    try {
      // Per ora scarico solo una legge di prova
      // URN di esempio: Decreto-Legge 30 dicembre 2023, n. 215
      const urn = "urn:nir:stato:decreto.legge:2023-12-29;215";

      const result = await scaricaESalvaLegge(urn);

      logger.info("Scaricamento completato", { result });

      return {
        success: true,
        leggiScaricate: 1,
        dettaglio: result
      };

    } catch (error) {
      logger.error("Errore durante lo scaricamento delle leggi", error);
      throw error;
    }
  }
);

/**
 * Scarica una legge da Normattiva tramite URN e la salva in Firestore
 * @param {string} urn - URN della legge (es: "urn:nir:stato:decreto.legge:2023-12-29;215")
 * @returns {Promise<Object>} Risultato dell'operazione
 */
async function scaricaESalvaLegge(urn) {
  logger.info(`Scaricamento legge: ${urn}`);

  try {
    // Costruisco l'URL per scaricare la legge in formato HTML
    const url = `https://www.normattiva.it/uri-res/N2Ls?${urn}`;

    logger.info(`Richiesta HTTP a: ${url}`);

    // Scarico il contenuto della legge
    const response = await axios.get(url, {
      timeout: 30000, // 30 secondi timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FirebaseCron/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    const htmlContent = response.data;

    // Estraggo metadati di base dall'HTML
    const metadati = estraiMetadati(htmlContent, urn);

    logger.info(`Metadati estratti:`, metadati);

    // Salvo nel database Firestore
    const db = admin.firestore();
    const leggiRef = db.collection("leggi");

    const docData = {
      urn: urn,
      titolo: metadati.titolo || "Titolo non disponibile",
      tipo: metadati.tipo || "Decreto-Legge",
      data: metadati.data || null,
      numero: metadati.numero || null,
      descrizione: metadati.descrizione || "",
      url: url,
      htmlContent: htmlContent.substring(0, 50000), // Limito a 50KB per non superare il limite Firestore
      dataDownload: admin.firestore.FieldValue.serverTimestamp(),
      stato: "scaricato"
    };

    // Uso l'URN come ID documento (sostituisco caratteri non validi)
    const docId = urn.replace(/:/g, "_").replace(/;/g, "_");

    await leggiRef.doc(docId).set(docData, { merge: true });

    logger.info(`Legge salvata con ID: ${docId}`);

    return {
      urn: urn,
      docId: docId,
      titolo: metadati.titolo,
      salvato: true
    };

  } catch (error) {
    logger.error(`Errore nello scaricamento della legge ${urn}:`, error);
    throw error;
  }
}

/**
 * Estrae metadati di base dall'HTML della legge
 * @param {string} html - Contenuto HTML della pagina
 * @param {string} urn - URN della legge
 * @returns {Object} Metadati estratti
 */
function estraiMetadati(html, urn) {
  const metadati = {};

  // Estraggo il titolo dalla tag <title>
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) {
    metadati.titolo = titleMatch[1].replace(" - Normattiva", "").trim();
  }

  // Estraggo la descrizione dalla meta tag
  const descMatch = html.match(/<meta name="description" content="([^"]+)"/i);
  if (descMatch) {
    metadati.descrizione = descMatch[1].trim();
  }

  // Parsing URN per estrarre tipo, data e numero
  // Formato: urn:nir:stato:decreto.legge:2023-12-29;215
  const urnParts = urn.split(":");
  if (urnParts.length >= 5) {
    metadati.tipo = urnParts[3].replace(".", " ").replace(/\b\w/g, l => l.toUpperCase());

    const dataNumero = urnParts[4];
    const [dataPart, numeroPart] = dataNumero.split(";");

    if (dataPart) {
      metadati.data = admin.firestore.Timestamp.fromDate(new Date(dataPart));
    }
    if (numeroPart) {
      metadati.numero = numeroPart;
    }
  }

  return metadati;
}

// Esporto anche la funzione di utilità per test manuali
exports.scaricaESalvaLegge = scaricaESalvaLegge;
