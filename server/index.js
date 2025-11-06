const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const Database = require('./database');
const WebRTCManager = require('./webrtc');

class MessengerServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        
        this.db = new Database();
        this.webrtc = new WebRTCManager();
        this.connectedUsers = new Map();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../client')));
    }

    setupRoutes() {
        // API для регистрации
        this.app.post('/api/register', async (req, res) => {
            try {
                const { username, password } = req.body;
                
                if (!username || !password) {
                    return res.status(400).json({ error: 'Username и password обязательны' });
                }

                if (username.length < 3) {
                    return res.status(400).json({ error: 'Username должен быть не менее 3 символов' });
                }

                const user = await this.db.createUser(username, password);
                res.json({ success: true, user });
            } catch (error) {
                if (error.code === 'SQLITE_CONSTRAINT') {
                    res.status(400).json({ error: 'Пользователь уже существует' });
                } else {
                    res.status(500).json({ error: 'Ошибка сервера' });
                }
            }
        });

        // API для авторизации
        this.app.post('/api/login', async (req, res) => {
            try {
                const { username, password } = req.body;
                
                if (!username || !password) {
                    return res.status(400).json({ error: 'Username и password обязательны' });
                }

                const user = await this.db.validateUser(username, password);
                if (!user) {
                    return res.status(401).json({ error: 'Неверные учетные данные' });
                }

                await this.db.updateUserStatus(user.id, 'online');
                res.json({ 
                    success: true, 
                    user: {
                        id: user.id,
                        username: user.username,
                        avatar: user.avatar,
                        status: 'online'
                    }
                });
            } catch (error) {
                res.status(500).json({ error: 'Ошибка сервера' });
            }
        });

        // Главная страница
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../client/index.html'));
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('Новое подключение:', socket.id);

            // Аутентификация сокета
            socket.on('authenticate', async (userData) => {
                try {
                    const user = await this.db.findUser(userData.username);
                    if (user) {
                        socket.user = {
                            id: user.id,
                            username: user.username,
                            avatar: user.avatar
                        };
                        
                        this.connectedUsers.set(user.id, {
                            socketId: socket.id,
                            user: socket.user
                        });

                        await this.db.updateUserStatus(user.id, 'online');
                        
                        // Уведомляем всех о новом онлайн пользователе
                        const onlineUsers = await this.db.getOnlineUsers();
                        this.io.emit('users-update', onlineUsers);
                        
                        // Отправляем историю каналов
                        const channels = await this.db.getChannels();
                        socket.emit('channels-list', channels);
                        
                        console.log(`Пользователь ${user.username} аутентифицирован`);
                    }
                } catch (error) {
                    console.error('Ошибка аутентификации:', error);
                }
            });

            // Обработка сообщений
            socket.on('send-message', async (data) => {
                try {
                    if (!socket.user) return;
                    
                    const messageId = await this.db.saveMessage(
                        socket.user.id, 
                        data.channelId, 
                        data.message, 
                        data.type
                    );
                    
                    const messageData = {
                        id: messageId,
                        user_id: socket.user.id,
                        channel_id: data.channelId,
                        message: data.message,
                        type: data.type,
                        username: socket.user.username,
                        avatar: socket.user.avatar,
                        created_at: new Date().toISOString()
                    };
                    
                    this.io.emit('new-message', messageData);
                } catch (error) {
                    console.error('Ошибка сохранения сообщения:', error);
                }
            });

            // Создание канала
            socket.on('create-channel', async (data) => {
                try {
                    if (!socket.user) return;
                    
                    const channel = await this.db.createChannel(
                        data.name, 
                        data.type, 
                        socket.user.id
                    );
                    
                    this.io.emit('channel-created', channel);
                } catch (error) {
                    console.error('Ошибка создания канала:', error);
                }
            });

            // Запрос истории сообщений
            socket.on('get-messages', async (channelId) => {
                try {
                    const messages = await this.db.getChannelMessages(channelId);
                    socket.emit('messages-history', { channelId, messages });
                } catch (error) {
                    console.error('Ошибка получения сообщений:', error);
                }
            });

            // WebRTC сигналинг
            this.webrtc.handleSignaling(socket, this.io);

            // Отключение пользователя
            socket.on('disconnect', async () => {
                try {
                    if (socket.user) {
                        await this.db.updateUserStatus(socket.user.id, 'offline');
                        this.connectedUsers.delete(socket.user.id);
                        
                        const onlineUsers = await this.db.getOnlineUsers();
                        this.io.emit('users-update', onlineUsers);
                        
                        console.log(`Пользователь ${socket.user.username} отключился`);
                    }
                } catch (error) {
                    console.error('Ошибка при отключении:', error);
                }
            });
        });
    }

    start(port = 3000) {
        this.server.listen(port, () => {
            console.log(`🚀 Сервер запущен на порту ${port}`);
            console.log(`📱 Откройте http://localhost:${port} в браузере`);
        });
    }
}

// Запуск сервера
const server = new MessengerServer();
server.start();