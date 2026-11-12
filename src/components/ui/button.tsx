import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-teal text-canvas font-semibold hover:bg-teal-deep hover:shadow-[0_0_16px_rgba(20,214,176,0.28)]",
        secondary:
          "border border-line bg-surface-raised text-ink hover:border-teal/50 hover:bg-surface-hover",
        destructive:
          "border border-crimson/25 bg-crimson/10 text-crimson hover:bg-crimson hover:text-white",
        ghost: "text-ink-secondary hover:bg-surface-raised hover:text-ink",
        outline:
          "border border-line bg-transparent text-ink-secondary hover:border-teal/40 hover:text-ink",
      },
      size: {
        sm: "h-8 px-3 text-[12px]",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-sm",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
