// Video chat with messaging - connects to backend for both video signaling and text chat

// Global state
let socket;
let pc = null;
let localStream = null;
let room = null;
let isInitiator = false;
let isConnected = false;

// Socket initialization
function initSocket() {
    if (socket && socket.connected) {
        console.log('[video] Socket already connected');
        return;
    }
    
    const backendUrl = window.__BACKEND_URL || `${location.protocol}//${location.hostname}:3000`;
    const signalingPath = window.__SIGNALING_PATH || '/signaling';
    console.log('[video] Creating socket to', backendUrl, 'path:', signalingPath);
    
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

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSocket);
} else {
    initSocket();
}

// Fallback init on window load
window.addEventListener('load', () => {
    if (!socket || !socket.connected) initSocket();
});

// DOM elements - using IDs from current video.html
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const statusEl = document.getElementById('status');
const chatEl = document.getElementById('chat');
const msgEl = document.getElementById('message');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const reallyBtn = document.getElementById('reallyBtn');
const sendBtn = document.getElementById('sendBtn');
const onlineEl = document.getElementById('onlineCount');
const blockBtn = document.getElementById('mod-block');
const reportBtn = document.getElementById('mod-report');
let partnerId = null;

// Start local video stream
async function startLocal() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true 
    });
    if (localVideo) localVideo.srcObject = localStream;
    console.log('[video] Local stream started');
  } catch (err) {
    console.error('[video] Error accessing media:', err);
    if (statusEl) statusEl.textContent = 'Error: Cannot access camera/microphone. ' + err.message;
  }
}

// Create WebRTC peer connection
function createPeerConnection() {
  const config = { 
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ] 
  };
  pc = new RTCPeerConnection(config);
  console.log('[video] PeerConnection created');
  
  // Add local stream tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
      console.log('[video] Added track:', track.kind);
    });
  }

  // Handle remote stream
  pc.ontrack = (event) => {
    console.log('[video] Received remote track:', event.track.kind);
    if (remoteVideo) remoteVideo.srcObject = event.streams[0];
  };

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate && socket && room) {
      socket.emit('signal', { room, data: { type: 'ice', candidate: event.candidate } });
    }
  };

  // Connection state changes
  pc.onconnectionstatechange = () => {
    console.log('[video] Connection state:', pc.connectionState);
    if (pc.connectionState === 'failed') {
      console.error('[video] PeerConnection failed');
      if (statusEl) statusEl.textContent = 'Connection failed. Click Next to try again.';
    }
  };
}

// Setup socket event listeners
function setupSocketListeners() {
  socket.on('connect', () => {
    console.log('[video] Connected to backend:', socket.id);
    if (statusEl) statusEl.textContent = 'Connected. Click Start to find a stranger.';
  });

  socket.on('error', (err) => {
    console.error('[video] Socket error:', err);
  });

  socket.on('connect_error', (err) => {
    console.error('[video] Socket connect_error:', err);
  });

  socket.on('numberOfOnline', (size) => {
    console.log('[video] numberOfOnline event:', size);
    if (onlineEl) {
      onlineEl.textContent = `${size} Online`;
      console.log('[video] Updated online count to:', size);
    }
  });

  socket.on('waiting', () => {
    console.log('[video] Waiting for another user...');
    if (statusEl) statusEl.textContent = 'Searching for a stranger...';
  });

  socket.on('matched', async (data) => {
    console.log('[video] Matched! Room:', data.room, 'Initiator:', data.initiator);
    room = data.room;
    isInitiator = data.initiator;
    isConnected = true;
    
    if (statusEl) statusEl.textContent = 'Connected! Starting video...';
    
    createPeerConnection();

    if (isInitiator) {
      console.log('[video] I am initiator, creating offer');
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { room, data: { type: 'offer', sdp: offer } });
      } catch (err) {
        console.error('[video] Error creating offer:', err);
      }
    }

    // Update UI - show Next (blue) button instead of Start
    if (msgEl) msgEl.disabled = false;
    if (startBtn) startBtn.style.display = 'none';
    if (reallyBtn) reallyBtn.style.display = 'none';
    if (stopBtn) {
      stopBtn.style.display = 'block';
      stopBtn.textContent = 'Next';
      stopBtn.classList.remove('danger');
      stopBtn.classList.add('primary');
    }
    // Show moderation icons
    if (blockBtn) blockBtn.classList.remove('hide');
    if (reportBtn) reportBtn.classList.remove('hide');
    addSystemMessage('Connected to a stranger!');
  });

  socket.on('signal', async (data) => {
    try {
      if (data.type === 'offer') {
        console.log('[video] Received offer');
        if (!pc) createPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { room, data: { type: 'answer', sdp: answer } });
      } else if (data.type === 'answer') {
        console.log('[video] Received answer');
        if (pc && pc.remoteDescription === null) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }
      } else if (data.type === 'ice') {
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.warn('[video] ICE candidate add failed', e);
          }
        }
      }
    } catch (err) {
      console.error('[video] Signal handling error:', err);
    }
  });

  socket.on('strangerDisconnected', (msg) => {
    console.log('[video] Stranger disconnected:', msg);
    if (statusEl) statusEl.textContent = msg;
    addSystemMessage(msg);
    resetVideoChat();
  });

  socket.on('goodBye', (msg) => {
    console.log('[video] Good bye:', msg);
    if (statusEl) statusEl.textContent = msg;
    addSystemMessage(msg);
    resetVideoChat();
  });

  socket.on('newMessageToClient', (data) => {
    // Capture partnerId from first stranger message
    if (!partnerId && data.id !== socket.id) partnerId = data.id;
    console.log('[video] Message from', data.id === socket.id ? 'me' : 'stranger');
    addMessage(data.msg, data.id === socket.id);
  });

  // Show when stranger is typing
  socket.on('strangerIsTyping', (msg) => {
    console.log('[video] Stranger is typing:', msg);
    showTypingIndicator(msg);
  });

  // Remove typing indicator
  socket.on('strangerIsDoneTyping', () => {
    console.log('[video] Stranger done typing');
    hideTypingIndicator();
  });
}

