// ==========================================
// AI ASSISTANT INTERACTIVE LOGIC
// ==========================================

let chatHistory = [];

// Markdown compiling logic for AI responses
function formatMessageText(text) {
    // First escape standard HTML characters to prevent XSS
    let escaped = escapeHtml(text);
    
    // Blockquotes: replace starting &gt; with blockquote block
    escaped = escaped.replace(/^&gt;\s+(.*)$/gm, "<blockquote>$1</blockquote>");
    
    // Bold: **text** to strong
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    
    // Italic: *text* to em
    escaped = escaped.replace(/\*(.*?)\*/g, "<em>$1</em>");
    
    // Code blocks: `text` to code
    escaped = escaped.replace(/`(.*?)`/g, "<code>$1</code>");
    
    // Split by lines to compile lists correctly
    const lines = escaped.split("\n");
    let inList = false;
    let listType = null; // "ul" or "ol"
    let formattedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Unordered lists
        if (line.startsWith("- ") || line.startsWith("• ")) {
            if (!inList) {
                formattedLines.push("<ul>");
                inList = true;
                listType = "ul";
            }
            formattedLines.push(`<li>${line.substring(2)}</li>`);
        } 
        // Ordered lists
        else if (line.match(/^\d+\.\s+(.*)$/)) {
            if (!inList) {
                formattedLines.push("<ol>");
                inList = true;
                listType = "ol";
            }
            const match = line.match(/^\d+\.\s+(.*)$/);
            formattedLines.push(`<li>${match[1]}</li>`);
        } 
        // Plain text lines
        else {
            if (inList) {
                formattedLines.push(listType === "ul" ? "</ul>" : "</ol>");
                inList = false;
                listType = null;
            }
            formattedLines.push(line);
        }
    }
    
    if (inList) {
        formattedLines.push(listType === "ul" ? "</ul>" : "</ol>");
    }
    
    // Join lines and clean up extra line breaks next to lists
    return formattedLines.join("<br>")
        .replace(/<\/ul><br>/g, "</ul>")
        .replace(/<\/ol><br>/g, "</ol>")
        .replace(/<br><ul>/g, "<ul>")
        .replace(/<br><ol>/g, "<ol>");
}

function loadChatHistory() {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.CHAT_HISTORY);
    chatHistory = saved ? JSON.parse(saved) : [];
}

function saveChatHistory() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(chatHistory));
}

function renderChatHistory() {
    const container = document.getElementById("messagesContainer");
    const welcomeCard = document.getElementById("chatWelcomeCard");
    
    if (!container) return;
    
    container.innerHTML = "";
    
    if (chatHistory.length > 0) {
        welcomeCard?.classList.add("hidden");
        
        chatHistory.forEach(msg => {
            const bubble = document.createElement("div");
            bubble.className = `message-bubble ${msg.sender}`;
            
            const content = msg.sender === "ai" ? formatMessageText(msg.text) : escapeHtml(msg.text);
            
            bubble.innerHTML = `
                <div class="message-content">${content}</div>
                <span class="message-timestamp">${escapeHtml(msg.timestamp)}</span>
            `;
            
            container.appendChild(bubble);
        });
    } else {
        welcomeCard?.classList.remove("hidden");
    }
    
    scrollChatToBottom();
}

function appendMessage(sender, text) {
    const welcomeCard = document.getElementById("chatWelcomeCard");
    welcomeCard?.classList.add("hidden");
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msg = { sender, text, timestamp };
    
    chatHistory.push(msg);
    saveChatHistory();
    
    const container = document.getElementById("messagesContainer");
    if (container) {
        const bubble = document.createElement("div");
        bubble.className = `message-bubble ${sender}`;
        
        const content = sender === "ai" ? formatMessageText(text) : escapeHtml(text);
        bubble.innerHTML = `
            <div class="message-content">${content}</div>
            <span class="message-timestamp">${escapeHtml(timestamp)}</span>
        `;
        
        container.appendChild(bubble);
    }
    
    scrollChatToBottom();
}

