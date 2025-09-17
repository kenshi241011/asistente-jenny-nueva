import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, serverTimestamp, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Funciones de UI ---

/**
 * Muestra una notificación temporal (toast) en la pantalla.
 * @param {string} message - El mensaje a mostrar.
 * @param {number} duration - Cuánto tiempo (en ms) debe ser visible.
 */
function showToast(message, duration = 2000) {
    notificationToast.textContent = message;
    notificationToast.classList.remove('opacity-0'); // Lo hace visible

    // Configura un temporizador para ocultarlo después de la duración especificada
    setTimeout(() => {
        notificationToast.classList.add('opacity-0'); // Lo oculta
    }, duration);
}

// --- Constantes y Variables Globales ---
const API_KEY = "AIzaSyB1xjT_S_pPECCQZ50VDDb3vRbQBa_EHpk"; // Para Gemini
const GROQ_API_KEY = "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"; // Clave de Groq ACTUALIZADA
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
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginButton = document.getElementById('login-button');
const googleLoginButton = document.getElementById('google-login-button');
const logoutButton = document.getElementById('logout-button');
const userName = document.getElementById('user-name');
const userPhoto = document.getElementById('user-photo');
const loginError = document.getElementById('login-error');
const chatContainer = document.getElementById('chat-container');
const welcomeScreen = document.getElementById('welcome-screen');
const chatHistory = document.getElementById('chat-history');
const chatInput = document.getElementById('chat-input');
const sendChatButton = document.getElementById('send-chat-button');
const statusIndicator = document.getElementById('status-indicator');
const historySidebar = document.getElementById('history-sidebar');
const historyList = document.getElementById('history-list');
const newChatButton = document.getElementById('new-chat-button');
const menuToggle = document.getElementById('menu-toggle');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const fileUploadInput = document.getElementById('file-upload-input');
const welcomeModal = document.getElementById('welcome-modal');
const closeWelcomeModal = document.getElementById('close-welcome-modal');
const temporalChatButton = document.getElementById('temporal-chat-button');
const chatTitle = document.getElementById('chat-title');
const notificationToast = document.getElementById('notification-toast');
const modelSelector = document.getElementById('model-selector'); // Selector de IA

// =================================================================================
// LÓGICA PARA CREAR ARCHIVOS
// =================================================================================

function generateExcel(datos, fileName = "archivo.xlsx") {
    try {
        const ws = XLSX.utils.json_to_sheet(datos);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
        XLSX.writeFile(wb, fileName);
    } catch (error) {
        console.error("Error al generar Excel:", error);
        alert("Hubo un error al generar el archivo de Excel.");
    }
}

