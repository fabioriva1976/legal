const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { VertexAI } = require("@google-cloud/vertexai");
const admin = require("firebase-admin");

const { region } = require("../index");

/**
 * Cloud Function che integra Vertex AI RAG per rispondere a domande
 * utilizzando i documenti caricati come contesto
 */
exports.ragChatApi = onCall({
    region: region
}, async (request) => {
    try {
        const userId = request.auth?.uid;

        if (!userId) {
            throw new HttpsError('unauthenticated', 'Utente non autenticato');
        }

        // Estrai i parametri della richiesta
        const { message, conversationHistory = [], practiceContext = '' } = request.data;

        if (!message) {
            throw new HttpsError('invalid-argument', 'Messaggio richiesto');
        }

        console.log(`📝 RAG Chat request from user ${userId}: ${message}`);
        if (practiceContext) {
            console.log(`📋 Practice context included: ${practiceContext.substring(0, 100)}...`);
        }

        // MODALITÀ MOCK PER EMULATORE
        const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
        if (isEmulator) {
            console.log('🧪 EMULATOR MODE: Returning mock response');
            return {
                answer: `[MODALITÀ EMULATORE]\n\nHo ricevuto la tua domanda: "${message}"\n\nPer testare la chat con l'AI RAG reale, esegui il deploy in produzione con:\nfirebase deploy --only functions\n\nL'emulatore non può accedere alle API Google Vertex AI.`,
                sources: [
                    {
                        id: 'mock-source-1',
                        title: 'Documento di test (Emulatore)',
                        fileName: 'test.pdf',
                        snippet: 'Questa è una risposta mock per l\'emulatore',
                        downloadURL: null
                    }
                ]
            };
        }

        // Recupera configurazione AI da Firestore
        const configRef = admin.firestore().collection('configurazioni').doc('ai');
        const configSnap = await configRef.get();

        if (!configSnap.exists) {
            throw new HttpsError('failed-precondition', 'Configurazione AI non trovata');
        }

        const aiConfig = configSnap.data();

        // System prompt per RAG - usa quello configurato o un default rigoroso
        const systemPrompt = aiConfig.systemPrompt || `Sei un assistente AI che risponde ESCLUSIVAMENTE basandosi sui documenti forniti.

REGOLE FONDAMENTALI:
1. Rispondi SOLO se la risposta è contenuta nei documenti forniti
2. Se l'informazione NON è nei documenti, rispondi chiaramente: "Non ho trovato questa informazione nei documenti disponibili."
3. Cita SEMPRE le fonti specifiche (nome documento) quando rispondi
4. NON inventare, NON dedurre, NON usare conoscenze esterne
5. Se i documenti forniscono informazioni parziali, specifica cosa è presente e cosa manca

Sei un assistente affidabile e preciso.`;

        // Prepara il contesto della conversazione
        let conversationContext = '';
        if (conversationHistory.length > 0) {
            conversationContext = '\n\nSTORICO CONVERSAZIONE:\n' + conversationHistory
                .map(msg => `${msg.role === 'user' ? 'Utente' : 'Assistente'}: ${msg.content}`)
                .join('\n') + '\n';
        }

        // Verifica che il RAG Corpus ID sia configurato
        if (!aiConfig.ragCorpusId) {
            throw new HttpsError('failed-precondition', 'RAG Corpus ID non configurato. Vai in Profilo > Agenti AI e configura il RAG Corpus ID.');
        }

        // Configurazione Vertex AI
        const projectId = process.env.GCLOUD_PROJECT || 'legal-816fa';
        const location = aiConfig.ragLocation || 'europe-west1';
        const ragCorpus = `projects/${projectId}/locations/${location}/ragCorpora/${aiConfig.ragCorpusId}`;

        console.log(`🔍 Using RAG Corpus: ${ragCorpus}`);

        // Normalizza il nome del modello
        let modelName = aiConfig.model || 'gemini-1.5-flash';
        if (modelName.startsWith('models/')) {
            modelName = modelName.replace('models/', '');
        }

        // Per Vertex AI, usa i nomi diretti (senza -latest)
        const modelMapping = {
            'gemini-1.5-pro': 'gemini-1.5-pro',
            'gemini-1.5-flash': 'gemini-1.5-flash',
            'gemini-2.5-pro': 'gemini-2.5-pro',
            'gemini-2.5-flash': 'gemini-2.5-flash',
            'gemini-pro': 'gemini-1.0-pro',
        };

        const finalModel = modelMapping[modelName] || modelName;

        // Inizializza Vertex AI
        const vertexAI = new VertexAI({
            project: projectId,
            location: location
        });

        // Crea il modello con RAG
        const generativeModel = vertexAI.preview.getGenerativeModel({
            model: finalModel,
            generationConfig: {
                temperature: aiConfig.temperature || 0.7,
                maxOutputTokens: aiConfig.maxTokens || 2048,
            }
        });

        // Costruisci il prompt con il system prompt, il contesto della pratica e la domanda
        const fullPrompt = `${systemPrompt}
${practiceContext}
${conversationContext}

DOMANDA UTENTE: ${message}

RISPOSTA (ricorda di citare le fonti dai documenti):`;

        console.log(`🤖 Sending query to Vertex AI RAG...`);

        // Genera la risposta usando RAG
        const ragRequest = {
            contents: [{
                role: 'user',
                parts: [{ text: fullPrompt }]
            }],
            tools: [{
                retrieval: {
                    vertexRagStore: {
                        ragResources: [{
                            ragCorpus: ragCorpus
                        }]
                    }
                }
            }]
        };

        const result = await generativeModel.generateContent(ragRequest);
        const response = result.response;
        const answer = response.candidates[0].content.parts[0].text;

        console.log('📊 Grounding metadata:', JSON.stringify(response.candidates[0].groundingMetadata, null, 2));

        // Estrai le fonti dalle grounding metadata
        const sources = [];
        const groundingMetadata = response.candidates[0].groundingMetadata;

        if (groundingMetadata) {
            // Prova groundingChunks (struttura più comune)
            if (groundingMetadata.groundingChunks && groundingMetadata.groundingChunks.length > 0) {
                console.log(`📚 Found ${groundingMetadata.groundingChunks.length} grounding chunks`);

                // Mappa per evitare duplicati (stesso file)
                const seenFiles = new Set();

                for (const chunk of groundingMetadata.groundingChunks) {
                    const retrievedContext = chunk.retrievedContext;

                    if (retrievedContext) {
                        // Estrai il nome del file dal percorso URI o title
                        const uri = retrievedContext.uri || '';
                        const title = retrievedContext.title || '';
                        const fileName = title || uri.split('/').pop() || `Documento ${sources.length + 1}`;

                        // Evita duplicati dello stesso file
                        if (seenFiles.has(fileName)) {
                            continue;
                        }
                        seenFiles.add(fileName);

                        // Cerca il documento in Firestore per ottenere ID, titolo e URL
                        let docId = null;
                        let docTitle = fileName;
                        let downloadURL = null;

                        try {
                            const docsSnapshot = await admin.firestore().collection('documenti')
                                .where('fileName', '==', fileName)
                                .limit(1)
                                .get();

                            if (!docsSnapshot.empty) {
                                const docData = docsSnapshot.docs[0];
                                docId = docData.id;
                                const data = docData.data();
                                docTitle = data.titolo || fileName;
                                downloadURL = data.downloadURL || null;
                            }
                        } catch (err) {
                            console.warn('⚠️ Could not find document in Firestore:', fileName, err);
                        }

                        // Estrai snippet dal testo del chunk
                        const text = retrievedContext.text || retrievedContext.ragChunk?.text || '';
                        const snippet = text.substring(0, 300);

                        sources.push({
                            id: docId || `source-${sources.length}`,
                            title: docTitle,
                            fileName: fileName,
                            snippet: snippet,
                            downloadURL: downloadURL,
                            uri: uri
                        });
                    }
                }
            }
            // Fallback: usa retrievalMetadata se disponibile
            else if (groundingMetadata.retrievalMetadata) {
                console.log('📚 Using retrievalMetadata');
                const sources_list = groundingMetadata.retrievalMetadata.sources || [];

                for (const source of sources_list) {
                    const fileName = source.title || source.uri?.split('/').pop() || `Documento ${sources.length + 1}`;

                    sources.push({
                        id: `source-${sources.length}`,
                        title: fileName,
                        fileName: fileName,
                        snippet: source.snippet || null,
                        downloadURL: null
                    });
                }
            }
        }

        // Se non ci sono fonti specifiche, prova a estrarre dal contenuto
        if (sources.length === 0) {
            console.warn('⚠️ No grounding metadata found, creating generic source');
            sources.push({
                id: 'source-generic',
                title: 'Documenti del corpus RAG',
                fileName: null,
                snippet: 'Risposta generata da documenti indicizzati nel RAG',
                downloadURL: null
            });
        }

        console.log(`✅ RAG Chat response generated successfully with ${sources.length} sources`);

        return {
            answer: answer,
            sources: sources.slice(0, 5) // Aumentato a 5 fonti
        };

    } catch (error) {
        console.error('❌ Errore in RAG Chat:', error);

        let errorMessage = 'Errore durante l\'elaborazione della richiesta';

        if (error.message && error.message.includes('not found')) {
            errorMessage = 'Modello AI non disponibile';
        } else if (error.message && error.message.includes('quota')) {
            errorMessage = 'Quota API superata';
        } else if (error.message) {
            errorMessage = error.message;
        }

        throw new HttpsError('internal', errorMessage);
    }
});
