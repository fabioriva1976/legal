// js/utils/actionUtils.js

import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

export class ActionManager {
    constructor(config) {
        this.db = config.db;
        this.auth = config.auth;
        this.functions = config.functions;
        this.entityCollection = config.entityCollection;

        this.listEl = document.getElementById(config.listElementId || 'action-list');

        this.currentEntityId = null;
    }

    async loadActions(entityId) {
        this.currentEntityId = entityId;

        if (!this.listEl) return;

        // Mostra loader
        this.listEl.innerHTML = '<div class="loading-state">Caricamento azioni...</div>';

        try {
            // Chiama la Cloud Function per recuperare gli audit logs
            const getEntityAuditLogsApi = httpsCallable(this.functions, 'getEntityAuditLogsApi');
            const result = await getEntityAuditLogsApi({
                entityType: this.entityCollection,
                entityId: entityId,
                limit: 50
            });

            const actions = result.data.logs || [];

            if (actions.length === 0) {
                this.renderEmptyMessage("Nessuna azione registrata per questa entità.");
                return;
            }

            this.renderTimeline(actions);

        } catch (error) {
            console.error("Errore nel caricamento delle azioni:", error);
            this.renderEmptyMessage("Errore nel caricamento delle azioni.");
        }
    }

    renderEmptyMessage(message) {
        if (this.listEl) {
            this.listEl.innerHTML = `<div class="empty-state">${message}</div>`;
        }
    }

    renderTimeline(actions) {
        if (!this.listEl) return;

        this.listEl.innerHTML = '';

        // Crea il container della timeline
        const timeline = document.createElement('div');
        timeline.className = 'timeline-container';

        actions.forEach((action, index) => {
            const timelineItem = this.createTimelineItem(action, index === actions.length - 1);
            timeline.appendChild(timelineItem);
        });

        this.listEl.appendChild(timeline);
    }

    createTimelineItem(action, isLast) {
        const item = document.createElement('div');
        item.className = 'timeline-item';

        // Formatta la data - gestisce diversi formati di timestamp
        let date;
        if (action.timestamp?.toDate) {
            // Timestamp Firestore con metodo toDate()
            date = action.timestamp.toDate();
        } else if (action.timestamp?._seconds) {
            // Timestamp serializzato da Cloud Function
            date = new Date(action.timestamp._seconds * 1000);
        } else if (typeof action.timestamp === 'string' || typeof action.timestamp === 'number') {
            // Stringa ISO o timestamp numerico
            date = new Date(action.timestamp);
        } else {
            // Fallback
            date = new Date();
        }

        const formattedDate = date.toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Determina l'icona e il colore in base al tipo di azione
        const { icon, color, label } = this.getActionStyle(action.action);

        // Mostra l'email dell'utente o "Sistema" se non c'è un utente
        const userDisplay = action.userEmail || (action.userId ? action.userId : 'Sistema');

        // Crea l'HTML della timeline
        item.innerHTML = `
            <div class="timeline-marker" style="background-color: ${color};">
                ${icon}
            </div>
            ${!isLast ? '<div class="timeline-line"></div>' : ''}
            <div class="timeline-content">
                <div class="timeline-header">
                    <span class="timeline-action" style="color: ${color};">${label}</span>
                    <span class="timeline-date">${formattedDate}</span>
                </div>
                <div class="timeline-user">
                    ${userDisplay}
                </div>
                ${this.renderActionDetails(action)}
            </div>
        `;

        return item;
    }

    getActionStyle(actionType) {
        const styles = {
            'create': {
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
                color: '#10b981',
                label: 'Creazione'
            },
            'update': {
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
                color: '#3b82f6',
                label: 'Modifica'
            },
            'delete': {
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
                color: '#ef4444',
                label: 'Eliminazione'
            },
            'read': {
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
                color: '#6b7280',
                label: 'Lettura'
            }
        };

        return styles[actionType] || styles['read'];
    }

