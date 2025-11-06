class GamerMessenger {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentChannel = 'general';
        this.mediaStream = null;
        this.peerConnections = new Map();
        this.isInCall = false;
        this.isScreenSharing = false;
        
        this.initializeApp();
    }

    initializeApp() {
        this.setupEventListeners();
        this.checkExistingAuth();
    }

    setupEventListeners() {
        // Авторизация
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));
        
        // Табы авторизации
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchAuthTab(e.target.dataset.tab));
        });

        // Выход
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        // Сообщения
        document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Каналы
        document.getElementById('create-channel-btn').addEventListener('click', () => this.showCreateChannelModal());
        document.getElementById('create-channel-form').addEventListener('submit', (e) => this.createChannel(e));
        document.getElementById('cancel-create-channel').addEventListener('click', () => this.hideCreateChannelModal());

        // Медиа управление
        document.getElementById('voice-call-btn').addEventListener('click', () => this.startVoiceCall());
        document.getElementById('video-call-btn').addEventListener('click', () => this.startVideoCall());
        document.getElementById('toggle-mic').addEventListener('click', () => this.toggleMicrophone());
        document.getElementById('toggle-camera').addEventListener('click', () => this.toggleCamera());
        document.getElementById('screen-share').addEventListener('click', () => this.toggleScreenShare());
        document.getElementById('leave-call').addEventListener('click', () => this.leaveCall());

        // Emoji
        document.getElementById('emoji-btn').addEventListener('click', () => this.toggleEmojiPicker());
        this.setupEmojiPicker();

        // Модальные окна
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideAllModals();
            }
        });
    }

    // Аутентификация
    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.currentUser = data.user;
                this.showApp();
                this.connectSocket();
            } else {
                this.showAuthMessage(data.error, 'error');
            }
        } catch (error) {
            this.showAuthMessage('Ошибка подключения к серверу', 'error');
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.showAuthMessage('Регистрация успешна! Теперь войдите.', 'success');
                this.switchAuthTab('login');
                document.getElementById('register-form').reset();
            } else {
                this.showAuthMessage(data.error, 'error');
            }
        } catch (error) {
            this.showAuthMessage('Ошибка подключения к серверу', 'error');
        }
    }

    switchAuthTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`${tab}-form`).classList.add('active');
        
        document.getElementById('auth-message').textContent = '';
    }

    showAuthMessage(message, type) {
        const messageEl = document.getElementById('auth-message');
        messageEl.textContent = message;
        messageEl.className = `message ${type}`;
    }

    // Основное приложение
    showApp() {
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
        
        document.getElementById('user-name').textContent = this.currentUser.username;
        document.getElementById('user-avatar').textContent = this.currentUser.username.charAt(0).toUpperCase();
    }

    logout() {
        this.currentUser = null;
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.stopAllMedia();
        
        document.getElementById('app-screen').classList.remove('active');
        document.getElementById('auth-screen').classList.add('active');
        document.getElementById('login-form').reset();
        document.getElementById('register-form').reset();
        document.getElementById('auth-message').textContent = '';
    }

    checkExistingAuth() {
        // Проверка сохраненной сессии (упрощенная версия)
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
            this.showApp();
            this.connectSocket();
        }
    }

    // Socket.io
    connectSocket() {
        this.socket = io();

        this.socket.emit('authenticate', this.currentUser);

        this.socket.on('users-update', (users) => this.updateUsersList(users));
        this.socket.on('channels-list', (channels) => this.updateChannelsList(channels));
        this.socket.on('new-message', (message) => this.displayMessage(message));
        this.socket.on('messages-history', (data) => this.loadMessagesHistory(data));
        this.socket.on('channel-created', (channel) => this.addChannel(channel));

        // WebRTC события
        this.socket.on('webrtc-offer', (data) => this.handleOffer(data));
        this.socket.on('webrtc-answer', (data) => this.handleAnswer(data));
        this.socket.on('webrtc-ice-candidate', (candidate) => this.handleIceCandidate(candidate));
        this.socket.on('user-media-update', (data) => this.updateUserMedia(data));
        this.socket.on('user-voice-activity', (data) => this.updateVoiceActivity(data));
        this.socket.on('user-screen-share-started', (data) => this.handleScreenShareStarted(data));
        this.socket.on('user-screen-share-stopped', (data) => this.handleScreenShareStopped(data));

        // Загрузка сообщений текущего канала
        this.socket.emit('get-messages', this.currentChannel);
    }

    // Пользователи и каналы
    updateUsersList(users) {
        const usersList = document.getElementById('users-list');
        const onlineCount = document.getElementById('online-count');
        
        onlineCount.textContent = users.length;
        usersList.innerHTML = '';

        users.forEach(user => {
            const userEl = document.createElement('div');
            userEl.className = 'user-item';
            userEl.innerHTML = `
                <div class="user-status ${user.status}"></div>
                <span>${user.username}</span>
            `;
            usersList.appendChild(userEl);
        });
    }

    updateChannelsList(channels) {
        const channelsList = document.getElementById('channels-list');
        channelsList.innerHTML = '';

        channels.forEach(channel => {
            const channelEl = document.createElement('div');
            channelEl.className = `channel-item ${channel.id === this.currentChannel ? 'active' : ''}`;
            channelEl.dataset.channelId = channel.id;
            channelEl.innerHTML = `
                <div class="channel-icon ${channel.type}"></div>
                <span>${channel.name}</span>
            `;
            channelEl.addEventListener('click', () => this.switchChannel(channel.id, channel.name));
            channelsList.appendChild(channelEl);
        });
    }

    switchChannel(channelId, channelName) {
        this.currentChannel = channelId;
        document.getElementById('current-channel').textContent = channelName;
        
        // Обновляем активный канал в списке
        document.querySelectorAll('.channel-item').forEach(item => {
            item.classList.toggle('active', item.dataset.channelId === channelId);
        });

        // Очищаем сообщения и загружаем историю
        document.getElementById('messages-container').innerHTML = '';
        this.socket.emit('get-messages', channelId);
    }

    // Сообщения
    sendMessage() {
        const input = document.getElementById('message-input');
        const message = input.value.trim();

        if (message && this.currentUser) {
            this.socket.emit('send-message', {
                channelId: this.currentChannel,
                message: message,
                type: 'text'
            });
            input.value = '';
        }
    }

    displayMessage(message) {
        if (message.channel_id !== this.currentChannel) return;

        const messagesContainer = document.getElementById('messages-container');
        const messageEl = document.createElement('div');
        messageEl.className = 'message-item';
        
        const time = new Date(message.created_at).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });

        messageEl.innerHTML = `
            <div class="message-avatar">${message.username.charAt(0).toUpperCase()}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="message-username">${message.username}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-text">${this.escapeHtml(message.message)}</div>
            </div>
        `;

        messagesContainer.appendChild(messageEl);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    loadMessagesHistory(data) {
        if (data.channelId !== this.currentChannel) return;

        const messagesContainer = document.getElementById('messages-container');
        messagesContainer.innerHTML = '';

        data.messages.forEach(message => this.displayMessage(message));
    }

    // Каналы
    showCreateChannelModal() {
        document.getElementById('create-channel-modal').classList.add('active');
    }

    hideCreateChannelModal() {
        document.getElementById('create-channel-modal').classList.remove('active');
        document.getElementById('create-channel-form').reset();
    }

    createChannel(e) {
        e.preventDefault();
        const name = document.getElementById('channel-name').value;
        const type = document.getElementById('channel-type').value;

        this.socket.emit('create-channel', { name, type });
        this.hideCreateChannelModal();
    }

    addChannel(channel) {
        this.updateChannelsList([...document.querySelectorAll('.channel-item').map(item => ({
            id: item.dataset.channelId,
            name: item.querySelector('span').textContent,
            type: item.querySelector('.channel-icon').classList.contains('voice') ? 'voice' : 'text'
        })), channel]);
    }

    // WebRTC и медиа функциональность
    async startVoiceCall() {
        await this.initializeMedia({ audio: true, video: false });
        this.showMediaArea('Голосовой вызов');
        this.isInCall = true;
    }

    async startVideoCall() {
        await this.initializeMedia({ audio: true, video: true });
        this.showMediaArea('Видео вызов');
        this.isInCall = true;
    }

    async initializeMedia(constraints) {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.createLocalVideoElement();
            this.setupMediaControls();
        } catch (error) {
            console.error('Ошибка доступа к медиа устройствам:', error);
            alert('Не удалось получить доступ к камере/микрофону');
        }
    }

    createLocalVideoElement() {
        const mediaContainer = document.getElementById('media-container');
        
        // Удаляем существующий локальный видео элемент
        const existingLocal = document.getElementById('local-video');
        if (existingLocal) existingLocal.remove();

        const videoContainer = document.createElement('div');
        videoContainer.className = 'video-container';
        videoContainer.innerHTML = `
            <video id="local-video" class="video-element" autoplay muted></video>
            <div class="video-overlay">
                <span class="video-user-name">${this.currentUser.username} (Вы)</span>
                <div class="video-indicators">
                    <div class="video-indicator muted" id="mic-indicator"></div>
                    <div class="video-indicator" id="camera-indicator"></div>
                </div>
            </div>
        `;

        const videoElement = videoContainer.querySelector('video');
        videoElement.srcObject = this.mediaStream;
        
        mediaContainer.appendChild(videoContainer);
    }

    setupMediaControls() {
        // Индикаторы состояния
        this.updateMediaIndicators();
        
        // Анализ голосовой активности
        this.setupVoiceActivityDetection();
    }

    setupVoiceActivityDetection() {
        if (!this.mediaStream) return;

        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(this.mediaStream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkVoiceActivity = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const isSpeaking = average > 20; // Порог чувствительности

            this.socket.emit('voice-activity', isSpeaking);
            this.updateSpeakingIndicator(isSpeaking);

            if (this.isInCall) {
                requestAnimationFrame(checkVoiceActivity);
            }
        };

        checkVoiceActivity();
    }

    updateSpeakingIndicator(isSpeaking) {
        const indicator = document.getElementById('local-video')?.parentElement?.querySelector('.speaking');
        if (indicator) {
            indicator.style.display = isSpeaking ? 'block' : 'none';
        }
    }

    updateMediaIndicators() {
        if (!this.mediaStream) return;

        const audioTracks = this.mediaStream.getAudioTracks();
        const videoTracks = this.mediaStream.getVideoTracks();

        const micIndicator = document.getElementById('mic-indicator');
        const cameraIndicator = document.getElementById('camera-indicator');

        if (micIndicator) {
            micIndicator.classList.toggle('muted', audioTracks.length === 0 || !audioTracks[0].enabled);
        }
        if (cameraIndicator) {
            cameraIndicator.classList.toggle('muted', videoTracks.length === 0 || !videoTracks[0].enabled);
        }
    }

    toggleMicrophone() {
        if (!this.mediaStream) return;

        const audioTracks = this.mediaStream.getAudioTracks();
        audioTracks.forEach(track => {
            track.enabled = !track.enabled;
        });

        const micBtn = document.getElementById('toggle-mic');
        micBtn.classList.toggle('active', audioTracks[0]?.enabled);
        
        this.socket.emit('media-toggle', {
            audio: audioTracks[0]?.enabled,
            video: this.mediaStream.getVideoTracks()[0]?.enabled
        });

        this.updateMediaIndicators();
    }

    toggleCamera() {
        if (!this.mediaStream) return;

        const videoTracks = this.mediaStream.getVideoTracks();
        videoTracks.forEach(track => {
            track.enabled = !track.enabled;
        });

        const cameraBtn = document.getElementById('toggle-camera');
        cameraBtn.classList.toggle('active', videoTracks[0]?.enabled);
        
        this.socket.emit('media-toggle', {
            audio: this.mediaStream.getAudioTracks()[0]?.enabled,
            video: videoTracks[0]?.enabled
        });

        this.updateMediaIndicators();
    }

    async toggleScreenShare() {
        if (this.isScreenSharing) {
            await this.stopScreenShare();
        } else {
            await this.startScreenShare();
        }
    }

    async startScreenShare() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            this.screenStream = screenStream;
            this.isScreenSharing = true;

            const shareContainer = document.getElementById('screen-share-container');
            shareContainer.classList.remove('hidden');
            
            const videoElement = document.createElement('video');
            videoElement.className = 'screen-share-video';
            videoElement.srcObject = screenStream;
            videoElement.autoplay = true;
            
            shareContainer.innerHTML = '';
            shareContainer.appendChild(videoElement);

            this.socket.emit('start-screen-share');

            // Обработка остановки стрима пользователем
            screenStream.getTracks().forEach(track => {
                track.onended = () => this.stopScreenShare();
            });

        } catch (error) {
            console.error('Ошибка стриминга экрана:', error);
        }
    }

    async stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        this.isScreenSharing = false;
        document.getElementById('screen-share-container').classList.add('hidden');
        this.socket.emit('stop-screen-share');
    }

    leaveCall() {
        this.stopAllMedia();
        this.showChatArea();
        this.isInCall = false;
    }

    stopAllMedia() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        this.isScreenSharing = false;
        this.peerConnections.clear();

        document.getElementById('media-container').innerHTML = '';
        document.getElementById('screen-share-container').classList.add('hidden');
    }

    // Управление интерфейсом
    showMediaArea(sessionName) {
        document.getElementById('media-session-name').textContent = sessionName;
        document.getElementById('chat-area').classList.remove('active');
        document.getElementById('media-area').classList.add('active');
    }

    showChatArea() {
        document.getElementById('media-area').classList.remove('active');
        document.getElementById('chat-area').classList.add('active');
    }

    hideAllModals() {
        document.querySelectorAll('.modal').forEach(modal => modal.classList.remove('active'));
        document.getElementById('emoji-picker').classList.add('hidden');
    }

    // Emoji
    setupEmojiPicker() {
        const picker = document.getElementById('emoji-picker');
        picker.addEventListener('click', (e) => {
            if (e.target.tagName === 'SPAN') {
                this.insertEmoji(e.target.textContent);
                picker.classList.add('hidden');
            }
        });
    }

    toggleEmojiPicker() {
        const picker = document.getElementById('emoji-picker');
        picker.classList.toggle('hidden');
    }

    insertEmoji(emoji) {
        const input = document.getElementById('message-input');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        
        input.value = text.substring(0, start) + emoji + text.substring(end);
        input.focus();
        input.selectionStart = input.selectionEnd = start + emoji.length;
    }

    // WebRTC обработчики (упрощенная реализация)
    handleOffer(data) {
        // Базовая реализация WebRTC
        console.log('Received offer:', data);
    }

    handleAnswer(data) {
        console.log('Received answer:', data);
    }

    handleIceCandidate(candidate) {
        console.log('Received ICE candidate:', candidate);
    }

    updateUserMedia(data) {
        console.log('User media updated:', data);
    }

    updateVoiceActivity(data) {
        const userVideo = document.querySelector(`[data-user-id="${data.userId}"]`);
        if (userVideo) {
            const indicator = userVideo.querySelector('.speaking');
            if (indicator) {
                indicator.style.display = data.isSpeaking ? 'block' : 'none';
            }
        }
    }

    handleScreenShareStarted(data) {
        console.log('Screen share started by:', data.userName);
    }

    handleScreenShareStopped(data) {
        console.log('Screen share stopped by:', data.userId);
    }

    // Вспомогательные методы
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', () => {
    new GamerMessenger();
});