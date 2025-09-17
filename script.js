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
const GROQ_API_KEY = "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"; // <-- REEMPLAZA CON TU CLAVE DE GROQ
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-jenny-app';

let app, auth, db, userId;
let unsubscribeConversations = null;
let currentConversationId = null;
let chatContext = [];
let activeContextMenu = null;
let isTemporaryChat = false;

// --- Configuración de Firebase (NUEVO PROYECTO) ---
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
const loginButton = document.getElementById('login-button'); // Botón de Facebook
const googleLoginButton = document.getElementById('google-login-button'); // Botón de Google
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
const openCanvasBtn = document.getElementById('open-canvas-btn');
const canvasModal = document.getElementById('canvas-modal');
const closeCanvasBtn = document.getElementById('close-canvas-btn');
const drawCanvas = document.getElementById('draw-canvas');
const temporalChatButton = document.getElementById('temporal-chat-button');
const chatTitle = document.getElementById('chat-title');
const notificationToast = document.getElementById('notification-toast');
const modelSelector = document.getElementById('model-selector');

// =================================================================================
// INICIO DE LA LÓGICA PARA CREAR ARCHIVOS
// =================================================================================

function generateExcel(datos, fileName = "archivo.xlsx") {
    try {
        const ws = XLSX.utils.json_to_sheet(datos);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Hoja1");
        XLSX.writeFile(wb, fileName);
    } catch (error) {
        console.error("Error al generar Excel:", error);
        alert("Hubo un error al generar el archivo de Excel. Asegúrate de que los datos tengan el formato JSON correcto.");
    }
}

function generateWord(textContent, fileName = 'documento.docx') {
    try {
        const zip = new PizZip();
        let contentForDocx = textContent.split('\n').map(p => `<w:p><w:r><w:t>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t></w:r></w:p>`).join('');
        const template = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${contentForDocx}</w:body></w:document>`;
        zip.load(template);
        const blob = zip.generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        saveAs(blob, fileName);
    } catch (error) {
        console.error("Error al generar Word:", error);
        alert("Hubo un error al generar el archivo de Word.");
    }
}

function generatePptx(textContent, fileName = 'presentacion.pptx') {
    try {
        const pptx = new PptxGenJS();
        const slides = textContent.split('\n---\n');
        slides.forEach(slideContent => {
            const slide = pptx.addSlide();
            const lines = slideContent.trim().split('\n');
            const title = lines[0] || 'Diapositiva';
            const body = lines.slice(1);
            slide.addText(title, { x: 0.5, y: 0.25, fontSize: 32, bold: true, color: '363636' });
            if (body.length > 0) {
                slide.addText(body.join('\n'), { x: 0.5, y: 1.5, fontSize: 18, color: '363636', bullet: true });
            }
        });
        pptx.writeFile({ fileName });
    } catch (error) {
        console.error("Error al generar PowerPoint:", error);
        alert("Hubo un error al generar el archivo de PowerPoint.");
    }
}

// =================================================================================
// FIN DE LA LÓGICA PARA CREAR ARCHIVOS
// =================================================================================


// --- Funciones Principales ---

function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        onAuthStateChanged(auth, user => {
            if (user) {
                const isNewUser = user.metadata.creationTime === user.metadata.lastSignInTime;
                if (isNewUser && !localStorage.getItem('hasSeenWelcome')) {
                    welcomeModal.classList.remove('hidden');
                    localStorage.setItem('hasSeenWelcome', 'true');
                }
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
        loginButton.disabled = true;
    }
}

async function signInWithFacebook() {
    if (!auth) {
        loginError.textContent = "Firebase no está listo. Intenta de nuevo en un momento.";
        return;
    }
    loginButton.disabled = true;
    loginError.textContent = "";

    const provider = new FacebookAuthProvider();
    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Error al iniciar sesión con Facebook:", error);
        if (error.code === 'auth/account-exists-with-different-credential') {
            loginError.textContent = "Ya existe una cuenta con este email. Intenta iniciar sesión con otro método.";
        } else {
            loginError.textContent = "Error al iniciar sesión. Inténtalo de nuevo.";
        }
    } finally {
        loginButton.disabled = false;
    }
}

async function signInWithGoogle() {
    if (!auth) {
        loginError.textContent = "Firebase no está listo. Intenta de nuevo en un momento.";
        return;
    }
    googleLoginButton.disabled = true;
    document.getElementById('google-login-button-text').textContent = "Conectando...";
    loginError.textContent = "";

    const provider = new GoogleAuthProvider();
    try {
        await setPersistence(auth, browserLocalPersistence);
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Error al iniciar sesión con Google:", error);
        loginError.textContent = "Error al iniciar sesión. Inténtalo de nuevo.";
    } finally {
        googleLoginButton.disabled = false;
        document.getElementById('google-login-button-text').textContent = "Iniciar Sesión con Google";
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

            if (doc.id === currentConversationId) {
                li.classList.add('active');
            }
        });
    });
}

function createHistoryItem(id, title) {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.dataset.id = id;
    const titleSpan = document.createElement('span');
    titleSpan.className = 'history-item-title';
    titleSpan.textContent = title;
    li.appendChild(titleSpan);
    const menuBtn = document.createElement('button');
    menuBtn.className = 'history-item-menu-btn';
    menuBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>`;
    li.appendChild(menuBtn);
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.innerHTML = `<button data-action="rename">Cambiar nombre</button><button data-action="delete">Eliminar</button>`;
    li.appendChild(contextMenu);
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeContextMenu && activeContextMenu !== contextMenu) {
            activeContextMenu.style.display = 'none';
        }
        contextMenu.style.display = contextMenu.style.display === 'block' ? 'none' : 'block';
        activeContextMenu = contextMenu.style.display === 'block' ? contextMenu : null;
    });
    contextMenu.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => handleContextMenuAction(e, btn.dataset.action, id, title));
    });
    li.onclick = () => {
        if (activeContextMenu) {
            activeContextMenu.style.display = 'none';
            activeContextMenu = null;
        }
        document.querySelectorAll('.history-item').forEach(item => item.classList.remove('active'));
        li.classList.add('active');
        loadConversation(id);
        historySidebar.classList.add('-translate-x-full');
        sidebarBackdrop.classList.add('hidden');
    };
    return li;
}

