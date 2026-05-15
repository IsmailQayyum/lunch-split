import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-bg/50 backdrop-blur-sm p-5 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
