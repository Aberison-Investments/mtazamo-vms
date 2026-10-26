import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { portal } from "../../portalTheme";

// ---- brand mark ------------------------------------------------------------
export function Wordmark({ size = "md" }: { size?: "sm" | "md" }) {
  const box = size === "sm" ? 24 : 22;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: box,
          height: box,
          borderRadius: 5,
          background: portal.brand,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: portal.inverse,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        M
      </span>
      <span style={{ fontSize: size === "sm" ? 14 : 18, fontWeight: size === "sm" ? 600 : 700, letterSpacing: "-0.2px" }}>
        Mtazamo{size === "sm" ? " Votes" : ""}
      </span>
      {size === "md" && <span style={{ fontSize: 14, color: portal.textSubtle }}>Votes</span>}
    </div>
  );
}

// ---- centered auth card ----------------------------------------------------
export function AuthLayout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: portal.canvasSubtle,
        fontFamily: portal.font,
        color: portal.ink,
        fontSize: 14,
        lineHeight: "20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 16px 56px",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <Wordmark />
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: portal.canvas,
          borderRadius: 8,
          boxShadow: portal.cardShadow,
          padding: 32,
        }}
      >
        {children}
      </div>
      {footer && <div style={{ fontSize: 14, color: portal.textSubtle, marginTop: 20 }}>{footer}</div>}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 16,
        fontWeight: 600,
        textAlign: "center",
        color: portal.label,
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}

// ---- labelled input --------------------------------------------------------
const baseInput: CSSProperties = {
  width: "100%",
  height: 36,
  boxSizing: "border-box",
  border: `1px solid ${portal.border}`,
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 14,
  color: portal.ink,
  background: portal.canvas,
  fontFamily: "inherit",
};

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, required, hint, error, style, ...rest },
  ref,
) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <Label required={required}>{label}</Label>}
      <input
        ref={ref}
        {...rest}
        onFocus={(e) => {
          setFocus(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          rest.onBlur?.(e);
        }}
        style={{
          ...baseInput,
          borderColor: error ? portal.dangerText : focus ? portal.brand : portal.border,
          boxShadow: focus ? `0 0 0 1px ${error ? portal.dangerText : portal.brand}` : "none",
          outline: "none",
          ...style,
        }}
      />
      {error ? (
        <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{error}</div>
      ) : (
        hint && <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
});

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
}

export function SelectField({ label, required, hint, error, style, children, ...rest }: SelectFieldProps) {
  const [focus, setFocus] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <Label required={required}>{label}</Label>}
      <select
        {...rest}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          ...baseInput,
          padding: "0 8px",
          borderColor: error ? portal.dangerText : focus ? portal.brand : portal.border,
          boxShadow: focus ? `0 0 0 1px ${portal.brand}` : "none",
          outline: "none",
          ...style,
        }}
      >
        {children}
      </select>
      {error ? (
        <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{error}</div>
      ) : (
        hint && <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}

export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>
      {children} {required && <span style={{ color: portal.dangerText }}>*</span>}
    </label>
  );
}

