import { db, auth, functions } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

export function initConfigSmtpPage() {
    loadCurrentConfig();
    setupEventListeners();
}

function setupEventListeners() {
    const form = document.getElementById('smtp-config-form');
    const testBtn = document.getElementById('test-smtp-btn');
    const sendTestBtn = document.getElementById('send-test-email-btn');
    const cancelTestBtn = document.getElementById('cancel-test-btn');

    if (form) {
        form.addEventListener('submit', handleSubmit);
    }

    if (testBtn) {
        testBtn.addEventListener('click', showTestEmailForm);
    }

    if (sendTestBtn) {
        sendTestBtn.addEventListener('click', sendTestEmail);
    }

    if (cancelTestBtn) {
        cancelTestBtn.addEventListener('click', hideTestEmailForm);
    }
}

async function loadCurrentConfig() {
    try {
        const configDoc = await getDoc(doc(db, 'configurazioni', 'smtp'));

        if (configDoc.exists()) {
            const data = configDoc.data();

            // Popola il form
            document.getElementById('smtp-host').value = data.host || '';
            document.getElementById('smtp-port').value = data.port || '';
            document.getElementById('smtp-user').value = data.user || '';
            document.getElementById('smtp-password').value = data.password || '';
            document.getElementById('smtp-from').value = data.from || '';
            document.getElementById('smtp-from-name').value = data.fromName || '';
            document.getElementById('smtp-secure').checked = data.secure || false;

            // Aggiorna lo stato
            updateStatus(data);
        }
    } catch (error) {
        console.error('Errore nel caricamento della configurazione:', error);
        showMessage('Errore nel caricamento della configurazione', 'error');
    }
}

async function handleSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="btn-loader"></span>Salvataggio...';

    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            throw new Error('Utente non autenticato');
        }

        const formData = new FormData(e.target);
        const configData = {
            host: formData.get('host'),
            port: parseInt(formData.get('port')),
            user: formData.get('user'),
            password: formData.get('password'),
            from: formData.get('from'),
            fromName: formData.get('fromName'),
            secure: document.getElementById('smtp-secure').checked,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid,
            updatedByEmail: currentUser.email
        };

        await setDoc(doc(db, 'configurazioni', 'smtp'), configData, { merge: true });

        // Ricarica i dati da Firestore per ottenere il timestamp aggiornato
        const updatedDoc = await getDoc(doc(db, 'configurazioni', 'smtp'));
        if (updatedDoc.exists()) {
            updateStatus(updatedDoc.data());
        }

        showMessage('Configurazione salvata con successo!', 'success');

    } catch (error) {
        console.error('Errore nel salvare la configurazione:', error);
        showMessage('Errore: ' + (error.message || 'Impossibile salvare la configurazione'), 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

function showTestEmailForm() {
    const container = document.getElementById('test-email-container');
    const emailInput = document.getElementById('test-email-input');

    // Precompila con l'email dell'utente corrente
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.email) {
        emailInput.value = currentUser.email;
    }

    container.style.display = 'block';
    emailInput.focus();
}

function hideTestEmailForm() {
    const container = document.getElementById('test-email-container');
    const emailInput = document.getElementById('test-email-input');

    container.style.display = 'none';
    emailInput.value = '';
    showMessage('', 'success'); // Pulisce eventuali messaggi
}

async function sendTestEmail() {
    const emailInput = document.getElementById('test-email-input');
    const sendBtn = document.getElementById('send-test-email-btn');
    const originalText = sendBtn.textContent;

    const testEmail = emailInput.value.trim();

    if (!testEmail) {
        showMessage('❌ Inserisci un indirizzo email', 'error');
        emailInput.focus();
        return;
    }

    // Valida l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
        showMessage('❌ Indirizzo email non valido', 'error');
        emailInput.focus();
        return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="btn-loader"></span>Invio in corso...';

    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            throw new Error('Utente non autenticato');
        }

        // Chiama la Cloud Function per testare SMTP
        const testSmtp = httpsCallable(functions, 'testSmtpApi');
        const result = await testSmtp({ testEmail });

        console.log('Test SMTP result:', result.data);

        if (result.data.success) {
            const message = result.data.details.testEmailSent
                ? `✅ Test completato! Email inviata a ${testEmail}. Controlla la casella di posta.`
                : '✅ Connessione SMTP verificata con successo!';
            showMessage(message, 'success');

            // Nascondi il form dopo il successo
            setTimeout(() => {
                hideTestEmailForm();
            }, 2000);
        } else {
            throw new Error(result.data.message || 'Test fallito');
        }

    } catch (error) {
        console.error('Errore nel test della connessione:', error);

        // Estrai il messaggio di errore dalla struttura Firebase Functions
        let errorMessage = 'Impossibile testare la connessione';

        // Firebase Functions wraps errors in a specific structure
        if (error.code === 'functions/internal') {
            // Extract the actual error message from the details
            if (error.details && error.details.message) {
                errorMessage = error.details.message;
            } else if (error.message && !error.message.includes('INTERNAL')) {
                errorMessage = error.message;
            } else {
                errorMessage = 'Errore del server. Verifica la configurazione SMTP e riprova.';
            }
        } else if (error.message) {
            errorMessage = error.message;
        } else if (error.code === 'functions/unauthenticated') {
            errorMessage = 'Devi essere autenticato per testare la connessione';
        } else if (error.code === 'functions/permission-denied') {
            errorMessage = 'Non hai i permessi per testare la connessione SMTP';
        }

        showMessage('❌ ' + errorMessage, 'error');
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = originalText;
    }
}

function updateStatus(data) {
    const hostElement = document.getElementById('status-host');
    const portElement = document.getElementById('status-port');
    const fromElement = document.getElementById('status-from');
    const secureElement = document.getElementById('status-secure');
    const updatedAtElement = document.getElementById('status-updatedAt');

    if (hostElement) {
        hostElement.textContent = data.host || 'Non configurato';
        hostElement.className = data.host ? 'status-value configured' : 'status-value not-configured';
    }

    if (portElement) {
        portElement.textContent = data.port || '-';
    }

    if (fromElement) {
        fromElement.textContent = data.from || '-';
    }

    if (secureElement) {
        secureElement.textContent = data.secure ? 'Sì (TLS/SSL)' : 'No';
        secureElement.className = data.secure ? 'status-value configured' : 'status-value';
    }

    if (updatedAtElement && data.updatedAt) {
        const date = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
        updatedAtElement.textContent = date.toLocaleDateString('it-IT', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

function showMessage(message, type) {
    const messageElement = document.getElementById('form-message');
    if (!messageElement) return;

    messageElement.textContent = message;
    messageElement.className = `form-message ${type}`;
    messageElement.style.display = 'block';

    setTimeout(() => {
        messageElement.style.display = 'none';
    }, 5000);
}
