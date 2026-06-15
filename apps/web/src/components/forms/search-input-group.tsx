import { IconSearch } from "@tabler/icons-react"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"

type SearchInputGroupProps = {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  "aria-label"?: string
  resultCount?: number | null
  resultLabel?: (count: number) => string
  className?: string
}

function defaultResultLabel(count: number): string {
  return count === 1 ? "1 result" : `${count} results`
}

export function SearchInputGroup({
  value,
  onValueChange,
  placeholder = "Search...",
  "aria-label": ariaLabel,
  resultCount,
  resultLabel = defaultResultLabel,
  className,
}: SearchInputGroupProps) {
  return (
    <InputGroup className={className}>
      <InputGroupInput
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label={ariaLabel}
      />
      <InputGroupAddon>
        <IconSearch />
      </InputGroupAddon>
      {resultCount != null && (
        <InputGroupAddon align="inline-end">
          {resultLabel(resultCount)}
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}
