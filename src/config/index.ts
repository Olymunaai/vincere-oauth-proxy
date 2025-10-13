export interface Config {
  nodeEnv: string;
  port: number;
  vincere: {
    idBase: string;
    clientId: string;
    redirectUri: string;
  };
  keyVault: {
    uri: string;
  };
  security: {
    idTokenCacheSeconds: number;
    allowedIps: string[];
    requirePsk: boolean;
  };
  appInsights: {
    connectionString: string | undefined;
  };
  appVersion: string;
}

function parseAllowedIps(input: string): string[] {
  if (!input || input.trim() === '') return [];
  return input.split(',').map((ip) => ip.trim()).filter(Boolean);
}

export const config: Config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  vincere: {
    idBase: process.env.VINCERE_ID_BASE || 'https://id.vincere.io',
    clientId: process.env.VINCERE_CLIENT_ID || '',
    redirectUri: process.env.VINCERE_REDIRECT_URI || '',
  },
  keyVault: {
    uri: process.env.KEY_VAULT_URI || '',
  },
  security: {
    idTokenCacheSeconds: parseInt(process.env.ID_TOKEN_CACHE_SECONDS || '50', 10),
    allowedIps: parseAllowedIps(process.env.ALLOWED_IPS || ''),
    requirePsk: process.env.REQUIRE_PSK === '1',
  },
  appInsights: {
    connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING,
  },
  appVersion: process.env.npm_package_version || '1.0.0',
};

export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.vincere.clientId) {
    errors.push('VINCERE_CLIENT_ID is required');
  }
  if (!config.vincere.redirectUri) {
    errors.push('VINCERE_REDIRECT_URI is required');
  }
  if (!config.keyVault.uri) {
    errors.push('KEY_VAULT_URI is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

