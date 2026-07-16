"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@workspace/ui/components/command"

import { buildSiteCommandRows, groupLabels } from "./site-command-index"
import {
  createSiteCommandRangeExtractor,
  estimateSiteCommandRowSize,
  getFirstRowIndex,
  resolveSiteCommandKeyNavigation,
} from "./site-command-menu-utils"
import type { SiteCommandResult } from "./site-command-index"
import type { KeyboardEvent } from "react"

const COMMAND_ROW_OVERSCAN = 8

export type SiteCommandMenuProps = {
  commands: Array<SiteCommandResult>
  emptyMessage: string
  searchQuery: string
  onSearchQueryChange: (value: string) => void
}

export function SiteCommandMenu({
  commands,
  emptyMessage,
  onSearchQueryChange,
  searchQuery,
}: SiteCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => buildSiteCommandRows(commands), [commands])
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null)
  const firstCommandId = rows[0]?.command.id ?? null
  const rowsSignature = useMemo(
    () => rows.map((row) => row.command.id).join("\n"),
    [rows]
  )

  const activeIndex = useMemo(() => {
    if (!activeCommandId) return -1
    return rows.findIndex((row) => row.command.id === activeCommandId)
  }, [activeCommandId, rows])

  const rangeExtractor = useMemo(
    () => createSiteCommandRangeExtractor(activeIndex),
    [activeIndex]
  )

  const getItemKey = useCallback(
    (index: number) => rows[index]?.command.id ?? String(index),
    [rows]
  )

  const estimateSize = useCallback(
    (index: number) => estimateSiteCommandRowSize(rows[index], index),
    [rows]
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    getItemKey,
    estimateSize,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: COMMAND_ROW_OVERSCAN,
    rangeExtractor,
  })

  const selectRowAtIndex = useCallback(
    (index: number) => {
      const row = rows[index]
      setActiveCommandId(row.command.id)
      virtualizer.scrollToIndex(index, { align: "auto", behavior: "auto" })
    },
    [rows, virtualizer]
  )

  const measureList = virtualizer.measure

  useEffect(() => {
    setActiveCommandId(firstCommandId)

    const listElement = listRef.current
    if (listElement) {
      if (typeof listElement.scrollTo === "function") {
        listElement.scrollTo({ top: 0 })
      } else {
        listElement.scrollTop = 0
      }
    }

    measureList()
  }, [firstCommandId, measureList, rowsSignature])

  const handleActiveValueChange = useCallback(
    (value: string) => {
      const index = rows.findIndex((row) => row.command.id === value)
      if (index < 0) return

      setActiveCommandId(value)
      virtualizer.scrollToIndex(index, { align: "auto", behavior: "auto" })
    },
    [rows, virtualizer]
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return
      }

      const currentIndex =
        activeIndex >= 0 ? activeIndex : getFirstRowIndex(rows)

      if (event.key === "Enter") {
        if (currentIndex >= 0) {
          event.preventDefault()
          rows[currentIndex]?.command.onSelect()
        }
        return
      }

      const nextIndex = resolveSiteCommandKeyNavigation(
        rows,
        currentIndex,
        event
      )
      if (nextIndex === null) return

      event.preventDefault()
      selectRowAtIndex(nextIndex)
    },
    [activeIndex, rows, selectRowAtIndex]
  )

  const firstGroupKey = rows[0]?.group

  return (
    <Command
      shouldFilter={false}
      value={activeCommandId ?? ""}
      onValueChange={handleActiveValueChange}
      onKeyDown={handleKeyDown}
    >
      <CommandInput
        placeholder="Search Kamino..."
        value={searchQuery}
        onValueChange={onSearchQueryChange}
      />
      <CommandList
        ref={listRef}
        className="max-h-[min(70dvh,42rem)] overscroll-contain"
      >
        <CommandEmpty>{emptyMessage}</CommandEmpty>
        {rows.length > 0 ? (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows.at(virtualRow.index)
              if (row === undefined) return null

              const { command } = row
              const showSeparator =
                row.startsGroup &&
                row.group !== firstGroupKey &&
                virtualRow.index > 0

              return (
                <div
                  key={virtualRow.key}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  data-command-id={command.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.startsGroup ? (
                    <div className="overflow-hidden px-1.5 text-foreground">
                      {showSeparator ? <CommandSeparator /> : null}
                      <div
                        className="px-3 py-2 text-xs font-medium text-muted-foreground"
                        cmdk-group-heading=""
                      >
                        {groupLabels[row.group]}
                      </div>
                      <CommandItem
                        value={command.id}
                        keywords={command.keywords}
                        onSelect={command.onSelect}
                        variant={command.variant}
                        aria-label={`${groupLabels[row.group]}: ${command.label}`}
                        aria-posinset={virtualRow.index + 1}
                        aria-setsize={rows.length}
                      >
                        <SiteCommandOptionContent command={command} />
                      </CommandItem>
                    </div>
                  ) : (
                    <div className="overflow-hidden px-1.5 text-foreground">
                      <CommandItem
                        value={command.id}
                        keywords={command.keywords}
                        onSelect={command.onSelect}
                        variant={command.variant}
                        aria-label={`${groupLabels[row.group]}: ${command.label}`}
                        aria-posinset={virtualRow.index + 1}
                        aria-setsize={rows.length}
                      >
                        <SiteCommandOptionContent command={command} />
                      </CommandItem>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : null}
      </CommandList>
    </Command>
  )
}

function SiteCommandOptionContent({ command }: { command: SiteCommandResult }) {
  return (
    <>
      <HugeiconsIcon icon={command.icon} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{command.label}</span>
        {command.preview ? (
          <>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {command.subtitle}
            </span>
            <span className="mt-1 line-clamp-5 block text-xs font-normal whitespace-pre-line text-muted-foreground/80">
              {command.preview}
            </span>
          </>
        ) : (
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {command.subtitle}
          </span>
        )}
      </span>
      {command.shortcut ? (
        <CommandShortcut>{command.shortcut}</CommandShortcut>
      ) : null}
    </>
  )
}
