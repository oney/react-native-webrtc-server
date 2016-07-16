const socket = io();
const RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection ||
  window.webkitRTCPeerConnection || window.msRTCPeerConnection;
const RTCSessionDescription = window.RTCSessionDescription ||
  window.mozRTCSessionDescription || window.webkitRTCSessionDescription ||
  window.msRTCSessionDescription;
navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia ||
  navigator.webkitGetUserMedia || navigator.msGetUserMedia;

const configuration = { 'iceServers': [{ 'url': 'stun:stun.l.google.com:19302' }] };

const pcPeers = {};
const selfView = document.getElementById('selfView');
const remoteViewContainer = document.getElementById('remoteViewContainer');
let localStream;

const logError = (error) => {
  console.log('logError: ', error);
};

const press = () => {
  const roomID = document.getElementById('roomID').value;
  if (roomID === '') {
    alert('Please enter room ID');
  } else {
    const roomIDContainer = document.getElementById('roomIDContainer');
    roomIDContainer.parentElement.removeChild(roomIDContainer);
    join(roomID);
  }
};

const textRoomPress = () => {
  const text = document.getElementById('textRoomInput').value;
  if (text === '') {
    alert('Enter something');
  } else {
    document.getElementById('textRoomInput').value = '';
    const content = document.getElementById('textRoomContent');
    content.innerHTML = `${content.innerHTML}<p>Me: ${text}</p>`;
    for (const key in pcPeers) {
      const pc = pcPeers[key];
      pc.textDataChannel.send(text);
    }
  }
};

const getLocalStream = () => {
  navigator.getUserMedia({ 'audio': true, 'video': true }, (stream) => {
    localStream = stream;
    selfView.src = URL.createObjectURL(stream);
    selfView.muted = true;
  }, logError);
};

const createPC = (socketId, isOffer) => {
  const pc = new RTCPeerConnection(configuration);
  pcPeers[socketId] = pc;

  pc.onicecandidate = (event) => {
    console.log('onicecandidate', event);
    if (event.candidate) {
      socket.emit('exchange', { 'to': socketId, 'candidate': event.candidate });
    }
  };

  const createOffer = () => {
    pc.createOffer((desc) => {
      console.log('createOffer', desc);
      pc.setLocalDescription(desc, () => {
        console.log('setLocalDescription', pc.localDescription);
        socket.emit('exchange', { 'to': socketId, 'sdp': pc.localDescription });
      }, logError);
    }, logError);
  };

  const createDataChannel = () => {
    if (pc.textDataChannel) {
      return;
    }
    const dataChannel = pc.createDataChannel('text');

    dataChannel.onerror = (error) => {
      console.log('dataChannel.onerror', error);
    };

    dataChannel.onmessage = (event) => {
      console.log('dataChannel.onmessage:', event.data);
      const content = document.getElementById('textRoomContent');
      content.innerHTML = `${content.innerHTML}<p>${socketId}: ${event.data}</p>`;
    };

    dataChannel.onopen = () => {
      console.log('dataChannel.onopen');
      const textRoom = document.getElementById('textRoom');
      textRoom.style.display = 'block';
    };

    dataChannel.onclose = () => {
      console.log('dataChannel.onclose');
    };

    pc.textDataChannel = dataChannel;
  };

  pc.onnegotiationneeded = () => {
    console.log('onnegotiationneeded');
    if (isOffer) {
      createOffer();
    }
  };

  pc.oniceconnectionstatechange = (event) => {
    console.log('oniceconnectionstatechange', event);
    if (event.target.iceConnectionState === 'connected') {
      createDataChannel();
    }
  };

  pc.onsignalingstatechange = (event) => {
    console.log('onsignalingstatechange', event);
  };

  pc.onaddstream = (event) => {
    console.log('onaddstream', event);
    const element = document.createElement('video');
    element.id = `remoteView${socketId}`;
    element.autoplay = 'autoplay';
    element.src = URL.createObjectURL(event.stream);
    remoteViewContainer.appendChild(element);
  };
  pc.addStream(localStream);

  return pc;
};


const join = (roomID) => {
  socket.emit('join', roomID, (socketIds) => {
    console.log('join', socketIds);
    for (var i in socketIds) {
      const socketId = socketIds[i];
      createPC(socketId, true);
    }
  });
};

const exchange = (data) => {
  const fromId = data.from;
  let pc;
  if (fromId in pcPeers) {
    pc = pcPeers[fromId];
  } else {
    pc = createPC(fromId, false);
  }

  if (data.sdp) {
    console.log('exchange sdp', data);
    pc.setRemoteDescription(new RTCSessionDescription(data.sdp), () => {
      if (pc.remoteDescription.type === 'offer') {
        pc.createAnswer((desc) => {
          console.log('createAnswer', desc);
          pc.setLocalDescription(desc, () => {
            console.log('setLocalDescription', pc.localDescription);
            socket.emit('exchange', { 'to': fromId, 'sdp': pc.localDescription });
          }, logError);
        }, logError);
      }
    }, logError);
  } else {
    console.log('exchange candidate', data);
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
};

const leave = (socketId) => {
  console.log('leave', socketId);
  const pc = pcPeers[socketId];
  pc.close();
  delete pcPeers[socketId];
  const video = document.getElementById(`remoteView${socketId}`);
  if (video) video.remove();
};

socket.on('exchange', (data) => {
  exchange(data);
});

socket.on('leave', (socketId) => {
  leave(socketId);
});

socket.on('connect', (data) => {
  console.log('connect');
  getLocalStream();
});
