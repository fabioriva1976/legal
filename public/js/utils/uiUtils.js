export function getTableStatusBadgeElement(value){
    let statusClass = 'status--non-attivo';
    let title = 'Non Attivo';
    
    if(value) {
        statusClass = 'status--attivo';
        title = 'Attivo';
    }

    // Costruisci l'HTML per il badge
    return `<span class="status-badge ${statusClass}">${title}</span>`;
}


export function formatTableActionElement(id){
    // Costruisci l'HTML per il badge
    return `<button class="btn-edit" data-id="${id}">Modifica</button><button class="btn-delete" data-id="${id}">Elimina</button>`
}


export function formatPriceElement(value){
    const formatted = new Intl.NumberFormat('it-IT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
    return `<span style="text-align: right; display: inline-block;">${formatted} €</span>`;
}

export function showSuccessMessage(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.style.color = 'var(--success-color, #10b981)';
        element.style.display = 'inline-block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 3000);
    }
}

export function showErrorMessage(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.style.color = 'var(--error-color, #ef4444)';
        element.style.display = 'inline-block';
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}
