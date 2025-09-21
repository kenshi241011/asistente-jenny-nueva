import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, serverTimestamp, query, orderBy, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Funciones de UI ---
function showToast(message, duration = 3000) {
    if (notificationToast) {
        notificationToast.textContent = message;
        notificationToast.style.opacity = '1';
        setTimeout(() => {
            notificationToast.style.opacity = '0';
        }, duration);
    }
}

// Función para mostrar/ocultar modal de bienvenida
function showWelcomeModal() {
    if (welcomeModal) {
        welcomeModal.classList.remove('hidden');
        welcomeModal.style.display = 'flex';
        // Agregar animación de entrada
        setTimeout(() => {
            const modalContent = welcomeModal.querySelector('.bg-gray-800') || welcomeModal.querySelector('[class*="bg-gray-800"]');
            if (modalContent) {
                modalContent.style.transform = 'scale(1)';
                modalContent.style.opacity = '1';
            }
        }, 10);
    }
}

function hideWelcomeModal() {
    if (welcomeModal) {
        const modalContent = welcomeModal.querySelector('.bg-gray-800') || welcomeModal.querySelector('[class*="bg-gray-800"]');
        if (modalContent) {
            modalContent.style.transform = 'scale(0.95)';
            modalContent.style.opacity = '0';
        }
        setTimeout(() => {
            welcomeModal.classList.add('hidden');
            welcomeModal.style.display = 'none';
        }, 200);
    }
}

// Función para manejar el sidebar móvil
function toggleSidebar() {
    if (window.innerWidth <= 768) {
        const isOpen = historySidebar.classList.contains('open');
        if (isOpen) {
            historySidebar.classList.remove('open');
            if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
        } else {
            historySidebar.classList.add('open');
            if (sidebarBackdrop) sidebarBackdrop.classList.remove('hidden');
        }
    }
}

// --- Constantes y Variables Globales ---
const API_KEY = "AIzaSyB1xjT_S_pPECCQZ50VDDb3vRbQBa_EHpk"; // Para Gemini
const GROQ_API_KEY = "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";
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-jenny-app';

let app, auth, db, userId;
let unsubscribeConversations = null;
let currentConversationId = null;
let chatContext = [];
let activeContextMenu = null;
let isTemporaryChat = false;

// --- Configuración de Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyCyEwjd6P6Az_VFJRDuU8bapbeSOvCVMpk",
  authDomain: "jelo-database-nueva.firebaseapp.com",
  projectId: "jelo-database-nueva",
  storageBucket: "jelo-database-nueva.firebasestorage.app",
  messagingSenderId: "725982583709",
  appId: "1:725982583709:web:dcb82f4f67b23a4ccaad74"
};

// --- Selección de Elementos del DOM ---
let loginScreen, appScreen, loginButton, googleLoginButton, logoutButton;
let userName, userPhoto, loginError, chatContainer, welcomeScreen, chatHistory;
let chatInput, sendChatButton, statusIndicator, historySidebar, historyList;
let newChatButton, menuToggle, sidebarBackdrop, fileUploadInput;
let welcomeModal, closeWelcomeModal, temporalChatButton, chatTitle;
let notificationToast, modelSelector;

// Función para inicializar elementos DOM
function initializeDOMElements() {
    loginScreen = document.getElementById('login-screen');
    appScreen = document.getElementById('app-screen');
    loginButton = document.getElementById('login-button');
    googleLoginButton = document.getElementById('google-login-button');
    logoutButton = document.getElementById('logout-button');
    userName = document.getElementById('user-name');
    userPhoto = document.getElementById('user-photo');
    loginError = document.getElementById('login-error');
    chatContainer = document.getElementById('chat-container');
    welcomeScreen = document.getElementById('welcome-screen');
    chatHistory = document.getElementById('chat-history');
    chatInput = document.getElementById('chat-input');
    sendChatButton = document.getElementById('send-chat-button');
    statusIndicator = document.getElementById('status-indicator');
    historySidebar = document.getElementById('history-sidebar');
    historyList = document.getElementById('history-list');
    newChatButton = document.getElementById('new-chat-button');
    menuToggle = document.getElementById('menu-toggle');
    sidebarBackdrop = document.getElementById('sidebar-backdrop');
    fileUploadInput = document.getElementById('file-upload-input');
    welcomeModal = document.getElementById('welcome-modal');
    closeWelcomeModal = document.getElementById('close-welcome-modal');
    temporalChatButton = document.getElementById('temporal-chat-button');
    chatTitle = document.getElementById('chat-title');
    notificationToast = document.getElementById('notification-toast');
    modelSelector = document.getElementById('model-selector');
}

