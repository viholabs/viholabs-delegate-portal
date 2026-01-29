import * as React from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "default" | "success" | "warning" | "danger";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border";

  const stylesByVariant: Record<Variant, React.CSSProperties> = {
    default: {
      background: "var(--viho-surface-2)",
      color: "var(--viho-text)",
      borderColor: "var(--viho-border)",
    },
    success: {
      background: "rgba(89, 49, 60, 0.08)", // tinta del principal
      color: "var(--viho-primary)",
      borderColor: "rgba(89, 49, 60, 0.25)",
    },
    warning: {
      background: "rgba(242, 132, 68, 0.14)", // tinta del secundario
      color: "#7a2f12",
      borderColor: "rgba(242, 132, 68, 0.35)",
    },
    danger: {
      background: "rgba(219, 157, 135, 0.20)", // complementario rose
      color: "#5b1f14",
      borderColor: "rgba(219, 157, 135, 0.45)",
    },
  };

  return (
    <span
      className={cx(base, className)}
      style={stylesByVariant[variant]}
      {...props}
    />
  );
}
