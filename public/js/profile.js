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
    }));

    // Form submit
    document.getElementById('profile-form').addEventListener('submit', saveProfile);
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
