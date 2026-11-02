import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

// shadcn Alert with the three message tones the design uses.
const alertVariants = cva(
  'flex w-full items-start gap-2 rounded-[10px] border px-3 py-2 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-foreground',
        destructive: 'border-danger-border bg-danger-bg text-destructive',
        warning: 'border-warning-border bg-warning-bg text-warning',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Alert({
  className,
  variant,
  role = 'alert',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={role}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('min-w-0', className)} {...props} />
}

export { Alert, AlertDescription }
