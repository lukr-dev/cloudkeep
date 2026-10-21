export type Filters = { q: string; listId: string; tag: string; type: string };
export function readFilters(query: URLSearchParams): Filters {
  return {
    type: ["link", "text", "asset"].includes(query.get("type") ?? "") ? query.get("type")! : "",
    q: query.get("q") ?? "",
    listId: query.get("listId") ?? "",
    tag: query.get("tag") ?? "",
  };
}
export function filterQuery(filters: Filters): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of ["q", "listId", "tag", "type"] as const) {
    const value = filters[key].trim();
    if (value) query.set(key, value);
  }
  return query;
}
export function filterUrl(filters: Filters): string {
  const query = filterQuery(filters).toString();
  return query ? `/?${query}` : "/";
}
