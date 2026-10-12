export const config = {
  region: import.meta.env.VITE_AWS_REGION ?? 'eu-central-1',
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID ?? '',
  apiUrl: (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, ''),
};
