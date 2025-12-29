/**
 * Plugin per la gestione dei campi form multi valore.
 */

let multivaluesElement = null;
let multivaluesOptions = [];

export function setup(config){
    multivaluesOptions = config.selectOptions;
    multivaluesElement = document.getElementById(config.buttonId);
}

export function setupMultiValuesFieldEventListeners() {
    multivaluesElement.addEventListener('click', () => addMultiValuesFieldRow());
}

export function addMultiValuesFieldRow(data = { tipo: '', valore: '' }) {

    const container = document.getElementById(multivaluesElement.id+'-container');
    const row = document.createElement('div');
    row.className = 'condition-row';

    let html = '';
    multivaluesOptions.forEach(function(value){
        let key = slugify(value);
        html += `<option value="${key}">${value}</option>`;
    });

    row.innerHTML = `<div><select class="condition-type">${html}</select></div><div><input type="text" class="condition-value" placeholder="Valore (es. 1.25)"></div><button type="button" class="remove-condition-btn btn-delete">&times;</button>`;
    
    row.querySelector('.condition-type').value = data.tipo || multivaluesOptions[0];
    row.querySelector('.condition-value').value = data.valore;
    row.querySelector('.remove-condition-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
}

export function getCurrentMultipValues(){
      const conditions = [];
      document.querySelectorAll('.condition-row').forEach(row => {
          const tipo = row.querySelector('.condition-type').value;
          const valore = row.querySelector('.condition-value').value;
          if (tipo && valore) { conditions.push({ tipo, valore }); }
      });

      return conditions;
}

export function isEmpty(){
    return getCurrentMultipValues().length === 0;
}


function slugify(testo) {
  const testoMinuscolo = testo.toLowerCase();
  const testoSenzaAccenti = testoMinuscolo
    .normalize('NFD') // Separa le lettere dagli accenti (es. "è" -> "e" + "`")
    .replace(/[\u0300-\u036f]/g, ''); // Rimuove solo gli accenti
  const testoConUnderscore = testoSenzaAccenti.replaceAll(' ', '_');
  
  return testoConUnderscore;
}
