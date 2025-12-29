// js/utils/commentUtils.js

import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export class CommentManager {
    constructor(config) {
        this.db = config.db;
        this.auth = config.auth;
        this.commentsCollectionName = config.commentsCollectionName || 'commenti';
        this.entityCollection = config.entityCollection;
        
        this.listEl = document.getElementById(config.listElementId || 'comment-list');
        this.formEl = document.getElementById(config.formElementId || 'comment-form');
        this.textEl = document.getElementById(config.textElementId || 'comment-text');
        this.saveBtnEl = document.getElementById(config.saveButtonId || 'save-comment-btn');
        
        this.currentEntityId = null;
        this.unsubscribeListener = null;
        
        if (this.saveBtnEl) {
            this.saveBtnEl.addEventListener('click', (e) => this.handleSaveComment(e));
        }
    }
    
    async handleSaveComment(e) {
        e.preventDefault();
        const text = this.textEl.value.trim();
        if (!text) {
            alert("Il commento non può essere vuoto.");
            return;
        }
        if (!this.currentEntityId || !this.entityCollection) {
            alert("Errore: Impossibile associare il commento. ID entità non trovato.");
            return;
        }
        const user = this.auth.currentUser;
        if (!user) {
            alert("Devi essere autenticato per lasciare un commento.");
            return;
        }
        this.setLoading(true);
        const newComment = {
            text: text,
            entityId: this.currentEntityId,
            entityCollection: this.entityCollection,
            userId: user.uid,
            userName: user.displayName || user.email,
            createdAt: serverTimestamp()
        };
        try {
            await addDoc(collection(this.db, this.commentsCollectionName), newComment);
            this.textEl.value = '';
        } catch (error) {
            console.error("Errore nel salvataggio del commento:", error);
            alert("Impossibile salvare il commento. Riprova.");
        } finally {
            this.setLoading(false);
        }
    }
    
    setLoading(isLoading) {
        if (!this.saveBtnEl) return;
        this.saveBtnEl.disabled = isLoading;
        if (isLoading) {
            this.saveBtnEl.classList.add('loading');
        } else {
            this.saveBtnEl.classList.remove('loading');
        }
    }
    
    renderEmptyMessage(message) {
        if (this.listEl) this.listEl.innerHTML = `<div class="empty-state">${message}</div>`;
    }
    
    listenForComments(entityId) {
        this.currentEntityId = entityId;
        if (this.formEl) this.formEl.style.display = 'block';
        if (this.listEl) this.listEl.innerHTML = '';
        const commentsRef = collection(this.db, this.commentsCollectionName);
        const q = query(commentsRef, where("entityId", "==", entityId), orderBy("createdAt", "desc"));
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
        }
        this.unsubscribeListener = onSnapshot(q, (snapshot) => {
            if (!this.listEl) return;
            this.listEl.innerHTML = '';
            if (snapshot.empty) {
                this.renderEmptyMessage("Nessun commento. Iniziane uno tu!");
                return;
            }
            snapshot.docs.forEach(doc => this.renderComment(doc.data()));
        }, (error) => {
            console.error("Errore nell'ascolto dei commenti:", error);
            this.renderEmptyMessage("Errore nel caricamento dei commenti.");
        });
        return this.unsubscribeListener;
    }
    
    renderComment(data) {
        if (!this.listEl) return;
        const item = document.createElement('div');
        item.className = 'comment-item';
        const date = data.createdAt ? data.createdAt.toDate() : new Date();
        const formattedDate = date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        item.innerHTML = `<div class="comment-header"><span class="comment-user">${data.userName || 'Utente Sconosciuto'}</span><span class="comment-date">${formattedDate}</span></div><div class="comment-body">${data.text}</div>`;
        this.listEl.appendChild(item);
    }
    
    showEmptyState(message) {
        if (this.unsubscribeListener) {
            this.unsubscribeListener();
            this.unsubscribeListener = null;
        }
        this.currentEntityId = null;
        this.renderEmptyMessage(message);
        if (this.formEl) this.formEl.style.display = 'none';
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
    defaultInstance = new CommentManager(config);
}
export function listenForComments(entityId) {
    return defaultInstance?.listenForComments(entityId);
}
export function showEmptyState(message) {
    defaultInstance?.showEmptyState(message);
}
