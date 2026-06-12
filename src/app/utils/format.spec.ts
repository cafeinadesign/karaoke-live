import { describe, expect, it } from 'vitest';
import { formatDuration } from './format';

describe('formatDuration', () => {
  it('formata minutos e segundos', () => {
    expect(formatDuration(192)).toBe('3:12');
  });

  it('zera à esquerda só os segundos', () => {
    expect(formatDuration(65)).toBe('1:05');
  });

  it('inclui horas quando passa de 60 minutos', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('retorna vazio para zero, negativo e não-finito', () => {
    expect(formatDuration(0)).toBe('');
    expect(formatDuration(-5)).toBe('');
    expect(formatDuration(Number.NaN)).toBe('');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('trunca frações de segundo', () => {
    expect(formatDuration(59.9)).toBe('0:59');
  });
});
