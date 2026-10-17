export type Filters = { q: string; listId: string; tag: string };
export function readFilters(query: URLSearchParams): Filters {
  return {
    q: query.get("q") ?? "",
    listId: query.get("listId") ?? "",
    tag: query.get("tag") ?? "",
  };
}
export function filterQuery(filters: Filters): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of ["q", "listId", "tag"] as const) {
    const value = filters[key].trim();
    if (value) query.set(key, value);
  }
  return query;
}
export function filterUrl(filters: Filters): string {
  const query = filterQuery(filters).toString();
  return query ? `/?${query}` : "/";
}
