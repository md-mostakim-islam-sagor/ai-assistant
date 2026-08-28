const SITE_NAME = "AI 2.0";
document.title = SITE_NAME;

function safeCreateIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

if (document.getElementById('site-name-display')) {
    document.getElementById('site-name-display').textContent = SITE_NAME;
}

const models = [
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', description: 'Most stable & smart', icon: 'zap', color: 'text-red-500', badge: 'Default', badgeColor: 'bg-red-600/20 text-red-400' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Lite', description: 'Lightning fast responses', icon: 'sparkles', color: 'text-emerald-400', badge: 'Fast', badgeColor: 'bg-red-600/20 text-red-400' },
    { id: 'art-gen-sys', name: 'Picture AI', description: 'Generate beautiful artwork', icon: 'image', color: 'text-purple-400', badge: 'Art', badgeColor: 'bg-purple-500/20 text-purple-300' }
];

let selectedModel = localStorage.getItem('boltSavedModel') || models[0].id;
let selectedImageSize = '1:1';
let selectedFiles = [];

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 120000;
const TEXT_FILE_EXTENSIONS = new Set([
    'txt', 'md', 'csv', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html',
    'xml', 'svg', 'yaml', 'yml', 'log', 'sql', 'py', 'java', 'c', 'cpp',
    'h', 'hpp', 'sh', 'env', 'ini', 'toml'
]);

// chatHistory  -> exact array sent to the Gemini API: [{role:'user'|'model', parts:[{text}]}]
// renderedMessages -> what the UI shows: [{type:'user'|'ai'|'image', text, chatIndex, prompt, sizeConfig, imageUrl, loading, error, editing}]
let chatHistory = [];
let renderedMessages = [];

let isChatActive = false;
let currentSessionId = Date.now().toString();
let allSessions = JSON.parse(localStorage.getItem('boltChatSessions')) || [];

const imageSizes = [
    { id: '1:1', name: '1:1 Square', width: 1024, height: 1024, icon: 'square' },
    { id: '16:9', name: '16:9 YouTube', width: 1344, height: 768, icon: 'rectangle-horizontal' },
    { id: '9:16', name: '9:16 TikTok', width: 768, height: 1344, icon: 'rectangle-vertical' },
    { id: '4:3', name: '4:3 Standard', width: 1152, height: 896, icon: 'rectangle-horizontal' },
    { id: '3:4', name: '3:4 Portrait', width: 896, height: 1152, icon: 'rectangle-vertical' }
];

const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const chatHistoryDiv = document.getElementById('chat-history');
const loadingIndicator = document.getElementById('loading-indicator');
const heroBg = document.getElementById('hero-bg');
const heroSection = document.getElementById('hero-section');
const modelBtn = document.getElementById('model-selector-btn');
const modelDropdown = document.getElementById('model-dropdown');
const dropdownItems = document.getElementById('dropdown-items');
const selectedName = document.getElementById('selected-name');
const selectedIcon = document.getElementById('selected-icon');
const sizeContainer = document.getElementById('size-selector-container');
const sizeBtn = document.getElementById('size-selector-btn');
const sizeDropdown = document.getElementById('size-dropdown');
const sizeItems = document.getElementById('size-items');
const sizeName = document.getElementById('size-name');
const sizeIcon = document.getElementById('size-icon');
const fileInput = document.getElementById('file-input');
const attachmentBtn = document.getElementById('attachment-btn');
const attachmentList = document.getElementById('attachment-list');

safeCreateIcons();

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(file) {
    return file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : '';
}

function isTextAttachment(file) {
    return file.type.startsWith('text/') || file.type === 'image/svg+xml' || TEXT_FILE_EXTENSIONS.has(getFileExtension(file));
}

function isInlineImage(file) {
    return file.type.startsWith('image/') && file.type !== 'image/svg+xml';
}

function fileMeta(file) {
    return { name: file.name, size: file.size, type: file.type || 'application/octet-stream' };
}

function updateSendState() {
    sendBtn.disabled = !userInput.value.trim() && selectedFiles.length === 0;
}

