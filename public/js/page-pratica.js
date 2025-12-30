import { auth, db, functions, storage } from './firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { doc, getDoc, collection, query, orderBy, getDocs, addDoc, updateDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

let conversationHistory = [];
let currentChatId = null;
let currentChatData = null;
let currentAttachments = [];

export function initPageAiChatPage() {
    setupEventListeners();
    autoResizeTextarea();

    // Aspetta che l'utente sia autenticato prima di caricare la chat
    if (auth.currentUser) {
        loadChatFromUrl();
    } else {
        // Listener per quando l'autenticazione è completa
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                loadChatFromUrl();
                unsubscribe(); // Rimuovi il listener dopo il primo caricamento
            }
        });
    }
}

function setupEventListeners() {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const backToListBtn = document.getElementById('back-to-list-btn');

    chatForm.addEventListener('submit', handleSendMessage);

    // Back to list button
    if (backToListBtn) {
        backToListBtn.addEventListener('click', () => {
            history.pushState({}, '', '/page-pratiche.html');
            const routerEvent = new Event('popstate');
            window.dispatchEvent(routerEvent);
        });
    }

    // Handle example questions
    document.querySelectorAll('.example-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            chatInput.value = btn.textContent;
            chatInput.focus();
        });
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    });

    // Submit on Enter (but Shift+Enter for new line)
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    // Tab navigation
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });

    // Save notes button
    const saveNotesBtn = document.getElementById('save-notes-btn');
    if (saveNotesBtn) {
        saveNotesBtn.addEventListener('click', saveNotes);
    }

    // File upload
    const fileUpload = document.getElementById('file-upload');
    if (fileUpload) {
        fileUpload.addEventListener('change', handleFileUpload);
    }
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
}

function autoResizeTextarea() {
    const chatInput = document.getElementById('chat-input');
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';
}

async function loadChatFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const chatId = urlParams.get('chatId');

    if (!chatId) {
        console.log('📝 Nessuna chat specifica, modalità generale');
        updateChatHeader('AI Legal Assistant', 'Chiedi informazioni sui tuoi documenti legali');
        return;
    }

    console.log('📂 Caricamento chat:', chatId);

    try {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Utente non autenticato');
        }

        // Carica i dati della chat
        const chatDocRef = doc(db, 'chats', chatId);
        const chatDoc = await getDoc(chatDocRef);

        if (!chatDoc.exists()) {
            throw new Error('Chat non trovata');
        }

        currentChatData = chatDoc.data();
        currentChatId = chatId;

        // Verifica che la chat appartenga all'utente corrente
        if (currentChatData.userId !== user.uid) {
            throw new Error('Non hai accesso a questa chat');
        }

        // Aggiorna l'header con i dati della chat
        updateChatHeader(
            `${currentChatData.clientName} - ${currentChatData.caseId}`,
            'Chat per questa pratica'
        );

        // Mostra i tab quando c'è una chat attiva
        const chatTabs = document.getElementById('chat-tabs');
        if (chatTabs) chatTabs.style.display = 'flex';

        // Carica lo storico dei messaggi
        await loadChatHistory(chatId);

        // Carica le note
        await loadNotes(chatId);

        // Carica gli allegati
        await loadAttachments(chatId);

    } catch (error) {
        console.error('Errore nel caricamento della chat:', error);
        addErrorMessage('Errore nel caricamento della chat: ' + error.message);
    }
}

async function loadNotes(chatId) {
    try {
        const chatDocRef = doc(db, 'chats', chatId);
        const chatDoc = await getDoc(chatDocRef);

        if (chatDoc.exists()) {
            const data = chatDoc.data();
            const notesTextarea = document.getElementById('notes-textarea');
            if (notesTextarea && data.notes) {
                notesTextarea.value = data.notes;
            }
        }
    } catch (error) {
        console.error('Errore nel caricamento delle note:', error);
    }
}

async function saveNotes() {
    if (!currentChatId) {
        alert('Nessuna chat attiva');
        return;
    }

    try {
        const notesTextarea = document.getElementById('notes-textarea');
        const notes = notesTextarea.value;

        const chatDocRef = doc(db, 'chats', currentChatId);
        await updateDoc(chatDocRef, {
            notes: notes,
            updatedAt: serverTimestamp()
        });

        // Mostra messaggio di successo
        const saveBtn = document.getElementById('save-notes-btn');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = '✓ Salvato';
        saveBtn.disabled = true;

        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
        }, 2000);

        console.log('✅ Note salvate');
    } catch (error) {
        console.error('Errore nel salvataggio delle note:', error);
        alert('Errore nel salvataggio delle note: ' + error.message);
    }
}

