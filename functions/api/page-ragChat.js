const { onRequest } = require("firebase-functions/v2/https");
const { VertexAI } = require('@google-cloud/vertexai');
const admin = require("firebase-admin");

const { region } = require("../index");

/**
 * Cloud Function che integra Vertex AI RAG per rispondere a domande
 * utilizzando i documenti caricati come contesto
 */
exports.ragChatApi = onRequest({ region: region, cors: true }, async (req, res) => {
    // Verifica autenticazione
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Non autorizzato' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        // Verifica il token Firebase
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;

        // Estrai i parametri della richiesta
        const { message, conversationHistory = [] } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Messaggio richiesto' });
        }

        console.log(`📝 RAG Chat request from user ${userId}: ${message}`);

        // Recupera configurazione AI da Firestore
        const configRef = admin.firestore().collection('configurazioni').doc('ai');
        const configSnap = await configRef.get();

        if (!configSnap.exists) {
            return res.status(500).json({ error: 'Configurazione AI non trovata' });
        }

        const aiConfig = configSnap.data();

        // TODO: Sostituisci questi valori con la tua configurazione Vertex AI RAG
        const projectId = 'legal-816fa'; // Il tuo project ID
        const location = 'europe-west1'; // La tua region
        const ragCorpusName = 'projects/' + projectId + '/locations/' + location + '/ragCorpora/YOUR_CORPUS_ID';

        // Inizializza Vertex AI
        const vertexAI = new VertexAI({
            project: projectId,
            location: location
        });

        // Prepara il contesto della conversazione
        let conversationContext = '';
        if (conversationHistory.length > 0) {
            conversationContext = conversationHistory
                .map(msg => `${msg.role === 'user' ? 'Utente' : 'Assistente'}: ${msg.content}`)
                .join('\n');
            conversationContext += '\n\n';
        }

        // Crea il prompt per RAG
        const prompt = `${conversationContext}Utente: ${message}

Rispondi alla domanda dell'utente basandoti SOLO sulle informazioni contenute nei documenti forniti.
Se le informazioni non sono disponibili nei documenti, dillo chiaramente.
Cita sempre le fonti specifiche da cui prendi le informazioni.`;

        // Per ora, useremo un approccio semplificato senza RAG corpus
        // In produzione, dovresti configurare Vertex AI RAG Engine

        // Usa il modello Gemini direttamente per ora
        const model = aiConfig.model || 'gemini-1.5-flash';
        const generativeModel = vertexAI.getGenerativeModel({
            model: model
        });

        // Query dei documenti rilevanti da Firestore
        const documentsRef = admin.firestore().collection('documenti');
        const documentsSnapshot = await documentsRef
            .where('stato', '==', true)
            .limit(10)
            .get();

        let documentsContext = '\n\n=== DOCUMENTI DISPONIBILI ===\n\n';
        const sources = [];

        documentsSnapshot.forEach(doc => {
            const data = doc.data();
            documentsContext += `Documento: ${data.titolo}\n`;
            documentsContext += `Tipologia: ${data.tipologia}\n`;
            if (data.descrizione) {
                documentsContext += `Descrizione: ${data.descrizione}\n`;
            }
            if (data.tags && data.tags.length > 0) {
                documentsContext += `Tag: ${data.tags.join(', ')}\n`;
            }
            documentsContext += '\n---\n\n';

            sources.push({
                id: doc.id,
                title: data.titolo,
                tipologia: data.tipologia,
                fileName: data.fileName,
                snippet: data.descrizione ? data.descrizione.substring(0, 200) : null
            });
        });

        const fullPrompt = documentsContext + '\n\n' + prompt;

        // Genera la risposta
        const result = await generativeModel.generateContent(fullPrompt);
        const response = result.response;
        const answer = response.text();

        console.log(`✅ RAG Chat response generated successfully`);

        return res.status(200).json({
            answer: answer,
            sources: sources.slice(0, 3) // Limita a 3 fonti per la risposta
        });

    } catch (error) {
        console.error('❌ Errore in RAG Chat:', error);

        let errorMessage = 'Errore durante l\'elaborazione della richiesta';
        if (error.message.includes('not found')) {
            errorMessage = 'Modello AI non disponibile';
        } else if (error.message.includes('quota')) {
            errorMessage = 'Quota API superata';
        }

        return res.status(500).json({
            error: errorMessage,
            details: error.message
        });
    }
});
