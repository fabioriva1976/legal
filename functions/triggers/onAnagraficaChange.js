const { onDocumentCreated, onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { logAudit, AuditAction } = require("../utils/auditLogger");
const { region } = require("../index");

/**
 * Controlla se ci sono effettivamente cambiamenti nei dati, escludendo campi di sistema
 * @param {Object} beforeData - Dati prima della modifica
 * @param {Object} afterData - Dati dopo la modifica
 * @returns {boolean} True se ci sono cambiamenti reali
 */
function hasActualChanges(beforeData, afterData) {
    // Campi di sistema da ignorare nel confronto
    const systemFields = ['created', 'changed', 'timestamp', 'lastModifiedBy', 'lastModifiedByEmail'];

    // Estrai tutti i campi unici da entrambi gli oggetti
    const allKeys = new Set([
        ...Object.keys(beforeData || {}),
        ...Object.keys(afterData || {})
    ]);

    // Controlla se c'è almeno un campo non di sistema che è cambiato
    for (const key of allKeys) {
        // Salta i campi di sistema
        if (systemFields.includes(key)) continue;

        const oldValue = beforeData?.[key];
        const newValue = afterData?.[key];

        // Confronta i valori
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            return true; // Trovato un cambiamento
        }
    }

    return false; // Nessun cambiamento reale
}

// NOTA: I trigger per la collezione 'utenti' sono gestiti in onUtentiChange.js
// per evitare duplicati negli audit logs

// Trigger per anagrafica_agenti
exports.onAnagraficaAgentiCreate = onDocumentCreated({ region: region, document: "anagrafica_agenti/{docId}" }, async (event) => {
    const afterData = event.data.data();
    await logAudit({
        entityType: 'anagrafica_agenti',
        entityId: event.params.docId,
        action: AuditAction.CREATE,
        userId: afterData?.lastModifiedBy || null,
        userEmail: afterData?.lastModifiedByEmail || null,
        newData: afterData,
        source: 'web'
    });
});

exports.onAnagraficaAgentiUpdate = onDocumentUpdated({ region: region, document: "anagrafica_agenti/{docId}" }, async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // Controlla se ci sono effettivamente cambiamenti nei dati (escludendo campi di sistema)
    if (!hasActualChanges(beforeData, afterData)) {
        console.log(`Nessun cambiamento reale per anagrafica_agenti/${event.params.docId}, audit log non creato`);
        return;
    }

    await logAudit({
        entityType: 'anagrafica_agenti',
        entityId: event.params.docId,
        action: AuditAction.UPDATE,
        userId: afterData?.lastModifiedBy || null,
        userEmail: afterData?.lastModifiedByEmail || null,
        oldData: beforeData,
        newData: afterData,
        source: 'web'
    });
});

exports.onAnagraficaAgentiDelete = onDocumentDeleted({ region: region, document: "anagrafica_agenti/{docId}" }, async (event) => {
    const beforeData = event.data.data();
    await logAudit({
        entityType: 'anagrafica_agenti',
        entityId: event.params.docId,
        action: AuditAction.DELETE,
        userId: beforeData?.lastModifiedBy || null,
        userEmail: beforeData?.lastModifiedByEmail || null,
        oldData: beforeData,
        source: 'web'
    });
});

// Trigger per anagrafica_clienti
exports.onAnagraficaClientiCreate = onDocumentCreated({ region: region, document: "anagrafica_clienti/{docId}" }, async (event) => {
    const afterData = event.data.data();
    await logAudit({
        entityType: 'anagrafica_clienti',
        entityId: event.params.docId,
        action: AuditAction.CREATE,
        userId: afterData?.lastModifiedBy || null,
        userEmail: afterData?.lastModifiedByEmail || null,
        newData: afterData,
        source: 'web'
    });
});

exports.onAnagraficaClientiUpdate = onDocumentUpdated({ region: region, document: "anagrafica_clienti/{docId}" }, async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // Controlla se ci sono effettivamente cambiamenti nei dati (escludendo campi di sistema)
    if (!hasActualChanges(beforeData, afterData)) {
        console.log(`Nessun cambiamento reale per anagrafica_clienti/${event.params.docId}, audit log non creato`);
        return;
    }

    await logAudit({
        entityType: 'anagrafica_clienti',
        entityId: event.params.docId,
        action: AuditAction.UPDATE,
        userId: afterData?.lastModifiedBy || null,
        userEmail: afterData?.lastModifiedByEmail || null,
        oldData: beforeData,
        newData: afterData,
        source: 'web'
    });
});

exports.onAnagraficaClientiDelete = onDocumentDeleted({ region: region, document: "anagrafica_clienti/{docId}" }, async (event) => {
    const beforeData = event.data.data();
    await logAudit({
        entityType: 'anagrafica_clienti',
        entityId: event.params.docId,
        action: AuditAction.DELETE,
        userId: beforeData?.lastModifiedBy || null,
        userEmail: beforeData?.lastModifiedByEmail || null,
        oldData: beforeData,
        source: 'web'
    });
});

// Trigger per documenti
exports.onDocumentiCreate = onDocumentCreated({ region: region, document: "documenti/{docId}" }, async (event) => {
    const afterData = event.data.data();
    await logAudit({
        entityType: 'documenti',
        entityId: event.params.docId,
        action: AuditAction.CREATE,
        userId: afterData?.lastModifiedBy || null,
        userEmail: afterData?.lastModifiedByEmail || null,
        newData: afterData,
        source: 'web'
    });
});

exports.onDocumentiUpdate = onDocumentUpdated({ region: region, document: "documenti/{docId}" }, async (event) => {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // Controlla se ci sono effettivamente cambiamenti nei dati (escludendo campi di sistema)
    if (!hasActualChanges(beforeData, afterData)) {
        console.log(`Nessun cambiamento reale per documenti/${event.params.docId}, audit log non creato`);
        return;
    }

    await logAudit({
        entityType: 'documenti',
        entityId: event.params.docId,
        action: AuditAction.UPDATE,
        userId: afterData?.lastModifiedBy || null,
        userEmail: afterData?.lastModifiedByEmail || null,
        oldData: beforeData,
        newData: afterData,
        source: 'web'
    });
});

exports.onDocumentiDelete = onDocumentDeleted({ region: region, document: "documenti/{docId}" }, async (event) => {
    const beforeData = event.data.data();
    await logAudit({
        entityType: 'documenti',
        entityId: event.params.docId,
        action: AuditAction.DELETE,
        userId: beforeData?.lastModifiedBy || null,
        userEmail: beforeData?.lastModifiedByEmail || null,
        oldData: beforeData,
        source: 'web'
    });
});
