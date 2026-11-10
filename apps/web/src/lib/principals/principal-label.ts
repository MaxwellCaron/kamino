type PrincipalLabelShape = {
  external_id: string
  full_name?: string | null
  name?: string | null
}

function trimValue(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function getPrincipalBaseName(principal: PrincipalLabelShape): string {
  return trimValue(principal.name) ?? principal.external_id
}

export function formatPrincipalReference(
  principal: PrincipalLabelShape
): string {
  const base = getPrincipalBaseName(principal)
  const fullName = trimValue(principal.full_name)

  if (!fullName) {
    return base
  }

  if (fullName.localeCompare(base, undefined, { sensitivity: "accent" }) === 0) {
    return base
  }

  return `${base} (${fullName})`
}
