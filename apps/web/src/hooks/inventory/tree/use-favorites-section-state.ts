import {
  parseFavoritesOpen,
  readFavoritesOpenSnapshot,
  subscribeToFavoritesOpen,
  writeFavoritesOpen,
} from "@/lib/inventory/tree/favorites-section-state"
import { useCallback, useSyncExternalStore } from "react"

export function useFavoritesSectionState() {
  const snapshot = useSyncExternalStore(
    subscribeToFavoritesOpen,
    readFavoritesOpenSnapshot,
    () => "true"
  )

  const favoritesOpen = parseFavoritesOpen(snapshot)

  const setFavoritesOpen = useCallback((open: boolean) => {
    writeFavoritesOpen(open)
  }, [])

  return { favoritesOpen, setFavoritesOpen }
}
