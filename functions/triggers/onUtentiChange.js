// functions/triggers/onUtentiChange.js

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { logAudit, AuditAction } = require("../utils/auditLogger");

/**
 * Trigger che si attiva quando un documento nella collezione 'utenti' viene creato, modificato o eliminato
 */
exports.onUtentiChange = onDocumentWritten(
    {
        document: "utenti/{userId}",
        region: "europe-west1"
    },
    async (event) => {
    const userId = event.params.userId;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();

    try {
        // Determina il tipo di azione
        let action;
        let oldData = null;
        let newData = null;

        if (!beforeData && afterData) {
            // Documento creato
            action = AuditAction.CREATE;
            newData = afterData;
        } else if (beforeData && afterData) {
            // Documento modificato - verifica se ci sono cambiamenti reali
            // Ignora campi di sistema nel confronto
            const systemFields = ['changed', 'lastModifiedBy', 'lastModifiedByEmail'];

            const hasChanges = Object.keys(afterData).some(key => {
                // Ignora campi di sistema
                if (systemFields.includes(key)) return false;

                // Confronta i valori
                return JSON.stringify(beforeData[key]) !== JSON.stringify(afterData[key]);
            });

            // Se non ci sono cambiamenti reali, non loggare
            if (!hasChanges) {
                console.log(`Nessuna modifica rilevante per utente ${userId}, audit log non creato`);
                return null;
            }

            action = AuditAction.UPDATE;
            oldData = beforeData;
            newData = afterData;
        } else if (beforeData && !afterData) {
            // Documento eliminato
            action = AuditAction.DELETE;
            oldData = beforeData;
        } else {
            // Caso imprevisto, non loggare nulla
            console.warn("Evento di scrittura senza dati rilevanti per:", userId);
            return null;
        }

        // Estrai informazioni sull'utente che ha effettuato la modifica
        // Nota: I trigger Firestore non hanno accesso diretto a auth context
        // Usiamo il campo 'lastModifiedBy' se presente, altrimenti null
        const modifiedByUid = afterData?.lastModifiedBy || beforeData?.lastModifiedBy || null;
        const modifiedByEmail = afterData?.lastModifiedByEmail || beforeData?.lastModifiedByEmail || null;

        // Determina se l'azione è manuale o automatica
        // Se abbiamo lastModifiedBy, è un'azione manuale, altrimenti è automatica (cron/sistema)
        const isManual = modifiedByUid !== null;
        const source = isManual ? "web" : "system";

        // Registra l'azione nell'audit log
        await logAudit({
            entityType: "utenti",
            entityId: userId,
            action: action,
            userId: modifiedByUid,
            userEmail: modifiedByEmail || (isManual ? null : "Sistema Automatico"),
            oldData: oldData,
            newData: newData,
            metadata: {
                actionType: isManual ? "manual" : "automatic"
            },
            source: source
        });

        console.log(`Audit log creato per ${action} su utente ${userId}`);
        return null;

    } catch (error) {
        console.error("Errore nel logging dell'audit:", error);
        // Non propagare l'errore per non bloccare l'operazione principale
        return null;
    }
});
