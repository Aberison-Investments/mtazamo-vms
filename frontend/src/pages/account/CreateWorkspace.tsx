import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type County, type CountyTree } from "../../api";
import { portal, SEATS, SEGMENTS, scopeLevels, seatScope } from "../../portalTheme";
import { PortalShell } from "../../components/portal/PortalShell";
import { SearchSelect } from "../../components/portal/ui";

export function CreateWorkspace() {
  const navigate = useNavigate();
  const [counties, setCounties] = useState<County[]>([]);
  const [tree, setTree] = useState<CountyTree | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);

  const [form, setForm] = useState({
    name: "",
    seat: "governor",
    segment: "general",
    year: "2027",
    election_date: "",
    party: "",
  });
  // Geography selection is tracked by id; names are derived for display + payload.
  const [countyId, setCountyId] = useState("");
  const [constituencyId, setConstituencyId] = useState("");
  const [wardId, setWardId] = useState("");
  const [priority, setPriority] = useState<string[]>([]);

  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scope = seatScope(form.seat);
  const levels = scopeLevels(scope);
  const needCounty = levels.includes("county");
  const needConstituency = levels.includes("constituency");
  const needWard = levels.includes("ward");

  // Load counties once.
  useEffect(() => {
    api
      .listCounties()
      .then(({ counties }) => {
        setCounties(counties);
        setCountyId((id) => id || counties[0]?.id || "");
      })
      .catch(() => setCounties([]));
  }, []);

  // Load the county tree (constituencies + wards) whenever the chosen county
  // changes and the seat reaches at least constituency level.
  useEffect(() => {
    if (!needConstituency || !countyId) {
      setTree(null);
      return;
    }
    if (tree?.county.id === countyId) return; // already loaded

    let cancelled = false;
    setLoadingTree(true);
    api
      .countyTree(countyId)
      .then((t) => {
        if (cancelled) return;
        setTree(t);
        // Reset deeper selections that no longer apply.
        setConstituencyId("");
        setWardId("");
      })
      .catch(() => !cancelled && setTree(null))
      .finally(() => !cancelled && setLoadingTree(false));
    return () => {
      cancelled = true;
    };
  }, [countyId, needConstituency, tree?.county.id]);

  const constituencies = tree?.constituencies ?? [];
  const selectedConstituency = constituencies.find((c) => c.id === constituencyId);
  const wards = selectedConstituency?.wards ?? [];

  const countyName = counties.find((c) => c.id === countyId)?.name ?? null;
  const constituencyName = selectedConstituency?.name ?? null;
  const wardName = wards.find((w) => w.id === wardId)?.name ?? null;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const fieldError = (k: string) => errors[k]?.[0];

  function togglePriority(name: string) {
    setPriority((p) => (p.includes(name) ? p.filter((x) => x !== name) : [...p, name]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      await api.createWorkspace({
        name: form.name,
        seat: form.seat,
        segment: form.segment,
        county: needCounty ? countyName : null,
        county_id: needCounty ? countyId : null,
        constituency: needConstituency ? constituencyName : null,
        constituency_id: needConstituency ? constituencyId || null : null,
        ward: needWard ? wardName : null,
        ward_id: needWard ? wardId || null : null,
        priority_counties: scope === "national" ? priority : undefined,
        year: Number(form.year),
        election_date: form.election_date || null,
        party: form.party || null,
      });
      navigate("/workspaces");
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setErrors(err.fields);
      } else {
        setFormError(err instanceof Error ? err.message : "Could not create the workspace.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalShell active="workspaces">
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px", width: "100%", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          <Link to="/workspaces" style={{ textDecoration: "none", color: portal.textSubtle }}>
            Workspaces
          </Link>{" "}
          / Create workspace
        </div>
        <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 24 }}>
          Create a workspace
        </div>

        <form onSubmit={submit}>
          <div
            style={{
              border: `1px solid ${portal.border}`,
              borderRadius: 8,
              boxShadow: portal.cardShadow,
              padding: 24,
            }}
          >
            <SectionLabel required>Workspace name</SectionLabel>
            <TextInput
              value={form.name}
              onChange={set("name")}
              placeholder='e.g. "2027 Nairobi General Election"'
              error={fieldError("name")}
            />
            <Help>How this election appears in your workspace list.</Help>

            <SectionLabel required style={{ marginTop: 20 }}>
              Seat you're contesting
            </SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 }}>
              {SEATS.map((s) => (
                <ChoiceCard
                  key={s.id}
                  selected={form.seat === s.id}
                  onClick={() => setForm((f) => ({ ...f, seat: s.id }))}
                  title={s.label}
                  desc={s.desc}
                />
              ))}
            </div>

            <SectionLabel required style={{ marginTop: 20 }}>
              Election segment
            </SectionLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
              {SEGMENTS.map((g) => (
                <ChoiceCard
                  key={g.id}
                  selected={form.segment === g.id}
                  onClick={() => setForm((f) => ({ ...f, segment: g.id }))}
                  title={g.label}
                  desc={g.desc}
                  grow
                />
              ))}
            </div>

            <SectionLabel required style={{ marginTop: 20 }}>
              Geography in scope
            </SectionLabel>

            {scope === "national" ? (
              <NationalScope
                counties={counties}
                priority={priority}
                onToggle={togglePriority}
              />
            ) : (
              <div>
                {/* County — always present for non-national seats */}
                <SearchSelect
                  label="County"
                  value={countyId}
                  onChange={(v) => setCountyId(v)}
                  error={fieldError("county")}
                  placeholder={counties.length === 0 ? "Loading…" : "Search a county"}
                  options={counties.map((c) => ({ value: c.id, label: `${c.name} County` }))}
                />

                {/* Constituency — MP and MCA */}
                {needConstituency && (
                  <SearchSelect
                    label="Constituency"
                    value={constituencyId}
                    onChange={(v) => {
                      setConstituencyId(v);
                      setWardId("");
                    }}
                    disabled={!countyId || loadingTree}
                    error={fieldError("constituency")}
                    placeholder={loadingTree ? "Loading…" : "Search a constituency"}
                    options={constituencies.map((c) => ({ value: c.id, label: c.name }))}
                  />
                )}

                {/* Ward — MCA only */}
                {needWard && (
                  <SearchSelect
                    label="Ward"
                    value={wardId}
                    onChange={(v) => setWardId(v)}
                    disabled={!constituencyId}
                    error={fieldError("ward")}
                    placeholder="Search a ward"
                    options={wards.map((w) => ({ value: w.id, label: w.name }))}
                  />
                )}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12, margin: "24px 0 12px" }}>
              <div>
                <SectionLabel>Election date</SectionLabel>
                <TextInput
                  type="date"
                  value={form.election_date}
                  onChange={set("election_date")}
                  error={fieldError("election_date")}
                />
                <Help>The day the vote is held.</Help>
              </div>
              <div>
                <SectionLabel>Election year</SectionLabel>
                <TextInput value={form.year} onChange={set("year")} error={fieldError("year")} />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <SectionLabel>
                Party <span style={{ fontWeight: 400, color: portal.textSubtle }}>(needed for a primary)</span>
              </SectionLabel>
              <TextInput value={form.party} onChange={set("party")} placeholder="e.g. UDA" />
            </div>

            {formError && (
              <div style={{ fontSize: 13, color: portal.dangerText, marginBottom: 12 }}>{formError}</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Link
                to="/workspaces"
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 8,
                  background: portal.neutral,
                  color: portal.ink,
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 8,
                  border: 0,
                  background: submitting ? portal.neutralHover : portal.brand,
                  color: portal.inverse,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: submitting ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {submitting ? "Creating…" : "Create workspace"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </PortalShell>
  );
}

// ---- geography sub-blocks --------------------------------------------------
function NationalScope({
  counties,
  priority,
  onToggle,
}: {
  counties: County[];
  priority: string[];
  onToggle: (name: string) => void;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          border: `1px solid ${portal.brand}`,
          background: portal.brandSubtlest,
          borderRadius: 8,
          padding: "12px 14px",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Pill>National</Pill>
          <span style={{ fontSize: 14, fontWeight: 600, color: portal.ink }}>All 47 counties</span>
        </div>
        <div style={{ fontSize: 12, color: portal.label }}>
          A presidential workspace takes a national snapshot. Scope can't be narrowed, but you can flag
          priority counties for the war room.
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, margin: "14px 0 6px" }}>
        Priority counties <span style={{ fontWeight: 400, color: portal.textSubtle }}>(optional)</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {counties.map((c) => (
          <Chip key={c.id} label={c.name} on={priority.includes(c.name)} onClick={() => onToggle(c.name)} />
        ))}
      </div>
    </div>
  );
}