// =================================================================================
// LÓGICA PARA CREAR ARCHIVOS
// =================================================================================
function generateExcel(datos, fileName = "archivo.xlsx") {
    try {
        const ws = XLSX.utils.json_to_sheet(datos);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
        XLSX.writeFile(wb, fileName);
        showToast("Archivo Excel descargado correctamente");
    } catch (error) {
        console.error("Error al generar Excel:", error);
        showToast("Hubo un error al generar el archivo de Excel.");
    }
}

function generateWord(textContent, fileName = 'documento.docx') {
    try {
        const zip = new PizZip(textContent);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });
        doc.render();
        const blob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        saveAs(blob, fileName);
        showToast("Archivo Word descargado correctamente");
    } catch (error) {
        console.error("Error al generar Word:", error);
        showToast("Hubo un error al generar el archivo de Word.");
    }
}

function generatePptx(textContent, fileName = 'presentacion.pptx') {
    try {
        const pptx = new PptxGenJS();
        textContent.split('\n---\n').forEach(slideContent => {
            const slide = pptx.addSlide();
            const [title, ...body] = slideContent.trim().split('\n');
            slide.addText(title || 'Diapositiva', { x: 0.5, y: 0.25, fontSize: 32, bold: true });
            if (body.length > 0) {
                slide.addText(body.join('\n'), { x: 0.5, y: 1.5, fontSize: 18, bullet: true });
            }
        });
        pptx.writeFile({ fileName });
        showToast("Archivo PowerPoint descargado correctamente");
    } catch (error) {
        console.error("Error al generar PowerPoint:", error);
        showToast("Hubo un error al generar el archivo de PowerPoint.");
    }
}

// --- Funciones Principales ---

function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        
        onAuthStateChanged(auth, user => {
            if (user) {
                userId = user.uid;
                if (userName) userName.textContent = user.displayName || 'Usuario';
                if (userPhoto) userPhoto.src = user.photoURL || '';
                
                // Transición suave a la app
                if (loginScreen && appScreen) {
                    loginScreen.classList.add('hidden');
                    appScreen.classList.remove('hidden');
                    appScreen.classList.add('flex');
                }
                
                startNewChat();
                loadConversationList();
                
                // Mostrar modal de bienvenida para nuevos usuarios
                setTimeout(() => {
                    showWelcomeModal();
                }, 500);
                
            } else {
                userId = null;
                if (loginScreen && appScreen) {
                    loginScreen.classList.remove('hidden');
                    appScreen.classList.add('hidden');
                    appScreen.classList.remove('flex');
                }
                if (unsubscribeConversations) unsubscribeConversations();
            }
        });
    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
        if (loginError) loginError.textContent = "Error crítico al inicializar Firebase.";
    }
}

async function signInWithProvider(providerType) {
    if (!auth) {
        if (loginError) loginError.textContent = "Firebase no está listo. Intenta de nuevo en un momento.";
        return;
    }
    
    const button = providerType === 'google' ? googleLoginButton : loginButton;
    const textElement = document.getElementById('google-login-button-text');
    let provider = providerType === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider();
    
    if (button) button.disabled = true;
    if (providerType === 'google' && textElement) textElement.textContent = "Conectando...";
    if (loginError) loginError.textContent = "";
    
    try {
        await setPersistence(auth, browserLocalPersistence);
        const result = await signInWithPopup(auth, provider);
        showToast(`Bienvenido ${result.user.displayName || 'Usuario'}!`);
    } catch (error) {
        console.error(`Error al iniciar sesión con ${providerType}:`, error);
        let errorMessage = "Error al iniciar sesión. Inténtalo de nuevo.";
        
        if (error.code === 'auth/account-exists-with-different-credential') {
            errorMessage = "Ya existe una cuenta con este email. Usa otro método.";
        } else if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = "Inicio de sesión cancelado.";
        } else if (error.code === 'auth/popup-blocked') {
            errorMessage = "Popup bloqueado. Permite popups e intenta de nuevo.";
        }
        
        if (loginError) loginError.textContent = errorMessage;
        showToast(errorMessage);
    } finally {
        if (button) button.disabled = false;
        if (providerType === 'google' && textElement) textElement.textContent = "Iniciar Sesión con Google";
    }
}

