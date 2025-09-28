import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, addDoc, serverTimestamp, query, orderBy, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Funciones de UI ---
function showToast(message, duration = 3000) {
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
        const zip = new PizZip(textContent);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });
        doc.render(); // No data object needed if template is self-contained
        const blob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
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
    if (unsubscribeConversations) unsubscribeConversations();
    if (!userId) return;

    const conversationsRef = collection(db, `artifacts/${appId}/users/${userId}/conversations`);
    const q = query(conversationsRef, orderBy('timestamp', 'desc'));

    unsubscribeConversations = onSnapshot(q, (snapshot) => {
        historyList.innerHTML = ''; // Limpia la lista actual
        if (snapshot.empty) {
            historyList.innerHTML = '<p class="text-gray-500 text-sm p-2">No hay chats guardados.</p>';
            return;
        }
        snapshot.forEach(doc => {
            const convo = doc.data();
            const historyItem = createHistoryItem(doc.id, convo.title);
            historyList.appendChild(historyItem);
        });
    }, (error) => {
        console.error("Error al cargar el historial:", error);
        historyList.innerHTML = '<p class="text-red-400 text-sm p-2">Error al cargar historial.</p>';
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

    // Event listener to load conversation on click
    item.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        document.querySelectorAll('.history-item.active').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        loadConversation(id);
    });

    return item;
}

