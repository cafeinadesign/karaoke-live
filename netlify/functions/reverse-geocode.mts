import { getStore } from '@netlify/blobs';
import { reverseGeocode } from '../../src/server/reverse-geocode';

export const config = { path: '/api/reverse-geocode' };

export default function handler(request: Request): Promise<Response> {
  const store = getStore({ name: 'venue-geocoding', consistency: 'strong' });
  return reverseGeocode(request, {
    get: (key) => store.get(key, { type: 'text' }),
    async reserve() {
      const key = 'next-request';
      const current = await store.getWithMetadata(key, { type: 'text' });
      if (current && Number(current.data) > Date.now()) return false;
      // Leave time for the storage write and outbound request before another invocation can start.
      const result = await store.set(key, String(Date.now() + 6000), current
        ? { onlyIfMatch: current.etag }
        : { onlyIfNew: true });
      return result.modified;
    },
    async save(key, address) {
      await store.set(key, address);
    },
  });
}