// ---- small building blocks -------------------------------------------------
function SectionLabel({
  children,
  required,
  style,
}: {
  children: React.ReactNode;
  required?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8, ...style }}>
      {children} {required && <span style={{ color: portal.dangerText }}>*</span>}
    </div>
  );
}

function Help({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: portal.textSubtle, margin: "4px 0 0" }}>{children}</div>;
}

function TextInput({
  value,
  onChange,
  placeholder,
  error,
  type = "text",
}: {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  placeholder?: string;
  error?: string;
  type?: string;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%",
          height: 36,
          boxSizing: "border-box",
          border: `1px solid ${error ? portal.dangerText : focus ? portal.brand : portal.border}`,
          boxShadow: focus ? `0 0 0 1px ${portal.brand}` : "none",
          borderRadius: 8,
          padding: "0 10px",
          fontSize: 14,
          color: portal.ink,
          background: portal.canvas,
          outline: "none",
          fontFamily: "inherit",
        }}
      />
      {error && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{error}</div>}
    </>
  );
}

function ChoiceCard({
  selected,
  onClick,
  title,
  desc,
  grow,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  grow?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 14px",
        borderRadius: 8,
        cursor: "pointer",
        boxSizing: "border-box",
        border: `1px solid ${selected ? portal.brand : portal.border}`,
        background: selected ? portal.brandSubtlest : portal.canvas,
        flex: grow ? 1 : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Radio selected={selected} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: portal.textSubtle, lineHeight: "16px", paddingLeft: 22, marginTop: 2 }}>
        {desc}
      </div>
    </div>
  );
}

function Radio({ selected }: { selected: boolean }) {
  return (
    <span
      style={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        flexShrink: 0,
        boxSizing: "border-box",
        border: selected ? `4px solid ${portal.brand}` : `1.5px solid ${portal.textSubtlest}`,
        background: portal.canvas,
      }}
    />
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 28,
        padding: "0 12px",
        borderRadius: 9999,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        boxSizing: "border-box",
        border: `1px solid ${on ? portal.brand : portal.border}`,
        background: on ? portal.brandSubtlest : portal.canvas,
        color: on ? portal.brandText : portal.label,
      }}
    >
      {label}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 3,
        background: portal.canvas,
        color: portal.brandText,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

