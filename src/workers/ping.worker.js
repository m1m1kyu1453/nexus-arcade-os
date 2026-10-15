import { handlePing } from './ping.js';

self.addEventListener('message', (event) => {
  const reply = handlePing(event.data);
  if (reply) self.postMessage(reply);
});
