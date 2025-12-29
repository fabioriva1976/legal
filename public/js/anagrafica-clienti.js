import { db, storage, auth, functions } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import * as ui from './utils/uiUtils.js';
import * as documentUtils from './utils/documentUtils.js';
import * as actionUtils from './utils/actionUtils.js';

let entities = [];
let collection_name = 'anagrafica_clienti';
let currentEntityId = null;
let dataTable = null;

export function initPageAnagraficaClientiPage() {
    documentUtils.setup({ db, storage, auth, functions, entityCollection: collection_name });
    actionUtils.setup({ db, auth, functions, entityCollection: collection_name });
    setupEventListeners();
    loadEntities();
}

function setupEventListeners() {
    document.getElementById('new-entity-btn').addEventListener('click', () => { 
        document.getElementById('entity-form').reset(); 
        document.getElementById('entity-form-title').textContent = 'Nuovo Cliente'; 
        currentEntityId = null;
        hideTabsForNewEntity();
        resetToFirstTab('entity-form-sidebar'); 
        openSidebar(); 
    });
    document.getElementById('close-sidebar-btn').addEventListener('click', closeSidebar);
    document.getElementById('entity-form').addEventListener('submit', saveEntity);
    document.querySelectorAll('.tab-link').forEach(btn => btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        const sidebar = e.target.closest('.form-sidebar');
        sidebar.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
        e.target.classList.add('active');
        sidebar.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        sidebar.querySelector(`#tab-${tabName}`).classList.add('active');
    }));
}

async function loadEntities() {
    const snapshot = await getDocs(collection(db, collection_name));
    entities = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable();
}

function renderTable() {
    const tableData = entities.map(e => [
        e.codice || 'N/D',
        e.ragione_sociale || 'N/D',
        e.piva || 'N/D',
        e.email || 'N/D',
        ui.formatTableActionElement(e.id)
    ]);

    if (dataTable) dataTable.destroy();

    dataTable = new simpleDatatables.DataTable('#data-table', {
        data: {
            headings: ['Codice', 'Ragione Sociale', 'P.IVA', 'Email', 'Azioni'],
            data: tableData
        },
        perPageSelect: false,
        labels: {
            placeholder: "Cerca...",
            noRows: "Nessun risultato trovato",
            info: "Mostra da {start} a {end} di {rows} elementi"
        },
        layout: { top: "{search}", bottom: "{info}{pager}" }
    });

    setupTableClickHandlers();
}

async function saveEntity(e) {
    e.preventDefault();
    const id = document.getElementById('entity-id').value || doc(collection(db, collection_name)).id;
    const isNew = !currentEntityId;
    if (!document.getElementById('entity-id').value) document.getElementById('entity-id').value = id;
    const now = new Date().toISOString();
    const currentUser = auth.currentUser;
    const data = {
        codice: document.getElementById('codice').value,
        ragione_sociale: document.getElementById('ragione_sociale').value,
        piva: document.getElementById('piva').value,
        cf: document.getElementById('cf').value,
        email: document.getElementById('email').value,
        telefono: document.getElementById('telefono').value,
        indirizzo: document.getElementById('indirizzo').value,
        citta: document.getElementById('citta').value,
        cap: document.getElementById('cap').value,
        stato: document.getElementById('toggle-stato').checked,
        changed: now,
        lastModifiedBy: currentUser?.uid || null,
        lastModifiedByEmail: currentUser?.email || null
    };
    if (isNew) data.created = now;
    await setDoc(doc(db, collection_name, id), data, { merge: true });
    if (isNew) {
        currentEntityId = id;
        showTabsForExistingEntity();
        documentUtils.listenForDocuments(id);
        actionUtils.loadActions(id);
    }
    showSaveMessage('save-message');
    loadEntities();
}

function showSaveMessage(elementId) {
    const msg = document.getElementById(elementId);
    msg.textContent = 'Salvato con successo';
    msg.style.display = 'inline';
    setTimeout(() => { msg.style.display = 'none'; }, 3000);
}

function resetToFirstTab(sidebarId) {
    const sidebar = document.getElementById(sidebarId);
    sidebar.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    sidebar.querySelector('.tab-link').classList.add('active');
    sidebar.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    sidebar.querySelector('.tab-content').classList.add('active');
}

const editEntity = async (id) => {
    currentEntityId = id;
    const docSnap = await getDoc(doc(db, collection_name, id));
    const data = docSnap.data();
    document.getElementById('entity-form-title').textContent = data.ragione_sociale || 'Cliente';
    document.getElementById('entity-id').value = id;
    document.getElementById('codice').value = data.codice || '';
    document.getElementById('ragione_sociale').value = data.ragione_sociale || '';
    document.getElementById('piva').value = data.piva || '';
    document.getElementById('cf').value = data.cf || '';
    document.getElementById('email').value = data.email || '';
    document.getElementById('telefono').value = data.telefono || '';
    document.getElementById('indirizzo').value = data.indirizzo || '';
    document.getElementById('citta').value = data.citta || '';
    document.getElementById('cap').value = data.cap || '';
    document.getElementById('toggle-stato').checked = data.stato || false;
    
    showTabsForExistingEntity();
    documentUtils.listenForDocuments(id);
    actionUtils.loadActions(id);
    resetToFirstTab('entity-form-sidebar');
    openSidebar();
};

async function deleteEntity(id) {
    await deleteDoc(doc(db, collection_name, id));
    loadEntities();
}

function setupTableClickHandlers() {
    document.getElementById('data-table').addEventListener('click', () => { closeSidebar(); }, { once: false });

    const resetAllDeleteButtons = () => {
        document.querySelectorAll('.delete-confirmation-overlay').forEach(overlay => {
            const td = overlay.closest('td');
            if (td) td.classList.remove('confirming-delete');
            overlay.remove();
        });
    };

    document.getElementById('data-table').addEventListener('click', function(event) {
        const target = event.target;

        const confirmYesButton = target.closest('.btn-confirm-yes');
        if (confirmYesButton) {
            deleteEntity(confirmYesButton.dataset.id);
            resetAllDeleteButtons();
            return;
        }

        const confirmNoButton = target.closest('.btn-confirm-no');
        if (confirmNoButton) {
            resetAllDeleteButtons();
            return;
        }

        const editButton = target.closest('.btn-edit');
        if (editButton) {
            resetAllDeleteButtons();
            editEntity(editButton.dataset.id);
            return;
        }

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
                <button class="btn btn-sm btn-outline-light btn-confirm-no">No</button>`;
            td.appendChild(overlay);
            setTimeout(() => { overlay.classList.add('active'); }, 10);
        }
    });
}

function hideTabsForNewEntity() {
    document.querySelectorAll('[data-tab="documenti"], [data-tab="azioni"]').forEach(t => t.style.display = 'none');
    document.querySelectorAll('#tab-documenti, #tab-azioni').forEach(t => t.style.display = 'none');
}

function showTabsForExistingEntity() {
    document.querySelectorAll('[data-tab="documenti"], [data-tab="azioni"]').forEach(t => t.style.display = '');
    document.querySelectorAll('#tab-documenti, #tab-azioni').forEach(t => t.style.display = '');
}

function openSidebar() { document.getElementById('entity-form-sidebar').classList.add('open'); }
function closeSidebar() { document.getElementById('entity-form-sidebar').classList.remove('open'); }