// UI Events setup
function setupEventListeners() {
  // Start button - find a random stranger for video
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      console.log('[video] Start clicked, socket:', socket ? socket.id : 'NOT CONNECTED');
      if (!socket || !socket.connected) {
        console.error('[video] Socket not connected!');
        alert('Connecting to server... please wait and try again');
        return;
      }

        // Immediately show Stop button (red) while searching, like classic Omegle UI
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) { stopBtn.style.display = 'block'; stopBtn.classList.add('danger'); }
        if (statusEl) statusEl.textContent = 'Searching for a stranger...';

        if (!localStream) {
          await startLocal();
        }

        console.log('[video] Emitting find event for video mode...');
        socket.emit('find', { interests: [], mode: 'video' });
    });
    console.log('[video] Start button listener attached');
  } else {
    console.error('[video] Start button not found!');
  }

  // Stop button - show exit modal if connected, else show Really?
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      console.log('[video] Stop clicked - isConnected=', isConnected);
      if (isConnected) {
        openExitModal();
        return;
      }
      // Not connected: show confirmation (Really?)
      stopBtn.style.display = 'none';
      if (reallyBtn) reallyBtn.style.display = 'block';
    });
  }

  // Really button - confirm disconnect
  if (reallyBtn) {
    reallyBtn.addEventListener('click', () => {
      console.log('[video] Really confirmed - disconnecting');
      if (socket) socket.emit('stop');
      resetVideoChat();
      setTimeout(() => window.location.href = '/', 300);
    });
  }

  // Moderation icon handlers (in navbar)
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
      if (socket && socket.connected) socket.emit('stop');
      closeExitModal();
      resetVideoChat();
      setTimeout(() => {
        if (socket && socket.connected) socket.emit('find', { interests: [], mode: 'video' });
      }, 300);
    });
  }

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
      closeExitModal();
      resetVideoChat();
      setTimeout(() => {
        if (socket && socket.connected) socket.emit('find', { interests: [], mode: 'video' });
      }, 300);
    });
  }

  // Exit modal handlers
  document.getElementById('modal-send')?.addEventListener('click', modalSendHandler);
  document.getElementById('modal-yes')?.addEventListener('click', modalYesHandler);
  document.getElementById('modal-close')?.addEventListener('click', closeExitModal);
  document.getElementById('modal-backdrop')?.addEventListener('click', closeExitModal);

  // Send message button
  if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
  }

  // Message input - Enter to send
  if (msgEl) {
    // Enter to send (Shift+Enter for newline)
    msgEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Typing indicator and enabling send button
        let typingTimer = null;
        const TYPING_TIMEOUT = 1400; // ms of inactivity before sending doneTyping

        msgEl.addEventListener('input', (e) => {
          const v = e.target.value;
          // Enable/disable send button
          if (sendBtn) sendBtn.disabled = !/\S/.test(v);

          // Send a fixed typing state string rather than a preview
          if (socket && socket.connected && /\S/.test(v)) {
            socket.emit('typing', 'Stranger is typing...');
          }

          // Reset the done-typing debounce
          if (typingTimer) clearTimeout(typingTimer);
          typingTimer = setTimeout(() => {
            if (socket && socket.connected) socket.emit('doneTyping');
          }, TYPING_TIMEOUT);
        });

        msgEl.addEventListener('blur', () => {
          if (typingTimer) clearTimeout(typingTimer);
          if (socket && socket.connected) socket.emit('doneTyping');
        });
  }
}

