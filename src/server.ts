import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { reverseGeocode } from './server/reverse-geocode';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine({
  // TODO: This is a security-sensitive option. Remove if not needed. For more information, see https://angular.dev/best-practices/security#configuring-trusted-proxy-headers
  trustProxyHeaders: ['x-forwarded-host', 'x-forwarded-proto'],
});

const addressCache = new Map<string, string>();
let nextGeocode = 0;
app.post('/api/reverse-geocode', express.json({ limit: '1kb' }), async (request, response) => {
  const result = await reverseGeocode(new Request('http://localhost/api/reverse-geocode', {
    method: 'POST',
    body: JSON.stringify(request.body ?? {}),
  }), {
    get: async (key) => addressCache.get(key) ?? null,
    async reserve() {
      if (Date.now() < nextGeocode) return false;
      nextGeocode = Date.now() + 1100;
      return true;
    },
    async save(key, address) {
      addressCache.set(key, address);
    },
  });
  await writeResponseToNodeResponse(result, response);
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
