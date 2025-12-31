const input = document.querySelector('#input');
const chatContainer = document.querySelector('#chat-container');
const askBtn = document.querySelector('#ask');
const newChatBtn = document.querySelector('#new-chat');
const exportBtn = document.querySelector('#export-chat');
const clearBtn = document.querySelector('#clear-chat');
const welcomeScreen = document.querySelector('#welcome-screen');
const charCounter = document.querySelector('#char-counter');

let threadId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
let isGenerating = false;

// Configure marked.js with syntax highlighting
marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false,
    highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(code, { language: lang }).value;
            } catch (err) { }
        }
        return hljs.highlightAuto(code).value;
    }
});

input?.addEventListener('keydown', handleEnter);
askBtn?.addEventListener('click', handleAsk);
newChatBtn?.addEventListener('click', handleNewChat);
exportBtn?.addEventListener('click', exportChat);
clearBtn?.addEventListener('click', clearChat);

// Auto-resize textarea
input?.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    updateCharCounter();
});

// Update character counter
function updateCharCounter() {
    const length = input.value.length;
    const maxLength = 5000;
    charCounter.textContent = `${length} / ${maxLength}`;

    if (length > maxLength * 0.9) {
        charCounter.classList.add('danger');
        charCounter.classList.remove('warning');
    } else if (length > maxLength * 0.7) {
        charCounter.classList.add('warning');
        charCounter.classList.remove('danger');
    } else {
        charCounter.classList.remove('warning', 'danger');
    }
}

// Handle suggestion buttons
document.querySelectorAll('.suggestion-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        const suggestionText = this.querySelector('.text-sm').textContent + ' ' + this.querySelector('.text-xs').textContent;
        input.value = suggestionText;
        input.focus();
    });
});

const loading = document.createElement('div');
loading.className = 'assistant-row border-b border-white/5';
loading.innerHTML = `
    <div class="container mx-auto max-w-3xl px-4 py-6 message-animation">
        <div class="flex items-start gap-4">
            <div class="w-8 h-8 bg-[#19c37d] rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
                AI
            </div>
            <div class="flex-1 pt-1">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    </div>
`;

