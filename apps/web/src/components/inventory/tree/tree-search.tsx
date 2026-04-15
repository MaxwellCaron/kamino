import { IconSearch } from "@tabler/icons-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"

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
    <InputGroup className="mb-2">
      <InputGroupInput
        placeholder="Search..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <InputGroupAddon>
        <IconSearch />
      </InputGroupAddon>
      {resultCount !== null && (
        <InputGroupAddon align="inline-end">
          {resultCount} results
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}
