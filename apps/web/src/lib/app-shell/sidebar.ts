import type { ApplicationPage } from "@/lib/app-shell/application-pages"

export type NavItem = ApplicationPage

export type NavGroupKey = NavItem["group"]

export type NavGroup = {
  key: NavGroupKey
  items: Array<NavItem>
}

export const navGroupStyles = {
  home: {
    rail: "",
    button:
      "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80 active:text-foreground data-active:bg-muted data-active:text-foreground",
    indicator: "bg-foreground",
  },
  manager: {
    rail: "bg-amber-600/5 text-amber-600 dark:bg-amber-400/5 dark:text-amber-400",
    button:
      "text-amber-600 hover:bg-amber-600/10 hover:text-amber-700 active:bg-amber-600/14 active:text-amber-700 data-active:bg-amber-600/14 data-active:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-400/10 dark:hover:text-amber-300 dark:active:bg-amber-400/14 dark:active:text-amber-300 dark:data-active:bg-amber-400/14 dark:data-active:text-amber-300",
    indicator: "bg-amber-600 dark:bg-amber-400",
  },
  admin: {
    rail: "bg-emerald-600/5 text-emerald-600 dark:bg-emerald-400/5 dark:text-emerald-400",
    button:
      "text-emerald-600 hover:bg-emerald-600/10 hover:text-emerald-700 active:bg-emerald-600/14 active:text-emerald-700 data-active:bg-emerald-600/14 data-active:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-400/10 dark:hover:text-emerald-300 dark:active:bg-emerald-400/14 dark:active:text-emerald-300 dark:data-active:bg-emerald-400/14 dark:data-active:text-emerald-300",
    indicator: "bg-emerald-600 dark:bg-emerald-400",
  },
} as const satisfies Record<
  NavGroupKey,
  {
    rail: string
    button: string
    indicator: string
  }
>

export function isActivePath(pathname: string, url: string) {
  return pathname === url
}
