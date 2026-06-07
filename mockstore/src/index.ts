import { createApp } from './app.js';
import { mockstoreConfig } from './config.js';

const cfg = mockstoreConfig();
createApp().listen(cfg.port, () => {
  console.log(`[mockstore] demo store listening on port ${cfg.port}`);
});
