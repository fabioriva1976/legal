import { db, storage, auth } from './firebase-config.js';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import * as ui from './utils/uiUtils.js';

let entities = [];
let collection_name = 'documenti';
let currentEntityId = null;
let dataTable = null;
let uploadedFile = null;
let currentFileUrl = null;

export function initPageDocumentiPage() {
    setupEventListeners();
    loadEntities();
}

function setupEventListeners() {
    document.getElementById('new-entity-btn').addEventListener('click', () => {
        document.getElementById('entity-form').reset();
        document.getElementById('entity-form-title').textContent = 'Nuovo Documento';
        currentEntityId = null;
        uploadedFile = null;
        currentFileUrl = null;
        document.getElementById('file-preview').innerHTML = '';
        openSidebar();
    });

    document.getElementById('close-sidebar-btn').addEventListener('click', closeSidebar);
    document.getElementById('entity-form').addEventListener('submit', saveEntity);

    // File upload handlers
    const dropArea = document.getElementById('file-drop-area');
    const fileInput = document.getElementById('document-upload');

    dropArea.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Drag & Drop
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('dragover');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('dragover');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
}

function handleFile(file) {
    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    if (!allowedTypes.includes(file.type)) {
        alert('Tipo di file non supportato. Usa PDF, DOC, DOCX o TXT.');
        return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('Il file è troppo grande. Dimensione massima: 10MB');
        return;
    }

    uploadedFile = file;

    // Show preview
    const preview = document.getElementById('file-preview');
    preview.innerHTML = `
        <div style="padding: 12px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; margin-top: 10px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <svg style="width: 24px; height: 24px; color: var(--primary-color);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${file.name}</div>
                    <div style="font-size: 12px; color: var(--text-color-secondary);">${formatFileSize(file.size)}</div>
                </div>
                <button type="button" onclick="window.clearUploadedFile()" style="background: none; border: none; cursor: pointer; color: var(--error-color);">
                    <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

window.clearUploadedFile = function() {
    uploadedFile = null;
    document.getElementById('file-preview').innerHTML = '';
    document.getElementById('document-upload').value = '';
};

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function loadEntities() {
    const snapshot = await getDocs(collection(db, collection_name));
    entities = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable();
}

function renderTable() {
    const tableData = entities.map(e => [
        e.titolo || 'N/D',
        e.tipologia || 'N/D',
        formatTags(e.tags || []),
        e.descrizione ? (e.descrizione.substring(0, 50) + (e.descrizione.length > 50 ? '...' : '')) : 'N/D',
        formatDate(e.created),
        ui.formatTableActionElement(e.id)
    ]);

    if (dataTable) dataTable.destroy();

    dataTable = new simpleDatatables.DataTable('#data-table', {
        data: {
            headings: ['Titolo', 'Tipologia', 'Tag', 'Descrizione', 'Data Creazione', 'Azioni'],
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

function formatTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return 'N/D';
    return tags.map(tag => `<span style="display: inline-block; padding: 2px 8px; background: var(--primary-color); color: white; border-radius: 12px; font-size: 11px; margin: 2px;">${tag}</span>`).join(' ');
}

function formatDate(isoDate) {
    if (!isoDate) return 'N/D';
    const date = new Date(isoDate);
    return date.toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

async function saveEntity(e) {
    e.preventDefault();

    const saveBtn = document.querySelector('.form-footer .btn');
    const saveMsg = document.getElementById('save-message');

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvataggio...';

        // Validate file upload for new documents
        if (!currentEntityId && !uploadedFile) {
            alert('Devi caricare un file per il documento');
            return;
        }

        const id = document.getElementById('entity-id').value || doc(collection(db, collection_name)).id;
        const isNew = !currentEntityId;

        if (!document.getElementById('entity-id').value) {
            document.getElementById('entity-id').value = id;
        }

        const now = new Date().toISOString();
        const currentUser = auth.currentUser;

        // Parse tags
        const tagsInput = document.getElementById('tags').value;
        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

        const data = {
            titolo: document.getElementById('titolo').value,
            descrizione: document.getElementById('descrizione').value,
            tipologia: document.getElementById('tipologia').value,
            tags: tags,
            stato: document.getElementById('toggle-stato').checked,
            changed: now,
            lastModifiedBy: currentUser?.uid || null,
            lastModifiedByEmail: currentUser?.email || null
        };

        if (isNew) {
            data.created = now;
        }

        // Upload file if new file is selected
        if (uploadedFile) {
            const fileName = `${id}_${uploadedFile.name}`;
            const storageRef = ref(storage, `documenti/${fileName}`);

            saveMsg.textContent = 'Caricamento file in corso...';
            await uploadBytes(storageRef, uploadedFile);
            const downloadURL = await getDownloadURL(storageRef);

            data.fileUrl = downloadURL;
            data.fileName = uploadedFile.name;
            data.fileSize = uploadedFile.size;
            data.fileType = uploadedFile.type;
            data.storagePath = `documenti/${fileName}`;
        } else if (currentFileUrl) {
            // Keep existing file data
            data.fileUrl = currentFileUrl;
        }

        saveMsg.textContent = 'Salvataggio dati...';
        await setDoc(doc(db, collection_name, id), data, { merge: true });

        if (isNew) {
            currentEntityId = id;
        }

        ui.showSuccessMessage('save-message', 'Salvato con successo');
        await loadEntities();

        // Reset form after save
        setTimeout(() => {
            closeSidebar();
            document.getElementById('entity-form').reset();
            currentEntityId = null;
            uploadedFile = null;
            currentFileUrl = null;
        }, 1000);

    } catch (error) {
        console.error('Errore nel salvataggio:', error);
        ui.showErrorMessage('save-message', 'Errore nel salvataggio: ' + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Salva';
    }
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
            deleteEntity(confirmYesButton.dataset.id);
            resetAllDeleteButtons();
            return;
        }

        // Gestisci annulla eliminazione (No)
        const confirmNoButton = target.closest('.btn-confirm-no');
        if (confirmNoButton) {
            resetAllDeleteButtons();
            return;
        }

        // Gestisci pulsante Modifica
        const editButton = target.closest('.btn-edit');
        if (editButton) {
            resetAllDeleteButtons();
            loadEntity(editButton.dataset.id);
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

async function loadEntity(id) {
    const docSnap = await getDoc(doc(db, collection_name, id));
    if (!docSnap.exists()) return;

    const data = docSnap.data();
    currentEntityId = id;
    currentFileUrl = data.fileUrl || null;

    document.getElementById('entity-id').value = id;
    document.getElementById('entity-form-title').textContent = 'Modifica Documento';
    document.getElementById('titolo').value = data.titolo || '';
    document.getElementById('descrizione').value = data.descrizione || '';
    document.getElementById('tipologia').value = data.tipologia || '';
    document.getElementById('tags').value = (data.tags || []).join(', ');
    document.getElementById('toggle-stato').checked = data.stato !== false;

    // Show existing file info
    if (data.fileUrl) {
        const preview = document.getElementById('file-preview');
        preview.innerHTML = `
            <div style="padding: 12px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 8px; margin-top: 10px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <svg style="width: 24px; height: 24px; color: var(--primary-color);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                        <polyline points="13 2 13 9 20 9"></polyline>
                    </svg>
                    <div style="flex: 1;">
                        <div style="font-weight: 600;">${data.fileName || 'File'}</div>
                        <div style="font-size: 12px; color: var(--text-color-secondary);">${data.fileSize ? formatFileSize(data.fileSize) : 'N/D'}</div>
                    </div>
                    <a href="${data.fileUrl}" target="_blank" style="padding: 6px 12px; background: var(--primary-color); color: white; border-radius: 4px; text-decoration: none; font-size: 12px;">
                        Visualizza
                    </a>
                </div>
            </div>
        `;
    }

    openSidebar();
}

async function deleteEntity(id) {
    try {
        console.log('Tentativo di eliminare documento con ID:', id);

        if (!id || typeof id !== 'string' || id.trim() === '') {
            throw new Error('ID documento non valido');
        }

        // Get document data to delete associated file
        const docSnap = await getDoc(doc(db, collection_name, id));
        if (docSnap.exists()) {
            const data = docSnap.data();

            // Delete file from storage if exists
            if (data.storagePath) {
                try {
                    const fileRef = ref(storage, data.storagePath);
                    await deleteObject(fileRef);
                    console.log('✅ File eliminato da Storage:', data.storagePath);
                } catch (error) {
                    console.error('⚠️ Errore nell\'eliminazione del file da Storage:', error);
                    // Continua comunque con l'eliminazione del documento
                }
            }
        }

        // Delete document from Firestore
        await deleteDoc(doc(db, collection_name, id));
        console.log('✅ Documento eliminato da Firestore:', id);

        // Reload entities list
        await loadEntities();

    } catch (error) {
        console.error('❌ Errore nell\'eliminazione del documento:', error);
        alert('Errore: ' + (error.message || 'Impossibile eliminare il documento'));
    }
}

function openSidebar() {
    document.getElementById('entity-form-sidebar').classList.add('open');
}

function closeSidebar() {
    document.getElementById('entity-form-sidebar').classList.remove('open');
}
