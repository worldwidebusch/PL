import { identityAdapterConfig } from './config.mjs';

export async function recordReferralOperation(operation, payload, options = {}) {
  let config;
  try { config = identityAdapterConfig(); }
  catch (error) {
    if (options.bestEffort === true) return { tracked: false, storageMode: 'external-adapter' };
    throw error;
  }
  if (!config) return { tracked: false, storageMode: 'signed-cookie-preview' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + config.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ version: 1, operation, ...payload }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('REFERRAL_ADAPTER_FAILED');
    return { tracked: true, storageMode: 'external-adapter' };
  } catch (error) {
    if (options.bestEffort === true) return { tracked: false, storageMode: 'external-adapter' };
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
