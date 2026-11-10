import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const buttonVariants = cva(
  "ui-button inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8b65b]/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090e] disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "ui-button-default",
        gold: "gold-button",
        ghost: "ghost-button",
        subtle: "ui-button-subtle",
        icon: "ui-button-icon"
      },
      size: {
        default: "",
        sm: "ui-button-sm",
        icon: "ui-button-icon-size"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export function Button({ className, variant, size, type = "button", ...props }) {
  return <button type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
