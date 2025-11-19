// Initialize socket after config is injected
let socket;
const conversation = document.querySelector('.conversation');
let alreadyTyping = false;
let typingTimerChat = null;
const TYPING_TIMEOUT_CHAT = 1400;
let pendingStart = false;
let isConnected = false; // Track if currently in a conversation
let partnerId = null; // store current stranger id when known

// Wait for config.js to load
function waitForConfig() {
    return new Promise((resolve) => {
        if (window.__BACKEND_URL && window.__SIGNALING_PATH) {
            console.log('[chat] Config already loaded:', window.__BACKEND_URL);
            resolve();
            return;
        }
        
        const checkConfig = setInterval(() => {
            if (window.__BACKEND_URL && window.__SIGNALING_PATH) {
                console.log('[chat] Config loaded:', window.__BACKEND_URL);
                clearInterval(checkConfig);
                resolve();
            }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkConfig);
            console.warn('[chat] Config not loaded, using defaults');
            resolve();
        }, 5000);
    });
}

// Socket setup
function initSocket() {
    if (socket && socket.connected) {
        console.log('[chat] Socket already connected');
        return;
    }
    
    const backendUrl = window.__BACKEND_URL || `${location.protocol}//${location.hostname}:3000`;
    const signalingPath = window.__SIGNALING_PATH || '/signaling';
    console.log('[chat] Creating socket to', backendUrl, 'path:', signalingPath);
    
    socket = io(backendUrl, { 
        path: signalingPath,
        transports: ['polling', 'websocket'],
        reconnectionDelay: 1000,
        reconnection: true,
        upgrade: true
    });
    
    setupSocketListeners();
    setupEventListeners();
}

