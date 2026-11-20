/** Eye button that sits inside a password field and shows or hides what was typed. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      title={shown ? "Hide password" : "Show password"}
      className="no-ring absolute inset-y-0 right-1 my-auto flex size-8 items-center justify-center rounded-md text-faint transition-colors outline-none hover:bg-surface-2 hover:text-text focus:outline-none focus-visible:bg-surface-2 focus-visible:text-text"
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {shown && <path d="M3 3l18 18" />}
      </svg>
    </button>
  );
}
