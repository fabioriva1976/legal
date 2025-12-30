const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { region } = require("../index");

// Inizializza l'Admin SDK (se non è già stato fatto nel file principale)
// È buona norma assicurarsi che sia inizializzato.
if (admin.apps.length === 0) {
    admin.initializeApp();
}

const auth = admin.auth();

/**
 * Ottiene la lista di tutti gli utenti.
 */
const userListApi = onCall({ region: region }, async (request) => {
    const data = request.data;
    const context = request;
    // Aggiungi qui controlli di sicurezza, es. se l'utente chiamante è un admin.
    // if (!context.auth) {
    //   throw new functions.https.HttpsError('unauthenticated', 'Devi essere autenticato.');
    // }
    
    try {
        const userRecords = await auth.listUsers(100); // Prende fino a 100 utenti
        const users = userRecords.users.map((user) => ({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            disabled: user.disabled,
        }));
        return { users };
    } catch (error) {
        console.error("Errore nel listare gli utenti:", error);
        throw new HttpsError('internal', 'Impossibile recuperare gli utenti.');
    }
});

/**
 * Crea un nuovo utente.
 */
const userCreateApi = onCall({ region: region }, async (request) => {
    try {
        const data = request.data;
        const context = request;

        const userRecord = await auth.createUser({
            email: data.email,
            password: data.password,
            displayName: data.displayName,
            disabled: data.disabled,
        });

        console.log("Utente creato con successo:", userRecord.uid);

        // NOTA: L'audit log viene gestito dal trigger Firestore onUtentiChange
        // quando il frontend salva i dati nella collezione 'utenti'

        return { uid: userRecord.uid, message: "Utente creato con successo!" };
    } catch (error) {
        console.error("Errore nella creazione utente:", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Aggiorna un utente esistente.
 */
const userUpdateApi = onCall({ region: region }, async (request) => {
    const data = request.data;
    const context = request;
    const { uid, ...updateData } = data;
    try {
        // Aggiorna l'utente in Firebase Auth
        await auth.updateUser(uid, updateData);

        // NOTA: L'audit log viene gestito dal trigger Firestore onUtentiChange
        // quando il frontend salva i dati nella collezione 'utenti'

        return { message: "Utente aggiornato con successo!" };
    } catch (error) {
        console.error("Errore nell'aggiornamento utente:", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Elimina un utente.
 */
const userDeleteApi = onCall({ region: region }, async (request) => {
    const data = request.data;
    const context = request;
    try {
        console.log("Richiesta eliminazione utente:", data);

        if (!data.uid || typeof data.uid !== 'string' || data.uid.trim() === '') {
            throw new HttpsError('invalid-argument', 'The uid must be a non-empty string with at most 128 characters.');
        }

        let oldData = null;
        let userExistsInAuth = false;

        // Verifica se l'utente esiste in Firebase Auth
        try {
            const userRecord = await auth.getUser(data.uid);
            userExistsInAuth = true;
            oldData = {
                email: userRecord.email,
                displayName: userRecord.displayName,
                disabled: userRecord.disabled,
                createdAt: userRecord.metadata.creationTime
            };
        } catch (authError) {
            console.log("Utente non trovato in Auth:", authError.code);
            if (authError.code === 'auth/user-not-found') {
                // L'utente non esiste in Auth, continua comunque per eliminare da Firestore
                userExistsInAuth = false;
            } else {
                throw authError;
            }
        }

        // Elimina l'utente da Auth solo se esiste
        if (userExistsInAuth) {
            await auth.deleteUser(data.uid);
            console.log("Utente eliminato da Firebase Auth:", data.uid);
        } else {
            console.log("Utente non presente in Auth, solo Firestore verrà aggiornato");
        }

        // NOTA: L'audit log viene gestito dal trigger Firestore onUtentiChange
        // quando il frontend elimina il documento dalla collezione 'utenti'

        return {
            message: "Utente eliminato con successo.",
            wasInAuth: userExistsInAuth
        };
    } catch (error) {
        console.error("Errore nell'eliminazione utente:", error);
        throw new HttpsError('internal', error.message);
    }
});


// Esporta tutte le funzioni che vuoi rendere disponibili al file index.js
module.exports = {
    userListApi,
    userCreateApi,
    userUpdateApi,
    userDeleteApi,
};