function loadConversationList() {
    if (unsubscribeConversations) unsubscribeConversations();
    if (!userId || !historyList) return;

    const conversationsRef = collection(db, `artifacts/${appId}/users/${userId}/conversations`);
    const q = query(conversationsRef, orderBy('timestamp', 'desc'));

    unsubscribeConversations = onSnapshot(q, (snapshot) => {
        historyList.innerHTML = '';
        
        if (snapshot.empty) {
            historyList.innerHTML = '<p style="color: rgba(255, 255, 255, 0.6); font-size: 0.875rem; padding: 1rem; text-align: center;">No hay chats guardados.</p>';
            return;
        }
        
        snapshot.forEach(doc => {
            const convo = doc.data();
            const historyItem = createHistoryItem(doc.id, convo.title);
            historyList.appendChild(historyItem);
        });
    }, (error) => {
        console.error("Error al cargar el historial:", error);
        historyList.innerHTML = '<p style="color: #ff6b6b; font-size: 0.875rem; padding: 1rem; text-align: center;">Error al cargar historial.</p>';
        showToast("Error al cargar el historial de chats");
    });
}

function createHistoryItem(id, title) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.dataset.id = id;

    const titleSpan = document.createElement('span');
    titleSpan.className = 'history-item-title';
    titleSpan.textContent = title || 'Nuevo Chat';
    item.appendChild(titleSpan);

    // Crear botón de menú contextual
    const menuButton = document.createElement('button');
    menuButton.className = 'history-item-menu';
    menuButton.innerHTML = '⋮';
    menuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        showContextMenu(e, id, title);
    });
    item.appendChild(menuButton);

    // Event listener to load conversation on click
    item.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        
        document.querySelectorAll('.history-item.active').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        loadConversation(id);
        
        // Cerrar sidebar en móvil después de seleccionar
        if (window.innerWidth <= 768) {
            toggleSidebar();
        }
    });

    return item;
}

function showContextMenu(event, convoId, currentTitle) {
    // Remover menú existente
    if (activeContextMenu) activeContextMenu.remove();
    
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `
        <button class="context-menu-item" data-action="rename">
            <span>📝</span> Renombrar
        </button>
        <button class="context-menu-item context-menu-delete" data-action="delete">
            <span>🗑️</span> Eliminar
        </button>
    `;
    
    // Posicionar el menú
    contextMenu.style.position = 'fixed';
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.style.zIndex = '1000';
    
    document.body.appendChild(contextMenu);
    activeContextMenu = contextMenu;
    
    // Event listeners para las opciones
    contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            handleContextMenuAction(e, action, convoId, currentTitle);
        });
    });
    
    // Cerrar menú al hacer clic fuera
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu, { once: true });
    }, 0);
}

function closeContextMenu() {
    if (activeContextMenu) {
        activeContextMenu.remove();
        activeContextMenu = null;
    }
}