function renderAttachmentList() {
    attachmentList.innerHTML = '';
    if (selectedFiles.length === 0) {
        attachmentList.classList.add('hidden');
        return;
    }

    attachmentList.classList.remove('hidden');
    selectedFiles.forEach((file, index) => {
        const chip = document.createElement('div');
        chip.className = 'attachment-chip';

        const icon = document.createElement('span');
        icon.textContent = isInlineImage(file) ? 'IMG' : (getFileExtension(file).toUpperCase() || 'FILE');
        icon.className = 'rounded-md bg-white/10 px-1.5 py-1 text-[9px] font-semibold text-[#b7b7bd]';

        const name = document.createElement('span');
        name.className = 'attachment-chip-name';
        name.title = file.name;
        name.textContent = file.name;

        const size = document.createElement('span');
        size.className = 'attachment-chip-size';
        size.textContent = formatFileSize(file.size);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'attachment-remove';
        remove.title = `Remove ${file.name}`;
        remove.setAttribute('aria-label', `Remove ${file.name}`);
        remove.textContent = '×';
        remove.onclick = () => {
            selectedFiles.splice(index, 1);
            renderAttachmentList();
            updateSendState();
        };

        chip.append(icon, name, size, remove);
        attachmentList.appendChild(chip);
    });
}

attachmentBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    const incomingFiles = Array.from(fileInput.files || []);
    let totalSize = selectedFiles.reduce((total, file) => total + file.size, 0);

    for (const file of incomingFiles) {
        if (file.size > MAX_FILE_SIZE) {
            window.alert(`${file.name} is larger than the 10 MB per-file limit.`);
            continue;
        }
        if (totalSize + file.size > MAX_TOTAL_FILE_SIZE) {
            window.alert('You can attach up to 20 MB per message.');
            break;
        }
        const alreadySelected = selectedFiles.some(
            (existing) => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified
        );
        if (!alreadySelected) {
            selectedFiles.push(file);
            totalSize += file.size;
        }
    }

    fileInput.value = '';
    renderAttachmentList();
    updateSendState();
});

models.forEach(model => {
    const btn = document.createElement('button');
    btn.className = `w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-all duration-150 ${selectedModel === model.id ? 'bg-white/10 text-white' : 'text-[#a0a0a5] hover:bg-white/5 hover:text-white'}`;
    btn.onclick = () => selectModel(model);
    let badgeHtml = model.badge ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full font-medium ${model.badgeColor}">${model.badge}</span>` : '';
    btn.innerHTML = `<div class="flex-shrink-0"><i data-lucide="${model.icon}" class="w-4 h-4 ${model.color}"></i></div><div class="flex-1 min-w-0"><div class="flex items-center gap-2"><span class="text-sm font-medium">${model.name}</span> ${badgeHtml} </div><span class="text-[11px] text-[#6a6a6f]">${model.description}</span></div>`;
    dropdownItems.appendChild(btn);
});

imageSizes.forEach(size => {
    const btn = document.createElement('button');
    btn.className = `w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-all duration-150 ${selectedImageSize === size.id ? 'bg-white/10 text-white' : 'text-[#a0a0a5] hover:bg-white/5 hover:text-white'}`;
    btn.onclick = () => selectSize(size);
    btn.innerHTML = `<div class="flex-shrink-0"><i data-lucide="${size.icon}" class="w-4 h-4 text-[#8a8a8f]"></i></div><div class="flex-1 text-sm font-medium">${size.name}</div>`;
    sizeItems.appendChild(btn);
});

safeCreateIcons();

const savedModelObj = models.find(m => m.id === selectedModel) || models[0];
selectModel(savedModelObj);

modelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    modelDropdown.classList.toggle('hidden');
    sizeDropdown.classList.add('hidden');
});
sizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sizeDropdown.classList.toggle('hidden');
    modelDropdown.classList.add('hidden');
});
document.addEventListener('click', (e) => {
    if (!modelDropdown.contains(e.target)) modelDropdown.classList.add('hidden');
    if (!sizeDropdown.contains(e.target)) sizeDropdown.classList.add('hidden');
});

function selectSize(size) {
    selectedImageSize = size.id;
    sizeName.innerText = size.name;
    sizeIcon.setAttribute('data-lucide', size.icon);
    sizeIcon.className = `w-4 h-4 lucide lucide-${size.icon}`;
    sizeDropdown.classList.add('hidden');
    safeCreateIcons();
    Array.from(sizeItems.children).forEach((child, idx) => {
        if (idx === 0) return;
        const s = imageSizes[idx - 1];
        child.className = `w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-all duration-150 ${s.id === size.id ? 'bg-white/10 text-white' : 'text-[#a0a0a5] hover:bg-white/5 hover:text-white'}`;
    });
}

