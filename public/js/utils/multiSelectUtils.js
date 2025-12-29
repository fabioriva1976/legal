/**
 * Plugin per la gestione dei campi select multivalue.
 */

export class Multiselect{
    #elementId = null;
    #multiSelectElement = null;
    #hiddenSelect = null;
    #multiSelectOptions = [];
    #multipleMode = true;

    constructor(config){
        this.#elementId = config.elementId;
        this.#multiSelectElement = document.getElementById(this.#elementId);
        this.#hiddenSelect = document.getElementById(this.#elementId + '-hidden');
        this.#multiSelectOptions = config.selectOptions;
        this.#multipleMode = config.multiple !== false;

        this.#populateOptions();
        this.#setupEventListeners();
        this.#updateUI();
    }

    setValue(values = []) {
        const valuesArray = Array.isArray(values) ? values : [values];
        Array.from(this.#hiddenSelect.options).forEach(opt => {
            opt.selected = valuesArray.includes(opt.value);
        });
        this.#updateUI();
    }

    getValue() {
        const selectedValues = Array.from(this.#hiddenSelect.selectedOptions).map(option => option.value);
        return this.#multipleMode ? selectedValues : (selectedValues[0] || '');
    }

    #populateOptions() {
        this.#multiSelectOptions.forEach(value => {
            const opzione = document.createElement('option');
            if (typeof value === 'string') {
                opzione.value = this.#slugify(value);
                opzione.textContent = value;
            } else {
                opzione.value = value.key;
                opzione.textContent = value.label;
            }
            this.#hiddenSelect.appendChild(opzione);
        });
    }

    #setupEventListeners() {
        this.#multiSelectElement.querySelector('.multiselect-input-wrapper').addEventListener('click', () => this.#multiSelectElement.classList.toggle('open'));
        this.#multiSelectElement.querySelector('.multiselect-dropdown').addEventListener('click', e => {
            if (e.target.classList.contains('multiselect-option')) {
                const selectedOption = Array.from(this.#hiddenSelect.options).find(o => o.value === e.target.dataset.value);
                if(selectedOption) selectedOption.selected = true;
                this.#updateUI();
                this.#multiSelectElement.classList.remove('open');
            }
        });
        this.#multiSelectElement.querySelector('.multiselect-selected-list').addEventListener('click', e => {
            if (e.target.classList.contains('multiselect-tag-remove')) {
                const valueToRemove = e.target.closest('.multiselect-tag').dataset.value;
                const optionToDeselect = Array.from(this.#hiddenSelect.options).find(o => o.value === valueToRemove);
                if(optionToDeselect) optionToDeselect.selected = false;
                this.#updateUI();
            }
        });
        document.addEventListener('click', e => { if (!this.#multiSelectElement.contains(e.target)) this.#multiSelectElement.classList.remove('open'); }, true);
    }

    #updateUI() {
        const dropdown = this.#multiSelectElement.querySelector('.multiselect-dropdown');
        const selectedList = this.#multiSelectElement.querySelector('.multiselect-selected-list');
        selectedList.innerHTML = '';
        dropdown.innerHTML = '';
        Array.from(this.#hiddenSelect.options).forEach(option => {
            if (option.selected) {
                const tag = document.createElement('div');
                tag.className = 'multiselect-tag';
                tag.dataset.value = option.value;
                tag.innerHTML = `<span>${option.textContent}</span><span class="multiselect-tag-remove">&times;</span>`;
                selectedList.appendChild(tag);
            } else {
                const optEl = document.createElement('div');
                optEl.classList.add('multiselect-option');
                optEl.dataset.value = option.value;
                optEl.textContent = option.textContent;
                dropdown.appendChild(optEl);
            }
        });
    }

    #slugify(testo) {
        return testo.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replaceAll(' ', '_');
    }
}


