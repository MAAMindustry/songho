const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const rooms = new Map();

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

wss.on('connection', (ws) => {
    let currentRoomCode = null;
    let myRole = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            switch (data.type) {
                case 'create': {
                    const code = generateRoomCode();
                    rooms.set(code, {
                        code: code,
                        players: { south: ws, north: null },
                        names: { south: data.name || 'Sud', north: '' }
                    });
                    currentRoomCode = code;
                    myRole = 'south';
                    ws.send(JSON.stringify({ type: 'room_created', code: code }));
                    break;
                }
                case 'join': {
                    const code = data.code ? data.code.trim().toUpperCase() : '';
                    const room = rooms.get(code);
                    if (!room || room.players.north !== null) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Salon indisponible.' }));
                        return;
                    }
                    room.players.north = ws;
                    room.names.north = data.name || 'Nord';
                    currentRoomCode = code;
                    myRole = 'north';
                    ws.send(JSON.stringify({ type: 'room_joined', code: code }));
                    const startPayload = {
                        type: 'game_start',
                        players: { south: room.names.south, north: room.names.north }
                    };
                    room.players.south.send(JSON.stringify(startPayload));
                    room.players.north.send(JSON.stringify(startPayload));
                    break;
                }
                case 'move': {
                    const room = rooms.get(data.code);
                    if (room) {
                        const targetWs = myRole === 'south' ? room.players.north : room.players.south;
                        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                            targetWs.send(JSON.stringify({ type: 'opponent_move', move: data.move }));
                        }
                    }
                    break;
                }
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => {
        if (currentRoomCode && rooms.has(currentRoomCode)) {
            const room = rooms.get(currentRoomCode);
            const opponentWs = myRole === 'south' ? room.players.north : room.players.south;
            if (opponentWs && opponentWs.readyState === WebSocket.OPEN) {
                opponentWs.send(JSON.stringify({ type: 'opponent_disconnected' }));
            }
            rooms.delete(currentRoomCode);
        }
    });
});

server.listen(port, () => console.log(`Serveur actif sur le port ${port}`));