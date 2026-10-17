import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1000;
const MAX_CHUNKS = 32;

function countKey(key: string): string {
  return `${key}.chunks`;
}

function chunkKey(key: string, chunkIndex: number): string {
  return `${key}.${chunkIndex}`;
}

async function readCount(key: string): Promise<number> {
  const storedCount = await SecureStore.getItemAsync(countKey(key));
  const count = Number(storedCount ?? 0);
  return Number.isInteger(count) && count > 0 && count <= MAX_CHUNKS ? count : 0;
}

async function removeItem(key: string): Promise<void> {
  const count = await readCount(key);
  for (let chunkIndex = 0; chunkIndex < count; chunkIndex += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, chunkIndex));
  }
  await SecureStore.deleteItemAsync(countKey(key));
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await readCount(key);
    if (count === 0) return null;

    const chunks: string[] = [];
    for (let chunkIndex = 0; chunkIndex < count; chunkIndex += 1) {
      const chunk = await SecureStore.getItemAsync(chunkKey(key, chunkIndex));
      if (chunk === null) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const totalChunks = Math.ceil(value.length / CHUNK_SIZE);
    if (totalChunks > MAX_CHUNKS) throw new Error('La sesion supera el limite local de SecureStore.');

    await removeItem(key);
    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        await SecureStore.setItemAsync(
          chunkKey(key, chunkIndex),
          value.slice(chunkIndex * CHUNK_SIZE, (chunkIndex + 1) * CHUNK_SIZE),
        );
      }
      await SecureStore.setItemAsync(countKey(key), String(totalChunks));
    } catch (error) {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        await SecureStore.deleteItemAsync(chunkKey(key, chunkIndex)).catch(() => undefined);
      }
      await SecureStore.deleteItemAsync(countKey(key)).catch(() => undefined);
      throw error;
    }
  },

  removeItem,
};