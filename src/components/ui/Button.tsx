import type { ButtonHTMLAttributes } from "react";

type Variant = "solid" | "outline" | "danger";

const VARIANTS: Record<Variant, string> = {
  solid: "bg-ink text-white border-ink hover:bg-white hover:text-ink",
  outline: "bg-white text-ink border-ink hover:bg-ink hover:text-white",
  danger: "bg-white text-ink border-ink hover:bg-[#c4271a] hover:text-white hover:border-[#c4271a]",
};

export function Button({
  variant = "outline",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center border-2 px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-ink ${VARIANTS[variant]} ${className}`}
    />
  );
}
