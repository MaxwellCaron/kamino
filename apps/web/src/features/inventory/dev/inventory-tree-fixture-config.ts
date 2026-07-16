export function resolveInventoryTreeFixtureVmCount(
  isDevelopment: boolean,
  rawCount: string | undefined
): number | null {
  if (!isDevelopment || rawCount === undefined || rawCount.trim() === "") {
    return null
  }

  const count = Number(rawCount)
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error(
      "VITE_INVENTORY_FIXTURE_COUNT must be a positive whole number"
    )
  }

  return count
}

export const inventoryTreeFixtureVmCount = import.meta.env.DEV
  ? resolveInventoryTreeFixtureVmCount(
      true,
      import.meta.env.VITE_INVENTORY_FIXTURE_COUNT
    )
  : null
