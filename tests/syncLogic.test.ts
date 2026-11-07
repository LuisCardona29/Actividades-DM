import { describe, expect, it } from 'vitest';

import { isPending, resolvePhotoConflict } from '../services/syncLogic';

const date = (value: string) => new Date(value);

describe('photo synchronization conflict resolution', () => {
  it('keeps new and edited local photos pending until their exact version is acknowledged', () => {
    expect(isPending({ syncedAt: null, updatedAt: date('2026-01-02T00:00:00Z') })).toBe(true);
    expect(isPending({
      syncedAt: date('2026-01-01T00:00:00Z'),
      updatedAt: date('2026-01-02T00:00:00Z'),
    })).toBe(true);
    expect(isPending({
      syncedAt: date('2026-01-02T00:00:00Z'),
      updatedAt: date('2026-01-02T00:00:00Z'),
    })).toBe(false);
  });

  it('applies a newer cloud edit and preserves a newer local edit', () => {
    expect(resolvePhotoConflict({
      localUpdatedAt: date('2026-01-01T00:00:00Z'),
      remoteUpdatedAt: '2026-01-02T00:00:00Z',
      remoteDeletedAt: null,
    })).toBe('apply-remote');
    expect(resolvePhotoConflict({
      localUpdatedAt: date('2026-01-02T00:00:00Z'),
      remoteUpdatedAt: '2026-01-01T00:00:00Z',
      remoteDeletedAt: null,
    })).toBe('keep-local');
  });

  it('keeps an offline deletion when the remote version is older', () => {
    expect(resolvePhotoConflict({
      localUpdatedAt: null,
      localDeletedAt: date('2026-01-03T00:00:00Z'),
      remoteUpdatedAt: '2026-01-02T00:00:00Z',
      remoteDeletedAt: null,
    })).toBe('keep-local');
  });

  it('restores a newer remote edit when it conflicts with a local deletion', () => {
    expect(resolvePhotoConflict({
      localUpdatedAt: null,
      localDeletedAt: date('2026-01-02T00:00:00Z'),
      remoteUpdatedAt: '2026-01-03T00:00:00Z',
      remoteDeletedAt: null,
    })).toBe('apply-remote');
  });

  it('applies a newer remote tombstone and acknowledges the same deletion from another device', () => {
    expect(resolvePhotoConflict({
      localUpdatedAt: date('2026-01-01T00:00:00Z'),
      remoteUpdatedAt: '2026-01-02T00:00:00Z',
      remoteDeletedAt: '2026-01-02T00:00:00Z',
    })).toBe('apply-remote-delete');
    expect(resolvePhotoConflict({
      localUpdatedAt: null,
      localDeletedAt: date('2026-01-02T00:00:00Z'),
      remoteUpdatedAt: '2026-01-02T00:00:00Z',
      remoteDeletedAt: '2026-01-02T00:00:00Z',
    })).toBe('acknowledge-local-delete');
  });

  it('keeps a newer offline deletion when an older remote edit arrives', () => {
    expect(resolvePhotoConflict({
      localUpdatedAt: null,
      localDeletedAt: date('2026-01-03T00:00:00Z'),
      remoteUpdatedAt: '2026-01-02T00:00:00Z',
      remoteDeletedAt: null,
    })).toBe('keep-local');
  });

  it('restores a photo when a newer remote edit beats a local offline deletion', () => {
    expect(resolvePhotoConflict({
      localUpdatedAt: null,
      localDeletedAt: date('2026-01-02T00:00:00Z'),
      remoteUpdatedAt: '2026-01-03T00:00:00Z',
      remoteDeletedAt: null,
    })).toBe('apply-remote');
  });

  it('rejects invalid remote timestamps before advancing the sync cursor', () => {
    expect(() => resolvePhotoConflict({
      localUpdatedAt: null,
      remoteUpdatedAt: 'invalid-date',
      remoteDeletedAt: null,
    })).toThrow('Fecha remota invalida');
  });
});
