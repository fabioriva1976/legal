import { auth, db } from './firebase-config.js';
import { collection, query, where, orderBy, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let chatsData = [];
let dataTable = null;

export function initPageChatListPage() {
    console.log('🚀 Inizializzazione page-pratiche');
    setupEventListeners();

    // Carica immediatamente se l'utente è già disponibile, altrimenti aspetta
    if (auth.currentUser) {
        loadChats();
    } else {
        // Aspetta che l'autenticazione sia pronta
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                loadChats();
                unsubscribe(); // Rimuovi il listener dopo il primo caricamento
            }
        });
    }
}

function setupEventListeners() {
    document.getElementById('new-entity-btn').addEventListener('click', () => {
        document.getElementById('entity-form').reset();
        document.getElementById('entity-form-title').textContent = 'Nuova Pratica';
        document.getElementById('entity-id').value = '';
        openSidebar();
    });

    document.getElementById('close-sidebar-btn').addEventListener('click', closeSidebar);
    document.getElementById('entity-form').addEventListener('submit', handleCreateChat);
}

function openSidebar() {
    document.getElementById('entity-form-sidebar').classList.add('open');
}

function closeSidebar() {
    document.getElementById('entity-form-sidebar').classList.remove('open');
}

async function loadChats() {
    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Utente non autenticato');
        }

        // Query per ottenere le pratiche dell'utente corrente
        const praticheRef = collection(db, 'pratiche');
        const q = query(
            praticheRef,
            where('userId', '==', user.uid),
            orderBy('updatedAt', 'desc')
        );

        const querySnapshot = await getDocs(q);
        chatsData = [];

        querySnapshot.forEach((docSnap) => {
            chatsData.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        renderTable();

    } catch (error) {
        console.error('Errore nel caricamento delle pratiche:', error);
        const tableElement = document.getElementById('data-table');
        if (tableElement) {
            tableElement.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #dc3545;">
                    Errore nel caricamento delle pratiche: ${error.message}
                </div>
            `;
        }
    }
}

function renderTable() {
    const tableData = chatsData.map(chat => [
        escapeHtml(chat.clientName || 'N/D'),
        escapeHtml(chat.caseId || 'N/D'),
        formatStatusBadge(chat.isOpen),
        formatDate(chat.updatedAt),
        formatActionElement(chat.id)
    ]);

    if (dataTable) {
        dataTable.destroy();
    }

    dataTable = new simpleDatatables.DataTable('#data-table', {
        data: {
            headings: ['Cliente', 'ID Pratica', 'Stato', 'Ultimo Aggiornamento', 'Azioni'],
            data: tableData
        },
        perPageSelect: false,
        labels: {
            placeholder: "Cerca...",
            noRows: "Nessuna pratica trovata",
            info: "Mostra da {start} a {end} di {rows} elementi"
        },
        layout: { top: "{search}", bottom: "{info}{pager}" }
    });

    setupTableClickHandlers();
}

function formatStatusBadge(isOpen) {
    const statusClass = isOpen !== false ? 'status--attivo' : 'status--non-attivo';
    const statusText = isOpen !== false ? 'Aperta' : 'Chiusa';
    return `<span class="status-badge ${statusClass}">${statusText}</span>`;
}

function formatActionElement(id) {
    return `<button class="btn-edit" data-id="${id}">Apri</button><button class="btn-delete" data-id="${id}">Elimina</button>`;
}

function setupTableClickHandlers() {
    const resetAllDeleteButtons = () => {
        document.querySelectorAll('.delete-confirmation-overlay').forEach(overlay => {
            const td = overlay.closest('td');
            if (td) td.classList.remove('confirming-delete');
            overlay.remove();
        });
    };

    document.getElementById('data-table').addEventListener('click', function(event) {
        const target = event.target;

        // Gestisci conferma eliminazione (Sì)
        const confirmYesButton = target.closest('.btn-confirm-yes');
        if (confirmYesButton) {
            deleteChat(confirmYesButton.dataset.id);
            resetAllDeleteButtons();
            return;
        }

        // Gestisci annulla eliminazione (No)
        const confirmNoButton = target.closest('.btn-confirm-no');
        if (confirmNoButton) {
            resetAllDeleteButtons();
            return;
        }

        // Gestisci pulsante Apri
        const editButton = target.closest('.btn-edit');
        if (editButton) {
            resetAllDeleteButtons();
            openChat(editButton.dataset.id);
            return;
        }

        // Gestisci pulsante Elimina
        const deleteButton = target.closest('.btn-delete');
        if (deleteButton) {
            resetAllDeleteButtons();
            const td = deleteButton.closest('td');
            if (!td) return;

            td.classList.add('confirming-delete');
            const overlay = document.createElement('div');
            overlay.className = 'delete-confirmation-overlay';
            overlay.innerHTML = `
                <span>Sei sicuro?</span>
                <button class="btn btn-sm btn-light btn-confirm-yes" data-id="${deleteButton.dataset.id}">Sì</button>
                <button class="btn btn-sm btn-outline-light btn-confirm-no">No</button>
            `;
            td.appendChild(overlay);
            setTimeout(() => { overlay.classList.add('active'); }, 10);
        }
    });
}

async function handleCreateChat(e) {
    e.preventDefault();

    const clientName = document.getElementById('client-name').value.trim();
    const caseId = document.getElementById('case-id').value.trim();
    const saveMessage = document.getElementById('save-message');

    if (!clientName || !caseId) {
        saveMessage.textContent = 'Compila tutti i campi';
        saveMessage.style.color = 'var(--error-color, #ef4444)';
        saveMessage.style.display = 'inline-block';
        setTimeout(() => { saveMessage.style.display = 'none'; }, 3000);
        return;
    }

    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Utente non autenticato');
        }

        // Crea il documento pratica
        const praticaData = {
            userId: user.uid,
            clientName: clientName,
            caseId: caseId,
            isOpen: document.getElementById('toggle-status').checked,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        const docRef = await addDoc(collection(db, 'pratiche'), praticaData);
        console.log('✅ Pratica creata con ID:', docRef.id);

        // Mostra messaggio di successo
        saveMessage.textContent = 'Pratica creata con successo';
        saveMessage.style.color = 'var(--success-color, #10b981)';
        saveMessage.style.display = 'inline-block';

        // Chiudi sidebar e resetta form dopo breve pausa
        setTimeout(() => {
            closeSidebar();
            document.getElementById('entity-form').reset();
            saveMessage.style.display = 'none';

            // Apri la pratica appena creata
            openChat(docRef.id);
        }, 500);

    } catch (error) {
        console.error('Errore nella creazione della pratica:', error);
        saveMessage.textContent = 'Errore: ' + error.message;
        saveMessage.style.color = 'var(--error-color, #ef4444)';
        saveMessage.style.display = 'inline-block';
    }
}

function openChat(chatId) {
    // Naviga alla pagina della chat con l'ID come parametro
    history.pushState({}, '', `/page-pratica.html?chatId=${chatId}`);

    // Trigger router manualmente
    const routerEvent = new Event('popstate');
    window.dispatchEvent(routerEvent);
}

async function deleteChat(chatId) {
    try {
        console.log('Tentativo di eliminare pratica con ID:', chatId);

        if (!chatId || typeof chatId !== 'string' || chatId.trim() === '') {
            throw new Error('ID pratica non valido');
        }

        // Elimina la pratica da Firestore
        await deleteDoc(doc(db, 'pratiche', chatId));
        console.log('✅ Pratica eliminata:', chatId);

        // Ricarica la lista
        await loadChats();

    } catch (error) {
        console.error('Errore nell\'eliminazione della pratica:', error);
        alert('Errore: ' + (error.message || 'Impossibile eliminare la pratica'));
    }
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/D';

    // Gestisci sia Timestamp di Firestore che Date normali
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return 'Oggi ' + date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
        return 'Ieri ' + date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } else if (days < 7) {
        return days + ' giorni fa';
    } else {
        return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
