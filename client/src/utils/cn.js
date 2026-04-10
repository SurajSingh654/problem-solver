/**
 * cn — className utility
 * Combines clsx (conditional classes) with
 * tailwind-merge (resolves Tailwind conflicts)
 *
 * Usage:
 *   cn('px-4 py-2', isActive && 'bg-brand-400', className)
 */
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
