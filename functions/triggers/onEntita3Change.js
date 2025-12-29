// functions/triggers/onEntita3Change.js

const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { logAudit, AuditAction } = require("../utils/auditLogger");

/**
 * Trigger che si attiva quando un documento nella collezione 'entita3' viene creato, modificato o eliminato
 */
exports.onEntita3Change = onDocumentWritten("entita3/{entityId}", async (event) => {
    const entityId = event.params.entityId;
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
                console.log(`Nessuna modifica rilevante per entita3 ${entityId}, audit log non creato`);
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
            console.warn("Evento di scrittura senza dati rilevanti per:", entityId);
            return null;
        }

        // Estrai informazioni sull'utente che ha effettuato la modifica
        const modifiedByUid = afterData?.lastModifiedBy || beforeData?.lastModifiedBy || null;
        const modifiedByEmail = afterData?.lastModifiedByEmail || beforeData?.lastModifiedByEmail || null;

        // Determina se l'azione è manuale o automatica
        const isManual = modifiedByUid !== null;
        const source = isManual ? "web" : "system";

        // Registra l'azione nell'audit log
        await logAudit({
            entityType: "entita3",
            entityId: entityId,
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

        console.log(`Audit log creato per ${action} su entita3 ${entityId}`);
        return null;

    } catch (error) {
        console.error("Errore nel logging dell'audit:", error);
        // Non propagare l'errore per non bloccare l'operazione principale
        return null;
    }
});