function selectModel(model) {
    selectedModel = model.id;
    localStorage.setItem('boltSavedModel', selectedModel);
    selectedName.innerText = model.name;
    selectedIcon.setAttribute('data-lucide', model.icon);
    selectedIcon.className = `w-4 h-4 ${model.color} lucide lucide-${model.icon}`;
    modelDropdown.classList.add('hidden');
    safeCreateIcons();
    Array.from(dropdownItems.children).forEach((child, idx) => {
        if (idx === 0) return;
        const m = models[idx - 1];
        child.className = m.id === model.id
            ? `w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-all duration-150 bg-white/10 text-white`
            : `w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-left transition-all duration-150 text-[#a0a0a5] hover:bg-white/5 hover:text-white`;
    });
    if (model.id === 'art-gen-sys') {
        sizeContainer.classList.remove('hidden');
    } else {
        sizeContainer.classList.add('hidden');
    }
}

const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebarClose = document.getElementById('sidebar-close');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');

function toggleSidebar(show) {
    if (show) {
        sidebar.classList.remove('-translate-x-full');
        sidebarOverlay.classList.remove('hidden');
    } else {
        sidebar.classList.add('-translate-x-full');
        sidebarOverlay.classList.add('hidden');
    }
}
sidebarToggle.onclick = () => toggleSidebar(true);
sidebarClose.onclick = () => toggleSidebar(false);
sidebarOverlay.onclick = () => toggleSidebar(false);

function saveToLocalStorage() {
    if (renderedMessages.length === 0) return;
    let sessionIndex = allSessions.findIndex(s => s.id === currentSessionId);
    const first = renderedMessages[0];
    const titleSource = first.text || first.prompt || 'Image chat';
    const title = titleSource.substring(0, 30) + (titleSource.length > 30 ? "..." : "");
    const messagesForStorage = chatHistory.map((message) => ({
        ...message,
        parts: (message.parts || []).map((part) => part.inline_data
            ? { text: '[Attached image omitted from local history]' }
            : part)
    }));
    const sessionData = { id: currentSessionId, title, messages: messagesForStorage, rendered: renderedMessages };
    if (sessionIndex >= 0) {
        allSessions[sessionIndex] = sessionData;
    } else {
        allSessions.unshift(sessionData);
    }
    localStorage.setItem('boltChatSessions', JSON.stringify(allSessions));
    renderHistoryList();
}

function renderHistoryList() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    if (allSessions.length === 0) {
        list.innerHTML = '<div class="text-center text-[#5a5a5f] text-xs mt-4">No history yet</div>';
        return;
    }
    allSessions.forEach(session => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `w-full flex items-center justify-between p-1.5 rounded-lg transition-colors group ${session.id === currentSessionId ? 'bg-white/10' : 'hover:bg-white/5'}`;
        const btn = document.createElement('button');
        btn.className = `flex-1 text-left px-2 py-1.5 text-sm flex items-center gap-2 ${session.id === currentSessionId ? 'text-white' : 'text-[#a0a0a5] group-hover:text-white'}`;
        btn.innerHTML = `<i data-lucide="message-square" class="w-4 h-4 opacity-70"></i><span class="truncate w-[160px]">${escapeHtml(session.title)}</span>`;
        btn.onclick = () => loadSession(session.id);
        const delBtn = document.createElement('button');
        delBtn.className = `p-1.5 rounded-md text-[#5a5a5f] hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all ${session.id === currentSessionId ? 'opacity-100 text-white/50 hover:text-red-400' : ''}`;
        delBtn.innerHTML = `<i data-lucide="trash-2" class="w-3.5 h-3.5"></i>`;
        delBtn.onclick = (e) => { e.stopPropagation(); deleteSession(session.id); };
        itemDiv.appendChild(btn);
        itemDiv.appendChild(delBtn);
        list.appendChild(itemDiv);
    });
    safeCreateIcons();
}

function deleteSession(id) {
    if (confirm("Delete this chat?")) {
        allSessions = allSessions.filter(s => s.id !== id);
        localStorage.setItem('boltChatSessions', JSON.stringify(allSessions));
        if (currentSessionId === id) {
            newChat();
        } else {
            renderHistoryList();
        }
    }
}

