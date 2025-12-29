// js/utils/documentUtils.js

import { collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

export class DocumentManager {
    constructor(config) {
        this.db = config.db;
        this.storage = config.storage;
        this.auth = config.auth;
        this.functions = config.functions;
        this.documentsCollectionName = config.documentsCollectionName || 'documenti';
        this.entityCollection = config.entityCollection;
        
        this.dropAreaEl = document.getElementById(config.dropAreaId || 'file-drop-area');
        this.fileInputEl = document.getElementById(config.fileInputId || 'document-upload');
        this.previewListEl = document.getElementById(config.previewListId || 'document-preview-list');
        this.formMessageEl = document.getElementById(config.formMessageId || 'entity-form-message');
        
        this.currentEntityId = null;
        this.unsubscribeListener = null;
        
        this.setupFileUploadListeners();
        if (this.previewListEl) {
            this.previewListEl.addEventListener('click', (e) => this.handlePreviewListClick(e));
        }
    }
    
    handlePreviewListClick(e) {
        const target = e.target;
        const confirmNoButton = target.closest('.btn-confirm-no');
        if (confirmNoButton) {
            e.stopPropagation();
            this.resetAllDeleteOverlays();
            return;
        }
        const confirmYesButton = target.closest('.btn-confirm-yes');
        if (confirmYesButton) {
            e.stopPropagation();
            const item = confirmYesButton.closest('.file-preview-item');
            if (!item) return;
            if (item.classList.contains('pending-file')) {
                item.remove();
            } else if (item.classList.contains('existing-file')) {
                const { docId, storagePath, fileName, description } = confirmYesButton.dataset;
                this.deleteDocument(docId, storagePath, fileName, description);
            }
            this.resetAllDeleteOverlays();
            return;
        }
        const deleteButton = target.closest('.remove-file-btn');
        if (deleteButton) {
            e.stopPropagation();
            this.resetAllDeleteOverlays();
            const item = deleteButton.closest('.file-preview-item');
            if (!item) return;
            item.classList.add('confirming-delete');
            const overlay = document.createElement('div');
            overlay.className = 'delete-confirmation-overlay';
            let yesButtonHtml = '';
            if (item.classList.contains('pending-file')) {
                yesButtonHtml = `<button class="btn btn-sm btn-light btn-confirm-yes">Sì</button>`;
            } else if (item.classList.contains('existing-file')) {
                const { docId, storagePath, fileName, description } = deleteButton.dataset;
                yesButtonHtml = `<button class="btn btn-sm btn-light btn-confirm-yes" data-doc-id="${docId}" data-storage-path="${storagePath}" data-file-name="${fileName}" data-description="${description || ''}">Sì</button>`;
            }
            overlay.innerHTML = `<span>Sei sicuro?</span>${yesButtonHtml}<button class="btn btn-sm btn-outline-light btn-confirm-no">No</button>`;
            item.appendChild(overlay);
            setTimeout(() => overlay.classList.add('active'), 10);
        }
    }
    
    resetAllDeleteOverlays() {
        if (!this.previewListEl) return;
        this.previewListEl.querySelectorAll('.delete-confirmation-overlay').forEach(overlay => {
            const item = overlay.closest('.file-preview-item');
            if (item) item.classList.remove('confirming-delete');
            overlay.remove();
        });
    }
    
    setupFileUploadListeners() {
        if (!this.dropAreaEl || !this.fileInputEl || !this.previewListEl) return;
        const preventDefaults = e => { e.preventDefault(); e.stopPropagation(); };
        const highlight = () => this.dropAreaEl.classList.add('drag-over');
        const unhighlight = () => this.dropAreaEl.classList.remove('drag-over');
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e => this.dropAreaEl.addEventListener(e, preventDefaults));
        ['dragenter', 'dragover'].forEach(e => this.dropAreaEl.addEventListener(e, highlight));
        ['dragleave', 'drop'].forEach(e => this.dropAreaEl.addEventListener(e, unhighlight));
        const handleFiles = (files) => {
            if (!this.currentEntityId) {
                this.showFormMessage("Salva l'entità prima di caricare file.", 'error');
                return;
            }
            [...files].forEach(file => this.renderPendingFile(file));
        };
        this.dropAreaEl.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
        this.fileInputEl.addEventListener('change', e => {
            handleFiles(e.target.files);
            e.target.value = null;
        });
    }
    
    renderPendingFile(file) {
        if (!this.previewListEl) return;
        const emptyStateEl = this.previewListEl.querySelector('.empty-state');
        if (emptyStateEl) emptyStateEl.remove();
        const formattedSize = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : `${(file.size / 1024).toFixed(2)} KB`;
        const item = document.createElement('div');
        item.className = 'file-preview-item pending-file';
        item.innerHTML = `<div class="file-icon-wrapper"><svg class="file-icon" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg><div class="loader-small"></div></div><div class="file-details"><span class="file-name">${file.name}</span><span class="file-size">${formattedSize}</span><input type="text" class="file-description-input" placeholder="Aggiungi una descrizione (opzionale)..."></div><div class="file-actions"><button type="button" class="btn btn-small btn-upload">Carica</button><button type="button" class="remove-file-btn">&times;</button></div>`;
        this.previewListEl.appendChild(item);
        const uploadBtn = item.querySelector('.btn-upload');
        const descriptionInput = item.querySelector('.file-description-input');
        const removeBtn = item.querySelector('.remove-file-btn');
        uploadBtn.addEventListener('click', async () => {
            const description = descriptionInput.value.trim();
            uploadBtn.disabled = true;
            removeBtn.disabled = true;
            descriptionInput.disabled = true;
            item.classList.add('is-uploading');
            try {
                await this.uploadAndSaveFile(file, description);
                item.remove();
                this.showFormMessage(`"${file.name}" caricato con successo.`, 'success');
            } catch (error) {
                uploadBtn.disabled = false;
                removeBtn.disabled = false;
                descriptionInput.disabled = false;
                item.classList.remove('is-uploading');
                console.error("Errore upload:", error);
                this.showFormMessage(`Errore nel caricamento di ${file.name}.`, 'error');
            }
        });
    }
    
    async uploadAndSaveFile(file, description) {
        const user = this.auth.currentUser;
        if (!user) throw new Error("Utente non autenticato.");
        if (!this.currentEntityId) throw new Error("ID Entità non trovato.");
        if (!this.entityCollection) throw new Error("entityCollection non configurato.");
        const storagePath = `${this.documentsCollectionName}/${this.currentEntityId}/${Date.now()}_${file.name}`;
        const fileRef = ref(this.storage, storagePath);
        const snapshot = await uploadBytes(fileRef, file);
        const url = await getDownloadURL(snapshot.ref);
        const newDocument = {
            entityId: this.currentEntityId,
            entityCollection: this.entityCollection,
            userId: user.uid,
            userName: user.displayName || user.email,
            createdAt: serverTimestamp(),
            name: file.name,
            url: url,
            path: snapshot.ref.fullPath,
            size: file.size,
            type: file.type,
            description: description || ""
        };
        await addDoc(collection(this.db, this.documentsCollectionName), newDocument);

        // Registra l'azione nell'audit log
        try {
            const createAuditLogApi = httpsCallable(this.functions, 'createAuditLogApi');
            const documentDisplayName = description || file.name;
            await createAuditLogApi({
                entityType: this.entityCollection,
                entityId: this.currentEntityId,
                action: 'create',
                metadata: {
                    documento: documentDisplayName
                }
            });
        } catch (auditError) {
            console.error('Errore durante la creazione dell\'audit log:', auditError);
            // Non bloccare l'upload se l'audit log fallisce
        }
    }
    
    listenForDocuments(entityId) {
        this.currentEntityId = entityId;
        if (this.dropAreaEl) this.dropAreaEl.style.display = 'flex';
        if (this.previewListEl) {
            this.previewListEl.querySelectorAll('.existing-file').forEach(el => el.remove());
        }
        const docsRef = collection(this.db, this.documentsCollectionName);
        const q = query(docsRef, where("entityId", "==", entityId), orderBy("createdAt", "desc"));
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
        }
        this.unsubscribeListener = onSnapshot(q, (snapshot) => {
            if (this.previewListEl) this.previewListEl.querySelectorAll('.existing-file').forEach(el => el.remove());
            if (snapshot.empty && (!this.previewListEl || this.previewListEl.querySelector('.pending-file') === null)) {
                if (this.previewListEl && this.previewListEl.querySelector('.empty-state') === null) {
                    const emptyEl = document.createElement('div');
                    emptyEl.className = 'empty-state';
                    emptyEl.textContent = 'Nessun documento allegato.';
                    this.previewListEl.appendChild(emptyEl);
                }
                return;
            }
            const emptyStateEl = this.previewListEl ? this.previewListEl.querySelector('.empty-state') : null;
            if (emptyStateEl) emptyStateEl.remove();
            snapshot.docs.forEach(doc => this.renderDocument(doc.id, doc.data()));
        }, (error) => {
            console.error("Errore nell'ascolto dei documenti:", error);
            if (this.previewListEl) this.previewListEl.innerHTML = `<div class="empty-state">Errore nel caricamento dei documenti.</div>`;
        });
    }
    
    renderDocument(docId, data) {
        if (!this.previewListEl) return;
        const item = document.createElement('div');
        item.className = 'file-preview-item existing-file';
        const date = data.createdAt ? data.createdAt.toDate() : new Date();
        const formattedDate = date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedSize = data.size > 1024 * 1024 ? `${(data.size / (1024 * 1024)).toFixed(2)} MB` : `${(data.size / 1024).toFixed(2)} KB`;
        const descriptionHtml = data.description ? `<p class="file-description-display">${data.description}</p>` : '';
        item.innerHTML = `<div class="file-icon-wrapper"><svg class="file-icon" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg></div><div class="file-details"><a href="${data.url}" target="_blank" class="file-name-link">${data.name}</a>${descriptionHtml}<span class="file-meta">Caricato da: ${data.userName || 'N/D'} il ${formattedDate} (${formattedSize})</span></div><div class="file-actions"><button type="button" class="remove-file-btn" data-doc-id="${docId}" data-storage-path="${data.path}" data-file-name="${data.name}" data-description="${data.description || ''}">&times;</button></div>`;
        this.previewListEl.prepend(item);
    }
    
    showEmptyState(message) {
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
            this.unsubscribeListener = null;
        }
        this.currentEntityId = null;
        if (this.dropAreaEl) this.dropAreaEl.style.display = 'none';
        if (this.previewListEl) {
            this.previewListEl.innerHTML = `<div class="empty-state">${message}</div>`;
        }
    }
    
    async deleteDocument(docId, storagePath, fileName, description) {
        try {
            const fileRef = ref(this.storage, storagePath);
            await deleteObject(fileRef);
            const docRef = doc(this.db, this.documentsCollectionName, docId);
            await deleteDoc(docRef);

            // Registra l'azione nell'audit log
            try {
                const createAuditLogApi = httpsCallable(this.functions, 'createAuditLogApi');
                const documentDisplayName = description || fileName;
                await createAuditLogApi({
                    entityType: this.entityCollection,
                    entityId: this.currentEntityId,
                    action: 'delete',
                    metadata: {
                        documento: documentDisplayName
                    }
                });
            } catch (auditError) {
                console.error('Errore durante la creazione dell\'audit log:', auditError);
                // Non bloccare l'eliminazione se l'audit log fallisce
            }

            this.showFormMessage("File eliminato con successo!", 'success');
        } catch (error) {
            console.error(`Errore eliminazione file "${fileName}":`, error);
            this.showFormMessage(`Errore: ${error.message}`, 'error');
        }
    }
    
    showFormMessage(message, type = 'info') {
        if (!this.formMessageEl) return;
        this.formMessageEl.textContent = message;
        this.formMessageEl.className = `form-message ${type}`;
        this.formMessageEl.style.display = 'block';
        const duration = (type === 'info' ? 3000 : 5000);
        setTimeout(() => {
            if (this.formMessageEl) this.formMessageEl.style.display = 'none';
        }, duration);
    }
    
    unsubscribe() {
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
            this.unsubscribeListener = null;
        }
    }
}

// Mantieni la compatibilità con il vecchio codice
let defaultInstance = null;
export function setup(config) {
    defaultInstance = new DocumentManager(config);
}
export function listenForDocuments(entityId) {
    return defaultInstance?.listenForDocuments(entityId);
}
export function showEmptyState(message) {
    defaultInstance?.showEmptyState(message);
}
