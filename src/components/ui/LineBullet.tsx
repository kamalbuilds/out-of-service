/** MTA route bullet: the real line colours, a filled circle carrying the letter. */
const LINE_COLOURS: Record<string, string> = {
  "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
  "4": "#00933C", "5": "#00933C", "6": "#00933C",
  "7": "#B933AD",
  A: "#0039A6", C: "#0039A6", E: "#0039A6",
  B: "#FF6319", D: "#FF6319", F: "#FF6319", M: "#FF6319",
  G: "#6CBE45",
  J: "#996633", Z: "#996633",
  L: "#A7A9AC",
  N: "#FCCC0A", Q: "#FCCC0A", R: "#FCCC0A", W: "#FCCC0A",
  S: "#808183",
  SIR: "#0039A6",
};

/** The two lines the MTA sets in black, plus grey, which needs the ink letter too. */
const DARK_TEXT = new Set(["N", "Q", "R", "W"]);

const SIZES = {
  xs: "h-4.5 w-4.5 text-[0.625rem]",
  sm: "h-5.5 w-5.5 text-[0.75rem]",
  md: "h-7 w-7 text-[0.9375rem]",
  lg: "h-9 w-9 text-[1.1875rem]",
} as const;

export function LineBullet({
  line,
  size = "md",
}: {
  line: string;
  size?: keyof typeof SIZES;
}) {
  const key = line.trim().toUpperCase();
  const bg = LINE_COLOURS[key] ?? "#14130f";
  const fg = DARK_TEXT.has(key) ? "#14130f" : "#ffffff";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold leading-none ${SIZES[size]}`}
      style={{ backgroundColor: bg, color: fg, fontStretch: "92%" }}
      aria-label={`${key} train`}
      title={`${key} train`}
    >
      {key}
    </span>
  );
}

export function LineBullets({ lines, size = "sm" }: { lines: string[]; size?: keyof typeof SIZES }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {lines.map((l) => (
        <LineBullet key={l} line={l} size={size} />
      ))}
    </span>
  );
}
