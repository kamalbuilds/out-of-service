import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "solid" | "outline" | "danger";

/**
 * Signage buttons: a rectangular plate with a hairline, no gradient, no shadow.
 * `primary` is the one accent (MTA blue). `solid` is ink, for the destructive-free
 * commitments a rider makes. Press is a 3% squeeze, nothing else moves.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-paper border-accent hover:bg-accent-ink hover:border-accent-ink",
  solid: "bg-ink text-paper border-ink hover:bg-ink-soft hover:border-ink-soft",
  outline:
    "bg-paper-raised text-ink border-hair-strong hover:border-ink hover:bg-paper-sunk",
  danger:
    "bg-paper-raised text-tier-unreliable border-hair-strong hover:border-tier-unreliable hover:bg-tier-unreliable hover:text-paper",
};

export function Button({
  variant = "outline",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center rounded-control border px-3.5 py-2 text-[0.8125rem] font-semibold tracking-[0.01em] transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
    />
  );
}
