import { describe, expect, it } from 'vitest';
import { scanActorId } from '~/domain/value-objects/sessions/actor.value-object.ts';

describe('セッションを回している者の名前', () => {
  it('本文のどこにあっても拾う', () => {
    expect(scanActorId('BEADS_ACTOR=mgr-deadbeef を用いる')).toBe('mgr-deadbeef');
  });

  it('最初の 1 つだけを採る', () => {
    expect(scanActorId('mgr-00000000 と mgr-11111111')).toBe('mgr-00000000');
  });

  it('十六進 8 桁でないものは名前ではない', () => {
    expect(scanActorId('mgr-deadbee')).toBe(null);
    expect(scanActorId('mgr-DEADBEEF')).toBe(null);
    expect(scanActorId('mgr-zzzzzzzz')).toBe(null);
  });

  it('9 桁以上でも先頭の 8 桁を名前として採る', () => {
    expect(scanActorId('mgr-deadbeef01'), '旧来の名前の形をそのまま保つ').toBe('mgr-deadbeef');
  });

  it('無ければ無いと答える', () => {
    expect(scanActorId('')).toBe(null);
    expect(scanActorId('ここに名前は無い')).toBe(null);
  });
});
