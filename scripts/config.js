export const DEFAULT_APP_URL = 'https://floki-u.github.io/Yujournal/';
export function appURL(value = process.env.YUJOURNAL_APP_URL || DEFAULT_APP_URL) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(
      'The app URL must be a public HTTPS URL without credentials, query or fragment.',
    );
  }
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}
