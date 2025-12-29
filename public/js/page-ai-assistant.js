import { functions } from './firebase-config.js';
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

export function initPageAiAssistantPage() {
    const promptInput = document.getElementById('ai-prompt');
    const submitBtn = document.getElementById('ai-submit-btn');
    const chatContainer = document.getElementById('chat-container');
    const history = [];

    function addMessage(text, isUser) {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            margin-bottom: 1rem;
            padding: 0.75rem;
            border-radius: 8px;
            ${isUser ? 'background: var(--primary-color); color: white; margin-left: 20%; text-align: right;' : 'background: var(--border-color); margin-right: 20%;'}
        `;
        messageDiv.textContent = text;
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    async function sendMessage() {
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        addMessage(prompt, true);
        promptInput.value = '';
        submitBtn.classList.add('loading');

        try {
            const aiAssistantApi = httpsCallable(functions, 'aiAssistantApi');
            const result = await aiAssistantApi({ prompt, history });
            const response = result.data.response;
            
            addMessage(response, false);
            
            history.push({ role: 'user', content: prompt });
            history.push({ role: 'assistant', content: response });
        } catch (error) {
            addMessage(`Errore: ${error.message}`, false);
        } finally {
            submitBtn.classList.remove('loading');
            promptInput.focus();
        }
    }

    submitBtn.addEventListener('click', sendMessage);

    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}
