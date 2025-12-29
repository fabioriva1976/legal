const { onCall } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { region } = require("../index.js");

exports.testAiApi = onCall({ region }, async (request) => {
    console.log("🔍 testAiApi chiamata");

    if (!request.auth) {
        throw new Error("Devi essere autenticato.");
    }

    try {
        const db = getFirestore();

        // Carica la configurazione AI da Firestore
        console.log("📋 Caricamento configurazione AI da Firestore...");
        const aiConfigDoc = await db.collection("configurazioni").doc("ai").get();

        if (!aiConfigDoc.exists) {
            console.error("❌ Documento configurazione AI non trovato");
            throw new Error("❌ Configurazione AI non trovata in Firestore. Configura l'AI prima di testare.");
        }

        const aiConfig = aiConfigDoc.data();
        console.log("✅ Configurazione AI caricata:", {
            provider: aiConfig.provider,
            model: aiConfig.model,
            hasApiKey: !!aiConfig.apiKey
        });

        // Verifica che tutti i parametri necessari siano presenti
        if (!aiConfig.provider || !aiConfig.apiKey || !aiConfig.model) {
            console.error("❌ Configurazione incompleta:", {
                hasProvider: !!aiConfig.provider,
                hasApiKey: !!aiConfig.apiKey,
                hasModel: !!aiConfig.model
            });
            throw new Error("❌ Configurazione AI incompleta. Verifica provider, API key e model.");
        }

        console.log(`🤖 Testing AI configuration: ${aiConfig.provider} - ${aiConfig.model}`);

        // Supporto per diversi provider AI
        if (aiConfig.provider === 'openai') {
            return await testOpenAI(aiConfig);
        } else if (aiConfig.provider === 'google') {
            return await testGoogleAI(aiConfig);
        } else if (aiConfig.provider === 'anthropic') {
            throw new Error(`❌ Provider "anthropic" (Claude) non ancora supportato per il test. Implementazione in arrivo.`);
        } else if (aiConfig.provider === 'azure') {
            throw new Error(`❌ Provider "azure" non ancora supportato per il test. Implementazione in arrivo.`);
        } else {
            throw new Error(`❌ Provider "${aiConfig.provider}" non riconosciuto. Provider supportati: google, openai.`);
        }

    } catch (error) {
        console.error("❌ Errore nel test AI:", error);

        // Fornisci messaggi di errore più specifici
        let errorMessage = "Errore durante il test della configurazione AI.";

        // Controlla prima se è un nostro errore personalizzato
        if (error.message && error.message.startsWith("❌")) {
            errorMessage = error.message;
        }
        // Gestisci gli errori comuni
        else if (error.message && error.message.includes("API key")) {
            errorMessage = "❌ API Key non valida. Verifica la chiave API configurata.";
        } else if (error.message && error.message.includes("quota")) {
            errorMessage = "❌ Quota API superata. Verifica il tuo account.";
        } else if (error.message) {
            errorMessage = `❌ Errore: ${error.message}`;
        }

        // Log dettagliato per debugging
        console.error("Dettagli errore AI:", {
            message: error.message,
            status: error.status,
            statusText: error.statusText,
            code: error.code
        });

        throw new Error(errorMessage);
    }
});

// Funzione di test per Google AI (Gemini)
async function testGoogleAI(aiConfig) {
    console.log(`🤖 Testing Google AI: ${aiConfig.model}`);

    // Inizializza Google Generative AI
    const genAI = new GoogleGenerativeAI(aiConfig.apiKey);
    const model = genAI.getGenerativeModel({
        model: aiConfig.model,
        generationConfig: {
            temperature: aiConfig.temperature || 0.7,
            maxOutputTokens: 100, // Limita per il test
        }
    });

    console.log("🔄 Invio prompt di test...");

    // Invia un prompt di test semplice
    const testPrompt = "Rispondi solo con 'OK' se funziono correttamente.";
    const result = await model.generateContent(testPrompt);
    const response = await result.response;
    const text = response.text();

    console.log("✅ Risposta Google AI ricevuta:", text.substring(0, 100));

    return {
        success: true,
        message: "✅ Test Google AI completato con successo!",
        details: {
            provider: aiConfig.provider,
            model: aiConfig.model,
            responsePreview: text.substring(0, 100),
            responseLength: text.length
        }
    };
}

// Funzione di test per OpenAI
async function testOpenAI(aiConfig) {
    console.log(`🤖 Testing OpenAI: ${aiConfig.model}`);

    // Uso axios per chiamare l'API OpenAI direttamente
    const axios = require('axios');

    console.log("🔄 Invio prompt di test...");

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: aiConfig.model,
                messages: [
                    {
                        role: 'user',
                        content: 'Rispondi solo con "OK" se funziono correttamente.'
                    }
                ],
                max_tokens: 100,
                temperature: aiConfig.temperature || 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${aiConfig.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: (aiConfig.timeout || 30) * 1000
            }
        );

        const text = response.data.choices[0].message.content;
        console.log("✅ Risposta OpenAI ricevuta:", text.substring(0, 100));

        return {
            success: true,
            message: "✅ Test OpenAI completato con successo!",
            details: {
                provider: aiConfig.provider,
                model: aiConfig.model,
                responsePreview: text.substring(0, 100),
                responseLength: text.length,
                tokensUsed: response.data.usage?.total_tokens
            }
        };

    } catch (error) {
        // Gestisci errori specifici di OpenAI
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data?.error;

            if (status === 401) {
                throw new Error("❌ API Key OpenAI non valida. Verifica la chiave API.");
            } else if (status === 429) {
                throw new Error("❌ Quota OpenAI superata o troppe richieste. Verifica il tuo account.");
            } else if (status === 404) {
                throw new Error(`❌ Modello "${aiConfig.model}" non trovato. Verifica che sia accessibile con la tua API key.`);
            } else if (errorData?.type === 'insufficient_quota') {
                throw new Error("❌ Credito OpenAI esaurito. Aggiungi credito al tuo account.");
            } else if (errorData?.message) {
                throw new Error(`❌ Errore OpenAI: ${errorData.message}`);
            } else {
                throw new Error(`❌ Errore OpenAI (${status}). Verifica la configurazione.`);
            }
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
            throw new Error("❌ Timeout della richiesta OpenAI. Verifica la connessione.");
        } else {
            throw error;
        }
    }
}
