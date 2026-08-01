type StarIconProps = {
  filled?: boolean;
  className?: string;
};

/** Outline or filled star for favorite affordances. */
export default function StarIcon({ filled = false, className = "h-5 w-5" }: StarIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
    >
      <path d="M12 3.2 14.9 9l6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 21l1.1-6.5L2.6 9.9 9.1 9 12 3.2z" />
    </svg>
  );
}
