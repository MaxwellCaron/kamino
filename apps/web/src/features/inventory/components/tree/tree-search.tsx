import { SearchInputGroup } from "@/components/forms/search-input-group"

export function InventoryTreeSearch({
  query,
  resultCount,
  setQuery,
}: {
  query: string
  resultCount: number | null
  setQuery: (query: string) => void
}) {
  return (
    <SearchInputGroup
      className="mb-2"
      value={query}
      onValueChange={setQuery}
      placeholder="Search..."
      resultCount={resultCount}
    />
  )
}
