import { useCallback, useMemo, useSyncExternalStore } from "react"

const FAVORITES_STORAGE_KEY = "kamino-favorite-inventory"

const favoriteListeners = new Set<() => void>()

function subscribeToFavorites(onStoreChange: () => void) {
  favoriteListeners.add(onStoreChange)

  if (typeof window === "undefined") {
    return () => {
      favoriteListeners.delete(onStoreChange)
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_STORAGE_KEY) {
      onStoreChange()
    }
  }

  window.addEventListener("storage", handleStorage)

  return () => {
    favoriteListeners.delete(onStoreChange)
    window.removeEventListener("storage", handleStorage)
  }
}

function emitFavoritesChange() {
  for (const listener of favoriteListeners) {
    listener()
  }
}

function readFavoritesSnapshot() {
  if (typeof window === "undefined") return "[]"
  return localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]"
}

function parseFavoriteIds(snapshot: string) {
  try {
    const parsed = JSON.parse(snapshot)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeFavoriteIds(next: Set<string>) {
  if (typeof window === "undefined") return
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(next)))
  emitFavoritesChange()
}

export function useInventoryFavorites() {
  const snapshot = useSyncExternalStore(
    subscribeToFavorites,
    readFavoritesSnapshot,
    () => "[]"
  )

  const favoriteIds = useMemo(
    () => new Set(parseFavoriteIds(snapshot)),
    [snapshot]
  )

  const toggleFavorite = useCallback((itemId: string) => {
    const next = new Set(parseFavoriteIds(readFavoritesSnapshot()))
    if (next.has(itemId)) {
      next.delete(itemId)
    } else {
      next.add(itemId)
    }
    writeFavoriteIds(next)
  }, [])

  return { favoriteIds, toggleFavorite }
}