function reconstructRenderedFromHistory(history) {
    return history.map((msg, i) => ({
        type: msg.role === 'user' ? 'user' : 'ai',
        text: (msg.parts || []).filter(part => part.text).map(part => part.text).join('\n'),
        chatIndex: i
    }));
}

function loadSession(id) {
    const session = allSessions.find(s => s.id === id);
    if (!session) return;
    currentSessionId = session.id;
    chatHistory = JSON.parse(JSON.stringify(session.messages || []));
    renderedMessages = session.rendered ? JSON.parse(JSON.stringify(session.rendered)) : reconstructRenderedFromHistory(chatHistory);
    activateChatLayout();
    rerenderChat();
    renderHistoryList();
    toggleSidebar(false);
}

function newChat() {
    currentSessionId = Date.now().toString();
    chatHistory = [];
    renderedMessages = [];
    chatHistoryDiv.innerHTML = '';
    isChatActive = false;
    heroBg.classList.remove('hidden');
    heroSection.classList.remove('hidden');
    chatHistoryDiv.classList.add('hidden');
    renderHistoryList();
    toggleSidebar(false);
}

function clearHistory() {
    if (confirm("Clear all history?")) {
        allSessions = [];
        localStorage.removeItem('boltChatSessions');
        newChat();
    }
}

renderHistoryList();

function downloadImage(url) {
    const downloadUrl = `/api/image/download?url=${encodeURIComponent(url)}`;
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = `ai-image-${Date.now()}.jpg`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => anchor.remove(), 1000);
}

function saveImage(url) {
    try {
        const savedImages = JSON.parse(localStorage.getItem('boltSavedImages') || '[]');
        if (!savedImages.some((image) => image.url === url)) {
            savedImages.unshift({ url, savedAt: new Date().toISOString() });
            localStorage.setItem('boltSavedImages', JSON.stringify(savedImages.slice(0, 50)));
        }
        saveToLocalStorage();
        return true;
    } catch (error) {
        console.error('Save failed', error);
        return false;
    }
}

async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.focus();
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    if (!copied) throw new Error('Clipboard access was denied.');
}

function addCodeCopyButtons(container) {
    container.querySelectorAll('pre').forEach((pre) => {
        const code = pre.querySelector('code');
        if (!code || pre.querySelector('.code-copy-btn')) return;

        const codeText = code.textContent || '';
        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'code-copy-btn';
        copyButton.title = 'Copy full code';
        copyButton.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5"></i><span>Copy code</span>';
        copyButton.onclick = async () => {
            try {
                await copyTextToClipboard(codeText);
                copyButton.classList.add('copied');
                copyButton.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i><span>Copied</span>';
                safeCreateIcons();
                window.setTimeout(() => {
                    copyButton.classList.remove('copied');
                    copyButton.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5"></i><span>Copy code</span>';
                    safeCreateIcons();
                }, 1600);
            } catch (error) {
                copyButton.textContent = 'Copy failed';
                window.setTimeout(() => {
                    copyButton.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5"></i><span>Copy code</span>';
                    safeCreateIcons();
                }, 1600);
            }
        };
        pre.appendChild(copyButton);
    });
}

userInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    updateSendState();
});
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) handleSend();
    }
});
sendBtn.addEventListener('click', handleSend);

function activateChatLayout() {
    if (!isChatActive) {
        isChatActive = true;
        heroBg.classList.add('hidden');
        heroSection.classList.add('hidden');
        chatHistoryDiv.classList.remove('hidden');
    }
}

function scrollToBottom() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

// ============================================================
// Rendering — rebuilds the whole visible chat from renderedMessages
// ============================================================
function rerenderChat() {
    chatHistoryDiv.innerHTML = '';
    renderedMessages.forEach((m, idx) => renderBubble(m, idx));
    safeCreateIcons();
    scrollToBottom();
}

function actionButton(icon, title, onClick, extraClass) {
    const btn = document.createElement('button');
    btn.className = `p-1.5 rounded-md text-[#6a6a6f] hover:text-white hover:bg-white/10 transition-colors ${extraClass || ''}`;
    btn.title = title;
    btn.innerHTML = `<i data-lucide="${icon}" class="w-3.5 h-3.5"></i>`;
    btn.onclick = onClick;
    return btn;
}

