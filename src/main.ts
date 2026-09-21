/**
 * @fileoverview API Gateway bootstrap module.
 *
 * Entry point of the NestJS application using Fastify adapter.
 * Responsibilities:
 * - Initialize Nest application with Fastify (high-performance HTTP server)
 * - Configure structured logging (Pino via Fastify logger)
 * - Apply global route prefix with exclusions (e.g., /health)
 * - Register core Fastify plugins (security headers, multipart handling)
 * - Enforce request validation and transformation via global pipes
 * - Attach global interceptors and exception filters for consistent responses
 * - Generate and expose OpenAPI (Swagger) documentation
 * - Start the HTTP server on configured host and port
 */
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { RequestMethod, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filter/http-exception.filter';
import { ResponseInterceptor } from './common/interceptor';
import { MetricsService } from './common/metrics/metrics.service';
import { ValidationPipe } from './common/pipes/validation.pipe';
import config from './shared/config/app.config';

/**
 * Bootstraps and starts the API Gateway.
 *
 * Key behaviors:
 * - Enables environment-aware logging (pretty logs in dev, structured in prod)
 * - Applies `/api` global prefix while excluding health check route
 * - Registers Fastify plugins for security and file handling
 * - Sets up global validation, interceptors, and error handling
 * - Exposes Swagger UI and raw JSON spec
 *
 * @returns Promise<void>
 */
async function bootstrap() {
  const isDev = config.NODE_ENV !== 'production';

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: isDev
        ? {
            level: 'debug',
            transport: {
              target: 'pino-pretty', // human-readable logs for local development
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            },
          }
        : {
            level: 'info', // structured JSON logs for production
          },
    }),
  );

  /**
   * Allow class-validator to use the NestJS DI container.
   *
   * Required for any ValidatorConstraint class that injects services.
   * `fallbackOnErrors: true` prevents crashes when a constraint is
   * not registered in the container (e.g. pure sync validators).
   */
  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  /**
   * Enable NestJS shutdown hooks.
   *
   * Forwards SIGTERM, SIGINT, and SIGHUP to `OnApplicationShutdown` /
   * `OnModuleDestroy` handlers on every provider. Without this, services like
   * PrismaService, RedisClientService, QueueLifecycleService and the
   * CircuitBreakerFactory never get a chance to close connections cleanly,
   * which produces ECONNRESET noise during deploys and slow process exits.
   */
  app.enableShutdownHooks();

  /**
   * Apply global route prefix.
   *
   * All routes are prefixed with `/api` except explicitly excluded ones.
   * Health endpoint is excluded to support load balancers and uptime checks.
   */
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'metrics', method: RequestMethod.GET },
    ],
  });

  /**
   * URI-based API versioning.
   * Routes can be versioned by prefixing with /v{version}, e.g. /api/v1/users.
   * Default version is '1' if not specified. Version is available in controllers
   *
   * @see https://docs.nestjs.com/techniques/versioning
   */
  app.enableVersioning({
    type: VersioningType.URI,
  });

  /**
   * Register Fastify security plugin.
   *
   * Adds HTTP headers (CSP, HSTS, XSS protection, etc.)
   * to mitigate common web vulnerabilities.
   */
  await app.register(helmet as any);

  /**
   * Register multipart plugin.
   *
   * Enables handling of file uploads (multipart/form-data).
   */
  await app.register(multipart as any);

  /**
   * Register CORS.
   *
   * Allows frontend applications to access the API.
   *
   * Best practice:
   * In production, move origins to env config.
   */
  await app.register(cors, {
    origin: isDev ? true : ['http://localhost:3000', 'http://127.0.0.1:3000', config.FRONTEND_URL].filter(Boolean),

    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language'],

    credentials: true,
  });

  /**
   * HTTP metrics instrumentation via Fastify lifecycle hooks.
   *
   * Records `http_requests_total` and `http_request_duration_seconds` for every
   * request. Uses Fastify's `onRequest` hook to capture start time and
   * `onResponse` hook to compute duration and increment counters.
   *
   * Skips `/metrics` itself to avoid infinite self-instrumentation loops.
   * Skips `/health` to avoid polluting latency histograms with liveness probes.
   */
  const metricsService = app.get(MetricsService);
  const fastifyInstance = app.getHttpAdapter().getInstance();

  fastifyInstance.addHook(
    'onRequest',
    (req: any, _reply: any, done: () => void) => {
      req.metricsStartTime = process.hrtime.bigint();
      done();
    },
  );

  fastifyInstance.addHook(
    'onResponse',
    (req: any, reply: any, done: () => void) => {
      const url: string = req.url ?? '';
      if (url === '/metrics' || url === '/health') {
        done();
        return;
      }
      const route: string = req.routerPath ?? url;
      const method: string = req.method ?? 'UNKNOWN';
      const statusCode = String(reply.statusCode ?? 0);
      const startTime: bigint = req.metricsStartTime ?? process.hrtime.bigint();
      const durationMs =
        Number(process.hrtime.bigint() - startTime) / 1_000_000;
      metricsService.incHttpRequest(method, route, statusCode);
      metricsService.observeHttpDuration(
        method,
        route,
        statusCode,
        durationMs / 1000,
      );
      done();
    },
  );

  /**
   * Global validation pipe.
   *
   * Runs class-validator on every incoming DTO and throws a standardized
   * 400 response shaped as `{ message, errors: [{ field, message }] }`.
   */
  app.useGlobalPipes(new ValidationPipe());

  /**
   * Global interceptor.
   *
   * Standardizes API responses (format, metadata, wrapping).
   */
  app.useGlobalInterceptors(new ResponseInterceptor());

  /**
   * Global exception filter.
   *
   * Centralized error handling and consistent error response formatting.
   */
  app.useGlobalFilters(new HttpExceptionFilter());

  /**
   * Swagger (OpenAPI) configuration.
   *
   * Defines API metadata and authentication scheme.
   */
  const swaggerConfig = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('API Gateway documentation')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'Authorization',
    )
    .setVersion('1.0')
    .build();

  /**
   * Generate OpenAPI document from application routes.
   */
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  /**
   * Serve Swagger UI.
   *
   * Accessible at `/api-doc`
   */
  SwaggerModule.setup('api-doc', app, document, {
    jsonDocumentUrl: 'api-doc-json',
    yamlDocumentUrl: 'api-doc-yaml',
  });

  /**
   * Serve raw OpenAPI JSON.
   *
   * Useful for API clients, code generation, or external tools.
   */
  app.getHttpAdapter().get('/api-json', (req, res) => {
    res.send(document);
  });

  const port = Number(config.PORT ?? 3000);

  /**
   * Start HTTP server.
   *
   * Binds to 0.0.0.0 to allow external access (Docker, cloud, etc.).
   */
  await app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 API Gateway is running at http://127.0.0.1:${port}/api`);
    console.log(`📖 Swagger UI available at http://127.0.0.1:${port}/api-doc`);
    console.log(
      `🧾 OpenAPI JSON available at http://127.0.0.1:${port}/api-doc-json`,
    );
  });
}

// Execute bootstrap
void bootstrap();
