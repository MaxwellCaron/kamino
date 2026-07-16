import { defaultRangeExtractor } from "@tanstack/react-virtual"

import type { SiteCommandRow } from "./site-command-index"
import type { Range } from "@tanstack/react-virtual"

const ORDINARY_ROW_HEIGHT = 56
const PREVIEW_ROW_HEIGHT = 140
const GROUP_START_EXTRA = 38
const FIRST_GROUP_START_EXTRA = 32

export function estimateSiteCommandRowSize(
  row: SiteCommandRow | undefined,
  rowIndex = 0
) {
  if (!row) return ORDINARY_ROW_HEIGHT

  let height = row.command.preview ? PREVIEW_ROW_HEIGHT : ORDINARY_ROW_HEIGHT
  if (row.startsGroup) {
    height += rowIndex === 0 ? FIRST_GROUP_START_EXTRA : GROUP_START_EXTRA
  }

  return height
}

function mergeActiveIndexIntoRange(
  rangeIndexes: Array<number>,
  activeIndex: number
) {
  if (activeIndex < 0) {
    return [...rangeIndexes].sort((left, right) => left - right)
  }

  const merged = new Set(rangeIndexes)
  merged.add(activeIndex)
  return [...merged].sort((left, right) => left - right)
}

export function createSiteCommandRangeExtractor(activeIndex: number) {
  return (range: Range) =>
    mergeActiveIndexIntoRange(defaultRangeExtractor(range), activeIndex)
}

function getNextRowIndex(rows: Array<SiteCommandRow>, currentIndex: number) {
  if (rows.length === 0) return -1
  return Math.min(Math.max(currentIndex, 0) + 1, rows.length - 1)
}

function getPreviousRowIndex(
  rows: Array<SiteCommandRow>,
  currentIndex: number
) {
  if (rows.length === 0) return -1
  return Math.max(Math.min(currentIndex, rows.length - 1) - 1, 0)
}

export function getFirstRowIndex(rows: Array<SiteCommandRow>) {
  return rows.length > 0 ? 0 : -1
}

function getLastRowIndex(rows: Array<SiteCommandRow>) {
  return rows.length > 0 ? rows.length - 1 : -1
}

function getNextGroupFirstRowIndex(
  rows: Array<SiteCommandRow>,
  currentIndex: number
) {
  if (rows.length === 0 || currentIndex < 0) return -1

  const currentGroup = rows[currentIndex].group
  for (let index = currentIndex + 1; index < rows.length; index++) {
    const row = rows[index]
    if (row.startsGroup && row.group !== currentGroup) {
      return index
    }
  }

  return currentIndex
}

function getPreviousGroupFirstRowIndex(
  rows: Array<SiteCommandRow>,
  currentIndex: number
) {
  if (rows.length === 0 || currentIndex <= 0) return 0

  const currentGroup = rows[currentIndex].group
  let index = currentIndex - 1

  while (index >= 0 && rows[index].group === currentGroup) {
    index--
  }

  if (index < 0) return 0

  const previousGroup = rows[index].group
  while (index >= 0) {
    const row = rows[index]
    if (row.group === previousGroup && row.startsGroup) {
      return index
    }
    index--
  }

  return 0
}

export function resolveSiteCommandKeyNavigation(
  rows: Array<SiteCommandRow>,
  currentIndex: number,
  event: {
    altKey: boolean
    ctrlKey: boolean
    key: string
    metaKey: boolean
    nativeEvent: { isComposing: boolean }
  }
) {
  if (event.nativeEvent.isComposing || event.key === "Process") {
    return null
  }

  const { altKey, ctrlKey, key, metaKey } = event

  if (key === "ArrowDown" && altKey && !ctrlKey && !metaKey) {
    return getNextGroupFirstRowIndex(rows, currentIndex)
  }

  if (key === "ArrowUp" && altKey && !ctrlKey && !metaKey) {
    return getPreviousGroupFirstRowIndex(rows, currentIndex)
  }

  if (
    (key === "ArrowDown" || (ctrlKey && (key === "n" || key === "j"))) &&
    !altKey &&
    !metaKey
  ) {
    return getNextRowIndex(rows, currentIndex)
  }

  if (
    (key === "ArrowUp" || (ctrlKey && (key === "p" || key === "k"))) &&
    !altKey &&
    !metaKey
  ) {
    return getPreviousRowIndex(rows, currentIndex)
  }

  if (
    (key === "Home" || (metaKey && key === "ArrowUp")) &&
    !altKey &&
    !ctrlKey
  ) {
    return getFirstRowIndex(rows)
  }

  if (
    (key === "End" || (metaKey && key === "ArrowDown")) &&
    !altKey &&
    !ctrlKey
  ) {
    return getLastRowIndex(rows)
  }

  return null
}
