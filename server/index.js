import { startServer } from './server.js';

const port = Number(process.env.PORT) || 3000;

startServer(port);