    renderActionDetails(action) {
        let details = '';

        // Gestione speciale per documenti (metadata.documento presente)
        if (action.metadata && action.metadata.documento) {
            const colorClass = action.action === 'create' ? 'change-new' : (action.action === 'delete' ? 'change-old' : '');
            details += '<div class="timeline-changes">';
            details += '<div class="changes-title">Documento:</div>';
            details += `<div class="document-name ${colorClass}">${action.metadata.documento}</div>`;
            details += '</div>';
            return details;
        }

        // Mostra i metadati se presenti, escludendo campi tecnici
        if (action.metadata && Object.keys(action.metadata).length > 0) {
            const excludedKeys = ['trigger', 'collection', 'source', 'actionType'];
            const filteredMetadata = Object.entries(action.metadata)
                .filter(([key, value]) => !excludedKeys.includes(key) && value && typeof value !== 'object');

            if (filteredMetadata.length > 0) {
                details += '<div class="timeline-metadata">';
                filteredMetadata.forEach(([key, value]) => {
                    details += `<span class="metadata-item"><strong>${key}:</strong> ${value}</span>`;
                });
                details += '</div>';
            }
        }

        // Mostra le modifiche per le azioni di update
        if (action.action === 'update' && action.oldData && action.newData) {
            const changes = this.detectChanges(action.oldData, action.newData);
            if (changes.length > 0) {
                details += '<div class="timeline-changes">';
                details += '<div class="changes-title">Modifiche:</div>';
                changes.forEach(change => {
                    details += `
                        <div class="change-item">
                            <span class="change-field">${change.field}:</span>
                            <span class="change-old">${this.formatValue(change.oldValue)}</span>
                            <span class="change-arrow">→</span>
                            <span class="change-new">${this.formatValue(change.newValue)}</span>
                        </div>
                    `;
                });
                details += '</div>';
            }
        }

        // Mostra i dati per create
        if (action.action === 'create' && action.newData) {
            details += '<div class="timeline-data">';
            details += '<div class="data-title">Dati iniziali:</div>';
            details += this.renderDataSummary(action.newData);
            details += '</div>';
        }

        return details;
    }

    detectChanges(oldData, newData) {
        const changes = [];
        const allKeys = new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);

        // Campi di sistema da ignorare
        const systemFields = ['created', 'changed', 'timestamp', 'lastModifiedBy', 'lastModifiedByEmail'];

        for (const key of allKeys) {
            // Ignora campi di sistema
            if (systemFields.includes(key)) continue;

            const oldValue = oldData?.[key];
            const newValue = newData?.[key];

            // Confronta i valori
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                changes.push({
                    field: key,
                    oldValue: oldValue,
                    newValue: newValue
                });
            }
        }

        return changes;
    }

    formatValue(value) {
        if (value === null || value === undefined) return '<em>vuoto</em>';
        if (typeof value === 'boolean') return value ? 'Sì' : 'No';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    renderDataSummary(data) {
        let summary = '<div class="data-summary">';

        // Campi di sistema da ignorare
        const systemFields = ['created', 'changed', 'timestamp', 'lastModifiedBy', 'lastModifiedByEmail'];

        for (const [key, value] of Object.entries(data)) {
            // Ignora campi di sistema
            if (systemFields.includes(key)) continue;

            summary += `
                <div class="data-item">
                    <span class="data-key">${key}:</span>
                    <span class="data-value">${this.formatValue(value)}</span>
                </div>
            `;
        }

        summary += '</div>';
        return summary;
    }

    showEmptyState(message) {
        this.currentEntityId = null;
        this.renderEmptyMessage(message);
    }
}

// Mantieni la compatibilità con il vecchio codice
let defaultInstance = null;

export function setup(config) {
    defaultInstance = new ActionManager(config);
}

export function loadActions(entityId) {
    return defaultInstance?.loadActions(entityId);
}

export function showEmptyState(message) {
    defaultInstance?.showEmptyState(message);
}
