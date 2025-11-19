// Initialize socket after config is injected
let socket;
const conversation = document.querySelector('.conversation');
let alreadyTyping = false;
let typingTimerChat = null;
const TYPING_TIMEOUT_CHAT = 1400;
let pendingStart = false;
let isConnected = false; // Track if currently in a conversation

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
        document.querySelector('#text').disabled = false;
        document.querySelector('#send').disabled = false;
        isConnected = true;
        console.log('[chat] Chat started - isConnected=true');
    });

    // Receive message from stranger
    socket.on('newMessageToClient', data => {
        const notStranger = data.id === socket.id;
        if (conversation) {
            conversation.innerHTML += `
                <div class="chat">
                    <span class="${notStranger ? 'name blue' : 'name red'}">${notStranger ? 'You: ' : 'Stranger: '} </span>
                    <span class="text">${data.msg}</span>
                </div>
            `;
            conversation.scrollTo(0, conversation.scrollHeight);
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
          // If socket is not created yet, initialize it
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
            // If currently connected, this button acts as 'Next': disconnect and find another
            if (isConnected) {
                if (socket) socket.emit('stop');
                // Reset UI state
                reset();
                // Start searching again after a short delay
                setTimeout(() => {
                    if (socket && socket.connected) {
                        console.log('[chat] Emitting start to find next stranger...');
                        socket.emit('start', socket.id);
                    }
                }, 250);
                return;
            }
            // Not connected: show Really? confirmation
            stopBtn.classList.add('hide');
            document.querySelector('#really')?.classList.remove('hide');
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

// Submit message helper
function submitMessage() {
    const input = document.querySelector('#text');
    if(/\S/.test(input.value)) {
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
    
    document.querySelector('#send').disabled = true;
    
    const typing = document.querySelector('.typing');
    if(typing) typing.remove();
    
    alreadyTyping = false;
    isConnected = false;
    if (conversation) conversation.scrollTo(0, conversation.scrollHeight);
}