async function handleContextMenuAction(e, action, convoId, currentTitle) {
    e.stopPropagation();
    if (activeContextMenu) activeContextMenu.remove();

    if (action === 'rename') {
        const newTitle = prompt("Ingresa el nuevo título para el chat:", currentTitle);
        if (newTitle && newTitle.trim() !== "") {
            try {
                const convoRef = doc(db, `artifacts/${appId}/users/${userId}/conversations`, convoId);
                await updateDoc(convoRef, { title: newTitle.trim() });
                showToast("Chat renombrado.");
            } catch (error) {
                console.error("Error al renombrar:", error);
                showToast("Error al renombrar el chat.");
            }
        }
    } else if (action === 'delete') {
        if (confirm("¿Estás seguro de que quieres eliminar este chat? Esta acción no se puede deshacer.")) {
            try {
                await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/conversations`, convoId));
                if (currentConversationId === convoId) {
                    startNewChat();
                }
                showToast("Chat eliminado.");
            } catch (error) {
                console.error("Error al eliminar:", error);
                showToast("Error al eliminar el chat.");
            }
        }
    }
}

function loadConversation(convoId) {
    if (!userId || !convoId) return;
    
    isTemporaryChat = false;
    currentConversationId = convoId;
    chatContext = [];
    
    // Limpiar y configurar el container
    if (chatHistory) chatHistory.innerHTML = '';
    if (welcomeScreen) welcomeScreen.classList.add('hidden');

    const convoRef = doc(db, `artifacts/${appId}/users/${userId}/conversations`, convoId);

    onSnapshot(convoRef, (docSnap) => {
        if (docSnap.exists()) {
            const conversationData = docSnap.data();
            if (chatTitle) chatTitle.textContent = conversationData.title || 'Chat';
            chatContext = conversationData.messages || [];
            
            // Render messages
            if (chatHistory) chatHistory.innerHTML = '';
            chatContext.forEach(message => {
                appendMessage(message.parts[0].text, message.role);
            });
        } else {
            console.error("Conversation does not exist.");
            showToast("Error: No se pudo cargar la conversación.");
            startNewChat();
        }
    });
}

function startNewChat(isTemporary = false) {
    currentConversationId = null;
    chatContext = [];
    
    // Limpiar y mostrar welcome
    if (chatHistory) chatHistory.innerHTML = '';
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    if (chatTitle) chatTitle.textContent = isTemporary ? 'Chat Temporal' : 'Jelo';
    
    isTemporaryChat = isTemporary;

    // Deseleccionar elementos activos del historial
    document.querySelectorAll('.history-item.active').forEach(el => el.classList.remove('active'));
    
    if (isTemporary) {
        showToast("Estás en un chat temporal. El historial no se guardará.");
    }
    
    // Cerrar sidebar en móvil
    if (window.innerWidth <= 768) {
        toggleSidebar();
    }
}

async function handleChat(promptOverride = null, isFileContext = false) {
    const provider = modelSelector ? modelSelector.value : 'gemini';
    const userPrompt = promptOverride || (chatInput ? chatInput.value.trim() : '');
    if (!userPrompt) return;

    setChatUIState(true);
    if (!isFileContext) appendMessage(userPrompt, 'user');
    const aiMessageBubble = appendMessage('', 'model');
    if (chatInput) {
        chatInput.disabled = isLoading;
        if (!isLoading) {
            chatInput.focus();
        }
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (statusIndicator) statusIndicator.textContent = `Analizando ${file.name}...`;
    let fileContent = "";

    try {
        if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            fileContent = result.value;
        } else if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);
            fileContent = JSON.stringify(json, null, 2);
        } else if (file.type === "text/plain") {
            fileContent = await file.text();
        } else {
            showToast("Formato de archivo no soportado.");
            return;
        }

        const prompt = `Aquí está el contenido de un archivo llamado "${file.name}". Por favor, resúmelo y dame los puntos más importantes:\n\n---\n\n${fileContent}`;
        appendMessage(`📁 Archivo subido: <strong>${file.name}</strong>`, 'user');
        handleChat(prompt, true);

    } catch (error) {
        console.error("Error procesando el archivo:", error);
        showToast("Error al leer el archivo.");
    } finally {
        if (statusIndicator) statusIndicator.textContent = '';
        if (fileUploadInput) fileUploadInput.value = '';
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // Botones de login
    if (loginButton) {
        loginButton.addEventListener('click', () => signInWithProvider('facebook'));
    }
    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', () => signInWithProvider('google'));
    }
    
    // Botones de navegación
    if (temporalChatButton) {
        temporalChatButton.addEventListener('click', () => startNewChat(true));
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', () => signOut(auth));
    }
    if (newChatButton) {
        newChatButton.addEventListener('click', () => startNewChat(false));
    }
    
    // Chat functionality
    if (sendChatButton) {
        sendChatButton.addEventListener('click', () => handleChat());
    }
    if (chatInput) {
        chatInput.addEventListener('keydown', e => { 
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                handleChat(); 
            } 
        });
    }
    
    // File upload
    if (fileUploadInput) {
        fileUploadInput.addEventListener('change', handleFileUpload);
    }
    
    // Sidebar mobile toggle
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleSidebar);
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', toggleSidebar);
    }
    
    // Modal de bienvenida - ARREGLADO
    if (closeWelcomeModal) {
        closeWelcomeModal.addEventListener('click', hideWelcomeModal);
        // Backup event listener
        closeWelcomeModal.onclick = hideWelcomeModal;
    }
    
    // Cerrar modal al hacer clic fuera
    if (welcomeModal) {
        welcomeModal.addEventListener('click', (e) => {
            if (e.target === welcomeModal) {
                hideWelcomeModal();
            }
        });
    }
    
    // Responsive sidebar
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && historySidebar) {
            historySidebar.classList.remove('open');
            if (sidebarBackdrop) sidebarBackdrop.classList.add('hidden');
        }
    });
    
    // Prevenir que el formulario se envíe
    document.addEventListener('submit', (e) => {
        e.preventDefault();
    });
    
    // Cerrar menús contextuales con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeContextMenu();
            hideWelcomeModal();
        }
    });
}

// Función para manejar errores globales
window.addEventListener('error', (e) => {
    console.error('Error global:', e.error);
    showToast('Ocurrió un error inesperado. Recarga la página si persiste.');
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Promise rejection:', e.reason);
    showToast('Error de conexión. Verifica tu internet.');
});

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar elementos DOM
    initializeDOMElements();
    
    // Configurar event listeners
    setupEventListeners();
    
    // Inicializar Firebase
    initializeFirebase();
    
    // Configurar animaciones iniciales
    if (loginScreen) {
        loginScreen.style.opacity = '0';
        loginScreen.style.transform = 'scale(0.95)';
        setTimeout(() => {
            loginScreen.style.transition = 'all 0.3s ease';
            loginScreen.style.opacity = '1';
            loginScreen.style.transform = 'scale(1)';
        }, 100);
    }
    
    // Configurar modal de bienvenida
    if (welcomeModal) {
        const modalContent = welcomeModal.querySelector('.bg-gray-800') || welcomeModal.querySelector('[class*="bg-gray-800"]');
        if (modalContent) {
            modalContent.style.transform = 'scale(0.95)';
            modalContent.style.opacity = '0';
            modalContent.style.transition = 'all 0.2s ease';
        }
    }
    
    console.log('🚀 Jelo iniciado correctamente con tema Liquid Glass');
});

// Funciones de utilidad adicionales
function addGlassEffect(element) {
    if (element) {
        element.style.backdropFilter = 'blur(20px)';
        element.style.webkitBackdropFilter = 'blur(20px)';
        element.style.background = 'rgba(255, 255, 255, 0.1)';
        element.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        element.style.borderRadius = '16px';
    }
}

function smoothScrollToBottom() {
    if (chatContainer) {
        const isScrolledToBottom = chatContainer.scrollHeight - chatContainer.clientHeight <= chatContainer.scrollTop + 1;
        if (isScrolledToBottom) {
            chatContainer.scrollTo({
                top: chatContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }
}

// Observer para detectar cuando se agregan nuevos mensajes
if (typeof MutationObserver !== 'undefined') {
    const chatObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                smoothScrollToBottom();
            }
        });
    });
    
    document.addEventListener('DOMContentLoaded', () => {
        if (chatHistory) {
            chatObserver.observe(chatHistory, {
                childList: true,
                subtree: true
            });
        }
    });
}

// Función para limpiar y resetear el estado
function resetAppState() {
    currentConversationId = null;
    chatContext = [];
    isTemporaryChat = false;
    
    if (chatHistory) chatHistory.innerHTML = '';
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    if (chatTitle) chatTitle.textContent = 'Jelo';
    
    document.querySelectorAll('.history-item.active').forEach(el => el.classList.remove('active'));
}

// Función para verificar conectividad
function checkConnection() {
    if (!navigator.onLine) {
        showToast('Sin conexión a internet. Algunas funciones pueden no estar disponibles.');
        return false;
    }
    return true;
}

// Event listeners para conectividad
window.addEventListener('online', () => {
    showToast('Conexión restaurada');
});

window.addEventListener('offline', () => {
    showToast('Sin conexión a internet');
});

// Funciones adicionales para mejorar la experiencia del usuario
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(() => {
            showToast('Texto copiado al portapapeles');
        }).catch(err => {
            console.error('Error al copiar:', err);
            fallbackCopyToClipboard(text);
        });
    } else {
        fallbackCopyToClipboard(text);
    }
}

function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showToast('Texto copiado al portapapeles');
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showToast('No se pudo copiar el texto');
    }
    
    document.body.removeChild(textArea);
}

// Función para formatear fechas
function formatDate(timestamp) {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short'
    });
}

// Función para buscar en el historial
function searchConversations(searchTerm) {
    if (!searchTerm.trim()) {
        loadConversationList();
        return;
    }
    
    const historyItems = document.querySelectorAll('.history-item');
    historyItems.forEach(item => {
        const title = item.querySelector('.history-item-title').textContent.toLowerCase();
        const matches = title.includes(searchTerm.toLowerCase());
        item.style.display = matches ? 'flex' : 'none';
    });
}

// Función para exportar conversación
async function exportConversation(format = 'txt') {
    if (!currentConversationId || chatContext.length === 0) {
        showToast('No hay conversación para exportar');
        return;
    }
    
    const title = chatTitle?.textContent || 'Conversacion';
    let content = '';
    
    if (format === 'txt') {
        content = `Conversación: ${title}\n`;
        content += `Fecha: ${new Date().toLocaleString()}\n`;
        content += '='.repeat(50) + '\n\n';
        
        chatContext.forEach(message => {
            const role = message.role === 'user' ? 'Usuario' : 'Jelo';
            content += `${role}:\n${message.parts[0].text}\n\n`;
        });
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
    } else if (format === 'json') {
        const exportData = {
            title,
            exportDate: new Date().toISOString(),
            messages: chatContext
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    showToast(`Conversación exportada como ${format.toUpperCase()}`);
}

// Función para configurar atajos de teclado
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + K para nuevo chat
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            startNewChat();
        }
        
        // Ctrl/Cmd + Shift + T para chat temporal
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
            e.preventDefault();
            startNewChat(true);
        }
        
        // Ctrl/Cmd + E para exportar
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            exportConversation('txt');
        }
        
        // Escape para cerrar modales y menús
        if (e.key === 'Escape') {
            closeContextMenu();
            hideWelcomeModal();
        }
    });
}

// Función para configurar PWA (Progressive Web App)
function setupPWA() {
    // Service Worker registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('SW registered: ', registration);
                })
                .catch(registrationError => {
                    console.log('SW registration failed: ', registrationError);
                });
        });
    }
    
    // Install prompt
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Mostrar botón de instalación si no existe
        const installButton = document.getElementById('install-button');
        if (installButton) {
            installButton.style.display = 'block';
            installButton.addEventListener('click', () => {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('PWA instalada');
                        showToast('Aplicación instalada correctamente');
                    }
                    deferredPrompt = null;
                });
            });
        }
    });
}

// Función de debug (solo en desarrollo)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.jeloDebug = {
        resetApp: resetAppState,
        showModal: showWelcomeModal,
        hideModal: hideWelcomeModal,
        toggleSidebar: toggleSidebar,
        exportChat: exportConversation,
        copyText: copyToClipboard,
        currentState: () => ({
            userId,
            currentConversationId,
            isTemporaryChat,
            chatContextLength: chatContext.length,
            isOnline: navigator.onLine
        }),
        testToast: (message) => showToast(message || 'Test notification'),
        clearStorage: () => {
            if (confirm('¿Limpiar todo el almacenamiento local?')) {
                localStorage.clear();
                sessionStorage.clear();
                showToast('Storage limpiado');
            }
        }
    };
    console.log('🔧 Modo debug activado. Usa window.jeloDebug para debugging.');
}

// Inicializar funciones adicionales
document.addEventListener('DOMContentLoaded', () => {
    setupKeyboardShortcuts();
    setupPWA();
    
    // Configurar tooltips o ayuda contextual
    const helpElements = document.querySelectorAll('[data-help]');
    helpElements.forEach(element => {
        element.addEventListener('mouseenter', (e) => {
            const helpText = e.target.dataset.help;
            if (helpText) {
                showToast(helpText, 2000);
            }
        });
    });
});

// Exportar funciones principales para uso externo si es necesario
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeFirebase,
        signInWithProvider,
        startNewChat,
        handleChat,
        showToast,
        showWelcomeModal,
        hideWelcomeModal,
        exportConversation,
        copyToClipboard,
        resetAppState
    };
} chatInput.value = '';

    try {
        // Crear nueva conversación si es necesario
        if (!currentConversationId && !isTemporaryChat) {
            const newConvoRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/conversations`), {
                title: userPrompt.substring(0, 30),
                timestamp: serverTimestamp(),
                messages: []
            });
            currentConversationId = newConvoRef.id;
            if (chatTitle) chatTitle.textContent = userPrompt.substring(0, 30);
        }
        
        const tempContext = [...chatContext, { role: "user", parts: [{ text: userPrompt }] }];
        let aiResponse = '';

        if (provider === 'gemini') {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
            const payload = { contents: tempContext.map(({role, parts}) => ({role, parts})) };
            const response = await fetch(apiUrl, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error?.message || 'Error en la API de Gemini');
            aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        } else if (provider === 'groq') {
            const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
            const payload = {
                model: 'llama-3.1-8b-instant',
                messages: tempContext.map(msg => ({
                    role: msg.role === 'model' ? 'assistant' : 'user',
                    content: msg.parts[0].text
                }))
            };
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error?.message || 'Error en la API de Groq');
            aiResponse = result.choices?.[0]?.message?.content;
        }

        if (aiResponse) {
            chatContext.push({ role: 'user', parts: [{ text: userPrompt }] });
            chatContext.push({ role: 'model', parts: [{ text: aiResponse }] });
            updateMessage(aiMessageBubble, aiResponse);
            
            // Guardar en Firebase si no es chat temporal
            if (!isTemporaryChat && currentConversationId) {
                const convoRef = doc(db, `artifacts/${appId}/users/${userId}/conversations`, currentConversationId);
                await setDoc(convoRef, { 
                    messages: chatContext, 
                    title: chatContext[0].parts[0].text.substring(0, 30), 
                    timestamp: serverTimestamp() 
                }, { merge: true });
            }
        } else {
            throw new Error("No se recibió una respuesta válida del proveedor.");
        }

    } catch (error) {
        console.error("Error en handleChat:", error);
        updateMessage(aiMessageBubble, `Lo siento, ocurrió un error: ${error.message}`);
        showToast(`Error: ${error.message}`);
    } finally {
        setChatUIState(false);
    }


