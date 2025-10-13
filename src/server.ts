import { config, validateConfig } from './config/index.js';
import { logger } from './infra/logger.js';
import { initializeKeyVault } from './infra/keyvault.js';
import { initializeAppInsights } from './infra/appInsights.js';
import { createApp } from './app.js';

async function startServer() {
  try {
    // Validate configuration
    logger.info('Validating configuration...');
    validateConfig();

    // Initialize Application Insights
    logger.info('Initializing Application Insights...');
    initializeAppInsights();

    // Initialize Key Vault
    logger.info('Initializing Key Vault...');
    initializeKeyVault();

    // Create Express app
    logger.info('Creating Express application...');
    const app = createApp();

    // Start server
    const server = app.listen(config.port, () => {
      logger.info(
        {
          port: config.port,
          nodeEnv: config.nodeEnv,
          appVersion: config.appVersion,
        },
        'Server started successfully'
      );
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received');

      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.fatal({ error }, 'Uncaught exception');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.fatal({ reason, promise }, 'Unhandled rejection');
      process.exit(1);
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start server
startServer().catch((error) => {
  logger.fatal({ error }, 'Server startup failed');
  process.exit(1);
});

