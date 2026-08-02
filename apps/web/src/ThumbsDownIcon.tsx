type ThumbsDownIconProps = {
  filled?: boolean;
  className?: string;
};

/** Outline or filled thumbs-down for dislike / demote. */
export default function ThumbsDownIcon({
  filled = false,
  className = "h-5 w-5",
}: ThumbsDownIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V3H7.2a2 2 0 0 0-2 1.7l-1.1 7A2 2 0 0 0 6 14.8H10z" />
      <path d="M17 3h2.7A1.3 1.3 0 0 1 21 4.3v6.4a1.3 1.3 0 0 1-1.3 1.3H17" />
    </svg>
  );
}
