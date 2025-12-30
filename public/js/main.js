// js/main.js
// 1. Importa le funzioni di cui hai bisogno dagli altri moduli
import { db, auth } from './firebase-config.js';
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

//pagine standard
import { initPageDocumentiPage } from './page-documenti.js';
import { initPageAiChatPage } from './page-pratica.js';
import { initPageChatListPage } from './page-pratiche.js';
//anagrafica
import { initPageAnagraficaUtentiPage } from './anagrafica-utenti.js';
import { initPageAnagraficaClientiPage } from './anagrafica-clienti.js';
//config
import { initConfigSmtpPage } from './config-smtp.js';
import { initConfigAiPage } from './config-ai.js';
//profile
import { initProfilePage } from './profile.js';

const CACHE_KEY = 'datiUtenteProfilo';

// Non ci sono ruoli - tutti gli utenti autenticati hanno accesso a tutte le pagine

// Mappa funzioni init per page
const pageInitializers = {
    'page-documenti': initPageDocumentiPage,
    'page-pratica': initPageAiChatPage,
    'page-pratiche': initPageChatListPage,
    //anagrafica
    'anagrafica-utenti': initPageAnagraficaUtentiPage,
    'anagrafica-clienti': initPageAnagraficaClientiPage,
    //config
    'config-smtp': initConfigSmtpPage,
    'config-ai': initConfigAiPage,
    //profile
    'profile': initProfilePage,
};


/**
 * Funzione per caricare i dati utente da Firestore e salvarli in cache.
 */
async function caricaEImpostaCache(uid) {
    try {
        console.log('🔍 Caricamento dati utente da Firestore per UID:', uid);

        // Carica direttamente il documento usando l'UID come ID del documento
        const userDocRef = doc(db, 'utenti', uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            console.log('✅ Dati utente caricati:', userData);

            localStorage.setItem(CACHE_KEY, JSON.stringify(userData));

            const mioEvento = new CustomEvent('dati:caricati', {
                detail: userData
            });
            document.dispatchEvent(mioEvento);
        } else {
            console.warn('⚠️ Documento utente non trovato in Firestore per UID:', uid);
        }
    } catch (error) {
        console.error("🔥 Errore durante il caricamento dei dati da Firestore:", error);
    }
}

// --- PUNTO DI INGRESSO PRINCIPALE ---
auth.onAuthStateChanged(user => {
    // Ottieni la pagina corrente in cui ci troviamo
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    if (user) {
        // --- CASO 1: L'UTENTE È LOGGATO ---

        // Se l'utente loggato si trova sulla pagina di login, lo mandiamo alla dashboard.
        if (currentPage === 'login.html') {
            window.location.replace('/index.html'); // Sostituisci con la tua pagina principale
            return; // Fermiamo l'esecuzione per evitare di caricare dati inutilmente
        }

        // Se è su qualsiasi altra pagina, procediamo a caricare i suoi dati.
        console.log("Utente autenticato, caricamento dati...");
        
        // [CACHE] Controlla se i dati sono già in localStorage
        const datiInCache = localStorage.getItem(CACHE_KEY);
        if (datiInCache) {
            visualizzaDati(JSON.parse(datiInCache));
        }

        // Avvia comunque il caricamento da Firestore in sottofondo
        caricaEImpostaCache(user.uid);
        
    } else {
        // --- CASO 2: L'UTENTE NON È LOGGATO (O HA APPENA FATTO LOGOUT) ---

        // Pulisci sempre la cache per sicurezza
        localStorage.removeItem(CACHE_KEY);
        
        // Se l'utente non loggato NON si trova già sulla pagina di login,
        // lo reindirizziamo lì.
        if (currentPage !== 'login.html') {
            console.log("Nessun utente, reindirizzamento al login...");
            window.location.replace('/login.html'); // <-- LA RIGA CHE MANCAVA
        }
    }
});

function visualizzaDati(user){
    const userIcon = document.getElementById('avatar-icon');
    if (!userIcon) return; // Element not yet loaded

    let url = 'https://ui-avatars.com/api/?name='+user.nome+'&background=3b82f6&color=fff&rounded=true';
    let alt = user.nome+' '+user.cognome;

    userIcon.setAttribute('src', url);
    userIcon.setAttribute('alt', alt);
}

function getCurrentUser(){
    const datiInCache = localStorage.getItem(CACHE_KEY);

    if (datiInCache) {
        // Se ci sono, li analizzo (da stringa a oggetto) e li mostro subito
        return JSON.parse(datiInCache);
    }else{
        return {'nome':'Anonimo', 'cognome':'', 'ruolo':''};
    }
}

// Tutti gli utenti autenticati hanno accesso a tutte le pagine
function hasPagePermission(pageName, userRole) {
    return true; // Sempre true - nessun controllo ruoli
}

