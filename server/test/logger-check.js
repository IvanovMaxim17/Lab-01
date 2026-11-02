
import { createMatchLogger } from '../src/log/match-logger.js';

const logDir = './server/logs/test';

const logger = await createMatchLogger(logDir);

logger.write({
  type: 'playerJoined',
  playerName: 'Pilot',
  roomName: 'Легка арена',
  timestamp: new Date().toISOString(),
});

logger.write({
  type: 'chat',
  playerName: 'Pilot',
  text: 'Hello!',
  timestamp: new Date().toISOString(),
});

await logger.close();

console.log('Logger test completed.');
console.log('File:', logger.filePath);