function generateWord(textContent, fileName = 'documento.docx') {
    try {
        const zip = new PizZip();
        let contentForDocx = textContent.split('\n').map(p => `<w:p><w:r><w:t>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t></w:r></w:p>`).join('');
        const template = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${contentForDocx}</w:body></w:document>`;
        zip.load(template);
        const blob = zip.generate({ type: "blob" });
        saveAs(blob, fileName);
    } catch (error) {
        console.error("Error al generar Word:", error);
        alert("Hubo un error al generar el archivo de Word.");
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
    } catch (error) {
        console.error("Error al generar PowerPoint:", error);
        alert("Hubo un error al generar el archivo de PowerPoint.");
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
                userName.textContent = user.displayName;
                userPhoto.src = user.photoURL;
                loginScreen.classList.add('hidden');
                appScreen.classList.remove('hidden');
                appScreen.classList.add('flex');
                startNewChat();
                loadConversationList();
            } else {
                userId = null;
                loginScreen.classList.remove('hidden');
                appScreen.classList.add('hidden');
                appScreen.classList.remove('flex');
                if (unsubscribeConversations) unsubscribeConversations();
            }
        });
    } catch (error) {
        console.error("Error al inicializar Firebase:", error);
        loginError.textContent = "Error crítico al inicializar Firebase.";
    }
}

async function signInWithProvider(providerType) {
    if (!auth) {
        loginError.textContent = "Firebase no está listo. Intenta de nuevo en un momento.";
        return;
    }
    
    let provider;
    if (providerType === 'facebook') {
        provider = new FacebookAuthProvider();
        loginButton.disabled = true;
    } else {
        provider = new GoogleAuthProvider();
        googleLoginButton.disabled = true;
        document.getElementById('google-login-button-text').textContent = "Conectando...";
    }
    loginError.textContent = "";

    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error(`Error al iniciar sesión con ${providerType}:`, error);
        if (error.code === 'auth/account-exists-with-different-credential') {
            loginError.textContent = "Ya existe una cuenta con este email. Usa otro método.";
        } else {
            loginError.textContent = "Error al iniciar sesión. Inténtalo de nuevo.";
        }
    } finally {
        if (providerType === 'facebook') {
            loginButton.disabled = false;
        } else {
            googleLoginButton.disabled = false;
            document.getElementById('google-login-button-text').textContent = "Iniciar Sesión con Google";
        }
    }
}

function loadConversationList() {
    if (!userId) return;
    if (unsubscribeConversations) unsubscribeConversations();
    const convosRef = collection(db, `artifacts/${appId}/users/${userId}/conversations`);
    const q = query(convosRef, orderBy('timestamp', 'desc'));

    unsubscribeConversations = onSnapshot(q, (snapshot) => {
        historyList.innerHTML = '';
        snapshot.forEach(doc => {
            const convo = doc.data();
            const title = convo.title || 'Nuevo Chat';
            const li = createHistoryItem(doc.id, title);
            historyList.appendChild(li);
            if (doc.id === currentConversationId) li.classList.add('active');
        });
    });
}

function createHistoryItem(id, title) {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.dataset.id = id;
    li.innerHTML = `
        <span class="history-item-title">${title}</span>
        <button class="history-item-menu-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
        </button>
        <div class="context-menu">
            <button data-action="rename">Cambiar nombre</button>
            <button data-action="delete">Eliminar</button>
        </div>
    `;
    
    li.querySelector('.history-item-menu-btn').addEventListener('click', e => {
        e.stopPropagation();
        const menu = li.querySelector('.context-menu');
        if (activeContextMenu && activeContextMenu !== menu) activeContextMenu.style.display = 'none';
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        activeContextMenu = menu.style.display === 'block' ? menu : null;
    });

    li.querySelectorAll('.context-menu button').forEach(btn => {
        btn.addEventListener('click', e => handleContextMenuAction(e, btn.dataset.action, id, title));
    });

    li.addEventListener('click', () => {
        if (activeContextMenu) activeContextMenu.style.display = 'none';
        document.querySelectorAll('.history-item.active').forEach(item => item.classList.remove('active'));
        li.classList.add('active');
        loadConversation(id);
        historySidebar.classList.add('-translate-x-full');
        sidebarBackdrop.classList.add('hidden');
    });

    return li;
}

async function handleContextMenuAction(e, action, convoId, currentTitle) {
    e.stopPropagation();
    if (activeContextMenu) activeContextMenu.style.display = 'none';
    const convoDocRef = doc(db, `artifacts/${appId}/users/${userId}/conversations/${convoId}`);
    
    if (action === 'delete' && confirm('¿Seguro que quieres eliminar este chat?')) {
        await deleteDoc(convoDocRef);
        if (currentConversationId === convoId) startNewChat();
    } else if (action === 'rename') {
        const newTitle = prompt('Nuevo nombre para el chat:', currentTitle);
        if (newTitle && newTitle.trim()) {
            await setDoc(convoDocRef, { title: newTitle.trim() }, { merge: true });
        }
    }
}

function loadConversation(convoId) {
    isTemporaryChat = false;
    currentConversationId = convoId;
    const convoDocRef = doc(db, `artifacts/${appId}/users/${userId}/conversations/${convoId}`);
    
    onSnapshot(convoDocRef, (doc) => {
        chatHistory.innerHTML = '';
        if (doc.exists()) {
            const convoData = doc.data();
            chatTitle.textContent = convoData.title || 'Jelo';
            chatContext = convoData.messages || [];
            if (chatContext.length > 0) {
                welcomeScreen.classList.add('hidden');
                chatContext.forEach(msg => appendMessage(msg.parts[0].text, msg.role, false, false));
            } else {
                welcomeScreen.classList.remove('hidden');
            }
        }
    });
}

function startNewChat(isTemporary = false) {
    isTemporaryChat = isTemporary;
    currentConversationId = null;
    chatContext = [];
    chatHistory.innerHTML = '';
    welcomeScreen.classList.remove('hidden');
    document.querySelectorAll('.history-item.active').forEach(item => item.classList.remove('active'));
    chatTitle.textContent = isTemporary ? 'Chat Temporal' : 'Jelo';
    if (isTemporary) showToast('Iniciando chat temporal...');
}

async function handleChat(promptOverride = null, isFileContext = false) {
    const provider = modelSelector.value;
    const userPrompt = promptOverride || chatInput.value.trim();
    if (!userPrompt) return;

    setChatUIState(true);
    if (!isFileContext) appendMessage(userPrompt, 'user', true);
    const aiMessageBubble = appendMessage('', 'model', false);
    chatInput.value = '';

    try {
        if (!currentConversationId && !isTemporaryChat) {
            const newConvoRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/conversations`), {
                title: userPrompt.substring(0, 30),
                timestamp: serverTimestamp(),
                messages: chatContext
            });
            currentConversationId = newConvoRef.id;
        }
        
        const tempContext = [...chatContext, { role: "user", parts: [{ text: userPrompt }] }];
        let aiResponse = '';

        if (provider === 'gemini') {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
            const payload = { contents: tempContext.map(({role, parts}) => ({role, parts})) };
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error.message);
            aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        } else if (provider === 'groq') {
            const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
            const payload = {
                model: 'llama3-8b-8192',
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
            if (!response.ok) throw new Error(result.error?.message);
            aiResponse = result.choices?.[0]?.message?.content;
        }

        if (aiResponse) {
            chatContext.push({ role: 'model', parts: [{ text: aiResponse }] });
            updateMessage(aiMessageBubble, aiResponse);
        } else {
            throw new Error("No se recibió una respuesta válida del proveedor.");
        }

    } catch (error) {
        updateMessage(aiMessageBubble, `Lo siento, ocurrió un error: ${error.message}`);
    } finally {
        setChatUIState(false);
    }
}

