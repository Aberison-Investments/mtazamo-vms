import { useEffect, useState } from "react";
import { api, ApiError, type County, type CountyTree } from "../../api";
import { portal, SEATS, SEGMENTS, scopeLevels, seatScope } from "../../portalTheme";
import { SearchSelect } from "./ui";

interface Props {
  onSuccess: (workspaceName: string) => void;
  onCancel: () => void;
  cancelLabel?: string;
}

export function WorkspaceFormBody({ onSuccess, onCancel, cancelLabel = "Cancel" }: Props) {
  const [counties, setCounties] = useState<County[]>([]);
  const [tree, setTree] = useState<CountyTree | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);

  const [form, setForm] = useState({ name: "", seat: "", segment: "", election_date: "", party: "" });
  const [countyId, setCountyId] = useState("");
  const [constituencyId, setConstituencyId] = useState("");
  const [wardId, setWardId] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scope = seatScope(form.seat);
  const levels = scopeLevels(scope);
  const needCounty = levels.includes("county");
  const needConstituency = levels.includes("constituency");
  const needWard = levels.includes("ward");

  useEffect(() => {
    api.listCounties()
      .then(({ counties }) => setCounties(counties))
      .catch(() => setCounties([]));
  }, []);

  useEffect(() => {
    if (!needConstituency || !countyId) { setTree(null); return; }
    if (tree?.county.id === countyId) return;
    let cancelled = false;
    setLoadingTree(true);
    api.countyTree(countyId)
      .then((t) => { if (!cancelled) { setTree(t); setConstituencyId(""); setWardId(""); } })
      .catch(() => { if (!cancelled) setTree(null); })
      .finally(() => { if (!cancelled) setLoadingTree(false); });
    return () => { cancelled = true; };
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
        year: form.election_date ? new Date(form.election_date).getFullYear() : new Date().getFullYear(),
        election_date: form.election_date || null,
        party: form.party || null,
      });
      onSuccess(form.name);
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
    <form onSubmit={submit}>
      <SectionLabel required>Workspace name</SectionLabel>
      <TextInput value={form.name} onChange={set("name")} placeholder='e.g. "2027 Nairobi General Election"' error={fieldError("name")} />
      <Help>How this election appears in your workspace list.</Help>

      <SectionLabel required style={{ marginTop: 20 }}>Seat you're contesting</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 4 }}>
        {SEATS.map((s) => (
          <ChoiceCard key={s.id} selected={form.seat === s.id} onClick={() => setForm((f) => ({ ...f, seat: s.id }))} title={s.label} desc={s.desc} />
        ))}
      </div>

      <SectionLabel required style={{ marginTop: 20 }}>Election segment</SectionLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        {SEGMENTS.map((g) => (
          <ChoiceCard key={g.id} selected={form.segment === g.id} onClick={() => setForm((f) => ({ ...f, segment: g.id }))} title={g.label} desc={g.desc} grow />
        ))}
      </div>

      <SectionLabel required style={{ marginTop: 20 }}>Geography in scope</SectionLabel>
      {form.seat && (scope === "national" ? (
        <NationalScope />
      ) : (
        <div>
          <SearchSelect label="County" value={countyId} onChange={setCountyId} error={fieldError("county")} placeholder={counties.length === 0 ? "Loading…" : "Search a county"} options={counties.map((c) => ({ value: c.id, label: `${c.name} County` }))} />
          {needConstituency && (
            <SearchSelect label="Constituency" value={constituencyId} onChange={(v) => { setConstituencyId(v); setWardId(""); }} disabled={!countyId || loadingTree} error={fieldError("constituency")} placeholder={loadingTree ? "Loading…" : "Search a constituency"} options={constituencies.map((c) => ({ value: c.id, label: c.name }))} />
          )}
          {needWard && (
            <SearchSelect label="Ward" value={wardId} onChange={setWardId} disabled={!constituencyId} error={fieldError("ward")} placeholder="Search a ward" options={wards.map((w) => ({ value: w.id, label: w.name }))} />
          )}
        </div>
      ))}

      <div style={{ margin: "24px 0 12px" }}>
        <SectionLabel>Election date</SectionLabel>
        <TextInput type="date" value={form.election_date} onChange={set("election_date")} error={fieldError("election_date")} />
        <Help>The day the vote is held.</Help>
      </div>

      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Party <span style={{ fontWeight: 400, color: portal.textSubtle }}>(needed for a primary)</span></SectionLabel>
        <TextInput value={form.party} onChange={set("party")} placeholder="e.g. UDA" />
      </div>

      {formError && <div style={{ fontSize: 13, color: portal.dangerText, marginBottom: 12 }}>{formError}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onCancel} style={{ display: "flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${portal.border}`, background: portal.canvas, color: portal.ink, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
          {cancelLabel}
        </button>
        <button type="submit" disabled={submitting} style={{ display: "flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 8, border: 0, background: submitting ? portal.neutralHover : portal.brand, color: portal.inverse, fontSize: 14, fontWeight: 500, cursor: submitting ? "default" : "pointer" }}>
          {submitting ? "Creating…" : "Create workspace"}
        </button>
      </div>
    </form>
  );
}

// ---- sub-components ---------------------------------------------------------

function NationalScope() {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ border: `1px solid ${portal.brand}`, background: portal.brandSubtlest, borderRadius: 8, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Pill>National</Pill>
          <span style={{ fontSize: 14, fontWeight: 600, color: portal.ink }}>All 47 counties</span>
        </div>
        <div style={{ fontSize: 12, color: portal.label }}>A presidential workspace covers all 47 counties. Scope cannot be narrowed.</div>
      </div>
    </div>
  );
}

function SectionLabel({ children, required, style }: { children: React.ReactNode; required?: boolean; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8, ...style }}>{children}{required && <span style={{ color: portal.dangerText }}> *</span>}</div>;
}

function Help({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: portal.textSubtle, margin: "4px 0 0" }}>{children}</div>;
}

function TextInput({ value, onChange, placeholder, error, type = "text" }: { value: string; onChange: (e: { target: { value: string } }) => void; placeholder?: string; error?: string; type?: string }) {
  const [focus, setFocus] = useState(false);
  return (
    <>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={{ width: "100%", height: 36, boxSizing: "border-box", border: `1px solid ${error ? portal.dangerText : focus ? portal.brand : portal.border}`, boxShadow: focus ? `0 0 0 1px ${portal.brand}` : "none", borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, outline: "none", fontFamily: "inherit" }} />
      {error && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{error}</div>}
    </>
  );
}

function ChoiceCard({ selected, onClick, title, desc, grow }: { selected: boolean; onClick: () => void; title: string; desc: string; grow?: boolean }) {
  return (
    <div onClick={onClick} style={{ padding: "12px 14px", borderRadius: 8, cursor: "pointer", boxSizing: "border-box", border: `1px solid ${selected ? portal.brand : portal.border}`, background: selected ? portal.brandSubtlest : portal.canvas, flex: grow ? 1 : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Radio selected={selected} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: portal.textSubtle, lineHeight: "16px", paddingLeft: 22, marginTop: 2 }}>{desc}</div>
    </div>
  );
}

function Radio({ selected }: { selected: boolean }) {
  return <span style={{ width: 14, height: 14, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box", border: selected ? `4px solid ${portal.brand}` : `1.5px solid ${portal.textSubtlest}`, background: portal.canvas }} />;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 3, background: portal.canvas, color: portal.brandText, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>{children}</span>;
}