// Send message helper
function sendMessage() {
  if (!msgEl) return;
  const text = msgEl.value.trim();
  if (text && socket && room) {
    // Do not locally append here; server will echo the message back to both peers
    socket.emit('newMessageToServer', text);
    msgEl.value = '';
    if (sendBtn) sendBtn.disabled = true;
  }
}

// Add message bubble
function addMessage(text, isOwn) {
  const bubble = document.createElement('div');
  bubble.className = 'bubble ' + (isOwn ? 'you' : 'them');

  const name = document.createElement('span');
  name.className = 'name ' + (isOwn ? 'blue' : 'red');
  name.textContent = isOwn ? 'You: ' : 'Stranger: ';

  const txt = document.createElement('span');
  txt.className = 'text';
  txt.textContent = text;

  bubble.appendChild(name);
  bubble.appendChild(txt);

  if (chatEl) {
    chatEl.appendChild(bubble);
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}

// Add system message
function addSystemMessage(text) {
  const bubble = document.createElement('div');
  bubble.className = 'bubble system';
  bubble.textContent = text;
  if (chatEl) {
    chatEl.appendChild(bubble);
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}

// Typing indicator helpers
function showTypingIndicator(msg) {
  // Avoid adding duplicate typing element
  if (!chatEl) return;
  const el = chatEl.querySelector('.typing');
  const text = 'Stranger is typing...';
  if (el) {
    el.textContent = text;
    return;
  }
  const bubble = document.createElement('div');
  bubble.className = 'bubble system typing';
  bubble.textContent = text;
  chatEl.appendChild(bubble);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function hideTypingIndicator() {
  if (!chatEl) return;
  const el = chatEl.querySelector('.typing');
  if (el) el.remove();
}

// Exit modal helpers
function openExitModal() {
  const modal = document.getElementById('exit-modal');
  if (!modal) return;
  modal.classList.remove('hide');
  modal.setAttribute('aria-hidden', 'false');
  const ta = document.getElementById('exit-note');
  if (ta) ta.focus();
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
  if (val && socket && room) {
    socket.emit('doneTyping');
    socket.emit('newMessageToServer', val);
    addMessage(val, true);
  }
  if (socket && socket.connected) socket.emit('stop');
  closeExitModal();
  resetVideoChat();
  setTimeout(() => {
    if (socket && socket.connected) socket.emit('find', { interests: [], mode: 'video' });
  }, 300);
}

function modalYesHandler(e) {
  e.preventDefault();
  if (socket && socket.connected) socket.emit('stop');
  closeExitModal();
  resetVideoChat();
  setTimeout(() => {
    if (socket && socket.connected) socket.emit('find', { interests: [], mode: 'video' });
  }, 300);
}

// Reset video chat state
function resetVideoChat() {
  console.log('[video] Resetting video chat state');
  
  // Reset UI
  if (msgEl) {
    msgEl.disabled = true;
    msgEl.value = '';
  }
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.style.display = 'block';
  }
  if (stopBtn) {
    stopBtn.style.display = 'none';
    stopBtn.textContent = 'Stop';
    stopBtn.classList.remove('primary');
    stopBtn.classList.add('danger');
  }
  if (reallyBtn) reallyBtn.style.display = 'none';
  if (blockBtn) blockBtn.classList.add('hide');
  if (reportBtn) reportBtn.classList.add('hide');
  partnerId = null;
  
  // Close peer connection
  if (pc) {
    pc.close();
    pc = null;
  }
  
  // Stop remote stream
  if (remoteVideo && remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(track => track.stop());
    remoteVideo.srcObject = null;
  }
  
  room = null;
  isInitiator = false;
  isConnected = false;
  if (statusEl) statusEl.textContent = 'Stopped. Click Start to find another stranger.';
  // remove typing indicator if present
  hideTypingIndicator();
}

// Initialize on page load
window.addEventListener('load', async () => {
  console.log('[video] Window load event');
  if (!localStream) {
    await startLocal();
  }
  if (statusEl) statusEl.textContent = 'Ready. Click Start to find a stranger.';
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  console.log('[video] Page unload - cleaning up');
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (pc) {
    pc.close();
  }
  if (socket) {
    socket.disconnect();
  }
});
