import { useCallback, useState } from "react"

type ItemDialogState<T> = {
  data?: T
  dialogKey: number
  open: boolean
}

export function useItemDialogState<T>() {
  const [state, setState] = useState<ItemDialogState<T>>({
    dialogKey: 0,
    open: false,
  })

  const onOpenChange = useCallback((open: boolean) => {
    setState((current) => ({ ...current, open }))
  }, [])

  const openWith = useCallback((data: T) => {
    setState((current) => ({
      data,
      dialogKey: current.dialogKey + 1,
      open: true,
    }))
  }, [])

  return {
    data: state.data,
    dialogKey: state.dialogKey,
    open: state.open,
    onOpenChange,
    openWith,
  }
}
