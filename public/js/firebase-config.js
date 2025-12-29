// js/firebase-config.js

// 1. Importa le funzioni v9+ che ti servono
// (Sto usando la v10.12.2, puoi aggiornarla se necessario)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyA1SVPwsTYb6n2Jv2A5nAed4DSOWkZRRFY",
    authDomain: "legal-816fa.firebaseapp.com",
    projectId: "legal-816fa",
    storageBucket: "legal-816fa.firebasestorage.app",
    messagingSenderId: "344057379796",
    appId: "1:344057379796:web:0fcec2f4583ad23e633441"
};

const region = 'europe-west1';

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, region);

if (window.location.hostname === "localhost") {
  connectFirestoreEmulator(db, "localhost", 8080);
  connectStorageEmulator(storage, "localhost", 9299);
  connectFunctionsEmulator(functions, "localhost", 5001);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
}

export default app;