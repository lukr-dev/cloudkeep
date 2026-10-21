export type Filters = { q: string; listId: string; tag: string; type: string; archived: boolean };
export function readFilters(query: URLSearchParams): Filters {
  return {
    type: ["link", "text", "asset"].includes(query.get("type") ?? "") ? query.get("type")! : "",
    q: query.get("q") ?? "",
    listId: query.get("listId") ?? "",
    tag: query.get("tag") ?? "",
    archived: ["1", "true"].includes(query.get("archived") ?? ""),
  };
}
export function filterQuery(filters: Filters): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of ["q", "listId", "tag", "type"] as const) {
    const value = filters[key].trim();
    if (value) query.set(key, value);
  }
  if (filters.archived) query.set("archived", "1");
  return query;
}
export function filterUrl(filters: Filters): string {
  const query = filterQuery(filters).toString();
  return query ? `/?${query}` : "/";
}