async function handleContextMenuAction(e, action, convoId, currentTitle) {
    e.stopPropagation();
    if (activeContextMenu) activeContextMenu.remove();

    if (action === 'rename') {
        const newTitle = prompt("Ingresa el nuevo título para el chat:", currentTitle);
        if (newTitle && newTitle.trim() !== "") {
            const convoRef = doc(db, `artifacts/${appId}/users/${userId}/conversations`, convoId);
            await updateDoc(convoRef, { title: newTitle.trim() });
            showToast("Chat renombrado.");
        }
    } else if (action === 'delete') {
        if (confirm("¿Estás seguro de que quieres eliminar este chat? Esta acción no se puede deshacer.")) {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/conversations`, convoId));
            if (currentConversationId === convoId) {
                startNewChat();
            }
            showToast("Chat eliminado.");
        }
    }
}

function loadConversation(convoId) {
    if (!userId || !convoId) return;
    
    isTemporaryChat = false;
    currentConversationId = convoId;
    chatContext = [];
    chatContainer.innerHTML = ''; // Clear current chat
    welcomeScreen.classList.add('hidden'); // Hide welcome

    const convoRef = doc(db, `artifacts/${appId}/users/${userId}/conversations`, convoId);

    onSnapshot(convoRef, (docSnap) => {
        if (docSnap.exists()) {
            const conversationData = docSnap.data();
            chatTitle.textContent = conversationData.title || 'Chat';
            chatContext = conversationData.messages || [];
            
            // Render messages
            chatContainer.innerHTML = ''; // Clear just in case
            chatContext.forEach(message => {
                appendMessage(message.parts[0].text, message.role);
            });
        } else {
            console.error("Conversation does not exist.");
            showToast("Error: Could not load conversation.");
            startNewChat();
        }
    });
}

function startNewChat(isTemporary = false) {
    currentConversationId = null;
    chatContext = [];
    chatContainer.innerHTML = ''; // Clear chat
    welcomeScreen.classList.remove('hidden'); // Show welcome screen
    chatTitle.textContent = isTemporary ? 'Chat Temporal' : 'Jelo';
    isTemporaryChat = isTemporary;

    // Deselect any active item in history
    document.querySelectorAll('.history-item.active').forEach(el => el.classList.remove('active'));
    
    if (isTemporary) {
      showToast("Estás en un chat temporal. El historial no se guardará.");
    }
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
                messages: [] // Starts empty, will be updated
            });
            currentConversationId = newConvoRef.id;
        }
        
        const tempContext = [...chatContext, { role: "user", parts: [{ text: userPrompt }] }];
        let aiResponse = '';

        if (provider === 'gemini') {
            const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
            const payload = { contents: tempContext.map(({role, parts}) => ({role, parts})) };
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error.message);
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
            if (!response.ok) throw new Error(result.error?.message);
            aiResponse = result.choices?.[0]?.message?.content;
        }

        if (aiResponse) {
            chatContext.push({ role: 'user', parts: [{ text: userPrompt }] });
            chatContext.push({ role: 'model', parts: [{ text: aiResponse }] });
            updateMessage(aiMessageBubble, aiResponse);
            
            if (!isTemporaryChat && currentConversationId) {
                const convoRef = doc(db, `artifacts/${appId}/users/${userId}/conversations`, currentConversationId);
                await setDoc(convoRef, { messages: chatContext, title: chatContext[0].parts[0].text.substring(0, 30), timestamp: serverTimestamp() }, { merge: true });
            }

        } else {
            throw new Error("No valid response received from provider.");
        }

    } catch (error) {
        updateMessage(aiMessageBubble, `Sorry, an error occurred: ${error.message}`);
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
              File ready to download
            </span>
            <button class="file-download-btn" data-type="${type}">Download ${fileTypes[type]}</button>
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

function appendMessage(text, role) {
    welcomeScreen.classList.add('hidden');
    const bubble = document.createElement('div');
    bubble.classList.add('prose', 'max-w-lg', 'w-fit', 'p-4', 'mb-4');
    
    if (role === 'user') {
        bubble.classList.add('bg-gray-700', 'self-end', 'ml-auto');
    } else {
        bubble.classList.add('bg-gray-800', 'self-start');
        if (!text) {
             bubble.innerHTML = '<div class="gemini-loader"><div class="sparkle"></div><div class="arc"></div></div>';
        }
    }

    if (text) {
        bubble.innerHTML = parseMarkdown(text);
    }
    
    chatContainer.appendChild(bubble);

    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    return bubble;
}

function updateMessage(bubble, text) {
    bubble.innerHTML = parseMarkdown(text);
    
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
                alert(`Error generating file. Ensure content format is correct.`);
            }
        });
    });

    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function setChatUIState(isLoading) {
    if (isLoading) {
        statusIndicator.textContent = 'Jelo is thinking...';
        sendChatButton.disabled = true;
        chatInput.disabled = true;
        sendChatButton.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        statusIndicator.textContent = '';
        sendChatButton.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
        sendChatButton.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    statusIndicator.textContent = `Analizando ${file.name}...`;
    let fileContent = "";

    try {
        if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") { // .docx
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            fileContent = result.value;
        } else if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") { // .xlsx
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);
            fileContent = JSON.stringify(json, null, 2);
        } else if (file.type === "text/plain") { // .txt
            fileContent = await file.text();
        } else {
            showToast("Formato de archivo no soportado.");
            return;
        }

        const prompt = `Aquí está el contenido de un archivo llamado "${file.name}". Por favor, resúmelo y dame los puntos más importantes:\n\n---\n\n${fileContent}`;
        appendMessage(`Archivo subido: <strong>${file.name}</strong>. A continuación se generará un resumen.`, 'user');
        handleChat(prompt, true);

    } catch (error) {
        console.error("Error procesando el archivo:", error);
        showToast("Error al leer el archivo.");
    } finally {
        statusIndicator.textContent = '';
        fileUploadInput.value = ''; // Reset input
    }
}

// --- Event Listeners ---
loginButton.addEventListener('click', () => signInWithProvider('facebook'));
googleLoginButton.addEventListener('click', () => signInWithProvider('google'));
temporalChatButton.addEventListener('click', () => startNewChat(true));
logoutButton.addEventListener('click', () => signOut(auth));
newChatButton.addEventListener('click', () => startNewChat(false));

sendChatButton.addEventListener('click', () => handleChat());
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChat(); } });
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