async function loadAttachments(chatId) {
    try {
        const attachmentsRef = collection(db, 'chats', chatId, 'attachments');
        const q = query(attachmentsRef, orderBy('uploadedAt', 'desc'));
        const querySnapshot = await getDocs(q);

        currentAttachments = [];
        querySnapshot.forEach((doc) => {
            currentAttachments.push({
                id: doc.id,
                ...doc.data()
            });
        });

        renderAttachments();
    } catch (error) {
        console.error('Errore nel caricamento degli allegati:', error);
    }
}

function renderAttachments() {
    const attachmentsList = document.getElementById('attachments-list');

    if (currentAttachments.length === 0) {
        attachmentsList.innerHTML = `
            <div class="empty-attachments">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
                <p>Nessun allegato</p>
                <span>Carica documenti relativi a questa pratica</span>
            </div>
        `;
        return;
    }

    attachmentsList.innerHTML = currentAttachments.map(attachment => {
        const hasText = !!attachment.extractedText;
        const isExtracting = attachment.isExtracting === true;

        let textBadge = '';
        if (isExtracting) {
            textBadge = `<span class="text-extracting-badge" title="Estrazione testo in corso..."><div class="spinner"></div> Estrazione...</span>`;
        } else if (hasText) {
            textBadge = `<span class="text-extracted-badge" title="Testo estratto e disponibile per l'AI">📄 AI Ready</span>`;
        }

        return `
        <div class="attachment-item" data-attachment-id="${attachment.id}">
            <div class="attachment-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
            </div>
            <div class="attachment-info">
                <div class="attachment-name">${escapeHtml(attachment.name)} ${textBadge}</div>
                <div class="attachment-meta">${formatFileSize(attachment.size)} • ${formatDate(attachment.uploadedAt)}</div>
            </div>
            <div class="attachment-actions">
                <button class="btn btn-icon" onclick="window.downloadAttachment('${attachment.id}')" title="Scarica">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </button>
                <button class="btn btn-icon btn-danger" onclick="window.deleteAttachment('${attachment.id}')" title="Elimina">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
        `;
    }).join('');
}

async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files.length || !currentChatId) return;

    for (const file of files) {
        await uploadAttachment(file);
    }

    // Reset input
    e.target.value = '';
}

