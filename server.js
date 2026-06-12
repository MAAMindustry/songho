const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map(); // Stocke les salons de jeu actifs

// Génère un code de salon unique à 5 lettres (Ex: CM237)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclusion de I, O, 0, 1 pour éviter les confusions
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  } while (rooms.has(code));
  return code;
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let myRole = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // 1. CRÉATION DU SALON
      if (data.type === 'create') {
        const code = generateRoomCode();
        currentRoom = code;
        myRole = 'south';

        rooms.set(code, {
          south: { ws, name: data.name.toUpperCase() },
          north: null
        });

        ws.send(JSON.stringify({ type: 'room_created', code }));
      }

      // 2. REJOINDRE UN SALON EXIStANT
      if (data.type === 'join') {
        const code = data.code.toUpperCase();
        const room = rooms.get(code);

        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: "L'arène demandée n'existe pas." }));
          return;
        }
        if (room.north) {
          ws.send(JSON.stringify({ type: 'error', message: "L'arène est déjà complète." }));
          return;
        }

        currentRoom = code;
        myRole = 'north';
        room.north = { ws, name: data.name.toUpperCase() };

        // Notifier les deux guerriers que le combat commence
        const startPayload = {
          type: 'game_start',
          players: { south: room.south.name, north: room.north.name }
        };

        room.south.ws.send(JSON.stringify(startPayload));
        room.north.ws.send(JSON.stringify(startPayload));
      }

      // 3. TRANSMISSION D'UN COUP JOUÉ
      if (data.type === 'move') {
        const room = rooms.get(data.code);
        if (room) {
          const opponent = myRole === 'south' ? room.north : room.south;
          if (opponent && opponent.ws) {
            opponent.ws.send(JSON.stringify({ type: 'move', move: data.move }));
          }
        }
      }

    } catch (err) {
      console.error(err);
    }
  });

  // GESTION DES DÉCONNEXIONS BRUTALES
  ws.on('close', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      const opponent = myRole === 'south' ? room.north : room.south;
      
      if (opponent && opponent.ws) {
        opponent.ws.send(JSON.stringify({ type: 'opponent_disconnected' }));
      }
      rooms.delete(currentRoom);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serveur Songo en ligne sur le port ${PORT}`));
