// js/login.js

// 1. Importa 'auth' dalla tua configurazione
import { auth } from './firebase-config.js';

// 2. IMPORTA LA FUNZIONE SPECIFICA v9+ dalla CDN
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Seleziona gli elementi
const loginForm = document.getElementById('login-form');
const emailField = document.getElementById('email');
const passwordField = document.getElementById('password');
const errorMessage = document.getElementById('error-message');
const loginButton = document.getElementById('login-btn'); // Aggiunto per disabilitare il bottone

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMessage.textContent = '';
    
    // Disabilita il bottone per evitare doppi click
    loginButton.disabled = true;
    loginButton.textContent = 'Accesso...';

    try {
        // 3. USA LA SINTASSI CORRETTA v9+
        await signInWithEmailAndPassword(auth, emailField.value, passwordField.value);
        
        // Login riuscito!
        // L'observer 'onAuthStateChanged' in main.js
        // rileverà il cambio di stato e gestirà il reindirizzamento.
        
    } catch (error) {
        console.error("Errore di login:", error.code);
        errorMessage.textContent = "Email o password non validi.";
        
        // Ri-abilita il bottone in caso di errore
        loginButton.disabled = false;
        loginButton.textContent = 'Accedi';
    }
});