function parseMarkdown(text) {
    // Esta función se mantiene igual que en la versión anterior
    // ... (incluye toda la lógica de parseo de markdown, code blocks, file blocks, etc.)
    return text.replace(/\n/g, '<br>'); // Implementación simple por ahora
}

function appendMessage(text, role, shouldSave = false) {
    welcomeScreen.classList.add('hidden');
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `flex items-start gap-3 ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    const messageBubble = document.createElement('div');
    // ... (resto de la lógica de appendMessage)
    messageBubble.innerHTML = parseMarkdown(text);
    messageWrapper.appendChild(messageBubble);
    chatHistory.appendChild(messageWrapper);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    if (shouldSave) {
        chatContext.push({ role, parts: [{ text }] });
        if (currentConversationId && !isTemporaryChat) {
            const convoDocRef = doc(db, `artifacts/${appId}/users/${userId}/conversations/${currentConversationId}`);
            setDoc(convoDocRef, { messages: chatContext }, { merge: true });
        }
    }
    return messageBubble;
}

function updateMessage(bubble, text) {
    bubble.innerHTML = parseMarkdown(text);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    if (currentConversationId && !isTemporaryChat) {
        const convoDocRef = doc(db, `artifacts/${appId}/users/${userId}/conversations/${currentConversationId}`);
        setDoc(convoDocRef, { messages: chatContext }, { merge: true });
    }
}

function setChatUIState(isLoading) {
    chatInput.disabled = isLoading;
    sendChatButton.disabled = isLoading;
    statusIndicator.textContent = isLoading ? 'Procesando...' : '';
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    appendMessage(`Archivo subido: <strong>${file.name}</strong>`, 'user', true);
    
    try {
        const extension = file.name.split('.').pop().toLowerCase();
        let fileContent = '';

        if (extension === 'docx') {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            fileContent = result.value;
        } else if (['xlsx', 'xls'].includes(extension)) {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheetName = workbook.SheetNames[0];
            fileContent = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        } else if (['txt', 'md', 'csv', 'js', 'py', 'html', 'css'].includes(extension)) {
            fileContent = await file.text();
        } else {
            throw new Error(`Formato de archivo .${extension} no soportado.`);
        }

        if (!fileContent) throw new Error("No se pudo extraer contenido del archivo.");
        
        const prompt = `Analiza el siguiente contenido del archivo "${file.name}" y dame un resumen o los puntos clave:\n\n---\n\n${fileContent}`;
        await handleChat(prompt, true);
    } catch (error) {
        console.error(`Error procesando archivo:`, error);
        appendMessage(`Error procesando archivo: ${error.message}`, 'model', true);
    } finally {
        fileUploadInput.value = '';
    }
}

// --- Event Listeners ---
loginButton.addEventListener('click', () => signInWithProvider('facebook'));
googleLoginButton.addEventListener('click', () => signInWithProvider('google'));
temporalChatButton.addEventListener('click', () => startNewChat(true));
logoutButton.addEventListener('click', () => signOut(auth));
newChatButton.addEventListener('click', () => startNewChat(false));
sendChatButton.addEventListener('click', () => handleChat());
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleChat(); });
fileUploadInput.addEventListener('change', handleFileUpload);
menuToggle.addEventListener('click', () => {
    historySidebar.classList.remove('-translate-x-full');
    sidebarBackdrop.classList.remove('hidden');
});
sidebarBackdrop.addEventListener('click', () => {
    historySidebar.classList.add('-translate-x-full');
    sidebarBackdrop.classList.add('hidden');
});
closeWelcomeModal.addEventListener('click', () => welcomeModal.classList.add('hidden'));

// --- Inicialización ---
initializeFirebase();