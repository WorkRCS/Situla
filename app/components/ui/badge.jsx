import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const badgeVariants = cva("ui-badge inline-flex items-center whitespace-nowrap font-semibold", {
  variants: {
    variant: {
      default: "ui-badge-default",
      secondary: "ui-badge-secondary",
      outline: "ui-badge-outline",
      gold: "ui-badge-gold"
    }
  },
  defaultVariants: { variant: "default" }
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { badgeVariants };
