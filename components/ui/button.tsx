import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  default: "btn",
  outline: "btn btn-outline",
  ghost: "btn btn-ghost",
  danger: "btn",
};

const sizeClasses: Record<Size, string> = {
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", style, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(variantClasses[variant], sizeClasses[size], className)}
      style={
        variant === "danger"
          ? { background: "var(--saffron)", borderColor: "var(--saffron)", ...style }
          : style
      }
      {...props}
    />
  ),
);
Button.displayName = "Button";
