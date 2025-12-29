import { db, auth } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function initProfileSettingsPage() {
    setupFormSubmit();
    setupCopyButton();
    loadCalendarConfig();
}

// Load calendar configuration
async function loadCalendarConfig() {
    try {
        const docRef = doc(db, 'configurazioni', 'calendar');
        const docSnap = await getDoc(docRef);

        // Imposta il redirect URI automaticamente
        const redirectUri = `${window.location.origin}/oauth-callback`;
        document.getElementById('calendar-redirect-uri').value = redirectUri;

        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('calendar-client-id').value = data.clientId || '';
            document.getElementById('calendar-client-secret').value = data.clientSecret || '';
            document.getElementById('calendar-default-id').value = data.defaultCalendarId || 'primary';
            document.getElementById('calendar-timezone').value = data.timezone || 'Europe/Rome';
        }
    } catch (error) {
        console.error('Errore caricamento configurazione calendar:', error);
    }
}

// Setup form submit
function setupFormSubmit() {
    const form = document.getElementById('calendar-config-form');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvataggio...';

            try {
                const user = auth.currentUser;
                const calendarData = {
                    clientId: document.getElementById('calendar-client-id').value,
                    clientSecret: document.getElementById('calendar-client-secret').value,
                    redirectUri: document.getElementById('calendar-redirect-uri').value,
                    defaultCalendarId: document.getElementById('calendar-default-id').value,
                    timezone: document.getElementById('calendar-timezone').value,
                    changed: new Date().toISOString(),
                    lastModifiedBy: user?.uid || null,
                    lastModifiedByEmail: user?.email || null
                };

                await setDoc(doc(db, 'configurazioni', 'calendar'), calendarData, { merge: true });

                showSuccessMessage('✓ Configurazione salvata con successo');
            } catch (error) {
                console.error('Errore nel salvataggio:', error);
                showErrorMessage('✗ Errore nel salvataggio: ' + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });
    }

    // Authorize calendar button
    const authorizeBtn = document.getElementById('authorize-calendar-btn');
    if (authorizeBtn) {
        authorizeBtn.addEventListener('click', () => {
            alert('Funzionalità di autorizzazione Google Calendar in arrivo');
        });
    }
}

// Setup copy button for redirect URI
function setupCopyButton() {
    const copyBtn = document.getElementById('copy-redirect-uri-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const redirectUri = document.getElementById('calendar-redirect-uri').value;
            try {
                await navigator.clipboard.writeText(redirectUri);
                const originalHtml = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copiato!';
                setTimeout(() => {
                    copyBtn.innerHTML = originalHtml;
                }, 2000);
            } catch (error) {
                console.error('Errore nella copia:', error);
                alert('Impossibile copiare: ' + error.message);
            }
        });
    }
}

function showSuccessMessage(message) {
    const alert = document.createElement('div');
    alert.className = 'alert-success';
    alert.textContent = message;
    alert.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 9999;';
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
}

function showErrorMessage(message) {
    const alert = document.createElement('div');
    alert.className = 'alert-error';
    alert.textContent = message;
    alert.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #ef4444; color: white; padding: 12px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 9999;';
    document.body.appendChild(alert);
    setTimeout(() => alert.remove(), 3000);
}