function renderBubble(m, idx) {
    const outer = document.createElement('div');
    outer.className = `flex w-full ${m.type === 'user' ? 'justify-end' : 'justify-start'}`;

    const wrapper = document.createElement('div');
    wrapper.className = `group relative flex flex-col ${m.type === 'user' ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%]`;

    if (m.type === 'user') {
        if (m.editing) {
            const box = document.createElement('div');
            box.className = 'w-full rounded-2xl px-4 py-3 bg-[#0b0d18] border border-red-500/40';
            const ta = document.createElement('textarea');
            ta.className = 'w-full bg-transparent text-white text-[15px] resize-none focus:outline-none';
            ta.value = m.text;
            ta.rows = Math.min(8, Math.max(2, Math.ceil(m.text.length / 40)));
            const btnRow = document.createElement('div');
            btnRow.className = 'flex gap-2 justify-end mt-2';
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'text-xs px-3 py-1.5 rounded-full text-[#8a8a8f] hover:text-white hover:bg-white/5';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.onclick = () => { m.editing = false; rerenderChat(); };
            const saveBtn = document.createElement('button');
            saveBtn.className = 'text-xs px-3 py-1.5 rounded-full bg-[#ff0033] hover:bg-[#ff1a47] text-white font-medium';
            saveBtn.textContent = 'Save & Regenerate';
            saveBtn.onclick = () => submitEditedUserMessage(idx, ta.value);
            btnRow.append(cancelBtn, saveBtn);
            box.append(ta, btnRow);
            wrapper.appendChild(box);
        } else {
            const bubble = document.createElement('div');
            bubble.className = 'rounded-2xl px-5 py-3.5 bg-[#ff0033] text-white break-words';
            bubble.style.cssText = 'overflow-wrap:break-word; word-break:break-word;';
            if (m.attachments && m.attachments.length) {
                const attachmentRow = document.createElement('div');
                attachmentRow.className = 'message-attachments';
                m.attachments.forEach((attachment) => {
                    const attachmentItem = document.createElement('span');
                    attachmentItem.className = 'message-attachment';
                    attachmentItem.textContent = `${attachment.name} · ${formatFileSize(attachment.size)}`;
                    attachmentRow.appendChild(attachmentItem);
                });
                bubble.appendChild(attachmentRow);
            }
            if (m.text) {
                const text = document.createElement('p');
                text.className = 'whitespace-pre-wrap text-[15px] leading-relaxed';
                text.textContent = m.text;
                bubble.appendChild(text);
            }
            wrapper.appendChild(bubble);

            const actions = document.createElement('div');
            actions.className = 'flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity';
            actions.appendChild(actionButton('pencil', 'Edit & resend', () => { m.editing = true; rerenderChat(); }));
            wrapper.appendChild(actions);
        }
    } else if (m.type === 'ai') {
        const bubble = document.createElement('div');
        bubble.className = 'rounded-2xl px-5 py-3.5 bg-[#0b0d18] text-white border border-white/10 ai-message break-words';
        bubble.style.cssText = 'overflow-wrap:break-word; word-break:break-word;';
        const rendered = window.marked ? marked.parse(m.text) : escapeHtml(m.text);
        bubble.innerHTML = `<div class="text-[15px] leading-relaxed">${rendered}</div>`;
        addCodeCopyButtons(bubble);
        wrapper.appendChild(bubble);

        const actions = document.createElement('div');
        actions.className = 'flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity';
        actions.appendChild(actionButton('repeat', 'Regenerate this reply', () => regenerateAi(idx)));
        wrapper.appendChild(actions);
    } else if (m.type === 'image') {
        const sizeConfig = m.sizeConfig || imageSizes[0];
        const box = document.createElement('div');
        box.className = 'relative w-full';
        box.style.cssText = 'width:100%; max-width:384px; box-sizing:border-box;';

        if (m.loading) {
            box.innerHTML = `<div style="aspect-ratio: ${sizeConfig.width}/${sizeConfig.height}; width:100%;" class="relative rounded-xl overflow-hidden bg-[#0b0d18] border border-white/10 flex flex-col items-center justify-center shadow-2xl"><div class="absolute inset-0 bg-gradient-to-b from-transparent via-red-600/10 to-transparent w-full h-full animate-[scan_2s_linear_infinite]"></div><div class="relative z-10 p-3 rounded-full bg-red-600/20 animate-pulse"><i data-lucide="image" class="w-8 h-8 text-red-500"></i></div></div>`;
        } else if (m.error) {
            box.innerHTML = `<div class="rounded-xl bg-[#0b0d18] border border-white/10 p-5 text-red-400 text-sm">${escapeHtml(m.error)}</div>`;
        } else if (m.imageUrl) {
            box.innerHTML = `<div class="relative group/img w-full"><img src="${m.imageUrl}" alt="Generated Image" class="w-full h-auto rounded-lg shadow-lg object-cover" style="max-width:100%; height:auto; display:block;" /><div class="image-action-bar"><button class="image-action-btn save-btn" title="Save image" aria-label="Save image"><i data-lucide="bookmark" class="w-4 h-4"></i><span>Save</span></button><button class="image-action-btn dl-btn" title="Download image" aria-label="Download image"><i data-lucide="download" class="w-4 h-4"></i><span>Download</span></button></div></div>`;
            box.querySelector('.dl-btn').onclick = () => downloadImage(m.imageUrl);
            box.querySelector('.save-btn').onclick = (event) => {
                const button = event.currentTarget;
                if (saveImage(m.imageUrl)) {
                    button.classList.add('saved');
                    button.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i><span>Saved</span>';
                    safeCreateIcons();
                }
            };
        }
        wrapper.appendChild(box);

        const actions = document.createElement('div');
        actions.className = 'flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity';
        if (!m.loading) {
            actions.appendChild(actionButton('repeat', 'Generate a new variation', () => regenerateImage(idx)));
        }
        wrapper.appendChild(actions);
    }

    outer.appendChild(wrapper);
    chatHistoryDiv.appendChild(outer);
}

