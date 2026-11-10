const FAVORITES_OPEN_STORAGE_KEY = "kamino-favorite-inventory-open"

const favoritesOpenListeners = new Set<() => void>()

export function subscribeToFavoritesOpen(onStoreChange: () => void) {
  favoritesOpenListeners.add(onStoreChange)

  if (typeof window === "undefined") {
    return () => {
      favoritesOpenListeners.delete(onStoreChange)
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_OPEN_STORAGE_KEY) {
      onStoreChange()
    }
  }

  window.addEventListener("storage", handleStorage)

  return () => {
    favoritesOpenListeners.delete(onStoreChange)
    window.removeEventListener("storage", handleStorage)
  }
}

function emitFavoritesOpenChange() {
  for (const listener of favoritesOpenListeners) {
    listener()
  }
}

export function readFavoritesOpenSnapshot() {
  if (typeof window === "undefined") return "true"
  return localStorage.getItem(FAVORITES_OPEN_STORAGE_KEY) ?? "true"
}

export function parseFavoritesOpen(snapshot: string) {
  return snapshot !== "false"
}

export function writeFavoritesOpen(open: boolean) {
  if (typeof window === "undefined") return
  localStorage.setItem(FAVORITES_OPEN_STORAGE_KEY, String(open))
  emitFavoritesOpenChange()
}
