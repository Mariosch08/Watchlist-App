import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
const cache = new Map();

export async function getSecret(name) {
  if (!name) throw new Error('Secret parameter name not configured');
  if (!cache.has(name)) {
    const res = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    cache.set(name, res.Parameter.Value);
  }
  return cache.get(name);
}

export const clearSecretCache = () => cache.clear();
