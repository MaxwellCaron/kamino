const appName = "Kamino"

export function formatPageTitle(title?: string | null) {
  const trimmedTitle = title?.trim()

  return trimmedTitle ? `${trimmedTitle} - ${appName}` : appName
}

export function pageTitle(title?: string | null) {
  return {
    meta: [
      {
        title: formatPageTitle(title),
      },
    ],
  }
}
