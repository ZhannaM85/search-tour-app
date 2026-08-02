type PencilIconProps = {
  className?: string;
};

/** Outline pencil for edit affordances. */
export default function PencilIcon({ className = "h-4 w-4" }: PencilIconProps) {
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
      <path d="M15.2 4.8a2.1 2.1 0 0 1 3 3L8.5 17.5 4 18.5l1-4.5L15.2 4.8z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </svg>
  );
}
