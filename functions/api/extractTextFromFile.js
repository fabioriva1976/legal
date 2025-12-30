const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { region } = require("../index");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

/**
 * Cloud Function per estrarre testo da file (PDF, DOCX, TXT)
 * Salva il testo estratto in Firestore per caching
 */
exports.extractTextFromFileApi = onCall({ region: region }, async (request) => {
    try {
        const userId = request.auth?.uid;
        if (!userId) {
            throw new HttpsError('unauthenticated', 'Utente non autenticato');
        }

        const { chatId, attachmentId } = request.data;

        if (!chatId || !attachmentId) {
            throw new HttpsError('invalid-argument', 'chatId e attachmentId richiesti');
        }

        console.log(`📄 Extracting text from attachment ${attachmentId} in chat ${chatId}`);

        // Verifica accesso alla pratica
        const praticaRef = admin.firestore().collection('pratiche').doc(chatId);
        const praticaDoc = await praticaRef.get();

        if (!praticaDoc.exists) {
            throw new HttpsError('not-found', 'Pratica non trovata');
        }

        if (praticaDoc.data().userId !== userId) {
            throw new HttpsError('permission-denied', 'Non hai accesso a questa pratica');
        }

        // Recupera i metadati dell'allegato
        const attachmentRef = praticaRef.collection('attachments').doc(attachmentId);
        const attachmentDoc = await attachmentRef.get();

        if (!attachmentDoc.exists) {
            throw new HttpsError('not-found', 'Allegato non trovato');
        }

        const attachmentData = attachmentDoc.data();

        // Se il testo è già stato estratto, restituiscilo
        if (attachmentData.extractedText) {
            console.log('✅ Text already extracted, returning cached version');
            return {
                text: attachmentData.extractedText,
                fromCache: true
            };
        }

        // Download del file da Storage
        console.log(`📦 Downloading file from path: ${attachmentData.storagePath}`);
        console.log(`🔧 Environment: FUNCTIONS_EMULATOR=${process.env.FUNCTIONS_EMULATOR}, FIREBASE_STORAGE_EMULATOR_HOST=${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`);

        // Usa il bucket corretto (firebasestorage.app invece di appspot.com)
        const bucketName = process.env.FUNCTIONS_EMULATOR === 'true'
            ? 'legal-816fa.firebasestorage.app'
            : 'legal-816fa.firebasestorage.app';

        const bucket = admin.storage().bucket(bucketName);
        const file = bucket.file(attachmentData.storagePath);

        console.log(`🪣 Using bucket: ${bucketName}`);
        const [fileBuffer] = await file.download();
        const fileType = attachmentData.type || '';
        const fileName = attachmentData.name || '';

        let extractedText = '';

        // Estrai testo in base al tipo di file
        if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
            console.log('📕 Extracting text from PDF');
            const parser = new PDFParse({ data: fileBuffer });
            const pdfData = await parser.getText();
            extractedText = pdfData.text;

        } else if (
            fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            fileName.toLowerCase().endsWith('.docx')
        ) {
            console.log('📘 Extracting text from DOCX');
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            extractedText = result.value;

        } else if (
            fileType === 'application/msword' ||
            fileName.toLowerCase().endsWith('.doc')
        ) {
            console.log('⚠️ DOC format not fully supported, attempting basic extraction');
            extractedText = fileBuffer.toString('utf-8');

        } else if (
            fileType.startsWith('text/') ||
            fileName.toLowerCase().endsWith('.txt') ||
            fileName.toLowerCase().endsWith('.json') ||
            fileName.toLowerCase().endsWith('.csv')
        ) {
            console.log('📄 Extracting text from text file');
            extractedText = fileBuffer.toString('utf-8');

        } else {
            console.log(`⚠️ Unsupported file type: ${fileType}`);
            throw new HttpsError('invalid-argument', `Tipo di file non supportato: ${fileType}. Supportati: PDF, DOCX, TXT`);
        }

        // Limita la lunghezza del testo (max 50000 caratteri per evitare problemi di storage)
        if (extractedText.length > 50000) {
            console.log(`⚠️ Text too long (${extractedText.length} chars), truncating to 50000`);
            extractedText = extractedText.substring(0, 50000) + '\n\n[TESTO TRONCATO - FILE TROPPO LUNGO]';
        }

        // Salva il testo estratto in Firestore (caching)
        await attachmentRef.update({
            extractedText: extractedText,
            textExtractedAt: Date.now(),
            textLength: extractedText.length
        });

        console.log(`✅ Text extracted and cached (${extractedText.length} chars)`);

        return {
            text: extractedText,
            fromCache: false
        };

    } catch (error) {
        console.error('❌ Error extracting text:', error);
        throw new HttpsError('internal', error.message || 'Errore nell\'estrazione del testo');
    }
});
