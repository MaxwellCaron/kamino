import { cn as cnfast } from "cnfast"
import type { ClassValue as CnfastClassValue } from "cnfast"

export type ClassValue =
  | CnfastClassValue
  | ((...args: Array<never>) => string | undefined)

export function cn(...inputs: Array<ClassValue>) {
  return cnfast(...(inputs as Array<CnfastClassValue>))
}
