import { useNavigate } from "react-router-dom";

/** Consistent back-navigation control for any drill-down page. Pass `to` for a
 * fixed destination (e.g. a list page); omit it to just pop browser history,
 * or pass `onClick` for in-page "back to list" behavior. */
export function BackButton({
  to,
  onClick,
  label = "Back",
}: {
  to?: string;
  onClick?: () => void;
  label?: string;
}) {
  const navigate = useNavigate();

  function handleClick() {
    if (onClick) return onClick();
    if (to) return navigate(to);
    navigate(-1);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}