// Initialize when DOM is ready
function startInit() {
    waitForConfig().then(() => {
        console.log('[chat] Starting socket initialization...');
        initSocket();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startInit);
} else {
    startInit();
}

// Ensure initialized on load too
window.addEventListener('load', () => {
    if (!socket || !socket.connected) {
        console.log('[chat] Reconnecting on window load...');
        startInit();
    }
});

// All socket event listeners
function setupSocketListeners() {
  socket.on('connect', () => {
        console.log('[chat] Socket connected:', socket.id);
        console.log('[chat] Socket ready, you can now click Start button');
        // Request online count immediately after connecting
        if (socket && socket.emit) {
          socket.emit('getOnlineCount');
        }
        if (pendingStart) {
            console.log('[chat] Pending start detected, emitting start now');
            socket.emit('start', socket.id);
            pendingStart = false;
        }
  });

  socket.on('connect_error', (err) => {
    console.error('[chat] Socket connect_error:', err);
  });

  socket.on('error', (err) => {
    console.error('[chat] Socket error:', err);
  });

  // Update online count in real-time
  socket.on('numberOfOnline', size => {
    console.log('[chat] numberOfOnline event:', size);
    const onlineEl = document.querySelector('.online');
    if (onlineEl) {
      const displayText = `${size} online now`;
      onlineEl.textContent = displayText;
      onlineEl.innerHTML = displayText;
      onlineEl.style.display = 'block';
      onlineEl.style.visibility = 'visible';
      console.log('[chat] ✓ Updated .online element to:', displayText);
    } else {
      console.warn('[chat] ✗ .online element not found!');
      console.warn('[chat] Available elements:', document.querySelectorAll('[class*="online"]'));
    }
  });

  // Display searching message
    socket.on('searching', msg => {
        if (conversation) conversation.innerHTML = `<div class="message">${msg}</div>`;
    });

    // Found someone - start chat
    socket.on('chatStart', msg => {
        if (conversation) conversation.innerHTML = `<div class="message">${msg}</div>`;
        document.querySelector('#stop')?.classList.remove('hide');
        document.querySelector('#start')?.classList.add('hide');
        document.querySelector('#really')?.classList.add('hide');
        const textEl = document.querySelector('#text');
        if (textEl) textEl.disabled = false;
        const sendEl = document.querySelector('#send');
        if (sendEl) sendEl.disabled = false;
        isConnected = true;
        // Show Next label on the stop button and show moderation icons
        const stopBtn = document.querySelector('#stop');
        if (stopBtn) stopBtn.textContent = 'Next';
        document.querySelector('#mod-block')?.classList.remove('hide');
        document.querySelector('#mod-report')?.classList.remove('hide');
        console.log('[chat] Chat started - isConnected=true');
    });

    // Receive message from stranger
    socket.on('newMessageToClient', data => {
        const notStranger = data.id === socket.id;
        const conv = document.querySelector('.conversation');
        if (conv) {
            // capture partner id from first incoming stranger message
            if (!notStranger && !partnerId && data.id) partnerId = data.id;
            conv.innerHTML += `
                <div class="chat">
                    <span class="${notStranger ? 'name blue' : 'name red'}">${notStranger ? 'You: ' : 'Stranger: '} </span>
                    <span class="text">${data.msg}</span>
                </div>
            `;
            conv.scrollTo(0, conv.scrollHeight);
        }
    });

    // Show when stranger is typing (fixed state message, update in-place)
    socket.on('strangerIsTyping', msg => {
        const typingEl = document.querySelector('.typing');
        if (typingEl) {
            typingEl.textContent = 'Stranger is typing...';
            return;
        }

        if (conversation) {
            const el = document.createElement('div');
            el.className = 'message typing';
            el.textContent = 'Stranger is typing...';
            conversation.appendChild(el);
            conversation.scrollTo(0, conversation.scrollHeight);
        }
    });

    // Remove typing indicator
    socket.on('strangerIsDoneTyping', () => {
        const typing = document.querySelector('.typing');
        if(typing) typing.remove();
    });

    // Stranger disconnected
    socket.on('goodBye', msg => {
        if (conversation) conversation.innerHTML += `<div class="message">${msg}</div>`;
        reset();
    });

    // Stranger disconnected
    socket.on('strangerDisconnected', msg => {
        if (conversation) conversation.innerHTML += `<div class="message">${msg}</div>`;
        isConnected = false;
        reset();
    });

    // Current user disconnected
    socket.on('endChat', msg => {
        if (conversation) conversation.innerHTML += `<div class="message">${msg}</div>`;
        isConnected = false;
        reset();
    });
}

// Setup DOM event listeners
function setupEventListeners() {
  // Ensure DOM is ready before querying elements
  if (!document.querySelector('#start')) {
    console.warn('[chat] Start button not yet in DOM, will retry...');
    setTimeout(setupEventListeners, 100);
    return;
  }

  // Start button - search for stranger
  const startBtn = document.querySelector('#start');
  if (startBtn) {
    console.log('[chat] Found start button, attaching listener');
    startBtn.style.pointerEvents = 'auto';
    startBtn.style.cursor = 'pointer';
    startBtn.disabled = false;
    startBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      console.log('[chat] === START BUTTON CLICKED ===');
      console.log('[chat] Socket exists:', !!socket);
      console.log('[chat] Socket ID:', socket?.id);
      console.log('[chat] Socket connected:', socket?.connected);
      console.log('[chat] Socket readyState:', socket?.io?.engine?.readyState);
      
            // toggle UI immediately to show searching state (Start -> Stop)
            const stopBtn = document.querySelector('#stop');
            if (stopBtn) {
                stopBtn.textContent = 'Stop';
                stopBtn.classList.remove('hide');
            }
            startBtn.classList.add('hide');

            if (socket && socket.connected) {
                console.log('[chat] Emitting start event...');
                socket.emit('start', socket.id);
            } else {
                console.error('[chat] Socket not connected! Queuing start and attempting to reconnect...');
                pendingStart = true;
                if (socket) {
                    console.log('[chat] Forcing socket reconnect');
                    socket.connect();
                } else {
                    try { 
                        console.log('[chat] Initializing socket...');
                        initSocket(); 
                    } catch (e) { 
                        console.warn('[chat] initSocket failed to start', e); 
                    }
                }
                alert('Connecting to server... trying to find a partner; will start automatically when connected');
            }
    });
    console.log('[chat] ✓ Start button listener attached successfully');
  } else {
    console.error('[chat] ✗ Start button not found!');
  }    // Stop button - if connected find next, otherwise show Really? confirmation
    const stopBtn = document.querySelector('#stop');
    if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                console.log('[chat] Stop clicked - isConnected=', isConnected);
                // If currently connected, this button acts as 'Next': open professional modal
                if (isConnected) {
                    openExitModal();
                    return;
                }
                // Not connected: show Really? confirmation (go home)
                stopBtn.classList.add('hide');
                document.querySelector('#really')?.classList.remove('hide');
            });
    }

        // Moderation icon handlers (in navbar)
        const blockBtn = document.querySelector('#mod-block');
        if (blockBtn) {
            blockBtn.addEventListener('click', () => {
                if (!partnerId) {
                    alert('No partner identified yet to block.');
                    return;
                }
                const blocked = JSON.parse(localStorage.getItem('blockedUsers') || '[]');
                if (!blocked.includes(partnerId)) {
                    blocked.push(partnerId);
                    localStorage.setItem('blockedUsers', JSON.stringify(blocked));
                }
                if (socket && socket.connected) {
                    socket.emit('block', { id: partnerId });
                }
                // end chat and auto-connect to next
                if (socket && socket.connected) socket.emit('stop');
                reset();
                setTimeout(() => { if (socket && socket.connected) socket.emit('start', socket.id); }, 300);
            });
        }

        const reportBtn = document.querySelector('#mod-report');
        if (reportBtn) {
            reportBtn.addEventListener('click', () => {
                if (!partnerId) {
                    alert('No partner identified yet to report.');
                    return;
                }
                const reason = window.prompt('Please briefly describe the reason for reporting this user (optional):');
                const reports = JSON.parse(localStorage.getItem('reports') || '[]');
                reports.push({ id: partnerId, reason: reason || '', date: new Date().toISOString() });
                localStorage.setItem('reports', JSON.stringify(reports));
                if (socket && socket.connected) socket.emit('report', { id: partnerId, reason });
                alert('Thank you — the user has been reported. You will be connected to someone else.');
                if (socket && socket.connected) socket.emit('stop');
                reset();
                setTimeout(() => { if (socket && socket.connected) socket.emit('start', socket.id); }, 300);
            });
        }

    // Really button - confirm disconnect and go home
    const reallyBtn = document.querySelector('#really');
    if (reallyBtn) {
        reallyBtn.addEventListener('click', () => {
            console.log('[chat] Really confirmed - disconnecting and going home');
            if (socket) socket.emit('stop');
            setTimeout(() => window.location.href = '/', 300);
        });
    }

    // Form submit - send message
    const form = document.querySelector('.form');
    if (form) {
        form.addEventListener('submit', e => {
            e.preventDefault();
            submitMessage();
        });
    }

    // Enter key to send (Shift+Enter for newline)
    const textInput = document.querySelector('#text');
    if (textInput) {
        textInput.onkeydown = e => {
            if(e.keyCode === 13 && !e.shiftKey) {
                e.preventDefault();
                submitMessage();
            }
        };

        // Typing indicator with preview (send current text as typing preview)
        textInput.addEventListener('input', e => {
            const v = e.target.value;
            // emit preview if non-empty
            if (socket && socket.connected && /\S/.test(v)) {
                const preview = v.slice(0, 250);
                socket.emit('typing', preview);
            }

            // debounce doneTyping
            if (typingTimerChat) clearTimeout(typingTimerChat);
            typingTimerChat = setTimeout(() => {
                if (socket && socket.connected) socket.emit('doneTyping');
            }, TYPING_TIMEOUT_CHAT);
        });

        textInput.addEventListener('blur', () => {
            if (typingTimerChat) clearTimeout(typingTimerChat);
            if (socket && socket.connected) socket.emit('doneTyping');
            alreadyTyping = false;
        });
    }
}

