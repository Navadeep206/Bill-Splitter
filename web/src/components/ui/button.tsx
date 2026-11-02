import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type * as React from 'react'
import { cn } from '@/lib/utils'

// shadcn Button, tuned to the design: 44px touch height, 10px radius, semibold label,
// and a grey disabled state instead of fading the colour.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-transparent font-semibold text-[15px] no-underline transition-colors disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-[#4a5361] [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground',
        secondary:
          'border-secondary-border bg-card text-primary hover:bg-primary-soft hover:text-accent-foreground',
        ghost:
          'bg-transparent px-3 text-primary hover:bg-primary-soft hover:text-accent-foreground',
      },
      size: {
        default: 'min-h-11 px-[18px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
