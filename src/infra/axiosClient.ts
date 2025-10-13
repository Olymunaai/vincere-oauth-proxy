import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { logger } from './logger.js';

export function createAxiosClient(): AxiosInstance {
  const client = axios.create({
    timeout: 100000, // 100 seconds
    validateStatus: () => true, // Don't throw on any status code
  });

  // Configure exponential backoff with jitter for specific error codes
  axiosRetry(client, {
    retries: 3,
    retryDelay: (retryCount) => {
      const baseDelay = Math.pow(2, retryCount) * 1000; // Exponential: 2s, 4s, 8s
      const jitter = Math.random() * 1000; // Add up to 1s jitter
      return baseDelay + jitter;
    },
    retryCondition: (error: AxiosError) => {
      // Retry on network errors or specific HTTP status codes
      if (!error.response) return true; // Network error
      
      const status = error.response.status;
      return status === 429 || status === 502 || status === 503 || status === 504;
    },
    onRetry: (retryCount, error, requestConfig) => {
      logger.warn(
        {
          retryCount,
          url: requestConfig.url,
          method: requestConfig.method,
          status: error.response?.status,
        },
        'Retrying request'
      );
    },
  });

  // Request interceptor for logging
  client.interceptors.request.use(
    (config) => {
      logger.debug(
        {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: config.headers,
        },
        'Outgoing HTTP request'
      );
      return config;
    },
    (error) => {
      logger.error({ error }, 'Request interceptor error');
      return Promise.reject(error);
    }
  );

  // Response interceptor for logging
  client.interceptors.response.use(
    (response) => {
      logger.debug(
        {
          status: response.status,
          url: response.config.url,
          headers: response.headers,
        },
        'HTTP response received'
      );
      return response;
    },
    (error: AxiosError) => {
      logger.error(
        {
          error,
          status: error.response?.status,
          url: error.config?.url,
        },
        'HTTP request failed'
      );
      return Promise.reject(error);
    }
  );

  return client;
}

export const axiosClient = createAxiosClient();