async function generate(text) {
    // Hide welcome screen on first message
    if (welcomeScreen) {
        welcomeScreen.style.display = 'none';
    }

    isGenerating = true;

    // User message
    const userMsgWrapper = document.createElement('div');
    userMsgWrapper.className = 'user-row border-b border-white/5';
    userMsgWrapper.innerHTML = `
        <div class="container mx-auto max-w-3xl px-4 py-6 message-animation">
            <div class="flex items-start gap-4 justify-end">
                <div class="flex-1 flex justify-end">
                    <div class="max-w-[80%]">
                        <p class="whitespace-pre-wrap break-words text-white/90 text-[15px] leading-7">${escapeHtml(text)}</p>
                        <div class="text-xs text-white/40 mt-2 text-right">${new Date().toLocaleTimeString()}</div>
                    </div>
                </div>
                <div class="w-8 h-8 bg-white rounded-full flex items-center justify-center flex-shrink-0 text-black font-semibold text-sm">
                    U
                </div>
            </div>
        </div>
    `;
    chatContainer?.appendChild(userMsgWrapper);
    input.value = '';
    input.style.height = 'auto';
    updateCharCounter();

    // Disable input and button while processing
    askBtn.disabled = true;
    input.disabled = true;

    // Show loading
    chatContainer?.appendChild(loading);
    scrollToBottom();

    try {
        // Call server
        const assistantMessage = await callServer(text);

        // Remove loading
        loading.remove();

        // Assistant message
        const assistantMsgWrapper = document.createElement('div');
        assistantMsgWrapper.className = 'assistant-row border-b border-white/5';
        const messageId = 'msg-' + Date.now();
        assistantMsgWrapper.setAttribute('data-message-id', messageId);
        assistantMsgWrapper.innerHTML = `
            <div class="container mx-auto max-w-3xl px-4 py-6 message-animation">
                <div class="flex items-start gap-4">
                    <div class="w-8 h-8 bg-[#19c37d] rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
                        AI
                    </div>
                    <div class="flex-1 pt-1 max-w-[80%]">
                        <div class="markdown-content text-white/90 text-[15px] leading-7">${parseMarkdown(assistantMessage)}</div>
                        <div class="message-actions">
                            <button class="action-btn copy-message-btn" data-message="${escapeHtml(assistantMessage)}" title="Copy message">
                                📋 Copy
                            </button>
                            <button class="action-btn regenerate-btn" data-prompt="${escapeHtml(text)}" title="Regenerate response">
                                🔄 Regenerate
                            </button>
                        </div>
                        <div class="text-xs text-white/40 mt-2">${new Date().toLocaleTimeString()}</div>
                    </div>
                </div>
            </div>
        `;
        chatContainer?.appendChild(assistantMsgWrapper);

        // Add event listeners for code copy buttons
        addCodeCopyButtons(assistantMsgWrapper);

        // Add event listeners for message actions
        assistantMsgWrapper.querySelector('.copy-message-btn')?.addEventListener('click', function () {
            copyToClipboard(this.getAttribute('data-message'), this);
        });

        assistantMsgWrapper.querySelector('.regenerate-btn')?.addEventListener('click', function () {
            const prompt = this.getAttribute('data-prompt');
            // Remove this assistant message before regenerating
            assistantMsgWrapper.remove();
            generate(prompt);
        });
    } catch (error) {
        loading.remove();

        // Error message
        const errorMsgWrapper = document.createElement('div');
        errorMsgWrapper.className = 'assistant-row border-b border-white/5';
        errorMsgWrapper.innerHTML = `
            <div class="container mx-auto max-w-3xl px-4 py-6 message-animation">
                <div class="flex items-start gap-4">
                    <div class="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-sm">
                        !
                    </div>
                    <div class="flex-1 pt-1 max-w-[80%]">
                        <p class="text-red-400 text-[15px] leading-7">Error: ${escapeHtml(error.message)}</p>
                        <div class="text-xs text-white/40 mt-2">${new Date().toLocaleTimeString()}</div>
                    </div>
                </div>
            </div>
        `;
        chatContainer?.appendChild(errorMsgWrapper);
    } finally {
        // Re-enable input and button
        isGenerating = false;
        askBtn.disabled = false;
        input.disabled = false;
        input.focus();
        scrollToBottom();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function parseMarkdown(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    try {
        // Use marked.js to parse markdown
        const html = marked.parse(text);

        // Wrap code blocks with custom header
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        const preElements = tempDiv.querySelectorAll('pre code');
        preElements.forEach((codeElement) => {
            const pre = codeElement.parentElement;
            const language = codeElement.className.match(/language-(\w+)/)?.[1] || 'text';

            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';

            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `
            <span class="code-language">${language}</span>
            <button class="copy-code-btn" data-code="${escapeHtml(codeElement.textContent)}">Copy</button>
        `;

            wrapper.appendChild(header);
            pre.style.borderRadius = '0 0 8px 8px';
            pre.style.marginTop = '0';
            wrapper.appendChild(pre.cloneNode(true));

            pre.replaceWith(wrapper);
        });

        return tempDiv.innerHTML;
    } catch (error) {
        console.error('Error parsing markdown:', error);
        return escapeHtml(text);
    }
}

function addCodeCopyButtons(container) {
    if (!container) return;

    const copyButtons = container.querySelectorAll('.copy-code-btn');
    if (!copyButtons) return;

    copyButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            const code = this.getAttribute('data-code');
            // Decode HTML entities
            const textarea = document.createElement('textarea');
            textarea.innerHTML = code;
            const decodedCode = textarea.value;
            copyToClipboard(decodedCode, this);
        });
    });
}

function copyToClipboard(text, button) {
    if (!text || !button) return;

    // Try modern clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showCopySuccess(button);
        }).catch(err => {
            console.error('Failed to copy with clipboard API:', err);
            fallbackCopy(text, button);
        });
    } else {
        fallbackCopy(text, button);
    }
}

function showCopySuccess(button) {
    const originalText = button.textContent;
    button.textContent = '✓ Copied!';
    button.classList.add('copied');
    setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('copied');
    }, 2000);
}

function fallbackCopy(text, button) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showCopySuccess(button);
    } catch (err) {
        console.error('Fallback copy failed:', err);
        alert('Failed to copy to clipboard');
    }
    document.body.removeChild(textarea);
}