function scrollChatToBottom() {
    const viewport = document.querySelector(".chat-viewport");
    if (viewport) {
        // Smooth scroll to the bottom of the viewport
        viewport.scrollTop = viewport.scrollHeight;
    }
}

async function sendChatMessage(text) {
    if (!text || !text.trim()) return;
    
    const input = document.getElementById("chatInputField");
    if (input) input.value = "";
    
    appendMessage("user", text);
    
    const typingIndicator = document.getElementById("typingIndicator");
    typingIndicator?.classList.remove("hidden");
    scrollChatToBottom();
    
    try {
        const response = await apiFetch("/tasks/ai/chat", {
            method: "POST",
            body: JSON.stringify({ message: text })
        });
        
        typingIndicator?.classList.add("hidden");
        
        if (response && response.reply) {
            appendMessage("ai", response.reply);
            
            // Sync gamification parameters if returned
            if (response.userState) {
                // Fetch full sidebar update dynamically to render accurate XP
                fetchAndRenderSidebar();
            }
        } else {
            appendMessage("ai", "I'm sorry, I encountered an issue processing that query. Please try again.");
        }
    } catch (err) {
        typingIndicator?.classList.add("hidden");
        console.error("AI Assistant chat error:", err);
        
        let errorMsg = "Failed to reach the AI Assistant. Make sure the backend server is running.";
        if (err.message === "Unauthorized") {
            errorMsg = "Your session has expired. Please log in again to speak with the AI Assistant.";
        }
        
        appendMessage("ai", `⚠️ **Error**\n\n${errorMsg}`);
    }
}

function clearChatHistory() {
    chatHistory = [];
    saveChatHistory();
    renderChatHistory();
    showToast("Chat history cleared.", 2000, "info");
}

function setupQuickActions() {
    const actionBtns = document.querySelectorAll(".ai-action-card");
    const input = document.getElementById("chatInputField");
    
    actionBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const prompt = btn.getAttribute("data-prompt");
            if (prompt) {
                sendChatMessage(prompt);
            }
        });
    });
    
    const clearBtn = document.getElementById("clearChatBtn");
    clearBtn?.addEventListener("click", clearChatHistory);
}

// Redirect or block anonymous users
function checkAuthAndInit() {
    const token = getToken();
    if (!token) {
        showToast("Please login or register to use the AI Assistant.", 4000, "error");
        // Open the global login modal
        document.getElementById("authModal")?.classList.remove("hidden");
        document.getElementById("chatInputField")?.setAttribute("disabled", "true");
        document.getElementById("chatSendBtn")?.setAttribute("disabled", "true");
        return;
    }
    
    document.getElementById("chatInputField")?.removeAttribute("disabled");
    document.getElementById("chatSendBtn")?.removeAttribute("disabled");
    
    loadChatHistory();
    renderChatHistory();
}

// Hook into the shared auth state change from auth.js
window.onAuthStateChanged = (loggedIn) => {
    if (loggedIn) {
        checkAuthAndInit();
        fetchAndRenderSidebar();
    } else {
        chatHistory = [];
        renderChatHistory();
        document.getElementById("chatInputField")?.setAttribute("disabled", "true");
        document.getElementById("chatSendBtn")?.setAttribute("disabled", "true");
        hideSidebarGamification();
        resetSidebarUser();
    }
};

document.addEventListener("DOMContentLoaded", () => {
    checkAuthAndInit();
    setupQuickActions();
    
    const sendBtn = document.getElementById("chatSendBtn");
    const input = document.getElementById("chatInputField");
    
    sendBtn?.addEventListener("click", () => {
        if (input) {
            sendChatMessage(input.value.trim());
        }
    });
    
    input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendChatMessage(input.value.trim());
        }
    });
});