function parseMarkdown(text) {
    let processedHtml = text;
    
    // Procesar bloques de archivo
    const fileBlockRegex = /```(excel|word|pptx)\n([\s\S]*?)\n```/g;
    processedHtml = processedHtml.replace(fileBlockRegex, (match, type, content) => {
        const fileTypes = { excel: 'Excel (.xlsx)', word: 'Word (.docx)', pptx: 'PowerPoint (.pptx)' };
        const uniqueId = `file-${Date.now()}-${Math.random()}`;
        return `
        <div id="${uniqueId}" class="file-download-container">
          <div class="file-download-header">
            <span class="file-download-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Archivo listo para descargar
            </span>
            <button class="file-download-btn" data-type="${type}">Descargar ${fileTypes[type]}</button>
          </div>
          <div class="file-data" style="display:none;">${content.trim()}</div>
        </div>`;
    });
    
    // Procesar bloques de código
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)\n```/g;
    processedHtml = processedHtml.replace(codeBlockRegex, (match, lang, code) => {
        if (match.includes('file-download-container')) return match;
        const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre><code class="language-${lang}">${escapedCode}</code></pre>`;
    });
    
    // Procesar formato inline
    const inline = (t) => t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                           .replace(/\*(.*?)\*/g, '<em>$1</em>')
                           .replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Procesar líneas
    const lines = processedHtml.split('\n');
    let inList = false;
    let finalHtml = '';
    
    for (const line of lines) {
        if (line.trim().startsWith('<div') || line.trim().startsWith('<pre>')) {
            if (inList) { finalHtml += '</ul>'; inList = false; }
            finalHtml += line;
            continue;
        }
        
        let processedLine = inline(line);
        if (processedLine.trim().startsWith('* ')) {
            if (!inList) { finalHtml += '<ul>'; inList = true; }
            finalHtml += `<li>${processedLine.trim().substring(2)}</li>`;
        } else {
            if (inList) { finalHtml += '</ul>'; inList = false; }
            if (processedLine.trim().startsWith('## ')) {
                finalHtml += `<h2>${processedLine.trim().substring(3)}</h2>`;
            } else if (processedLine.trim().startsWith('# ')) {
                finalHtml += `<h1>${processedLine.trim().substring(2)}</h1>`;
            } else if (processedLine.trim()) {
                finalHtml += `<p>${processedLine}</p>`;
            } else {
                finalHtml += '<br>';
            }
        }
    }
    if (inList) finalHtml += '</ul>';
    return finalHtml.replace(/<p><\/p>/g, '').replace(/<br><br>/g, '<br>');
}

