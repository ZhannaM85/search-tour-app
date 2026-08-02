import { useEffect, useRef, useState } from "react";
import PencilIcon from "./PencilIcon";

type OperatorFieldProps = {
  value: string;
  onChange: (value: string) => void;
  /** When this changes, the field locks again (API fill, form reset, etc.). */
  lockKey: string;
  "aria-label": string;
};

/** Tour operator display: read-only until the pencil unlocks editing. */
export default function OperatorField({
  value,
  onChange,
  lockKey,
  "aria-label": ariaLabel,
}: OperatorFieldProps) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditing(false);
  }, [lockKey]);

  function startEditing() {
    setEditing(true);
    queueMicrotask(() => inputRef.current?.focus());
  }

  return (
    <div className="relative mt-1.5">
      <input
        ref={inputRef}
        readOnly={!editing}
        className={`w-full rounded-xl border py-1.5 pl-3 pr-9 text-sm font-normal ${
          editing
            ? "border-slate-300 bg-white text-slate-900"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={editing ? "Tour operator" : "From tour search"}
        aria-label={ariaLabel}
        aria-readonly={!editing}
      />
      {!editing ? (
        <button
          type="button"
          onClick={startEditing}
          className="absolute inset-y-0 right-1 flex items-center rounded-lg px-2 text-slate-400 hover:text-teal-700"
          aria-label={`Edit ${ariaLabel.toLowerCase()}`}
          title="Edit tour operator"
        >
          <PencilIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
