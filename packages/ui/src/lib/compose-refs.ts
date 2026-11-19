import * as React from "react"

type PossibleRef<T> = React.Ref<T> | undefined
type RefCleanup = void | (() => void)

function setRef<T>(ref: PossibleRef<T>, value: T): RefCleanup {
  if (typeof ref === "function") {
    return ref(value)
  }

  if (ref !== null && ref !== undefined) {
    ref.current = value
  }
}

function composeRefs<T>(...refs: Array<PossibleRef<T>>): React.RefCallback<T> {
  return (node) => {
    const cleanups = refs.map((ref) => {
      return setRef(ref, node)
    })

    // React <19 will log an error to the console if a callback ref returns a
    // value. We don't use ref cleanups internally so this will only happen if a
    // user's ref callback returns a value, which we only expect if they are
    // using the cleanup functionality added in React 19.
    if (cleanups.some((cleanup) => typeof cleanup === "function")) {
      return () => {
        for (let i = 0; i < cleanups.length; i++) {
          const cleanup = cleanups[i]
          if (typeof cleanup === "function") {
            cleanup()
          } else {
            setRef(refs[i], null)
          }
        }
      }
    }
  }
}

function useComposedRefs<T>(
  ...refs: Array<PossibleRef<T>>
): React.RefCallback<T> {
  // biome-ignore lint/correctness/useExhaustiveDependencies: we want to memoize by all values
  return React.useCallback(composeRefs(...refs), refs)
}

export { composeRefs, useComposedRefs }
