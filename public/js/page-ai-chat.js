import { auth, functions } from './firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

let conversationHistory = [];

export function initPageAiChatPage() {
    setupEventListeners();
    autoResizeTextarea();
}

function setupEventListeners() {
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');

    chatForm.addEventListener('submit', handleSendMessage);

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
}

function autoResizeTextarea() {
    const chatInput = document.getElementById('chat-input');
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';
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
        const token = await user.getIdToken();

        // Call the Cloud Function via HTTP
        const apiUrl = window.location.hostname === 'localhost'
            ? 'http://localhost:5001/legal-816fa/europe-west1/ragChatApi'
            : 'https://europe-west1-legal-816fa.cloudfunctions.net/ragChatApi';

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                data: {
                    message: message,
                    conversationHistory: conversationHistory
                }
            })
        });

        // Remove typing indicator
        removeTypingIndicator(typingId);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Errore durante la richiesta');
        }

        const responseData = await response.json();
        const { answer, sources } = responseData.result;

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