async function handleContextMenuAction(e, action, convoId, currentTitle) {
    e.stopPropagation();
    const contextMenu = e.target.closest('.context-menu');
    if (contextMenu) contextMenu.style.display = 'none';
    activeContextMenu = null;
    const convoDocRef = doc(db, `artifacts/${appId}/users/${userId}/conversations/${convoId}`);
    if (action === 'delete') {
        if (confirm('¿Seguro que quieres eliminar este chat?')) {
            await deleteDoc(convoDocRef);
            if (currentConversationId === convoId) {
                startNewChat();
            }
        }
    } else if (action === 'rename') {
        const newTitle = prompt('Nuevo nombre para el chat:', currentTitle);
        if (newTitle && newTitle.trim() !== '') {
            await setDoc(convoDocRef, { title: newTitle.trim() }, { merge: true });
        }
    }
}

function loadConversation(convoId) {
    isTemporaryChat = false;
    currentConversationId = convoId;
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.toggle('active', item.dataset.id === convoId);
    });
    const convoDocRef = doc(db, `artifacts/${appId}/users/${userId}/conversations/${convoId}`);
    onSnapshot(convoDocRef, (doc) => {
        chatHistory.innerHTML = '';
        if (doc.exists()) {
            const convoData = doc.data();
            chatTitle.textContent = convoData.title || 'Jelo';
            chatContext = convoData.messages || [];
            if (chatContext.length > 0) {
                welcomeScreen.classList.add('hidden');
                chatContext.forEach(msg => appendMessage(msg.parts[0].text, msg.role, msg.isImage || false, false));
            } else {
                welcomeScreen.classList.remove('hidden');
            }
        }
    });
}

function startNewChat() {
    isTemporaryChat = false;
    currentConversationId = null;
    chatContext = [];
    chatHistory.innerHTML = '';
    welcomeScreen.classList.remove('hidden');
    document.querySelectorAll('.history-item').forEach(item => item.classList.remove('active'));
    chatTitle.textContent = 'Jelo';
}

function startTemporaryChat() {
    isTemporaryChat = true;
    currentConversationId = null;
    chatContext = [];
    chatHistory.innerHTML = '';
    welcomeScreen.classList.remove('hidden');
    document.querySelectorAll('.history-item').forEach(item => item.classList.remove('active'));
    chatTitle.textContent = 'Chat Temporal';
    showToast('Iniciando chat temporal...');
    historySidebar.classList.add('-translate-x-full');
    sidebarBackdrop.classList.add('hidden');
}

