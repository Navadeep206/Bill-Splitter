import type * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'min-h-11 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 text-base text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60',
        'aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_1px_var(--destructive)]',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
