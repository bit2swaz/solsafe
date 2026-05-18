import { startTelegramServer } from './telegram/server.js';

const server = await startTelegramServer();

const address = server.address();

if (address && typeof address !== 'string') {
  console.log(`SolSafe webhook server listening on port ${address.port}`);
}

function shutdown(): void {
  server.close((error) => {
    if (error) {
      console.error('Failed to stop SolSafe webhook server', error);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => {
  shutdown();
});

process.once('SIGTERM', () => {
  shutdown();
});