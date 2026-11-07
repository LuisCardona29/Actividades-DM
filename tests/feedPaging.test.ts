import { describe, expect, it } from 'vitest';

import { splitIdPage } from '../services/feedPaging';

describe('cloud feed id pagination', () => {
  it('uses the last returned row as the cursor when an extra row proves there is another page', () => {
    const rows = Array.from({ length: 21 }, (_, index) => ({ id: 100 - index }));

    expect(splitIdPage(rows, 20)).toEqual({
      items: rows.slice(0, 20),
      nextCursor: { id: 81 },
    });
  });

  it('ends the feed when the server returns at most one full page', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ id: 20 - index }));

    expect(splitIdPage(rows, 20)).toEqual({ items: rows, nextCursor: null });
    expect(splitIdPage([], 20)).toEqual({ items: [], nextCursor: null });
  });
});
