import socket from '../../axion/socket';
export { socket };

socket.connectToServer('particle-lenia', true);

socket.onConnect = () => {
  socket.emit('listC', (creatures: string[]) => {
    console.log('creatures', creatures);
  });
};
