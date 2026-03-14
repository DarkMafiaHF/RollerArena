const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {}; // keyed by Discord instanceId

io.on("connection", (socket) => {
  socket.on("join_room", ({ instanceId, userId, username, avatar, game }) => {
    socket.join(instanceId);
    if (!rooms[instanceId]) rooms[instanceId] = { players: [], gameState: null, game };
    
    const room = rooms[instanceId];
    if (room.players.length < 2 && !room.players.find(p => p.userId === userId)) {
      room.players.push({ socketId: socket.id, userId, username, avatar });
      // Assign colors: first joiner = white/red, second = black/black
      socket.emit("assigned_color", room.players.length === 1 ? "white" : "black");
    }

    if (room.players.length === 2) {
      io.to(instanceId).emit("game_start", { players: room.players });
    }
  });

  socket.on("make_move", ({ instanceId, move }) => {
    // Relay the move to the OTHER player
    socket.to(instanceId).emit("opponent_move", { move });
    // Store state for reconnects
    if (rooms[instanceId]) rooms[instanceId].lastMove = move;
  });

  socket.on("game_over", ({ instanceId, winnerId }) => {
    if (rooms[instanceId]) {
      const loser = rooms[instanceId].players.find(p => p.userId !== winnerId);
      io.to(instanceId).emit("show_winner_screen", { 
        winnerId, 
        loserId: loser?.userId 
      });
    }
  });

  socket.on("tournament_score", ({ instanceId, scores }) => {
    io.to(instanceId).emit("tournament_update", { scores });
  });
});

app.post("/api/token", express.json(), async (req, res) => {
  // Exchange Discord OAuth code for access token
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: "authorization_code",
      code: req.body.code,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const data = await response.json();
  res.json({ access_token: data.access_token });
});

server.listen(3000);