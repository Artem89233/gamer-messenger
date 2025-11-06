class WebRTCManager {
    constructor() {
        this.connections = new Map();
        this.mediaStreams = new Map();
    }

    // Сигналинг для установки WebRTC соединений
    handleSignaling(socket, io) {
        socket.on('webrtc-offer', (data) => {
            socket.to(data.target).emit('webrtc-offer', {
                offer: data.offer,
                caller: socket.user.id,
                callerName: socket.user.username
            });
        });

        socket.on('webrtc-answer', (data) => {
            socket.to(data.target).emit('webrtc-answer', {
                answer: data.answer,
                answerer: socket.user.id
            });
        });

        socket.on('webrtc-ice-candidate', (data) => {
            socket.to(data.target).emit('webrtc-ice-candidate', data.candidate);
        });

        // Управление медиа потоками
        socket.on('media-toggle', (data) => {
            socket.broadcast.emit('user-media-update', {
                userId: socket.user.id,
                audio: data.audio,
                video: data.video
            });
        });

        // Стриминг экрана
        socket.on('start-screen-share', () => {
            socket.broadcast.emit('user-screen-share-started', {
                userId: socket.user.id,
                userName: socket.user.username
            });
        });

        socket.on('stop-screen-share', () => {
            socket.broadcast.emit('user-screen-share-stopped', {
                userId: socket.user.id
            });
        });

        // Индикатор говорящего
        socket.on('voice-activity', (isSpeaking) => {
            socket.broadcast.emit('user-voice-activity', {
                userId: socket.user.id,
                isSpeaking: isSpeaking
            });
        });
    }

    // Создание медиа комнаты
    createMediaRoom(roomId) {
        this.connections.set(roomId, new Set());
        return roomId;
    }

    // Удаление медиа комнаты
    removeMediaRoom(roomId) {
        this.connections.delete(roomId);
    }

    // Добавление пользователя в комнату
    joinMediaRoom(roomId, userId) {
        if (!this.connections.has(roomId)) {
            this.createMediaRoom(roomId);
        }
        this.connections.get(roomId).add(userId);
    }

    // Удаление пользователя из комнаты
    leaveMediaRoom(roomId, userId) {
        if (this.connections.has(roomId)) {
            this.connections.get(roomId).delete(userId);
            if (this.connections.get(roomId).size === 0) {
                this.removeMediaRoom(roomId);
            }
        }
    }
}

module.exports = WebRTCManager;