// Make getCurrentUser available globally for other modules
window.getCurrentUser = getCurrentUser;

// --- 3. LOGICA PRINCIPALE DELL'APPLICAZIONE (SPA) ---
document.addEventListener('DOMContentLoaded', () => {
    const contentPlaceholder = document.getElementById('content-placeholder');
    const sidebarPlaceholder = document.getElementById('sidebar-placeholder');
    const appWrapper = document.querySelector('.app-wrapper');

    if (!sidebarPlaceholder || !contentPlaceholder || !appWrapper) {
        return;
    }

    // -- Funzione per caricare la sidebar --
    async function loadCorrectSidebar() {
        // Estrae il nome della pagina dal path
        const path = window.location.pathname.split('/').pop();
        const pageName = path.replace('.html', '');

        let sidebarArea = 'page'; // default: page

        // Determina l'area in base al PREFISSO del nome della pagina
        if (pageName.startsWith('config-')) {
            sidebarArea = 'config';
        } else if (pageName.startsWith('profile')) {
            sidebarArea = 'profile';
        } else {
            // Tutte le altre pagine (page-*, anagrafica-*, ecc.) usano sidebar-page_
            sidebarArea = 'page';
        }

        // Carica la sidebar appropriata
        const sidebarPath = `/_includes/sidebar-${sidebarArea}_.html`;
        const loaded = await loadComponent('#sidebar-placeholder', sidebarPath);

        // Se il caricamento fallisce, usa sidebar-page_ come fallback
        if (!loaded) {
            await loadComponent('#sidebar-placeholder', '/_includes/sidebar-page_.html');
        }

        // Ricarica gli event listener della sidebar
        setupSidebarInteractions();
    }

    // -- Funzione principale che avvia l'interfaccia --
    async function loadMainUI() {
        console.log('🚀 loadMainUI() chiamato');

        if (localStorage.getItem('sidebarCollapsed') === 'true') {
            appWrapper.classList.add('sidebar-collapsed');
        }
        const savedTheme = localStorage.getItem('theme') || 'light';
        applyTheme(savedTheme);

        //carico l'utente (no verifiche ruoli)
        let user = getCurrentUser();
        console.log('👤 User da cache:', user);

        await loadCorrectSidebar();

        console.log('⚙️ Setup interazioni...');
        setupHeaderInteractions();
        setupSidebarInteractions();

        console.log('🔀 Chiamata router...');
        // Carica il contenuto della pagina corrente basandosi sull'URL
        await router();
        console.log('✅ loadMainUI() completato');
    }

    // -- Gestione Interazioni Header (Tema, Menu Mobile e Toggle Desktop) --
    function setupHeaderInteractions() {
        const themeToggle = document.getElementById('theme-toggle');
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const desktopSidebarToggle = document.getElementById('toggle-sidebar-btn');
        const profileToggle = document.getElementById('profile-toggle');

        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const isDarkMode = document.documentElement.classList.contains('dark-mode');
                const newTheme = isDarkMode ? 'light' : 'dark';
                localStorage.setItem('theme', newTheme);
                applyTheme(newTheme);
            });
        }
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                appWrapper.classList.toggle('sidebar-mobile-open');
            });
        }
        if (desktopSidebarToggle) {
            desktopSidebarToggle.addEventListener('click', () => {
                appWrapper.classList.toggle('sidebar-collapsed');
                localStorage.setItem('sidebarCollapsed', appWrapper.classList.contains('sidebar-collapsed'));
            });
        }
        if (profileToggle) {
            profileToggle.addEventListener('click', async () => {
                // Carica la sidebar del profilo
                await loadComponent('#sidebar-placeholder', '/_includes/sidebar-profile_.html');

                setupSidebarInteractions();
                history.pushState({}, '', '/profile.html');
                router();
            });
        }
    }
    
    // -- Gestione Interazioni Sidebar (Solo Navigazione e Logout) --
    function setupSidebarInteractions() {
        sidebarPlaceholder.addEventListener('click', e => {
            const link = e.target.closest('a');
            if (!link) return;

            if (link.href && !link.id) {
                appWrapper.classList.remove('sidebar-mobile-open');
            }
            if (link.id === 'logout-btn') {
                e.preventDefault();
                console.log('Logout');
                auth.signOut();
                return;
            }
            if (link.id === 'back-to-app-btn') {
                e.preventDefault();
                history.pushState({}, '', '/page-pratica.html');
                router();
                return;
            }
            if (link.id === 'admin-area-btn') {
                e.preventDefault();
                history.pushState({}, '', '/config-settings.html');
                router();
                return;
            }
            if (link.href) {
                 e.preventDefault();
                 const url = new URL(link.href);
                 if (url.pathname !== window.location.pathname || url.search !== window.location.search) {
                     history.pushState({}, '', url.href);
                     router();
                 }
            }
        });
    }

    // -- Router Dinamico e Caricatore di Contenuto --
    async function loadPage(pageName) {
        contentPlaceholder.innerHTML = '';
        await loadComponent('#content-placeholder', `/_partials/${pageName}.html`);
        const functionName = `init${pageName.charAt(0).toUpperCase() + pageName.slice(1)}Page`;
        if (typeof window[functionName] === 'function') {
            window[functionName]();
        }
    }

    async function loadJs(pageName){
        console.log('🔍 loadJs chiamato per:', pageName);
        const initializer = pageInitializers[pageName];
        if (initializer) {
            console.log('✅ Eseguo initializer per:', pageName);
            initializer();
        } else {
            console.log('❌ Nessun initializer trovato per:', pageName);
        }
    }

    // -- Router: Decide quale contenuto mostrare in base all'URL --
    async function router() {
        const path = window.location.pathname.split('/').pop();
        let pageName = path.replace('.html', '');
        console.log('🌐 Router - path:', path, '| pageName:', pageName);
        if (pageName === '' || pageName === 'index') {
            pageName = 'page-pratiche';
        }

        // Carica la sidebar corretta per l'area corrente
        await loadCorrectSidebar();

        // Tenta di caricare la pagina richiesta
        const success = await loadComponent('#content-placeholder', `/_partials/${pageName}.html`);

        if (success) {
            // --- Pagina Trovata ---
            loadJs(pageName);
            updateActiveLink(pageName);
        } else {
            // --- Pagina NON Trovata (404) ---
            // Carica la pagina 404
            await loadComponent('#content-placeholder', '/_partials/404.html');
            // Non caricare JS e deseleziona i link attivi
            updateActiveLink(null);
        }
    }



    // -- Funzioni Ausiliarie --
    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark-mode');
        } else {
            document.documentElement.classList.remove('dark-mode');
        }
    }
    
    function updateActiveLink(pageName) {
    // Rimuove 'active' da tutti i link
        document.querySelectorAll('.nav-menu li').forEach(li => li.classList.remove('active'));

        // Se pageName è null (pagina 404), esci
        if (pageName === null) {
            return;
        }

        // Altrimenti, trova e attiva il link corretto
        const linkSelector = `${pageName}.html`;
        const activeLink = document.querySelector(`.nav-menu a[href*="${linkSelector}"]`);
        if (activeLink) {
            activeLink.closest('li').classList.add('active');
        }
    }

    async function loadComponent(selector, url) {
        try {
            const response = await fetch(url);
            
            // 1. Controlla per 404 reali
            if (!response.ok) {
                console.warn(`File non trovato (404): ${url}`);
                return false; // Ritorna 'false' per 404
            }
            
            const html = await response.text();
            
            // 2. NUOVO CONTROLLO DI SICUREZZA
            // Se l'HTML ricevuto sembra una pagina intera (invece di un partial),
            // lo trattiamo come un errore per evitare caricamenti nidificati.
            if (html.trim().toLowerCase().startsWith('<!doctype html') || 
                html.trim().toLowerCase().startsWith('<html') || 
                html.includes('<body')) 
            {
                console.warn(`Caricamento fallito: il server ha restituito una pagina intera invece di un partial per ${url}. (File parziale non trovato?)`);
                return false; // Tratta questo come un "non trovato"
            }

            // 3. Inserisci l'HTML (ora siamo sicuri sia un partial)
            const element = document.querySelector(selector);
            if (element) element.innerHTML = html;
            return true; // Ritorna 'true' per successo

        } catch (error) {
            // Errore generico (es. rete offline)
            console.error("Impossibile caricare il componente:", error);
            contentPlaceholder.innerHTML = `<div class="container"><h1>Errore di Rete</h1><p>Impossibile contattare il server. Controlla la tua connessione.</p></div>`;
            return false;
        }
    }

    window.addEventListener('popstate', router);

    /**
     * Quando i dati utente vengono caricati da Firestore, aggiorna l'avatar
     */
    document.addEventListener('dati:caricati', async function(event) {
        const userData = event.detail;

        // Aggiorna l'avatar
        visualizzaDati(userData);
    });


    if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(function(position) {
    var latitude = position.coords.latitude;
    var longitude = position.coords.longitude;

    // Chiama la funzione Firebase per inviare la posizione
    console.log(latitude +' '+ longitude);
  }, function(error) {
    console.log("Errore nel recuperare la posizione: ", error);
  });
} else {
  console.log("La geolocalizzazione non è supportata da questo browser.");
}
    loadMainUI();
});