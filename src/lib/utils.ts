import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn/ui 標準の className 合成ヘルパー */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
