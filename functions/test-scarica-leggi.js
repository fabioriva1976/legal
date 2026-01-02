/**
 * Script di test per la funzione scaricaLeggiNormattiva
 * Esegui con: node test-scarica-leggi.js
 */

const admin = require("firebase-admin");

// Configura l'emulatore Firestore
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.GCLOUD_PROJECT = "legal-816fa";

console.log(`🔧 Usando Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(`🔧 Project ID: ${process.env.GCLOUD_PROJECT}\n`);

admin.initializeApp({
  projectId: "legal-816fa"
});

// Importa la funzione di utilità
const { scaricaESalvaLegge } = require("./cron/scaricaLeggiNormattiva");

async function test() {
  console.log("🚀 Avvio test scaricamento legge da Normattiva\n");

  try {
    // URN di test: Decreto-Legge 30 dicembre 2023, n. 215
    const urn = "urn:nir:stato:decreto.legge:2023-12-29;215";

    console.log(`📥 Scaricamento legge: ${urn}\n`);

    const result = await scaricaESalvaLegge(urn);

    console.log("\n✅ Test completato con successo!");
    console.log("\nRisultato:");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n📊 Verifica nel database:");
    const db = admin.firestore();
    const docId = urn.replace(/:/g, "_").replace(/;/g, "_");
    const doc = await db.collection("leggi").doc(docId).get();

    if (doc.exists) {
      const data = doc.data();
      console.log(`\n  ID: ${doc.id}`);
      console.log(`  Titolo: ${data.titolo}`);
      console.log(`  Tipo: ${data.tipo}`);
      console.log(`  Data: ${data.data ? data.data.toDate() : 'N/A'}`);
      console.log(`  Numero: ${data.numero}`);
      console.log(`  URL: ${data.url}`);
      console.log(`  Descrizione: ${data.descrizione}`);
      console.log(`  Dimensione HTML: ${data.htmlContent ? data.htmlContent.length : 0} caratteri`);
      console.log(`  Data download: ${data.dataDownload ? data.dataDownload.toDate() : 'N/A'}`);
      console.log(`  Stato: ${data.stato}`);
    } else {
      console.log("  ⚠️ Documento non trovato nel database");
    }

    process.exit(0);

  } catch (error) {
    console.error("\n❌ Errore durante il test:");
    console.error(error);
    process.exit(1);
  }
}

// Esegui il test
test();
