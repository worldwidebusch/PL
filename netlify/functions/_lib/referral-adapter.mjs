import { allowPreviewAuth, backendAdapterConfig } from './config.mjs';
import { callPrivateAdapter } from './private-adapter.mjs';

function adapterRequired() {
  const error = new Error('A durable referral adapter is required.');
  error.code = 'REFERRAL_ADAPTER_REQUIRED';
  error.status = 503;
  return error;
}

export async function recordReferralOperation(operation, payload, options = {}) {
  let configured = false;
  try { configured = !!backendAdapterConfig(); }
  catch (error) {
    if (options.bestEffort === true) return { tracked: false, storageMode: 'external-adapter' };
    throw error;
  }
  if (!configured) {
    if (allowPreviewAuth()) return { tracked: false, storageMode: 'signed-cookie-preview' };
    if (options.bestEffort === true) return { tracked: false, storageMode: 'external-adapter' };
    throw adapterRequired();
  }
  try {
    const result = await callPrivateAdapter(operation, payload);
    const data = result.data && typeof result.data === 'object' ? result.data : {};
    return {
      tracked: data.tracked !== false,
      storageMode: 'external-adapter'
    };
  } catch (error) {
    if (options.bestEffort === true) return { tracked: false, storageMode: 'external-adapter' };
    throw error;
  }
}