async function uploadAttachment(file) {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('Utente non autenticato');

        console.log(`📤 Uploading file: ${file.name} (${formatFileSize(file.size)})`);

        // Upload file to Storage
        const storageRef = ref(storage, `chats/${currentChatId}/attachments/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        // Save metadata to Firestore
        const attachmentData = {
            name: file.name,
            size: file.size,
            type: file.type,
            downloadURL: downloadURL,
            storagePath: storageRef.fullPath,
            uploadedAt: serverTimestamp(),
            uploadedBy: user.uid
        };

        const docRef = await addDoc(collection(db, 'chats', currentChatId, 'attachments'), attachmentData);

        console.log('✅ File caricato:', file.name);

        // Estrai testo automaticamente per PDF, DOCX, TXT
        const supportedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'text/plain',
            'text/csv',
            'application/json'
        ];

        const isSupportedFile = supportedTypes.includes(file.type) ||
            file.name.toLowerCase().endsWith('.pdf') ||
            file.name.toLowerCase().endsWith('.docx') ||
            file.name.toLowerCase().endsWith('.doc') ||
            file.name.toLowerCase().endsWith('.txt');

        if (isSupportedFile) {
            console.log('📄 Extracting text from file...');

            // Aggiungi il file alla lista con lo stato "extracting"
            currentAttachments.push({
                id: docRef.id,
                ...attachmentData,
                isExtracting: true
            });
            renderAttachments();

            try {
                const extractTextFromFileApi = httpsCallable(functions, 'extractTextFromFileApi');
                await extractTextFromFileApi({
                    chatId: currentChatId,
                    attachmentId: docRef.id
                });
                console.log('✅ Testo estratto e salvato');
            } catch (extractError) {
                console.warn('⚠️ Impossibile estrarre il testo:', extractError.message);
                // Non bloccare l'upload se l'estrazione fallisce
            }
        }

        // Reload attachments
        await loadAttachments(currentChatId);

    } catch (error) {
        console.error('Errore nel caricamento del file:', error);
        alert('Errore nel caricamento del file: ' + error.message);
    }
}

window.downloadAttachment = async function(attachmentId) {
    const attachment = currentAttachments.find(a => a.id === attachmentId);
    if (!attachment) return;

    window.open(attachment.downloadURL, '_blank');
};

window.deleteAttachment = async function(attachmentId) {
    if (!confirm('Sei sicuro di voler eliminare questo allegato?')) return;

    try {
        const attachment = currentAttachments.find(a => a.id === attachmentId);
        if (!attachment) return;

        // Delete from Storage
        const storageRef = ref(storage, attachment.storagePath);
        await deleteObject(storageRef);

        // Delete from Firestore
        await deleteDoc(doc(db, 'chats', currentChatId, 'attachments', attachmentId));

        // Reload attachments
        await loadAttachments(currentChatId);

        console.log('✅ File eliminato');
    } catch (error) {
        console.error('Errore nell\'eliminazione del file:', error);
        alert('Errore nell\'eliminazione del file: ' + error.message);
    }
};

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffInMs = now - date;
    const diffInHours = diffInMs / (1000 * 60 * 60);

    if (diffInHours < 24) {
        return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 168) { // 7 days
        return date.toLocaleDateString('it-IT', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateChatHeader(title, subtitle) {
    const titleEl = document.getElementById('chat-title');
    const subtitleEl = document.getElementById('chat-subtitle');

    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
}

async function loadChatHistory(chatId) {
    try {
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));
        const querySnapshot = await getDocs(q);

        // Nascondi il messaggio di benvenuto se ci sono messaggi
        if (!querySnapshot.empty) {
            const welcomeMessage = document.querySelector('.welcome-message');
            if (welcomeMessage) {
                welcomeMessage.remove();
            }
        }

        // Carica i messaggi nella chat
        conversationHistory = [];
        querySnapshot.forEach((doc) => {
            const messageData = doc.data();

            // Aggiungi alla UI
            addMessageToChat(messageData.role, messageData.content, messageData.sources || null);

            // Aggiungi allo storico della conversazione
            conversationHistory.push({
                role: messageData.role,
                content: messageData.content
            });
        });

        console.log('✅ Caricati', conversationHistory.length, 'messaggi');

    } catch (error) {
        console.error('Errore nel caricamento dello storico:', error);
    }
}

async function saveMessageToFirestore(role, content, sources = null) {
    if (!currentChatId) {
        console.log('⚠️ Nessuna chat attiva, messaggio non salvato');
        return;
    }

    try {
        const messageData = {
            role: role,
            content: content,
            timestamp: serverTimestamp()
        };

        if (sources && sources.length > 0) {
            messageData.sources = sources;
        }

        // Salva il messaggio nella sottocollezione
        const messagesRef = collection(db, 'chats', currentChatId, 'messages');
        await addDoc(messagesRef, messageData);

        // Aggiorna il timestamp della chat principale
        const chatDocRef = doc(db, 'chats', currentChatId);
        await updateDoc(chatDocRef, {
            updatedAt: serverTimestamp()
        });

        console.log('✅ Messaggio salvato in Firestore');

    } catch (error) {
        console.error('Errore nel salvataggio del messaggio:', error);
    }
}

async function handleSendMessage(e) {
    e.preventDefault();

    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const message = chatInput.value.trim();

    if (!message) return;

    // Hide welcome message
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    // Add user message to chat
    addMessageToChat('user', message);

    // Clear input and reset height
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Disable send button
    sendBtn.disabled = true;

    // Show typing indicator
    const typingId = showTypingIndicator();

    try {
        // Get auth token
        const user = auth.currentUser;
        if (!user) {
            throw new Error('Utente non autenticato');
        }

        // Prepara il contesto della pratica con note e allegati
        let practiceContext = '';

        if (currentChatId && currentChatData) {
            practiceContext += `\n\n[CONTESTO PRATICA]\n`;
            practiceContext += `Cliente: ${currentChatData.clientName}\n`;
            practiceContext += `ID Pratica: ${currentChatData.caseId}\n`;

            // Aggiungi le note se presenti
            const notesTextarea = document.getElementById('notes-textarea');
            if (notesTextarea && notesTextarea.value.trim()) {
                practiceContext += `\nNote della Pratica:\n${notesTextarea.value.trim()}\n`;
            }

            // Aggiungi gli allegati con il testo estratto se presente
            if (currentAttachments.length > 0) {
                practiceContext += `\nAllegati (${currentAttachments.length}):\n`;

                currentAttachments.forEach((att, idx) => {
                    practiceContext += `\n--- Allegato ${idx + 1}: ${att.name} (${formatFileSize(att.size)}) ---\n`;

                    // Se c'è testo estratto, includilo
                    if (att.extractedText) {
                        // Limita il testo per allegato a 5000 caratteri per non superare i limiti del prompt
                        const maxCharsPerFile = 5000;
                        const text = att.extractedText.length > maxCharsPerFile
                            ? att.extractedText.substring(0, maxCharsPerFile) + '\n[... testo troncato ...]'
                            : att.extractedText;

                        practiceContext += `Contenuto:\n${text}\n`;
                    } else {
                        practiceContext += `[File binario - contenuto non disponibile]\n`;
                    }
                    practiceContext += `--- Fine allegato ${idx + 1} ---\n`;
                });
            }

            practiceContext += `[FINE CONTESTO PRATICA]\n\n`;
        }

        // Call the Cloud Function via Firebase SDK
        const ragChatApi = httpsCallable(functions, 'ragChatApi');

        const result = await ragChatApi({
            message: message,
            conversationHistory: conversationHistory,
            practiceContext: practiceContext
        });

        // Remove typing indicator
        removeTypingIndicator(typingId);

        const { answer, sources } = result.data;

        // Debug: log sources to verify downloadURL
        console.log('📊 Sources received:', sources);
        sources.forEach((source, idx) => {
            console.log(`Source ${idx}:`, {
                title: source.title,
                fileName: source.fileName,
                hasDownloadURL: !!source.downloadURL,
                downloadURL: source.downloadURL
            });
        });

        // Add assistant response to chat
        addMessageToChat('assistant', answer, sources);

        // Save messages to Firestore
        await saveMessageToFirestore('user', message);
        await saveMessageToFirestore('assistant', answer, sources);

        // Update conversation history
        conversationHistory.push({
            role: 'user',
            content: message
        });
        conversationHistory.push({
            role: 'assistant',
            content: answer
        });

        // Keep only last 10 messages to avoid token limits
        if (conversationHistory.length > 10) {
            conversationHistory = conversationHistory.slice(-10);
        }

    } catch (error) {
        console.error('Error calling RAG chat:', error);
        removeTypingIndicator(typingId);

        let errorMessage = 'Si è verificato un errore. Riprova.';
        if (error.code === 'functions/not-found') {
            errorMessage = 'La funzione AI non è disponibile. Contatta l\'amministratore.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        addErrorMessage(errorMessage);
    } finally {
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

function addMessageToChat(role, text, sources = null) {
    const messagesContainer = document.getElementById('chat-messages');

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';

    if (role === 'user') {
        avatarDiv.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        `;
    } else {
        avatarDiv.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
        `;
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const textP = document.createElement('p');
    textP.className = 'message-text';
    textP.textContent = text;

    contentDiv.appendChild(textP);

    // Add sources if available
    if (sources && sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'message-sources';

        const sourcesTitle = document.createElement('div');
        sourcesTitle.className = 'message-sources-title';
        sourcesTitle.textContent = 'Fonti:';
        sourcesDiv.appendChild(sourcesTitle);

        sources.forEach(source => {
            console.log('🔗 Creating source item:', source.title, 'downloadURL:', source.downloadURL);

            const sourceItem = document.createElement('div');
            sourceItem.className = 'source-item';

            if (source.downloadURL) {
                // Se c'è il link, crea un elemento cliccabile
                const sourceLink = document.createElement('a');
                sourceLink.href = source.downloadURL;
                sourceLink.target = '_blank';
                sourceLink.className = 'source-item-link';
                sourceLink.innerHTML = `
                    <span class="source-item-title">${source.title || source.fileName || 'Documento'}</span>
                    <svg style="width: 14px; height: 14px; margin-left: 4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                `;
                sourceItem.appendChild(sourceLink);
            } else {
                // Se non c'è il link, mostra solo il titolo
                const sourceTitle = document.createElement('div');
                sourceTitle.className = 'source-item-title';
                sourceTitle.textContent = source.title || source.fileName || 'Documento';
                sourceItem.appendChild(sourceTitle);
            }

            sourcesDiv.appendChild(sourceItem);
        });

        contentDiv.appendChild(sourcesDiv);
    }

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);

    messagesContainer.appendChild(messageDiv);

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('chat-messages');

    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typing-indicator-' + Date.now();

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
        </svg>
    `;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'typing-indicator';
    typingIndicator.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;

    contentDiv.appendChild(typingIndicator);
    typingDiv.appendChild(avatarDiv);
    typingDiv.appendChild(contentDiv);

    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return typingDiv.id;
}

function removeTypingIndicator(typingId) {
    const typingDiv = document.getElementById(typingId);
    if (typingDiv) {
        typingDiv.remove();
    }
}

function addErrorMessage(errorText) {
    const messagesContainer = document.getElementById('chat-messages');

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = errorText;

    messagesContainer.appendChild(errorDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
