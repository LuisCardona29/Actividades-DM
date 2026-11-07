export type PhotoSyncDecision =
  | 'apply-remote'
  | 'apply-remote-delete'
  | 'acknowledge-local-delete'
  | 'keep-local';

export function isPending(photo: { syncedAt: Date | null; updatedAt: Date | null }): boolean {
  return photo.syncedAt === null
    || (photo.updatedAt?.getTime() ?? 0) > photo.syncedAt.getTime();
}

export function resolvePhotoConflict(input: {
  localUpdatedAt: Date | null;
  localDeletedAt?: Date | null;
  remoteUpdatedAt: string;
  remoteDeletedAt: string | null;
}): PhotoSyncDecision {
  const remoteTime = new Date(input.remoteUpdatedAt).getTime();
  if (!Number.isFinite(remoteTime)) throw new Error('Fecha remota invalida durante la sincronizacion.');
  const localDeleteTime = input.localDeletedAt?.getTime();
  const localUpdateTime = input.localUpdatedAt?.getTime();
  if (localDeleteTime !== undefined && !Number.isFinite(localDeleteTime)) {
    throw new Error('Fecha de borrado local invalida durante la sincronizacion.');
  }
  if (localUpdateTime !== undefined && !Number.isFinite(localUpdateTime)) {
    throw new Error('Fecha local invalida durante la sincronizacion.');
  }

  if (localDeleteTime !== undefined) {
    if (input.remoteDeletedAt && remoteTime >= localDeleteTime) return 'acknowledge-local-delete';
    return remoteTime > localDeleteTime ? 'apply-remote' : 'keep-local';
  }

  if (!input.localUpdatedAt) {
    return input.remoteDeletedAt ? 'apply-remote-delete' : 'apply-remote';
  }

  const localTime = localUpdateTime as number;
  if (input.remoteDeletedAt) {
    return remoteTime >= localTime ? 'apply-remote-delete' : 'keep-local';
  }
  return remoteTime > localTime ? 'apply-remote' : 'keep-local';
}