// Exit modal helpers
function openExitModal() {
    const modal = document.getElementById('exit-modal');
    if (!modal) return;
    modal.classList.remove('hide');
    modal.setAttribute('aria-hidden', 'false');
    // focus the textarea
    const ta = document.getElementById('exit-note');
    if (ta) ta.focus();

    // wire modal buttons (idempotent)
    document.getElementById('modal-send')?.addEventListener('click', modalSendHandler);
    document.getElementById('modal-yes')?.addEventListener('click', modalYesHandler);
    document.getElementById('modal-close')?.addEventListener('click', closeExitModal);
    document.getElementById('modal-backdrop')?.addEventListener('click', closeExitModal);
}

function closeExitModal() {
    const modal = document.getElementById('exit-modal');
    if (!modal) return;
    modal.classList.add('hide');
    modal.setAttribute('aria-hidden', 'true');
    const ta = document.getElementById('exit-note');
    if (ta) ta.value = '';
}

function modalSendHandler(e) {
    e.preventDefault();
    const ta = document.getElementById('exit-note');
    const val = ta ? ta.value.trim() : '';
    if (val && socket && socket.connected) {
        // send a final message before leaving
        socket.emit('doneTyping');
        socket.emit('newMessageToServer', val);
        // append locally
        if (conversation) {
            conversation.innerHTML += `\n                <div class="chat">\n                    <span class="name blue">You: </span>\n                    <span class="text">${escapeHtml(val)}</span>\n                </div>\n            `;
            conversation.scrollTo(0, conversation.scrollHeight);
        }
    }
    // end chat and auto-connect to next
    if (socket && socket.connected) socket.emit('stop');
    closeExitModal();
    reset();
    setTimeout(() => { if (socket && socket.connected) socket.emit('start', socket.id); }, 300);
}

function modalYesHandler(e) {
    e.preventDefault();
    if (socket && socket.connected) socket.emit('stop');
    closeExitModal();
    reset();
    setTimeout(() => { if (socket && socket.connected) socket.emit('start', socket.id); }, 300);
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Submit message helper
function submitMessage() {
    const input = document.querySelector('#text');
    if (input && /\S/.test(input.value)) {
        if (socket) socket.emit('doneTyping');
        if (socket) socket.emit('newMessageToServer', input.value);
        input.value = '';
        alreadyTyping = false;
    }
}

// Reset UI
function reset() {
    document.querySelector('#start')?.classList.remove('hide');
    document.querySelector('#stop')?.classList.add('hide');
    document.querySelector('#really')?.classList.add('hide');
    
    const text = document.querySelector('#text');
    if (text) {
        text.disabled = true;
        text.value = '';
    }

    const sendEl = document.querySelector('#send');
    if (sendEl) sendEl.disabled = true;

    const typing = document.querySelector('.typing');
    if (typing) typing.remove();
    
    alreadyTyping = false;
    isConnected = false;
    // clear partner info and hide moderation buttons
    partnerId = null;
    document.querySelector('#mod-block')?.classList.add('hide');
    document.querySelector('#mod-report')?.classList.add('hide');
    const stopBtn = document.querySelector('#stop');
    if (stopBtn) stopBtn.textContent = 'Stop';
    const conv = document.querySelector('.conversation');
    if (conv) conv.scrollTo(0, conv.scrollHeight);
}