function appendMessage(text, role) {
    if (!chatHistory) return null;
    
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    
    const bubble = document.createElement('div');
    bubble.classList.add('prose', 'max-w-lg');
    
    if (role === 'user') {
        bubble.classList.add('bg-gray-700');
    } else {
        bubble.classList.add('bg-gray-800');
        if (!text) {
            bubble.innerHTML = '<div class="gemini-loader"><div class="sparkle"></div><div class="arc"></div></div>';
        }
    }

    if (text) {
        bubble.innerHTML = parseMarkdown(text);
    }
    
    chatHistory.appendChild(bubble);
    
    // Scroll suave al final
    setTimeout(() => {
        if (chatContainer) {
            chatContainer.scrollTo({
                top: chatContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, 100);
    
    return bubble;
}

function updateMessage(bubble, text) {
    if (!bubble) return;
    
    bubble.innerHTML = parseMarkdown(text);
    
    // Agregar event listeners a botones de descarga
    bubble.querySelectorAll('.file-download-btn').forEach(button => {
        button.addEventListener('click', () => {
            const container = button.closest('.file-download-container');
            const dataContainer = container.querySelector('.file-data');
            const type = button.dataset.type;
            const content = dataContainer.textContent;

            try {
                if (type === 'excel') {
                    const jsonData = JSON.parse(content);
                    generateExcel(jsonData);
                } else if (type === 'word') {
                    generateWord(content);
                } else if (type === 'pptx') {
                    generatePptx(content);
                }
            } catch (error) {
                console.error(`Error processing data for ${type}:`, error);
                showToast(`Error al generar el archivo. Verifica que el formato sea correcto.`);
            }
        });
    });

    // Scroll al final
    setTimeout(() => {
        if (chatContainer) {
            chatContainer.scrollTo({
                top: chatContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, 100);
}

function setChatUIState(isLoading) {
    if (statusIndicator) {
        statusIndicator.textContent = isLoading ? 'Jelo está pensando...' : '';
    }
    
    if (sendChatButton) {
        sendChatButton.disabled = isLoading;
        if (isLoading) {
            sendChatButton.style.opacity = '0.5';
            sendChatButton.style.cursor = 'not-allowed';
        } else {
            sendChatButton.style.opacity = '1';
            sendChatButton.style.cursor = 'pointer';
        }
    }
    
    if (chatInput) {
    chatInput.disabled = isLoading;
    if (!isLoading) {
        chatInput.focus(); 
    }
    }
    }
    
