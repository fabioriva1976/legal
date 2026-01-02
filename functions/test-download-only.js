/**
 * Test rapido: scarica solo la legge senza salvare nel DB
 */

const axios = require("axios");

async function testDownload() {
  console.log("🚀 Test download da Normattiva\n");

  try {
    const urn = "urn:nir:stato:decreto.legge:2023-12-29;215";
    const url = `https://www.normattiva.it/uri-res/N2Ls?${urn}`;

    console.log(`📥 URL: ${url}\n`);

    const response = await axios.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FirebaseCron/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });

    console.log("✅ Download completato!");
    console.log(`📊 Dimensione: ${response.data.length} caratteri\n`);

    // Estrai metadati
    const html = response.data;

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta name="description" content="([^"]+)"/i);

    console.log("📋 Metadati:");
    console.log(`  Titolo: ${titleMatch ? titleMatch[1].replace(" - Normattiva", "").trim() : "N/A"}`);
    console.log(`  Descrizione: ${descMatch ? descMatch[1].trim() : "N/A"}`);

    // Estrai URN
    const urnParts = urn.split(":");
    if (urnParts.length >= 5) {
      const tipo = urnParts[3].replace(".", " ").replace(/\b\w/g, l => l.toUpperCase());
      const dataNumero = urnParts[4];
      const [dataPart, numeroPart] = dataNumero.split(";");

      console.log(`  Tipo: ${tipo}`);
      console.log(`  Data: ${dataPart}`);
      console.log(`  Numero: ${numeroPart}`);
    }

    console.log("\n✅ Test completato con successo!");

  } catch (error) {
    console.error("\n❌ Errore:", error.message);
    process.exit(1);
  }
}

testDownload();
