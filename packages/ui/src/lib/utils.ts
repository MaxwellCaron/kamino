import { cn as cnfast } from "cnfast"
import type { ClassValue as CnfastClassValue } from "cnfast"

export type ClassValue =
  | CnfastClassValue
  | ((...args: Array<never>) => string | undefined)

export function cn(...inputs: Array<ClassValue>) {
  return cnfast(...(inputs as Array<CnfastClassValue>))
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}
