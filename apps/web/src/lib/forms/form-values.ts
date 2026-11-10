export function parseNumberInput(value: string, fallback: number) {
  const next = Number.parseInt(value, 10)
  return Number.isNaN(next) ? fallback : next
}

export function parseOptionalNumberInput(value: string) {
  const next = Number.parseInt(value, 10)
  return Number.isNaN(next) ? undefined : next
}
