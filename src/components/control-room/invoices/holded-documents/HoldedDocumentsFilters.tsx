import type { ActorFilterOption } from "./types";

type Props = {
  months: string[];
  selectedMonth: string;
  selectedActorKey: string;
  actorOptions: ActorFilterOption[];
  onMonthChange: (value: string) => void;
  onActorChange: (value: string) => void;
};

export default function HoldedDocumentsFilters({
  months,
  selectedMonth,
  selectedActorKey,
  actorOptions,
  onMonthChange,
  onActorChange,
}: Props) {
  return (
    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <label
          htmlFor="billing-month"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9f8652]"
        >
          Mes
        </label>
        <select
          id="billing-month"
          value={selectedMonth}
          onChange={(e) => onMonthChange(e.target.value)}
          className="h-11 w-full rounded-2xl border border-[#d8c08a] bg-[#fbf7f1] px-4 text-sm text-[#3d342e] outline-none"
        >
          {months.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label
          htmlFor="billing-actor"
          className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9f8652]"
        >
          Actor
        </label>
        <select
          id="billing-actor"
          value={selectedActorKey}
          onChange={(e) => onActorChange(e.target.value)}
          className="h-11 w-full rounded-2xl border border-[#d8c08a] bg-[#fbf7f1] px-4 text-sm text-[#3d342e] outline-none"
        >
          <option value="all">Todos</option>
          {actorOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}