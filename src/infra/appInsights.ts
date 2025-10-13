import * as appInsights from 'applicationinsights';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let isInitialized = false;

export function initializeAppInsights(): void {
  if (isInitialized) return;

  if (!config.appInsights.connectionString) {
    logger.warn('Application Insights connection string not configured, telemetry disabled');
    return;
  }

  try {
    appInsights
      .setup(config.appInsights.connectionString)
      .setAutoDependencyCorrelation(true)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true, true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(true, false)
      .setUseDiskRetryCaching(true)
      .setSendLiveMetrics(false)
      .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
      .start();

    const client = appInsights.defaultClient;
    client.context.tags[client.context.keys.cloudRole] = 'vincere-oauth-proxy';
    client.context.tags[client.context.keys.applicationVersion] = config.appVersion;

    isInitialized = true;
    logger.info('Application Insights initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Application Insights');
  }
}

export function trackEvent(name: string, properties?: Record<string, string>): void {
  if (isInitialized && appInsights.defaultClient) {
    appInsights.defaultClient.trackEvent({ name, properties });
  }
}

export function trackMetric(name: string, value: number): void {
  if (isInitialized && appInsights.defaultClient) {
    appInsights.defaultClient.trackMetric({ name, value });
  }
}

export function trackException(error: Error, properties?: Record<string, string>): void {
  if (isInitialized && appInsights.defaultClient) {
    appInsights.defaultClient.trackException({ exception: error, properties });
  }
}

