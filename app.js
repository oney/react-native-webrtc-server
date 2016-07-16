'use strict';

const express = require('express');
const app = express();
const fs = require('fs');
const open = require('open');
const options = {
  key: fs.readFileSync('./fake-keys/privatekey.pem'),
  cert: fs.readFileSync('./fake-keys/certificate.pem'),
};
const serverPort = (process.env.PORT || 4443);
const https = require('https');
const http = require('http');
let server;
if (process.env.LOCAL) {
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}
const io = require('socket.io')(server);

const socketIdsInRoom = (name) => {
  const socketIds = io.nsps['/'].adapter.rooms[name];
  if (socketIds) {
    const collection = [];
    for (const key in socketIds) {
      collection.push(key);
    }
    return collection;
  }
  return [];
};

app.get('/', (req, res) => {
  console.log('get /');
  res.sendFile(`${__dirname}/index.html`);
});

server.listen(serverPort, () => {
  console.log('server up and running at %s port', serverPort);
  if (process.env.LOCAL) {
    open(`https://localhost: ${serverPort}`);
  }
});

io.on('connection', (socket) => {
  console.log('connection');
  socket.on('disconnect', () => {
    console.log('disconnect');
    if (socket.room) {
      const room = socket.room;
      io.to(room).emit('leave', socket.id);
      socket.leave(room);
    }
  });

  socket.on('join', (name, callback) => {
    console.log('join', name);
    const socketIds = socketIdsInRoom(name);
    callback(socketIds);
    socket.join(name);
    socket.room = name;
  });

  socket.on('exchange', (data) => {
    console.log('exchange', data);
    data.from = socket.id;
    const to = io.sockets.connected[data.to];
    to.emit('exchange', data);
  });
});
