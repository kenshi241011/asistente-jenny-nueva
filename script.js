import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, serverTimestamp, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Funciones de UI ---
function showToast(message, duration = 2000) {
    notificationToast.textContent = message;
    notificationToast.classList.remove('opacity-0');
    setTimeout(() => {
        notificationToast.classList.add('opacity-0');
    }, duration);
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
const modelSelector = document.getElementById('model-selector');

// =================================================================================
// LÓGICA PARA CREAR ARCHIVOS
// =================================================================================
// (Las funciones generateExcel, generateWord, generatePptx se mantienen igual)
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
    const button = providerType === 'google' ? googleLoginButton : loginButton;
    const textElement = document.getElementById('google-login-button-text');
    let provider = providerType === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider();
    button.disabled = true;
    if (providerType === 'google' && textElement) textElement.textContent = "Conectando...";
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
        button.disabled = false;
        if (providerType === 'google' && textElement) textElement.textContent = "Iniciar Sesión con Google";
    }
}

function loadConversationList() {
    // ... (Esta función se mantiene igual)
}

function createHistoryItem(id, title) {
    // ... (Esta función se mantiene igual)
}

async function handleContextMenuAction(e, action, convoId, currentTitle) {
    // ... (Esta función se mantiene igual)
}

function loadConversation(convoId) {
    // ... (Esta función se mantiene igual)
}

function startNewChat(isTemporary = false) {
    // ... (Esta función se mantiene igual)
}

async function handleChat(promptOverride = null, isFileContext = false) {
    const provider = modelSelector.value;
    const userPrompt = promptOverride || chatInput.value.trim();
    if (!userPrompt) return;

    setChatUIState(true);
    if (!isFileContext) appendMessage(userPrompt, 'user', true);
    const aiMessageBubble = appendMessage('', 'model');
    chatInput.value = '';

    try {
        if (!currentConversationId && !isTemporaryChat) {
            const newConvoRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/conversations`), {
                title: userPrompt.substring(0, 30),
                timestamp: serverTimestamp(),
                messages: [] // Inicia vacío, se actualizará después
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
                model: 'llama-3.1-8b-instant', // MODELO CORREGIDO
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
            chatContext.push({ role: 'user', parts: [{ text: userPrompt }] }); // Guarda el prompt del usuario
            chatContext.push({ role: 'model', parts: [{ text: aiResponse }] }); // Guarda la respuesta de la IA
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
    // FUNCIÓN COMPLETA Y CORREGIDA
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
            }
        }
    }
    if (inList) finalHtml += '</ul>';
    return finalHtml.replace(/<p><\/p>/g, '');
}

function appendMessage(text, role, shouldSave = false) {
    // ... (Esta función se mantiene igual)
}

function updateMessage(bubble, text) {
    // ... (Esta función se mantiene igual)
}

function setChatUIState(isLoading) {
    // ... (Esta función se mantiene igual)
}

async function handleFileUpload(event) {
    // ... (Esta función se mantiene igual)
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