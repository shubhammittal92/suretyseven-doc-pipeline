import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import { router } from './routes/documents';
import { errorHandler } from './middleware/errorHandler';

// App factory kept separate from the server bootstrap so tests can import the
// app and drive it with supertest without opening a port or starting the worker.
export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(
    pinoHttp({
      logger,
      // Only log identifiers/metadata, never bodies (no document contents in logs).
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    })
  );

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', router);

  app.use(errorHandler);
  return app;
}
