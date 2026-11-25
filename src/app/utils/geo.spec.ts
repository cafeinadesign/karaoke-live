import { describe, expect, it } from 'vitest';
import { distanceKm, formatDistanceKm } from './geo';

describe('geo utilities', () => {
  it('calculates zero distance for identical points', () => {
    const point = { latitude: -8.0476, longitude: -34.877 };
    expect(distanceKm(point, point)).toBe(0);
  });

  it('computes approximate Haversine distance between two cities', () => {
    const recife = { latitude: -8.0476, longitude: -34.877 };
    const olinda = { latitude: -8.0089, longitude: -34.8553 };
    const km = distanceKm(recife, olinda);
    expect(km).toBeGreaterThan(4);
    expect(km).toBeLessThan(6);
  });

  it('formats sub-kilometer distances in meters and longer distances in km', () => {
    expect(formatDistanceKm(0.32, 'pt-BR')).toBe('300 m');
    expect(formatDistanceKm(2.46, 'pt-BR')).toBe('2,5 km');
    expect(formatDistanceKm(18.7, 'pt-BR')).toBe('19 km');
  });
});
