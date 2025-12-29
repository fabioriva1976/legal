import { db, auth, functions } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

export function initConfigAiPage() {
    loadCurrentConfig();
    setupEventListeners();
}

function setupEventListeners() {
    const form = document.getElementById('ai-config-form');
    const testBtn = document.getElementById('test-ai-btn');

    if (form) {
        form.addEventListener('submit', handleSubmit);
    }

    if (testBtn) {
        testBtn.addEventListener('click', testAI);
    }
}

async function loadCurrentConfig() {
    try {
        const configDoc = await getDoc(doc(db, 'configurazioni', 'ai'));

        if (configDoc.exists()) {
            const data = configDoc.data();

            // Popola il form
            document.getElementById('ai-provider').value = data.provider || 'google';
            document.getElementById('ai-api-key').value = data.apiKey || '';
            document.getElementById('ai-model').value = data.model || 'gemini-1.5-pro';
            document.getElementById('ai-temperature').value = data.temperature || 0.7;
            document.getElementById('ai-max-tokens').value = data.maxTokens || 2048;
            document.getElementById('ai-timeout').value = data.timeout || 30;
            document.getElementById('ai-system-prompt').value = data.systemPrompt || 'Sei un assistente virtuale intelligente che aiuta gli utenti con le loro richieste in modo professionale e cortese.';
            document.getElementById('ai-enable-context').checked = data.enableContext !== undefined ? data.enableContext : true;
            document.getElementById('ai-enable-safety').checked = data.enableSafety !== undefined ? data.enableSafety : true;

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
            provider: formData.get('provider'),
            apiKey: formData.get('apiKey'),
            model: formData.get('model'),
            temperature: parseFloat(formData.get('temperature')),
            maxTokens: parseInt(formData.get('maxTokens')),
            timeout: parseInt(formData.get('timeout')),
            systemPrompt: formData.get('systemPrompt'),
            enableContext: document.getElementById('ai-enable-context').checked,
            enableSafety: document.getElementById('ai-enable-safety').checked,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid,
            updatedByEmail: currentUser.email
        };

        await setDoc(doc(db, 'configurazioni', 'ai'), configData, { merge: true });

        // Ricarica i dati da Firestore per ottenere il timestamp aggiornato
        const updatedDoc = await getDoc(doc(db, 'configurazioni', 'ai'));
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

async function testAI() {
    const btn = document.getElementById('test-ai-btn');
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loader"></span>Test in corso...';

    try {
        const testAi = httpsCallable(functions, 'testAiApi');
        const result = await testAi({});

        if (result.data.success) {
            showMessage(result.data.message, 'success');
        } else {
            throw new Error(result.data.message || 'Test fallito');
        }
    } catch (error) {
        console.error('Errore nel test AI:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Full error object:', JSON.stringify(error, null, 2));

        // Estrai il messaggio di errore dalla struttura Firebase Functions
        let errorMessage = 'Impossibile testare la configurazione AI';

        // Firebase Functions wraps errors in a specific structure
        if (error.code === 'functions/internal') {
            // Extract the actual error message from the details
            if (error.details && error.details.message) {
                errorMessage = error.details.message;
            } else if (error.message && !error.message.includes('INTERNAL')) {
                errorMessage = error.message;
            } else {
                errorMessage = 'Errore del server. Verifica la configurazione AI e riprova.';
            }
        } else if (error.message) {
            errorMessage = error.message;
        } else if (error.code === 'functions/unauthenticated') {
            errorMessage = 'Devi essere autenticato per testare la configurazione AI';
        } else if (error.code === 'functions/permission-denied') {
            errorMessage = 'Non hai i permessi per testare la configurazione AI';
        }

        showMessage('❌ ' + errorMessage, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function updateStatus(data) {
    const providerElement = document.getElementById('status-provider');
    const modelElement = document.getElementById('status-model');
    const temperatureElement = document.getElementById('status-temperature');
    const maxTokensElement = document.getElementById('status-maxTokens');
    const updatedAtElement = document.getElementById('status-updatedAt');

    if (providerElement) {
        const providerNames = {
            'google': 'Google AI (Gemini)',
            'openai': 'OpenAI (GPT)',
            'anthropic': 'Anthropic (Claude)',
            'azure': 'Azure OpenAI'
        };
        providerElement.textContent = providerNames[data.provider] || data.provider || 'Non configurato';
        providerElement.className = data.provider ? 'status-value configured' : 'status-value not-configured';
    }

    if (modelElement) {
        modelElement.textContent = data.model || '-';
    }

    if (temperatureElement) {
        temperatureElement.textContent = data.temperature !== undefined ? data.temperature : '-';
    }

    if (maxTokensElement) {
        maxTokensElement.textContent = data.maxTokens || '-';
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
