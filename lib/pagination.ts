export type PaginationItem =
  | { kind: "page"; page: number }
  | { kind: "ellipsis"; key: string };

export function buildPaginationItems(requestedPage: number, requestedTotalPages: number): PaginationItem[] {
  const totalPages = Math.max(0, Math.trunc(requestedTotalPages));
  if (totalPages === 0) return [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => ({ kind: "page", page: index + 1 }));
  }

  const currentPage = Math.min(Math.max(Math.trunc(requestedPage) || 1, 1), totalPages);
  const visiblePages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const pages = [...visiblePages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);

  const items: PaginationItem[] = [];
  let previousPage: number | undefined;
  for (const page of pages) {
    if (previousPage !== undefined && page - previousPage === 2) {
      items.push({ kind: "page", page: previousPage + 1 });
    } else if (previousPage !== undefined && page - previousPage > 2) {
      items.push({ kind: "ellipsis", key: `ellipsis-${previousPage}-${page}` });
    }

    items.push({ kind: "page", page });
    previousPage = page;
  }

  return items;
}
