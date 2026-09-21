import 'dotenv/config';
import net from 'node:net';

const client = new net.Socket();

client.connect(5433, '127.0.0.1', () => {
  console.log('Connected to 127.0.0.1:5433!');
  client.destroy();
});

client.on('error', (err) => {
  console.error('Socket error on 5433:', err.message);
});
