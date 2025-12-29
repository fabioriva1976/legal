const { onCall } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { region } = require("../index");

exports.aiAssistantApi = onCall({ region }, async (request) => {
    try {
        const { prompt, history = [] } = request.data;

        if (!prompt) {
            throw new Error("❌ Prompt mancante. Inserisci una domanda o richiesta.");
        }

        const db = getFirestore();

    // Carica la configurazione AI da Firestore
    const aiConfigDoc = await db.collection("configurazioni").doc("ai").get();

    if (!aiConfigDoc.exists) {
        throw new Error("❌ Configurazione AI non trovata in Firestore. Configura AI prima di usare l'assistente.");
    }

    const aiConfig = aiConfigDoc.data();

    // Verifica che i parametri necessari siano presenti
    if (!aiConfig.provider || !aiConfig.apiKey || !aiConfig.model) {
        throw new Error("❌ Configurazione AI incompleta. Verifica provider, apiKey e model in Firestore.");
    }

    console.log(`🤖 Usando AI provider: ${aiConfig.provider}, model: ${aiConfig.model}`);

    // Usa AI per determinare quali collection servono
    const analysisPrompt = `
Analizza questa richiesta e determina quali collection Firebase sono necessarie.
Collection disponibili: pratiche, utenti, import_dati

Richiesta: "${prompt}"

Rispondi SOLO con i nomi delle collection separate da virgola (es: pratiche,utenti)
`;

    let collectionsNeeded;

    // Analisi delle collection necessarie (differente per provider)
    if (aiConfig.provider === 'google') {
        const genAI = new GoogleGenerativeAI(aiConfig.apiKey);
        const analysisModel = genAI.getGenerativeModel({ model: aiConfig.model });
        const analysisResult = await analysisModel.generateContent(analysisPrompt);
        collectionsNeeded = analysisResult.response.text()
            .trim()
            .split(',')
            .map(c => c.trim())
            .filter(c => ['pratiche', 'utenti', 'import_dati'].includes(c));
    } else if (aiConfig.provider === 'openai') {
        const axios = require('axios');
        const analysisResponse = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: aiConfig.model,
                messages: [{ role: 'user', content: analysisPrompt }],
                max_tokens: 50,
                temperature: 0.3
            },
            {
                headers: {
                    'Authorization': `Bearer ${aiConfig.apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        collectionsNeeded = analysisResponse.data.choices[0].message.content
            .trim()
            .split(',')
            .map(c => c.trim())
            .filter(c => ['pratiche', 'utenti', 'import_dati'].includes(c));
    } else {
        throw new Error(`❌ Provider AI '${aiConfig.provider}' non supportato. Usa 'google' o 'openai'.`);
    }

    // Carica solo i dati necessari
    const allData = {};
    for (const collectionName of collectionsNeeded) {
        const snapshot = await db.collection(collectionName).limit(100).get();
        allData[collectionName] = [];
        snapshot.forEach(doc => {
            allData[collectionName].push({ id: doc.id, ...doc.data() });
        });
    }

    // Costruisci lo storico della conversazione
    const conversationHistory = history.map(msg =>
        `${msg.role === 'user' ? 'Utente' : 'Assistente'}: ${msg.content}`
    ).join('\n');

    // Usa il systemPrompt dalla configurazione o un default
    const systemPrompt = aiConfig.systemPrompt ||
        "Sei un assistente AI per un sistema gestionale. Analizza i dati e rispondi in modo chiaro e professionale in italiano.";

    const aiPrompt = `
${systemPrompt}

Hai accesso ai seguenti dati:
${JSON.stringify(allData, null, 2)}

${conversationHistory ? `Storico conversazione:\n${conversationHistory}\n\n` : ''}
Nuova richiesta dell'utente: "${prompt}"

Rispondi alla richiesta. Se non trovi informazioni rilevanti, dillo chiaramente.
`;

    let response;

    // Genera la risposta finale basandosi sul provider
    if (aiConfig.provider === 'google') {
        const genAI = new GoogleGenerativeAI(aiConfig.apiKey);
        const model = genAI.getGenerativeModel({
            model: aiConfig.model,
            generationConfig: {
                temperature: aiConfig.temperature || 0.7,
                maxOutputTokens: aiConfig.maxTokens || 2048,
            }
        });
        const result = await model.generateContent(aiPrompt);
        response = result.response.text();
    } else if (aiConfig.provider === 'openai') {
        const axios = require('axios');
        const result = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: aiConfig.model,
                messages: [{ role: 'user', content: aiPrompt }],
                max_tokens: aiConfig.maxTokens || 2048,
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
        response = result.data.choices[0].message.content;
    }

    // Rimuovi asterischi per formattazione markdown
    response = response.replace(/\*\*/g, '').replace(/\*/g, '');

    return { response };

    } catch (error) {
        console.error("❌ Errore in aiAssistantApi:", error);

        // Gestione errori dettagliata
        let errorMessage = "Si è verificato un errore durante l'elaborazione della richiesta.";

        if (error.message) {
            // Usa il messaggio personalizzato se già presente
            if (error.message.startsWith("❌")) {
                errorMessage = error.message;
            } else if (error.message.includes("API key")) {
                errorMessage = "❌ Errore con l'API Key AI. Verifica la configurazione in config-ai.";
            } else if (error.message.includes("quota") || error.message.includes("limit")) {
                errorMessage = "❌ Quota API superata. Verifica il tuo account AI provider.";
            } else if (error.message.includes("model")) {
                errorMessage = `❌ Errore con il modello AI. Verifica che il modello configurato sia valido.`;
            } else if (error.message.includes("Firestore")) {
                errorMessage = "❌ Errore di connessione al database. Riprova tra qualche istante.";
            } else if (error.message.includes("timeout")) {
                errorMessage = "❌ Timeout della richiesta AI. Il prompt potrebbe essere troppo complesso.";
            } else {
                errorMessage = `❌ Errore AI: ${error.message}`;
            }
        }

        // Log dettagliato per debugging
        console.error("Dettagli errore:", {
            message: error.message,
            stack: error.stack,
            code: error.code
        });

        throw new Error(errorMessage);
    }
});