async function handleChat(promptOverride = null, isFileContext = false, provider = 'gemini') {
    const userPrompt = promptOverride || chatInput.value.trim();
    if (!userPrompt) return;
    setChatUIState(true);
    if (!isFileContext) {
        appendMessage(userPrompt, 'user');
    }
    const aiMessageBubble = appendMessage('', 'model', false, false);
    chatInput.value = '';

    try {
        if (!currentConversationId && !isTemporaryChat) {
            const convosRef = collection(db, `artifacts/${appId}/users/${userId}/conversations`);
            const newConvoDoc = await addDoc(convosRef, {
                title: userPrompt.substring(0, 30),
                timestamp: serverTimestamp(),
                messages: []
            });
            currentConversationId = newConvoDoc.id;
        }
        
        let aiResponse = '';
        const currentTurn = { role: "user", parts: [{ text: userPrompt }] };
        const tempContext = [...chatContext, currentTurn]; // Use a temporary context for the API call

        if (provider === 'gemini') {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
            const payload = { contents: tempContext.map(({role, parts}) => ({role, parts})) };
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error.message || 'Error en la API de Gemini');
            }
            const result = await response.json();
            aiResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

        } else if (provider === 'groq') {
            const apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
            const groqMessages = tempContext.map(msg => ({
                role: msg.role === 'model' ? 'assistant' : 'user',
                content: msg.parts[0].text
            }));
            const payload = {
                model: 'llama3-8b-8192',
                messages: groqMessages
            };
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Error en la API de Groq');
            }
            const result = await response.json();
            aiResponse = result.choices?.[0]?.message?.content;
        }

        if (aiResponse) {
            // Update the persistent chatContext after a successful response
            chatContext.push(currentTurn);
            chatContext.push({ role: 'model', parts: [{ text: aiResponse }] });
            updateMessage(aiMessageBubble, aiResponse, 'model');
        } else {
            updateMessage(aiMessageBubble, "No se recibió una respuesta válida del proveedor.", 'model');
        }

    } catch (error) {
        updateMessage(aiMessageBubble, `Lo siento, ocurrió un error: ${error.message}`, 'model');
    } finally {
        setChatUIState(false);
    }
}

function parseMarkdown(text) {
    let processedHtml = text;
    const fileBlockRegex = /```(excel|word|pptx)\n([\s\S]*?)\n```/g;
    processedHtml = processedHtml.replace(fileBlockRegex, (match, type, content) => {
        const fileTypes = { excel: 'Excel (.xlsx)', word: 'Word (.docx)', pptx: 'PowerPoint (.pptx)' };
        const uniqueId = `file-${Date.now()}-${Math.random()}`;
        return `
        <div id="${uniqueId}" class="file-download-container prose max-w-lg">
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
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)\n```/g;
    processedHtml = processedHtml.replace(codeBlockRegex, (match, lang, code) => {
        if (match.includes('file-download-container')) return match;
        const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre><code class="language-${lang}">${escapedCode}</code></pre>`;
    });
    const inline = (t) => t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const lines = processedHtml.split('\n');
    let inList = false;
    let finalHtml = '';
    for (const line of lines) {
        if (line.trim().startsWith('<div') || line.trim().startsWith('<pre>')) {
            if (inList) { finalHtml += '</ul>'; inList = false; }
            finalHtml += line;
        } else {
            let processedLine = inline(line);
            if (processedLine.startsWith('* ')) {
                if (!inList) { finalHtml += '<ul>'; inList = true; }
                finalHtml += `<li>${processedLine.substring(2)}</li>`;
            } else {
                if (inList) { finalHtml += '</ul>'; inList = false; }
                if (processedLine.startsWith('## ')) {
                    finalHtml += `<h2>${processedLine.substring(3)}</h2>`;
                } else if (processedLine.startsWith('# ')) {
                    finalHtml += `<h1>${processedLine.substring(2)}</h1>`;
                } else if (processedLine.trim()) {
                    finalHtml += `<p>${processedLine}</p>`;
                }
            }
        }
    }
    if (inList) finalHtml += '</ul>';
    return finalHtml.replace(/<p><\/p>/g, '');
}

function appendMessage(text, role, isImage = false) {
    welcomeScreen.classList.add('hidden');
    const messageWrapper = document.createElement('div');
    messageWrapper.className = `flex items-start gap-3 ${role === 'user' ? 'justify-end' : 'justify-start'}`;
    const messageBubble = document.createElement('div');
    if (role === 'model') {
        const avatar = document.createElement('div');
        avatar.className = 'w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0';
        avatar.innerHTML = `<svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.75L13.2625 8.2375L18.75 9.5L13.2625 10.7625L12 16.25L10.7375 10.7625L5.25 9.5L10.7375 8.2375L12 2.75Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        messageWrapper.appendChild(avatar);
    }
    messageBubble.className = `prose max-w-lg p-3 rounded-xl ${role === 'user' ? 'bg-gray-700 text-white' : 'bg-gray-800'}`;
    if (isImage) {
        const img = document.createElement('img');
        img.src = text;
        img.className = 'rounded-md max-w-xs';
        messageBubble.innerHTML = '';
        messageBubble.appendChild(img);
        messageBubble.classList.add('p-1');
    } else if (role === 'model' && !text) {
        messageBubble.innerHTML = `<div class="gemini-loader"><div class="arc"></div><div class="sparkle"></div></div>`;
    } else {
        if (role === 'model') {
            messageBubble.innerHTML = parseMarkdown(text);
        } else {
            messageBubble.textContent = text;
        }
    }
    messageWrapper.appendChild(messageBubble);
    chatHistory.appendChild(messageWrapper);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return messageBubble;
}

function updateMessage(bubble, text, role, isImage = false) {
    setTimeout(() => {
        if (isImage) {
            const img = document.createElement('img');
            img.src = text;
            img.className = 'rounded-md max-w-xs';
            bubble.innerHTML = '';
            bubble.appendChild(img);
            bubble.classList.add('p-1');
        } else {
            bubble.innerHTML = parseMarkdown(text);
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Save the full conversation turn to Firestore
        if (currentConversationId && !isTemporaryChat) {
            const convoDocRef = doc(db, `artifacts/${appId}/users/${userId}/conversations/${currentConversationId}`);
            setDoc(convoDocRef, { messages: chatContext }, { merge: true });
        }
    }, 800);
}

function setChatUIState(isLoading) {
    chatInput.disabled = isLoading;
    sendChatButton.disabled = isLoading;
    statusIndicator.textContent = isLoading ? 'Procesando...' : '';
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    appendMessage(`Archivo subido: <strong>${file.name}</strong>`, 'user');
    const extension = file.name.split('.').pop().toLowerCase();
    try {
        let fileContent = '';
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(extension)) {
            appendMessage(`Lo siento, el análisis de imágenes aún no está implementado con los nuevos proveedores de IA.`, 'model');
            return;
        } else if (extension === 'docx') {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            fileContent = result.value;
        } else if (['xlsx', 'xls'].includes(extension)) {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            fileContent = XLSX.utils.sheet_to_csv(worksheet);
        } else if (['txt', 'md', 'csv', 'js', 'py', 'html', 'css', 'json'].includes(extension)) {
            fileContent = await file.text();
        } else {
            appendMessage(`Lo siento, no puedo leer archivos .${extension}.`, 'model');
            return;
        }

        if(!fileContent) {
            throw new Error("No se pudo extraer contenido del archivo.");
        }

        const prompt = `Analiza el siguiente contenido del archivo "${file.name}" y dame un resumen o los puntos clave:\n\n---\n\n${fileContent}`;
        const selectedProvider = modelSelector.value;
        await handleChat(prompt, true, selectedProvider);
    } catch (error) {
        console.error(`Error procesando archivo ${file.name}:`, error);
        appendMessage(`Error procesando archivo ${file.name}: ${error.message}`, 'model');
    } finally {
        fileUploadInput.value = '';
    }
}

// --- Event Listeners ---
loginButton.addEventListener('click', signInWithFacebook);
googleLoginButton.addEventListener('click', signInWithGoogle);
temporalChatButton.addEventListener('click', startTemporaryChat);
logoutButton.addEventListener('click', () => signOut(auth));
newChatButton.addEventListener('click', startNewChat);

sendChatButton.addEventListener('click', () => {
    const selectedProvider = modelSelector.value;
    handleChat(null, false, selectedProvider);
});
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const selectedProvider = modelSelector.value;
        handleChat(null, false, selectedProvider);
    }
});

