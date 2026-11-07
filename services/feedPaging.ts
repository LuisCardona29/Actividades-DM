export type IdCursor = { id: number };

/** Splits an id-ordered query result that requested `pageSize + 1` rows. */
export function splitIdPage<T extends IdCursor>(rows: T[], pageSize: number): {
  items: T[];
  nextCursor: IdCursor | null;
} {
  const items = rows.slice(0, pageSize);
  const hasMore = rows.length > pageSize;
  return {
    items,
    nextCursor: hasMore && items.length > 0 ? { id: items[items.length - 1].id } : null,
  };
}
