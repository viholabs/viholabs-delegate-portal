import * as React from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div
      className="w-full rounded-2xl border"
      style={{
        borderColor: "var(--viho-border)",
        background: "var(--viho-surface)",
      }}
    >
      {/* CLAVE: scroll horizontal real (antes estaba overflow-hidden y “cortaba” la tabla) */}
      <div className="w-full overflow-x-auto">
        <table className={cx("w-full text-sm", className)} {...props} />
      </div>
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cx(className)}
      style={{
        background: "rgba(217, 194, 186, 0.22)", // viho-cream tint
      }}
      {...props}
    />
  );
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cx(className)} {...props} />;
}

export function TableRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cx("border-t", className)}
      style={{ borderColor: "var(--viho-border)" }}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cx(
        "px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wide whitespace-nowrap",
        className
      )}
      style={{ color: "var(--viho-muted)" }}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cx("px-4 py-3 align-middle", className)}
      style={{ color: "var(--viho-text)" }}
      {...props}
    />
  );
}
