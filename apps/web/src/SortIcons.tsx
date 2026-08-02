type IconProps = {
  className?: string;
};

/** Clock for “recent” sort. */
export function RecentSortIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 1.5" />
    </svg>
  );
}

/** Trophy for “best overall” sort. */
export function BestSortIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 5h8v3a4 4 0 0 1-8 0V5z" />
      <path d="M8 5H5.5A2.5 2.5 0 0 0 8 8.5" />
      <path d="M16 5h2.5A2.5 2.5 0 0 1 16 8.5" />
      <path d="M12 12v3" />
      <path d="M9 20h6" />
      <path d="M10 17h4v3h-4z" />
    </svg>
  );
}
