function pluralize(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

export function formatRelativeTime(date: Date, now = new Date()): string {
  const diff = now.getTime() - date.getTime()
  const isInFuture = diff < 0
  const absDiff = Math.abs(diff)

  const seconds = Math.floor(absDiff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 5) return "just now"

  if (isInFuture) {
    if (seconds < 60) return `in ${pluralize(seconds, "second")}`
    if (minutes < 60) return `in ${pluralize(minutes, "minute")}`
    if (hours < 24) return `in ${pluralize(hours, "hour")}`
    if (days < 7) return `in ${pluralize(days, "day")}`
    return date.toLocaleDateString()
  }

  if (seconds < 60) return `${pluralize(seconds, "second")} ago`
  if (minutes < 60)
    return `${pluralize(minutes, "minute")} ${pluralize(seconds % 60, "second")} ago`
  if (hours < 24) return `${pluralize(hours, "hour")} ago`
  if (days < 7) return `${pluralize(days, "day")} ago`
  return date.toLocaleDateString()
}

function msUntilNextSecond(now: Date): number {
  const remainder = now.getTime() % 1000
  return remainder === 0 ? 1000 : 1000 - remainder
}

function msUntilNextHour(now: Date): number {
  const remainder =
    (now.getMinutes() * 60_000 +
      now.getSeconds() * 1000 +
      now.getMilliseconds()) %
    3_600_000
  return remainder === 0 ? 3_600_000 : 3_600_000 - remainder
}

function msUntilNextDay(now: Date): number {
  const remainder =
    (now.getHours() * 3_600_000 +
      now.getMinutes() * 60_000 +
      now.getSeconds() * 1000 +
      now.getMilliseconds()) %
    86_400_000
  return remainder === 0 ? 86_400_000 : 86_400_000 - remainder
}

export function getRelativeTimeUpdateDelay(
  date: Date,
  now = new Date()
): number | null {
  const diff = now.getTime() - date.getTime()
  const absDiff = Math.abs(diff)

  const seconds = Math.floor(absDiff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days >= 7) return null
  if (seconds < 60) return msUntilNextSecond(now)
  if (minutes < 60) return msUntilNextSecond(now)
  if (hours < 24) return msUntilNextHour(now)
  return msUntilNextDay(now)
}
