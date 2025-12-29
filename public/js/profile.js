import { db, storage, auth, functions } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import * as documentUtils from './utils/documentUtils.js';

const collection_name = 'utenti';
let currentUserId = null;

export function initProfilePage() {
    documentUtils.setup({ db, storage, auth, entityCollection: collection_name, listElementId: 'profile-document-preview-list', dropAreaId: 'profile-file-drop-area', uploadInputId: 'profile-document-upload' });
    setupEventListeners();

    // Attendi che l'autenticazione sia pronta prima di caricare il profilo
    auth.onAuthStateChanged((user) => {
        if (user) {
            loadCurrentUserProfile();
        } else {
            console.error('Utente non autenticato');
        }
    });
}

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-link').forEach(btn => btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
        e.target.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`#tab-${tabName}`).classList.add('active');

        // Se si apre il tab calendar, carica lo stato della connessione
        if (tabName === 'calendar') {
            loadCalendarConnectionStatus();
        }
    }));

    // Form submit
    document.getElementById('profile-form').addEventListener('submit', saveProfile);

    // Calendar connection buttons
    const connectBtn = document.getElementById('connect-calendar-btn');
    const disconnectBtn = document.getElementById('disconnect-calendar-btn');

    if (connectBtn) {
        connectBtn.addEventListener('click', connectGoogleCalendar);
    }

    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectGoogleCalendar);
    }
}

async function loadCurrentUserProfile() {
    const user = auth.currentUser;

    if (!user) {
        console.error('Utente non autenticato');
        return;
    }

    currentUserId = user.uid;
    document.getElementById('profile-user-id').value = currentUserId;

    try {
        const docSnap = await getDoc(doc(db, collection_name, currentUserId));

        if (docSnap.exists()) {
            const data = docSnap.data();

            document.getElementById('profile-nome').value = data.nome || '';
            document.getElementById('profile-cognome').value = data.cognome || '';
            document.getElementById('profile-email').value = data.email || user.email || '';
            document.getElementById('profile-telefono').value = data.telefono || '';

            // Carica i documenti dell'utente
            documentUtils.listenForDocuments(currentUserId);
        } else {
            console.log('Profilo utente non trovato in Firestore, uso i dati da Auth');
            document.getElementById('profile-email').value = user.email || '';
            document.getElementById('profile-nome').value = user.displayName?.split(' ')[0] || '';
            document.getElementById('profile-cognome').value = user.displayName?.split(' ').slice(1).join(' ') || '';
        }
    } catch (error) {
        console.error('Errore nel caricamento del profilo:', error);
        alert('Errore nel caricamento del profilo');
    }
}

