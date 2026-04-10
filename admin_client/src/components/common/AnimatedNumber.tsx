import React from "react";
import { useAnimatedCount } from "../../hooks/ui/useAnimatedCount";

export type AnimatedNumberProps = {
  value: number;
  duration?: number;
  integer?: boolean;
  format?: (n: number) => string;
  className?: string;
};

/**
 * Renders `value` with an ease-out count-up when the value changes.
 */
export function AnimatedNumber({
  value,
  duration,
  integer = true,
  format,
  className,
}: AnimatedNumberProps): React.ReactElement {
  const n = useAnimatedCount(value, { duration, integer });
  const text = format
    ? format(n)
    : integer
      ? n.toLocaleString("en-IN")
      : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return <span className={className}>{text}</span>;
}
