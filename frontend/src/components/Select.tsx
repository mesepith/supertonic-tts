import * as RS from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export function Select({ value, onChange, options, placeholder, className }: Props) {
  return (
    <RS.Root value={value} onValueChange={onChange}>
      <RS.Trigger
        className={cn(
          "input flex items-center justify-between gap-2 text-left",
          "data-[placeholder]:text-ink-400",
          className
        )}
      >
        <RS.Value placeholder={placeholder} />
        <RS.Icon>
          <ChevronDown className="h-4 w-4 text-ink-300" />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 backdrop-blur-xl shadow-2xl ring-1 ring-white/5 animate-fade-in"
        >
          <RS.Viewport className="p-1">
            {options.map((o) => (
              <RS.Item
                key={o.value}
                value={o.value}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm",
                  "text-ink-100 outline-none data-[highlighted]:bg-accent-500/15 data-[highlighted]:text-white"
                )}
              >
                <RS.ItemText>{o.label}</RS.ItemText>
                <RS.ItemIndicator>
                  <Check className="h-4 w-4 text-accent-400" />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