// ============================================================
// Sending / regenerating
// ============================================================
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error(`Could not read ${file.name}`));
        reader.readAsDataURL(file);
    });
}

async function buildAttachmentParts(files) {
    const parts = [];

    for (const file of files) {
        if (isInlineImage(file)) {
            const dataUrl = await readFileAsDataUrl(file);
            const commaIndex = dataUrl.indexOf(',');
            if (commaIndex > -1) {
                parts.push({
                    inline_data: {
                        mime_type: file.type || 'application/octet-stream',
                        data: dataUrl.slice(commaIndex + 1)
                    }
                });
            }
            parts.push({ text: `[Attached image: ${file.name}]` });
            continue;
        }

        if (isTextAttachment(file)) {
            const content = (await file.text()).slice(0, MAX_TEXT_CHARS);
            const truncated = file.size > MAX_TEXT_CHARS ? '\n[File content truncated for safety]' : '';
            parts.push({ text: `\n[Attached file: ${file.name}]\n${content}${truncated}` });
            continue;
        }

        parts.push({
            text: `[Attached file: ${file.name} | ${file.type || 'unknown type'} | ${formatFileSize(file.size)}]\nThis binary file is attached, but its contents are not decoded by this model.`
        });
    }

    return parts;
}

async function handleSend() {
    const text = userInput.value.trim();
    const files = selectedFiles.slice();
    if (!text && files.length === 0) return;

    activateChatLayout();
    userInput.value = '';
    userInput.style.height = '80px';
    selectedFiles = [];
    renderAttachmentList();
    sendBtn.disabled = true;
    userInput.disabled = true;

    if (selectedModel === 'art-gen-sys') {
        await handleImageGeneration(text || 'Create a creative image inspired by the attached files');
    } else {
        await handleChatMessage(text, files);
    }

    userInput.disabled = false;
    userInput.focus();
}

async function fetchAiReply() {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ history: chatHistory, model: selectedModel })
        });
        const data = await response.json();
        if (response.ok) {
            const aiText = data.candidates[0].content.parts[0].text;
            const aiChatIndex = chatHistory.length;
            chatHistory.push({ role: 'model', parts: [{ text: aiText }] });
            renderedMessages.push({ type: 'ai', text: aiText, chatIndex: aiChatIndex });
        } else {
            renderedMessages.push({ type: 'ai', text: `Error: ${data.error?.message || 'Server Error'}`, chatIndex: chatHistory.length });
        }
    } catch (err) {
        renderedMessages.push({ type: 'ai', text: `Network error: ${err.message}`, chatIndex: chatHistory.length });
    }
}

