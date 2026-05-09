import * as RTG from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/cn";

interface Item {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  items: Item[];
  className?: string;
}

export function SegmentedToggle({ value, onChange, items, className }: Props) {
  return (
    <RTG.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className={cn(
        "inline-flex rounded-xl border border-white/10 bg-ink-900/70 p-1",
        className
      )}
    >
      {items.map((it) => (
        <RTG.Item
          key={it.value}
          value={it.value}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition",
            "text-ink-300 hover:text-white",
            "data-[state=on]:bg-gradient-to-r data-[state=on]:from-accent-500 data-[state=on]:to-fuchsia-500 data-[state=on]:text-white data-[state=on]:shadow"
          )}
        >
          {it.icon}
          {it.label}
        </RTG.Item>
      ))}
    </RTG.Root>
  );
}
