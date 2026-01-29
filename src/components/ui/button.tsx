import * as React from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "default" | "secondary" | "ghost" | "outline";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition active:translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none";

    const stylesByVariant: Record<Variant, React.CSSProperties> = {
      default: {
        background: "var(--viho-primary)", // #59313c
        color: "#ffffff",
        border: "1px solid rgba(0,0,0,0.10)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
      },
      secondary: {
        background: "var(--viho-secondary)", // #f28444
        color: "#1b1b1b",
        border: "1px solid rgba(0,0,0,0.10)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.10)",
      },
      outline: {
        background: "transparent",
        color: "var(--viho-primary)",
        border: "1px solid var(--viho-border)",
        boxShadow: "none",
      },
      ghost: {
        background: "transparent",
        color: "var(--viho-text)",
        border: "1px solid transparent",
        boxShadow: "none",
      },
    };

    return (
      <button
        ref={ref}
        className={cx(base, className)}
        style={stylesByVariant[variant]}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