function exportChat() {
    const messages = [];
    const allRows = document.querySelectorAll('.user-row, .assistant-row');

    if (!allRows || allRows.length === 0) {
        alert('No messages to export!');
        return;
    }

    allRows.forEach(row => {
        if (row.classList.contains('user-row')) {
            const text = row.querySelector('p')?.textContent?.trim();
            if (text) messages.push(`User: ${text}\n`);
        } else if (!row.querySelector('.typing-indicator')) {
            // Skip loading indicators
            const text = row.querySelector('.markdown-content')?.textContent?.trim();
            if (text && text !== 'Error:') messages.push(`Assistant: ${text}\n`);
        }
    });

    if (messages.length === 0) {
        alert('No messages to export!');
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const header = `ChatGPT Conversation Export\nDate: ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
    const chatText = header + messages.join('\n');

    try {
        const blob = new Blob([chatText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chatgpt-conversation-${timestamp}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting chat:', error);
        alert('Failed to export chat. Please try again.');
    }
}

function clearChat() {
    if (confirm('Are you sure you want to clear all messages?')) {
        const allMessages = document.querySelectorAll('.user-row, .assistant-row');
        allMessages.forEach(msg => msg.remove());
        if (welcomeScreen) {
            welcomeScreen.style.display = 'flex';
        }
    }
}

function scrollToBottom() {
    setTimeout(() => {
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
    }, 100);
}

function handleNewChat() {
    // Generate new thread ID
    threadId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

    // Clear chat container
    chatContainer.innerHTML = '';

    // Show welcome screen again
    const welcomeHtml = `
        <div class="flex items-center justify-center min-h-[70vh]" id="welcome-screen">
            <div class="text-center px-4 message-animation">
                <h2 class="text-4xl font-semibold mb-8 text-white/90">
                    ChatGPT
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto">
                    <button class="suggestion-btn bg-[#2f2f2f] hover:bg-[#3a3a3a] p-4 rounded-2xl text-left transition-colors duration-200 border border-white/5">
                        <div class="text-sm font-medium mb-2">Explain quantum computing</div>
                        <div class="text-xs text-white/50">in simple terms</div>
                    </button>
                    <button class="suggestion-btn bg-[#2f2f2f] hover:bg-[#3a3a3a] p-4 rounded-2xl text-left transition-colors duration-200 border border-white/5">
                        <div class="text-sm font-medium mb-2">Get weather update</div>
                        <div class="text-xs text-white/50">for my location</div>
                    </button>
                    <button class="suggestion-btn bg-[#2f2f2f] hover:bg-[#3a3a3a] p-4 rounded-2xl text-left transition-colors duration-200 border border-white/5">
                        <div class="text-sm font-medium mb-2">Latest tech news</div>
                        <div class="text-xs text-white/50">what's trending today</div>
                    </button>
                    <button class="suggestion-btn bg-[#2f2f2f] hover:bg-[#3a3a3a] p-4 rounded-2xl text-left transition-colors duration-200 border border-white/5">
                        <div class="text-sm font-medium mb-2">Write a function</div>
                        <div class="text-xs text-white/50">in Python</div>
                    </button>
                </div>
            </div>
        </div>
    `;

    chatContainer.innerHTML = welcomeHtml;

    // Re-attach suggestion button listeners
    document.querySelectorAll('.suggestion-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const suggestionText = this.querySelector('.text-sm').textContent + ' ' + this.querySelector('.text-xs').textContent;
            input.value = suggestionText;
            input.focus();
        });
    });

    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function callServer(inputText) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

        const response = await fetch('http://localhost:3001/chat', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: JSON.stringify({ threadId: threadId, message: inputText }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Server error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();

        if (!result || !result.message) {
            throw new Error('Invalid response from server');
        }

        return result.message;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timeout. The server took too long to respond.');
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error('Network error. Please check your connection and ensure the server is running.');
        }
        throw error;
    }
}

async function handleAsk(e) {
    const text = input?.value.trim();
    if (!text || askBtn.disabled || isGenerating) {
        return;
    }

    if (text.length > 5000) {
        alert('Message is too long! Maximum 5000 characters.');
        return;
    }

    await generate(text);
}

async function handleEnter(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input?.value.trim();
        if (!text || askBtn.disabled || isGenerating) {
            return;
        }

        if (text.length > 5000) {
            alert('Message is too long! Maximum 5000 characters.');
            return;
        }

        await generate(text);
    }
}