// ---- buttons ---------------------------------------------------------------
export function PrimaryButton({
  children,
  disabled,
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hover, setHover] = useState(false);
  return (
    <button
      {...rest}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: 36,
        boxSizing: "border-box",
        borderRadius: 8,
        border: 0,
        background: disabled ? portal.neutral : hover ? portal.brandHover : portal.brand,
        color: disabled ? portal.textSubtle : portal.inverse,
        fontSize: 14,
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        opacity: 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hover, setHover] = useState(false);
  return (
    <button
      {...rest}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 32,
        padding: "0 12px",
        borderRadius: 8,
        border: 0,
        background: hover ? portal.neutralHover : portal.neutral,
        color: portal.ink,
        fontSize: 14,
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ---- banners ---------------------------------------------------------------
type Tone = "info" | "success" | "warning" | "error";

const toneMap: Record<Tone, { bg: string; fg: string; dot: string }> = {
  info: { bg: portal.brandSubtlest, fg: portal.brandText, dot: portal.brand },
  success: { bg: portal.successBg, fg: portal.successText, dot: portal.successBold },
  warning: { bg: portal.warnBg, fg: portal.warnText, dot: portal.warnBold },
  error: { bg: portal.dangerBg, fg: portal.dangerText, dot: portal.dangerText },
};

export function Banner({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const c = toneMap[tone];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 8,
        background: c.bg,
        color: c.fg,
        fontSize: 13,
        marginBottom: 16,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot, marginTop: 5, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );
}

// ---- searchable select (Select2-style combobox) ---------------------------
export interface Option {
  value: string;
  label: string;
}

interface SearchSelectProps {
  label?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  emptyText?: string;
}

export function SearchSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  error,
  emptyText = "No matches",
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // Keep the highlighted row in range as the filter changes.
  useEffect(() => {
    setHighlight((h) => Math.min(Math.max(h, 0), Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  function openMenu() {
    if (disabled) return;
    setQuery("");
    const idx = Math.max(
      filtered.findIndex((o) => o.value === value),
      0,
    );
    setHighlight(idx);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(opt: Option) {
    onChange(opt.value);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      openMenu();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlight]) choose(filtered[highlight]);
    } else if (e.key === "Escape") {
      close();
    }
  }

  const displayValue = open ? query : selected?.label ?? "";

  return (
    <div style={{ marginBottom: 10 }} ref={rootRef}>
      {label && (
        <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>{label}</div>
      )}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          value={displayValue}
          disabled={disabled}
          readOnly={!open}
          placeholder={selected ? selected.label : placeholder}
          onMouseDown={(e) => {
            if (open) return;
            e.preventDefault();
            openMenu();
            inputRef.current?.focus();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          style={{
            width: "100%",
            height: 36,
            boxSizing: "border-box",
            border: `1px solid ${error ? portal.dangerText : open ? portal.brand : portal.border}`,
            boxShadow: open ? `0 0 0 1px ${portal.brand}` : "none",
            borderRadius: 8,
            padding: "0 30px 0 10px",
            fontSize: 14,
            color: disabled ? portal.textSubtlest : selected || open ? portal.ink : portal.textSubtlest,
            background: disabled ? portal.canvasSubtle : portal.canvas,
            outline: "none",
            fontFamily: "inherit",
            cursor: disabled ? "default" : "text",
          }}
        />
        <span
          onMouseDown={(e) => {
            e.preventDefault();
            if (disabled) return;
            open ? close() : openMenu();
          }}
          style={{
            position: "absolute",
            right: 10,
            top: 0,
            height: 36,
            display: "flex",
            alignItems: "center",
            color: portal.textSubtlest,
            fontSize: 10,
            pointerEvents: disabled ? "none" : "auto",
          }}
        >
          ▾
        </span>

        {open && (
          <div
            style={{
              position: "absolute",
              top: 40,
              left: 0,
              right: 0,
              background: portal.canvas,
              border: `1px solid ${portal.border}`,
              borderRadius: 8,
              boxShadow: portal.cardShadow,
              maxHeight: 240,
              overflowY: "auto",
              zIndex: 60,
              padding: 4,
            }}
          >
            {filtered.length === 0 ? (
              <div style={{ padding: "8px 10px", fontSize: 13, color: portal.textSubtle }}>{emptyText}</div>
            ) : (
              filtered.map((o, i) => {
                const active = i === highlight;
                const isSelected = o.value === value;
                return (
                  <div
                    key={o.value}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(o);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 6,
                      fontSize: 14,
                      cursor: "pointer",
                      background: active ? portal.brandSubtlest : "transparent",
                      color: isSelected ? portal.brandText : portal.ink,
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    <span>{o.label}</span>
                    {isSelected && <span style={{ color: portal.brandText, fontSize: 12 }}>✓</span>}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      {error && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{error}</div>}
    </div>
  );
}
