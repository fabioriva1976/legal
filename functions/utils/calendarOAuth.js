// functions/utils/calendarOAuth.js
const { getFirestore } = require("firebase-admin/firestore");
const { google } = require("googleapis");

/**
 * Carica la configurazione Google Calendar da Firestore
 */
async function getCalendarConfig() {
  const db = getFirestore();
  const configDoc = await db.collection("configurazioni").doc("calendar").get();

  if (!configDoc.exists) {
    throw new Error("Configurazione Calendar non trovata");
  }

  const config = configDoc.data();

  if (!config.clientId || !config.clientSecret) {
    throw new Error("Client ID o Client Secret non configurati");
  }

  return config;
}

/**
 * Carica i token OAuth per un utente specifico
 */
async function getUserTokens(userId) {
  const db = getFirestore();
  const tokenDoc = await db.collection("calendar_tokens").doc(userId).get();

  if (!tokenDoc.exists) {
    throw new Error(`Token non trovati per l'utente ${userId}`);
  }

  return tokenDoc.data();
}

/**
 * Salva i token aggiornati (dopo un refresh)
 */
async function saveUserTokens(userId, tokens) {
  const db = getFirestore();
  await db.collection("calendar_tokens").doc(userId).set({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date,
    tokenType: tokens.token_type,
    scope: tokens.scope,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}

/**
 * Crea un client OAuth2 autenticato per un utente
 * Gestisce automaticamente il refresh dei token se necessario
 */
async function getAuthenticatedCalendarClient(userId) {
  const config = await getCalendarConfig();
  const userTokens = await getUserTokens(userId);

  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri || `https://${process.env.GCLOUD_PROJECT}.web.app/oauth2callback`
  );

  // Imposta le credenziali
  oauth2Client.setCredentials({
    access_token: userTokens.accessToken,
    refresh_token: userTokens.refreshToken,
    expiry_date: userTokens.expiryDate,
    token_type: userTokens.tokenType,
    scope: userTokens.scope
  });

  // Gestisce automaticamente il refresh del token
  oauth2Client.on('tokens', async (tokens) => {
    console.log(`Token refresh per utente ${userId}`);

    // Se c'è un nuovo refresh token, salvalo
    if (tokens.refresh_token) {
      await saveUserTokens(userId, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        token_type: tokens.token_type,
        scope: tokens.scope
      });
    } else {
      // Altrimenti salva solo l'access token aggiornato
      await db.collection("calendar_tokens").doc(userId).update({
        accessToken: tokens.access_token,
        expiryDate: tokens.expiry_date,
        updatedAt: new Date().toISOString()
      });
    }
  });

  return oauth2Client;
}

/**
 * Crea un'istanza dell'API Calendar autenticata per un utente
 */
async function getCalendarApi(userId) {
  const authClient = await getAuthenticatedCalendarClient(userId);
  return google.calendar({ version: "v3", auth: authClient });
}

module.exports = {
  getCalendarConfig,
  getUserTokens,
  saveUserTokens,
  getAuthenticatedCalendarClient,
  getCalendarApi
};
