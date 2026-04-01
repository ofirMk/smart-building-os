import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export { formatError } from "./format-error"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