async function saveProfile(e) {
    e.preventDefault();

    const saveBtn = document.querySelector('button[type="submit"]');
    const originalText = saveBtn.textContent;

    // Disabilita il pulsante e mostra il loader
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="btn-loader"></span>Salvataggio...';

    try {
        const nome = document.getElementById('profile-nome').value;
        const cognome = document.getElementById('profile-cognome').value;
        const email = document.getElementById('profile-email').value;
        const telefono = document.getElementById('profile-telefono').value;
        const password = document.getElementById('profile-password').value;
        const displayName = `${nome} ${cognome}`.trim();
        const now = new Date().toISOString();

        // Aggiorna Firebase Auth se email, displayName o password sono cambiati
        const user = auth.currentUser;
        const userUpdateApi = httpsCallable(functions, 'userUpdateApi');

        const updateData = {
            uid: currentUserId,
            displayName: displayName
        };

        // Se email è cambiata, aggiornala
        if (email !== user.email) {
            updateData.email = email;
        }

        // Se è stata inserita una password, aggiornala
        if (password && password.trim() !== '') {
            updateData.password = password;
        }

        await userUpdateApi(updateData);

        // Aggiorna i dati su Firestore
        const data = {
            nome: nome,
            cognome: cognome,
            email: email,
            telefono: telefono,
            changed: now,
            lastModifiedBy: user.uid,
            lastModifiedByEmail: user.email
        };

        await setDoc(doc(db, collection_name, currentUserId), data, { merge: true });

        showSaveMessage('Profilo aggiornato con successo!');

        // Pulisci il campo password dopo il salvataggio
        document.getElementById('profile-password').value = '';

        // Aggiorna l'avatar nell'header senza ricaricare la pagina
        const userIcon = document.getElementById('avatar-icon');
        if (userIcon) {
            const url = `https://ui-avatars.com/api/?name=${nome}&background=3b82f6&color=fff&rounded=true`;
            userIcon.setAttribute('src', url);
            userIcon.setAttribute('alt', `${nome} ${cognome}`);
        }

    } catch (error) {
        console.error('Errore nel salvare il profilo:', error);
        alert('Errore: ' + (error.message || 'Impossibile salvare il profilo'));
    } finally {
        // Riabilita il pulsante
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
}

function showSaveMessage(message) {
    const msg = document.getElementById('profile-save-message');
    msg.textContent = message;
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

// ==================== Google Calendar Integration ====================

async function loadCalendarConnectionStatus() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        // Controlla se esiste un token per questo utente
        const tokenDoc = await getDoc(doc(db, 'calendar_tokens', user.uid));

        const notConnectedCard = document.getElementById('calendar-not-connected');
        const connectedCard = document.getElementById('calendar-connected');

        if (tokenDoc.exists()) {
            const tokenData = tokenDoc.data();

            // Mostra stato connesso
            notConnectedCard.style.display = 'none';
            connectedCard.style.display = 'flex';

            // Aggiorna i dettagli della connessione
            const emailElement = document.getElementById('calendar-connected-email');
            const dateElement = document.getElementById('calendar-connected-date');

            if (tokenData.userEmail) {
                emailElement.textContent = `Account: ${tokenData.userEmail}`;
            }

            if (tokenData.createdAt) {
                const date = tokenData.createdAt.toDate ? tokenData.createdAt.toDate() : new Date(tokenData.createdAt);
                dateElement.textContent = date.toLocaleDateString('it-IT', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
        } else {
            // Mostra stato non connesso
            notConnectedCard.style.display = 'flex';
            connectedCard.style.display = 'none';
        }
    } catch (error) {
        console.error('Errore nel caricamento dello stato della connessione:', error);
    }
}

async function connectGoogleCalendar() {
    const btn = document.getElementById('connect-calendar-btn');
    const originalContent = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loader"></span>Connessione...';

    try {
        // Chiama la Cloud Function per ottenere l'URL di autorizzazione
        const startCalendarAuth = httpsCallable(functions, 'startCalendarAuthApi');
        const result = await startCalendarAuth();

        if (result.data && result.data.authUrl) {
            // Apri popup con l'URL di autorizzazione
            const width = 600;
            const height = 700;
            const left = (window.innerWidth - width) / 2;
            const top = (window.innerHeight - height) / 2;

            const popup = window.open(
                result.data.authUrl,
                'Google Calendar Authorization',
                `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
            );

            if (!popup) {
                throw new Error('Il popup è stato bloccato dal browser. Permetti i popup per questo sito.');
            }

            // Monitora il popup
            const popupChecker = setInterval(() => {
                if (popup.closed) {
                    clearInterval(popupChecker);
                    // Ricarica lo stato della connessione dopo la chiusura del popup
                    setTimeout(() => {
                        loadCalendarConnectionStatus();
                        btn.disabled = false;
                        btn.innerHTML = originalContent;
                    }, 1000);
                }
            }, 500);

        } else {
            throw new Error('Impossibile ottenere l\'URL di autorizzazione');
        }
    } catch (error) {
        console.error('Errore nella connessione a Google Calendar:', error);
        alert('Errore: ' + (error.message || 'Impossibile connettersi a Google Calendar'));
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

async function disconnectGoogleCalendar() {
    if (!confirm('Sei sicuro di voler scollegare il tuo account Google Calendar?')) {
        return;
    }

    const btn = document.getElementById('disconnect-calendar-btn');
    const originalContent = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loader"></span>Disconnessione...';

    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Utente non autenticato');
        }

        // Elimina il token dal database
        const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
        await deleteDoc(doc(db, 'calendar_tokens', user.uid));

        // Ricarica lo stato
        await loadCalendarConnectionStatus();

        alert('Account Google Calendar disconnesso con successo');
    } catch (error) {
        console.error('Errore nella disconnessione:', error);
        alert('Errore: ' + (error.message || 'Impossibile disconnettere l\'account'));
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}
