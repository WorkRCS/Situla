import { cn } from "../../lib/utils.js";

export function Card({ className, as: Component = "div", ...props }) {
  return <Component className={cn("ui-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn("ui-card-header", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn("ui-card-content", className)} {...props} />;
}

export function CardFooter({ className, ...props }) {
  return <div className={cn("ui-card-footer", className)} {...props} />;
}
