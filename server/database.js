const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'messenger.db'), (err) => {
            if (err) {
                console.error('Ошибка подключения к БД:', err.message);
            } else {
                console.log('Подключение к SQLite установлено');
                this.initDatabase();
            }
        });
    }

    initDatabase() {
        // Таблица пользователей
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                avatar TEXT DEFAULT 'default.png',
                status TEXT DEFAULT 'online',
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица сообщений
        this.db.run(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                channel_id TEXT NOT NULL,
                message TEXT NOT NULL,
                type TEXT DEFAULT 'text',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);

        // Таблица каналов
        this.db.run(`
            CREATE TABLE IF NOT EXISTS channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                created_by INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    // Пользователи
    async createUser(username, password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO users (username, password) VALUES (?, ?)',
                [username, hashedPassword],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, username });
                }
            );
        });
    }

    async findUser(username) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE username = ?',
                [username],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async validateUser(username, password) {
        const user = await this.findUser(username);
        if (!user) return null;
        
        const isValid = await bcrypt.compare(password, user.password);
        return isValid ? user : null;
    }

    async updateUserStatus(userId, status) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE users SET status = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
                [status, userId],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async getOnlineUsers() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT id, username, avatar, status FROM users WHERE status != "offline" ORDER BY username',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    // Сообщения
    async saveMessage(userId, channelId, message, type = 'text') {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO messages (user_id, channel_id, message, type) VALUES (?, ?, ?, ?)',
                [userId, channelId, message, type],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getChannelMessages(channelId, limit = 100) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT m.*, u.username, u.avatar 
                FROM messages m 
                JOIN users u ON m.user_id = u.id 
                WHERE m.channel_id = ? 
                ORDER BY m.created_at DESC 
                LIMIT ?
            `, [channelId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.reverse());
            });
        });
    }

    // Каналы
    async createChannel(name, type, createdBy) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO channels (name, type, created_by) VALUES (?, ?, ?)',
                [name, type, createdBy],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, name, type });
                }
            );
        });
    }

    async getChannels() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM channels ORDER BY name',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }
}

module.exports = Database;