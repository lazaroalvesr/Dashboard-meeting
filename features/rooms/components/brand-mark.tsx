type BrandMarkProps = {
  className?: string;
  variant?: "dark" | "light";
};

// Three connected nodes: clients, projects and meetings tied together in one workspace.
export function BrandMark({ className = "h-8 w-8", variant = "dark" }: BrandMarkProps) {
  const background = variant === "dark" ? "#202126" : "#ffd84f";
  const mark = variant === "dark" ? "#ffd84f" : "#202126";

  return (
    <svg aria-hidden className={`shrink-0 rounded-lg ${className}`} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect fill={background} height="32" rx="9" width="32" />
      <line opacity="0.6" stroke={mark} strokeLinecap="round" strokeWidth="2" x1="11" x2="21" y1="12" y2="12" />
      <line opacity="0.6" stroke={mark} strokeLinecap="round" strokeWidth="2" x1="11" x2="16" y1="12" y2="21" />
      <line opacity="0.6" stroke={mark} strokeLinecap="round" strokeWidth="2" x1="21" x2="16" y1="12" y2="21" />
      <circle cx="11" cy="12" fill={mark} r="3.4" />
      <circle cx="21" cy="12" fill={mark} r="3.4" />
      <circle cx="16" cy="21" fill={mark} r="3.4" />
    </svg>
  );
}