async function handleChatMessage(text, files = []) {
    const userChatIndex = chatHistory.length;
    const parts = [];
    if (text) parts.push({ text });
    try {
        parts.push(...await buildAttachmentParts(files));
    } catch (error) {
        parts.push({ text: `[Attachment could not be read: ${error.message}]` });
    }
    chatHistory.push({ role: 'user', parts });
    renderedMessages.push({
        type: 'user',
        text,
        attachments: files.map(fileMeta),
        chatIndex: userChatIndex
    });
    rerenderChat();

    loadingIndicator.classList.remove('hidden');
    scrollToBottom();
    await fetchAiReply();
    loadingIndicator.classList.add('hidden');

    rerenderChat();
    saveToLocalStorage();
    sendBtn.disabled = false;
}

async function regenerateAi(idx) {
    const msg = renderedMessages[idx];
    if (!msg || msg.type !== 'ai') return;

    chatHistory = chatHistory.slice(0, msg.chatIndex);
    renderedMessages = renderedMessages.slice(0, idx);
    rerenderChat();

    loadingIndicator.classList.remove('hidden');
    scrollToBottom();
    await fetchAiReply();
    loadingIndicator.classList.add('hidden');

    rerenderChat();
    saveToLocalStorage();
}

async function submitEditedUserMessage(idx, newTextRaw) {
    const newText = newTextRaw.trim();
    if (!newText) return;
    const msg = renderedMessages[idx];
    if (!msg || msg.type !== 'user') return;

    chatHistory = chatHistory.slice(0, msg.chatIndex);
    renderedMessages = renderedMessages.slice(0, idx);

    activateChatLayout();
    await handleChatMessage(newText);
}

async function handleImageGeneration(text) {
    const nsfwRegex = /\b(sex|sexy|nude|naked|porn|nsfw|boobs|erotic)\b/i;
    if (nsfwRegex.test(text)) {
        renderedMessages.push({ type: 'ai', text: 'দুঃখিত, এই ধরনের কনটেন্ট তৈরি করা সম্ভব না। অন্য কিছু চেষ্টা করুন।', chatIndex: -1 });
        rerenderChat();
        sendBtn.disabled = false;
        return;
    }

    const sizeConfig = imageSizes.find(s => s.id === selectedImageSize) || imageSizes[0];
    const msgIndex = renderedMessages.length;
    renderedMessages.push({ type: 'image', prompt: text, sizeConfig, loading: true });
    rerenderChat();
    scrollToBottom();

    await fetchImageAndUpdate(msgIndex, text, sizeConfig);
    saveToLocalStorage();
    sendBtn.disabled = false;
}

async function fetchImageAndUpdate(msgIndex, prompt, sizeConfig) {
    try {
        const response = await fetch('/api/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, width: sizeConfig.width, height: sizeConfig.height })
        });
        const data = await response.json();

        if (!response.ok) {
            renderedMessages[msgIndex] = { ...renderedMessages[msgIndex], loading: false, error: data.error?.message || 'Image generation failed.' };
            rerenderChat();
            return;
        }

        const imageUrl = data.imageUrl;
        await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                renderedMessages[msgIndex] = { ...renderedMessages[msgIndex], loading: false, imageUrl, error: null };
                rerenderChat();
                resolve();
            };
            img.onerror = () => {
                renderedMessages[msgIndex] = { ...renderedMessages[msgIndex], loading: false, error: 'Failed to generate image. Please try again.' };
                rerenderChat();
                resolve();
            };
            img.src = imageUrl;
        });
    } catch (err) {
        renderedMessages[msgIndex] = { ...renderedMessages[msgIndex], loading: false, error: `Network error: ${err.message}` };
        rerenderChat();
    }
}

async function regenerateImage(idx) {
    const msg = renderedMessages[idx];
    if (!msg || msg.type !== 'image') return;
    renderedMessages[idx] = { ...msg, loading: true, imageUrl: null, error: null };
    rerenderChat();
    await fetchImageAndUpdate(idx, msg.prompt, msg.sizeConfig || imageSizes[0]);
    saveToLocalStorage();
}
