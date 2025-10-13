import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let secretClient: SecretClient | null = null;

export function initializeKeyVault(): SecretClient {
  if (secretClient) return secretClient;

  try {
    const credential = new DefaultAzureCredential();
    secretClient = new SecretClient(config.keyVault.uri, credential);
    logger.info({ keyVaultUri: config.keyVault.uri }, 'Key Vault client initialized');
    return secretClient;
  } catch (error) {
    logger.error({ error, keyVaultUri: config.keyVault.uri }, 'Failed to initialize Key Vault');
    throw error;
  }
}

export async function getSecretOrNull(secretName: string): Promise<string | null> {
  try {
    const client = initializeKeyVault();
    const secret = await client.getSecret(secretName);
    
    if (!secret.value) {
      logger.warn({ secretName }, 'Secret exists but has no value');
      return null;
    }

    logger.debug({ secretName }, 'Retrieved secret from Key Vault');
    return secret.value;
  } catch (error) {
    if ((error as { code?: string }).code === 'SecretNotFound') {
      logger.debug({ secretName }, 'Secret not found in Key Vault');
      return null;
    }
    
    logger.error({ error, secretName }, 'Error retrieving secret from Key Vault');
    throw error;
  }
}

export async function setSecret(secretName: string, value: string): Promise<void> {
  try {
    const client = initializeKeyVault();
    await client.setSecret(secretName, value);
    logger.info({ secretName }, 'Secret stored in Key Vault');
  } catch (error) {
    logger.error({ error, secretName }, 'Error storing secret in Key Vault');
    throw error;
  }
}

export function buildSecretName(tenant: string, secretType: 'refresh_token' | 'api_key'): string {
  // Clean tenant host to ensure valid secret name (alphanumeric and hyphens only)
  const cleanTenant = tenant.replace(/[^a-zA-Z0-9-]/g, '-');
  return `vincere/${cleanTenant}/${secretType}`;
}

