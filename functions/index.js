// functions/index.js

// --- INIZIALIZZAZIONE ADMIN SDK ---
const admin = require("firebase-admin");

// Configura emulator per Storage se in modalità emulatore
if (process.env.FUNCTIONS_EMULATOR === 'true') {
    // Imposta l'host dell'emulatore Storage se non già impostato
    if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
        process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'localhost:9299';
        console.log('🔧 Set FIREBASE_STORAGE_EMULATOR_HOST=localhost:9299');
    }
}

admin.initializeApp();

// --- CONFIGURAZIONE GLOBALE ---

// Esporta le configurazioni globali in modo che altri file possano importarle.
exports.region = "europe-west1";
exports.timezone = "Europe/Rome";

// ============================================================================
// NOTA IMPORTANTE: MIGRAZIONE A FIRESTORE COMPLETATA
// ============================================================================
// Tutte le configurazioni (SMTP, WhatsApp, AI) sono ora gestite
// dinamicamente in Firestore nella collezione 'configurazioni'.
//
// Documenti disponibili:
// - configurazioni/smtp: {host, port, user, password, from, fromName, secure}
// - configurazioni/whatsapp: {phoneNumberId, accessToken, businessAccountId, webhookVerifyToken, apiVersion}
// - configurazioni/ai: {provider, apiKey, model, temperature, maxTokens, timeout, systemPrompt, enableContext, enableSafety}
//
// VANTAGGI:
// ✅ Configurazioni modificabili tramite UI web senza redeploy
// ✅ Nessun valore hardcoded o secret necessari
// ✅ Audit trail completo (updatedBy, updatedAt, updatedByEmail)
// ✅ Gestione centralizzata e sicura con Firestore Security Rules
// ============================================================================

// --- ESPORTAZIONE DELLE FUNZIONI ---

// === FUNZIONI API - PAGINE ===
exports.ragChatApi = require("./api/page-ragChat").ragChatApi;
exports.extractTextFromFileApi = require("./api/extractTextFromFile").extractTextFromFileApi;

// === FUNZIONI API - TEST CONFIGURAZIONI ===
exports.testSmtpApi = require("./api/testConfig-smtp").testSmtpApi;
exports.testAiApi = require("./api/testConfig-ai").testAiApi;

// === FUNZIONI API - PROFILO UTENTE ===
const userManagement = require("./api/profile-utenti");
exports.userListApi = userManagement.userListApi;
exports.userCreateApi = userManagement.userCreateApi;
exports.userUpdateApi = userManagement.userUpdateApi;
exports.userDeleteApi = userManagement.userDeleteApi;

// === FUNZIONI API - AUDIT LOGS ===
const auditLogs = require("./api/page-auditLogs");
exports.getEntityAuditLogsApi = auditLogs.getEntityAuditLogsApi;
exports.getUserAuditLogsApi = auditLogs.getUserAuditLogsApi;
exports.searchAuditLogsApi = auditLogs.searchAuditLogsApi;
exports.createAuditLogApi = auditLogs.createAuditLogApi;

// Triggers Firestore
exports.onUtentiChange = require("./triggers/onUtentiChange").onUtentiChange;

// Triggers Anagrafica (utenti gestiti in onUtentiChange.js)
const anagraficaTriggers = require("./triggers/onAnagraficaChange");
exports.onAnagraficaClientiCreate = anagraficaTriggers.onAnagraficaClientiCreate;
exports.onAnagraficaClientiUpdate = anagraficaTriggers.onAnagraficaClientiUpdate;
exports.onAnagraficaClientiDelete = anagraficaTriggers.onAnagraficaClientiDelete;

// Triggers Documenti
exports.onDocumentiCreate = anagraficaTriggers.onDocumentiCreate;
exports.onDocumentiUpdate = anagraficaTriggers.onDocumentiUpdate;
exports.onDocumentiDelete = anagraficaTriggers.onDocumentiDelete;

// === FUNZIONI CRON ===
exports.scaricaLeggiNormattiva = require("./cron/scaricaLeggiNormattiva").scaricaLeggiNormattiva;