menuToggle.addEventListener('click', () => {
    historySidebar.classList.remove('-translate-x-full');
    sidebarBackdrop.classList.remove('hidden');
});
sidebarBackdrop.addEventListener('click', () => {
    historySidebar.classList.add('-translate-x-full');
    sidebarBackdrop.classList.add('hidden');
});
fileUploadInput.addEventListener('change', handleFileUpload);
closeWelcomeModal.addEventListener('click', () => welcomeModal.classList.add('hidden'));
openCanvasBtn.addEventListener('click', () => canvasModal.classList.remove('hidden'));
closeCanvasBtn.addEventListener('click', () => canvasModal.classList.add('hidden'));

// --- Listener de eventos actualizado para manejar la descarga ---
chatHistory.addEventListener('click', function (e) {
    if (e.target && e.target.classList.contains('file-download-btn')) {
        const container = e.target.closest('.file-download-container');
        const dataElement = container.querySelector('.file-data');
        const fileType = e.target.dataset.type;
        const fileContent = dataElement.textContent;

        if (fileType === 'excel') {
            try {
                const jsonData = JSON.parse(fileContent);
                generateExcel(jsonData, 'reporte.xlsx');
            } catch (error) {
                console.error("Error: El contenido para Excel no es un JSON válido.", error);
                alert("El contenido para Excel no es un JSON válido. Revisa los datos proporcionados por el asistente.");
            }
        } else if (fileType === 'word') {
            generateWord(fileContent, 'documento.docx');
        } else if (fileType === 'pptx') {
            generatePptx(fileContent, 'presentacion.pptx');
        }
    }
});


// --- Inicialización ---
initializeFirebase();