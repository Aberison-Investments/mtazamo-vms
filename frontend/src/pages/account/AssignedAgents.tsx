import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  type AssignedStation,
  type AssignedWardSummary,
  type BenchAgent,
} from "../../api";
import { portal } from "../../portalTheme";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";

// ---- tiny helpers -----------------------------------------------------------

function tag(tone: "green" | "amber" | "red" | "grey") {
  const tones = {
    green: { bg: "#E3FCEF", color: "#164B35" },
    amber: { bg: "#FFF7D6", color: "#974F0C" },
    red:   { bg: "#FFECEB", color: "#AE2A19" },
    grey:  { bg: portal.neutral, color: portal.label },
  };
  const t = tones[tone];
  return {
    display: "inline-flex", alignItems: "center",
    height: 20, padding: "0 8px", borderRadius: 3,
    fontSize: 11, fontWeight: 700,
    textTransform: "uppercase" as const, letterSpacing: "0.3px",
    whiteSpace: "nowrap" as const, flexShrink: 0,
    background: t.bg, color: t.color,
  };
}

function stationTone(state: AssignedStation["state"]): "green" | "amber" | "red" {
  return state === "assigned" ? "green" : state === "pending" ? "amber" : "red";
}

function stationTagLabel(state: AssignedStation["state"]) {
  return state === "assigned" ? "Confirmed" : state === "pending" ? "Invite sent" : "Uncovered";
}

// ---- Ward list panel --------------------------------------------------------

const WARD_PAGE_SIZE = 20;

function WardList({
  wards,
  selectedId,
  onSelect,
}: {
  wards: AssignedWardSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = wards.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / WARD_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * WARD_PAGE_SIZE, safePage * WARD_PAGE_SIZE);

  function handleSearch(val: string) {
    setSearch(val);
    setPage(1);
  }

  return (
    <div
      style={{
        width: 220, flexShrink: 0, display: "flex", flexDirection: "column",
        border: `1px solid ${portal.border}`, borderRadius: 8,
        boxShadow: portal.cardShadow, boxSizing: "border-box", overflow: "hidden",
      }}
    >
      {/* Header + search */}
      <div style={{ padding: "10px 10px 8px", borderBottom: `1px solid ${portal.borderSubtle}`, flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: portal.textSubtle, marginBottom: 8 }}>
          Wards
        </div>
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search wards…"
          style={{
            width: "100%", height: 28, boxSizing: "border-box",
            border: `1px solid ${portal.border}`, borderRadius: 6,
            padding: "0 8px", fontSize: 12, fontFamily: "inherit",
            background: portal.canvasSubtle, color: portal.ink, outline: "none",
          }}
        />
      </div>

      {/* Ward rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
        {visible.length === 0 ? (
          <div style={{ padding: "16px 8px", fontSize: 12, color: portal.textSubtle, textAlign: "center" }}>
            No wards match.
          </div>
        ) : visible.map((w) => {
          const covered = w.assigned_count + w.pending_count;
          const pct = w.total_stations > 0 ? Math.round((covered / w.total_stations) * 100) : 0;
          const active = w.id === selectedId;
          return (
            <div
              key={w.id}
              onClick={() => onSelect(w.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 6px", borderRadius: 8, cursor: "pointer", marginBottom: 2,
                background: active ? portal.brandSubtlest : "transparent",
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = portal.neutral; }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  color: active ? portal.brandText : portal.ink,
                  marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {w.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 3, borderRadius: 2, background: portal.neutral, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct >= 80 ? "#1F845A" : portal.brand }} />
                  </div>
                  <span style={{ fontSize: 10, color: portal.textSubtle, whiteSpace: "nowrap" }}>
                    {covered}/{w.total_stations}
                  </span>
                </div>
              </div>
              {w.bench_count > 0 && (
                <span style={{ fontSize: 10, color: portal.textSubtle, whiteSpace: "nowrap" }}>
                  {w.bench_count}B
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 10px", borderTop: `1px solid ${portal.borderSubtle}`,
          fontSize: 11, color: portal.textSubtle,
        }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            style={{ border: "none", background: "none", cursor: safePage === 1 ? "default" : "pointer", color: safePage === 1 ? portal.textSubtlest : portal.brandText, fontFamily: "inherit", fontSize: 11, padding: "2px 4px" }}
          >
            ← Prev
          </button>
          <span>{safePage} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            style={{ border: "none", background: "none", cursor: safePage === totalPages ? "default" : "pointer", color: safePage === totalPages ? portal.textSubtlest : portal.brandText, fontFamily: "inherit", fontSize: 11, padding: "2px 4px" }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Stations panel ---------------------------------------------------------

type StationFilter = "all" | "assigned" | "gap";

function StationsPanel({
  ward,
  stations,
  loading,
  canAssign,
  workspaceId,
  onReassigned,
}: {
  ward: AssignedWardSummary | undefined;
  stations: AssignedStation[];
  loading: boolean;
  canAssign: boolean;
  workspaceId: string;
  onReassigned: (agentId: string, newStationId: string | null, oldStationId: string | null) => void;
}) {
  const [filter, setFilter] = useState<StationFilter>("all");
  const [search, setSearch] = useState("");
  const [reassignTarget, setReassignTarget] = useState<AssignedStation | null>(null);

  const assigned = stations.filter((s) => s.state === "assigned").length;
  const pending  = stations.filter((s) => s.state === "pending").length;
  const gap      = stations.filter((s) => s.state === "gap").length;
  const total    = stations.length;

  const filtered = stations.filter((s) => {
    if (filter === "assigned" && s.state === "gap") return false;
    if (filter === "gap" && s.state !== "gap") return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.code && s.code.includes(q)) ||
      (s.agent && s.agent.name.toLowerCase().includes(q))
    );
  });

  const summaryText = ward
    ? `${total} stations · ${assigned} confirmed · ${pending} invite sent · ${gap} uncovered`
    : "";

  const filters: { id: StationFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "assigned", label: "Assigned" },
    { id: "gap", label: "Uncovered" },
  ];

  return (
    <>
    <div
      style={{
        flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
        border: `1px solid ${portal.border}`, borderRadius: 8,
        boxShadow: portal.cardShadow,
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "14px 20px", borderBottom: `1px solid ${portal.border}`,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            Polling stations{ward ? ` — ${ward.name} Ward` : ""}
          </div>
          <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>{summaryText}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Station or agent"
            style={{
              width: 180, height: 32, boxSizing: "border-box",
              border: `1px solid ${portal.border}`, borderRadius: 8,
              padding: "0 10px", fontSize: 13,
              color: portal.ink, background: portal.canvasSubtle, fontFamily: "inherit",
            }}
          />
          <div
            style={{
              display: "flex", background: portal.neutral,
              borderRadius: 8, padding: 2, gap: 2,
            }}
          >
            {filters.map((f) => {
              const active = filter === f.id;
              return (
                <div
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    height: 28, display: "flex", alignItems: "center",
                    padding: "0 10px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                    fontWeight: active ? 600 : 500,
                    color: active ? portal.ink : portal.label,
                    background: active ? portal.canvas : "transparent",
                    boxShadow: active ? "0 1px 1px rgba(9,30,66,0.25)" : "none",
                  }}
                >
                  {f.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: canAssign ? "90px minmax(0,1.4fr) minmax(0,1fr) 90px" : "90px minmax(0,1.4fr) minmax(0,1fr)",
          gap: 12, padding: "10px 14px",
          background: portal.canvasSubtle, borderBottom: `1px solid ${portal.border}`,
          fontSize: 12, fontWeight: 600, color: portal.label,
        }}
      >
        <span>Polling station</span>
        <span>Polling center</span>
        <span>Agent</span>
        {canAssign && <span />}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: "24px 20px", fontSize: 13, color: portal.textSubtle }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "28px 20px", textAlign: "center", fontSize: 13, color: portal.textSubtle }}>
            No stations match.
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              style={{
                display: "grid",
                gridTemplateColumns: canAssign ? "90px minmax(0,1.4fr) minmax(0,1fr) 90px" : "90px minmax(0,1.4fr) minmax(0,1fr)",
                gap: 12, alignItems: "center",
                padding: "10px 14px", borderBottom: `1px solid ${portal.borderSubtle}`,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 12, color: portal.textSubtle, fontVariantNumeric: "tabular-nums" }}>
                  {s.centre_code ?? s.code ?? "—"}
                </span>
                {s.stream_number != null && (
                  <span style={{ fontSize: 11, color: portal.textSubtlest }}>
                    stream {s.stream_number}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 13 }}>{s.name}</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 13, fontWeight: s.agent ? 500 : 400,
                      color: s.agent ? portal.ink : "#974F0C",
                    }}
                  >
                    {s.agent ? s.agent.name : "Unassigned"}
                  </span>
                  <span style={tag(stationTone(s.state))}>{stationTagLabel(s.state)}</span>
                </div>
                {s.agent && (
                  <div style={{ fontSize: 12, color: portal.textSubtle }}>{s.agent.phone_masked}</div>
                )}
              </div>
              {canAssign && s.agent && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setReassignTarget(s)}
                    style={{ height: 26, padding: "0 10px", borderRadius: 6, border: `1px solid ${portal.border}`, background: portal.canvas, color: portal.label, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Reassign
                  </button>
                </div>
              )}
              {canAssign && !s.agent && <div />}
            </div>
          ))
        )}
      </div>
    </div>

    {reassignTarget && ward && (

      <ReassignModal
        workspaceId={workspaceId}
        wardName={ward.name}
        station={reassignTarget}
        allStations={stations}
        onClose={() => setReassignTarget(null)}
        onDone={(agentId, newStationId) => {
          onReassigned(agentId, newStationId, reassignTarget.id);
          setReassignTarget(null);
        }}
      />
    )}
    </>
  );
}

// ---- ReassignModal ----------------------------------------------------------

function ReassignModal({
  workspaceId,
  wardName,
  station,
  allStations,
  onClose,
  onDone,
}: {
  workspaceId: string;
  wardName: string;
  station: AssignedStation;
  allStations: AssignedStation[];
  onClose: () => void;
  onDone: (agentId: string, newStationId: string | null) => void;
}) {
  const [selected, setSelected] = useState<string | null>(station.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherStations = allStations.filter((s) => s.id !== station.id);

  async function handleConfirm() {
    if (!station.agent) return;
    setSaving(true);
    setError(null);
    try {
      await api.reassignAgent(workspaceId, station.agent.id, selected === station.id ? null : selected);
      onDone(station.agent.id, selected === station.id ? null : selected);
    } catch {
      setError("Could not reassign. Try again.");
      setSaving(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(9,30,66,0.22)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 301, width: 400, background: portal.canvas, borderRadius: 10, boxShadow: "0 8px 32px rgba(9,30,66,0.2)", padding: "22px 22px 18px", fontFamily: portal.font }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: portal.ink, marginBottom: 2 }}>Reassign {station.agent?.name}</div>
        <div style={{ fontSize: 13, color: portal.textSubtle, marginBottom: 18 }}>
          Currently at <strong style={{ color: portal.ink }}>{station.name}</strong> · {wardName} Ward
        </div>

        {error && (
          <div style={{ padding: "8px 10px", borderRadius: 8, background: portal.dangerBg, color: portal.dangerText, fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8 }}>Move to</div>
        <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 8, maxHeight: 280, overflowY: "auto" }}>
          {/* Bench option */}
          <div
            onClick={() => setSelected(null)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${portal.borderSubtle}`, cursor: "pointer", background: selected === null ? portal.brandSubtlest : portal.canvas }}
          >
            <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${selected === null ? portal.brand : portal.textSubtlest}`, background: selected === null ? portal.brand : "transparent", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: selected === null ? portal.brandText : portal.ink }}>Ward bench</div>
              <div style={{ fontSize: 11, color: portal.textSubtle }}>Remove from station, keep in ward</div>
            </div>
          </div>
          {otherStations.map((s) => {
            const sel = selected === s.id;
            return (
              <div
                key={s.id}
                onClick={() => setSelected(s.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${portal.borderSubtle}`, cursor: "pointer", background: sel ? portal.brandSubtlest : portal.canvas }}
              >
                <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${sel ? portal.brand : portal.textSubtlest}`, background: sel ? portal.brand : "transparent", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: sel ? portal.brandText : portal.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: portal.textSubtle }}>{s.code ?? "—"}{s.agent ? ` · ${s.agent.name} already here` : " · Uncovered"}</div>
                </div>
                {s.agent && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: portal.warnBg, color: portal.warnText, fontWeight: 600, flexShrink: 0 }}>Occupied</span>}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 18 }}>Moving to an occupied station places both agents there.</div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ height: 34, padding: "0 14px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, color: portal.ink, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            style={{ height: 34, padding: "0 18px", border: "none", borderRadius: 8, background: saving ? portal.neutralHover : portal.brand, color: portal.inverse, fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}
          >
            {saving ? "Saving…" : "Confirm reassignment"}
          </button>
        </div>
      </div>
    </>
  );
}

// ---- BenchStationSelect -----------------------------------------------------

function BenchStationSelect({
  stations,
  value,
  onChange,
}: {
  stations: AssignedStation[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const gaps     = stations.filter((s) => s.state !== "assigned");
  const occupied = stations.filter((s) => s.state === "assigned");

  const filterFn = (s: AssignedStation) =>
    !search.trim() || s.name.toLowerCase().includes(search.toLowerCase());

  const filteredGaps     = gaps.filter(filterFn);
  const filteredOccupied = occupied.filter(filterFn);

  const selected = stations.find((s) => s.id === value) ?? null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleOpen() {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUp(spaceBelow < 280);
    }
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  const stationLabel = (s: AssignedStation) =>
    [s.centre_code ?? s.code, s.name, s.stream_number != null ? `stream ${s.stream_number}` : null]
      .filter(Boolean).join(" · ");

  const label = selected ? stationLabel(selected) : "Choose a station…";

  return (
    <div ref={containerRef} style={{ position: "relative", width: 520 }}>
      <div
        onClick={open ? () => { setOpen(false); setSearch(""); } : handleOpen}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 32, padding: "0 8px 0 10px", border: `1px solid ${open ? portal.brand : portal.border}`, borderRadius: open ? (openUp ? "0 0 8px 8px" : "8px 8px 0 0") : 8, background: portal.canvas, cursor: "pointer", boxSizing: "border-box", boxShadow: open ? `0 0 0 1px ${portal.brand}` : "none" }}
      >
        <span style={{ fontSize: 13, color: selected ? portal.ink : portal.textSubtlest, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {label}
        </span>
        {selected?.state === "assigned" && (
          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: portal.warnBg, color: portal.warnText, fontWeight: 700, textTransform: "uppercase", marginRight: 4, flexShrink: 0 }}>Occupied</span>
        )}
        <span style={{ color: portal.textSubtlest, fontSize: 11, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>▾</span>
      </div>

      {open && (
        <div style={{ position: "absolute", ...(openUp ? { bottom: "100%", borderBottom: "none", borderRadius: "8px 8px 0 0" } : { top: "100%", borderTop: "none", borderRadius: "0 0 8px 8px" }), left: 0, right: 0, background: portal.canvas, border: `1px solid ${portal.brand}`, boxShadow: portal.cardShadow, zIndex: 50 }}>
          <div style={{ padding: "5px 6px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
            <input ref={inputRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stations…" style={{ width: "100%", height: 26, boxSizing: "border-box", border: `1px solid ${portal.border}`, borderRadius: 6, padding: "0 8px", fontSize: 12, color: portal.ink, background: portal.canvasSubtle, fontFamily: "inherit", outline: "none" }} />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filteredGaps.length > 0 && (
              <>
                <div style={{ padding: "5px 10px 3px", fontSize: 10, fontWeight: 700, color: portal.textSubtle, textTransform: "uppercase", letterSpacing: "0.04em" }}>Uncovered</div>
                {filteredGaps.map((s) => (
                  <div key={s.id} onClick={() => handleSelect(s.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer", background: s.id === value ? portal.brandSubtlest : portal.canvas, fontSize: 13 }}
                    onMouseEnter={(e) => { if (s.id !== value) (e.currentTarget as HTMLDivElement).style.background = portal.canvasSubtle; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = s.id === value ? portal.brandSubtlest : portal.canvas; }}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: s.id === value ? portal.brandText : portal.ink, fontWeight: s.id === value ? 600 : 400 }}>{stationLabel(s)}</span>
                    <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: portal.successBg, color: portal.successText, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>Free</span>
                  </div>
                ))}
              </>
            )}
            {filteredOccupied.length > 0 && (
              <>
                <div style={{ padding: "5px 10px 3px", fontSize: 10, fontWeight: 700, color: portal.textSubtle, textTransform: "uppercase", letterSpacing: "0.04em", borderTop: filteredGaps.length > 0 ? `1px solid ${portal.borderSubtle}` : "none", marginTop: filteredGaps.length > 0 ? 4 : 0 }}>Occupied — will replace</div>
                {filteredOccupied.map((s) => (
                  <div key={s.id} onClick={() => handleSelect(s.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer", background: s.id === value ? "#FFF7D6" : portal.canvas, fontSize: 13 }}
                    onMouseEnter={(e) => { if (s.id !== value) (e.currentTarget as HTMLDivElement).style.background = portal.canvasSubtle; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = s.id === value ? "#FFF7D6" : portal.canvas; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: s.id === value ? portal.warnText : portal.ink, fontWeight: s.id === value ? 600 : 400 }}>{stationLabel(s)}</div>
                      {s.agent && <div style={{ fontSize: 11, color: portal.textSubtle, marginTop: 1 }}>{s.agent.name}</div>}
                    </div>
                    <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: portal.warnBg, color: portal.warnText, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>Occupied</span>
                  </div>
                ))}
              </>
            )}
            {filteredGaps.length === 0 && filteredOccupied.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 13, color: portal.textSubtle }}>No stations match.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Bench panel ------------------------------------------------------------

function BenchPanel({
  wardName,
  bench,
  allStations,
  canAssign,
  onDeploy,
}: {
  wardName: string;
  bench: BenchAgent[];
  allStations: AssignedStation[];
  canAssign: boolean;
  onDeploy: (agentId: string, stationId: string, occupantId?: string) => Promise<void>;
}) {
  const [picks, setPicks]         = useState<Record<string, string>>({});
  const [deploying, setDeploying] = useState<string | null>(null);

  const gapCount = allStations.filter((s) => s.state === "gap").length;
  const total    = Math.ceil((gapCount + bench.length) * 0.1) || 1;
  const benchTone = bench.length >= total ? "green" : bench.length > 0 ? "amber" : "red";

  async function handleDeploy(agent: BenchAgent) {
    const stationId = picks[agent.id];
    if (!stationId || deploying) return;
    const station = allStations.find((s) => s.id === stationId);
    const occupantId = station?.agent?.id;
    setDeploying(agent.id);
    try {
      await onDeploy(agent.id, stationId, occupantId);
      setPicks((p) => { const n = { ...p }; delete n[agent.id]; return n; });
    } finally {
      setDeploying(null);
    }
  }

  return (
    <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, boxShadow: portal.cardShadow }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "14px 20px", borderBottom: `1px solid ${portal.border}`, flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{wardName} bench</div>
          <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>
            Vetted reserve agents. Deploy one to cover a gap or replace a no-show on election day.
          </div>
        </div>
        <span style={tag(benchTone)}>
          {bench.length} of {total} reserve
        </span>
      </div>

      {bench.length === 0 ? (
        <div style={{ padding: 20, fontSize: 13, color: portal.textSubtle }}>
          Nobody on the bench. Approve a reserve from the{" "}
          <Link to="pending" relative="path" style={{ fontWeight: 500, color: portal.brandText }}>
            review queue
          </Link>{" "}
          to add one.
        </div>
      ) : (
        bench.map((b) => {
          const picked = picks[b.id] || "";
          const canDeploy = canAssign && allStations.length > 0;
          const readyToDeploy = canDeploy && !!picked;
          const pickedStation = allStations.find((s) => s.id === picked) ?? null;

          return (
            <div
              key={b.id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 20px", borderBottom: `1px solid ${portal.borderSubtle}`,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: portal.brandSubtlest, color: portal.brandText,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 600, flexShrink: 0,
                }}
              >
                {b.initials}
              </span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{b.name}</div>
                <div style={{ fontSize: 12, color: portal.textSubtle }}>
                  {b.phone_masked}
                  {b.approved_at ? ` · Vetted ${new Date(b.approved_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}` : ""}
                </div>
              </div>
              {canDeploy && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <BenchStationSelect
                      stations={allStations}
                      value={picked}
                      onChange={(v) => setPicks((p) => ({ ...p, [b.id]: v }))}
                    />
                    <button
                      onClick={() => handleDeploy(b)}
                      disabled={!readyToDeploy || deploying === b.id}
                      style={{
                        display: "flex", alignItems: "center", height: 32,
                        padding: "0 12px", borderRadius: 8,
                        fontSize: 13, fontWeight: 500, border: "none",
                        cursor: readyToDeploy ? "pointer" : "not-allowed",
                        background: readyToDeploy
                          ? (pickedStation?.state === "assigned" ? "#C9372C" : portal.brand)
                          : portal.neutral,
                        color: readyToDeploy ? portal.inverse : portal.textSubtlest,
                        fontFamily: "inherit", flexShrink: 0,
                      }}
                    >
                      {deploying === b.id ? "Deploying…" : pickedStation?.state === "assigned" ? "Replace" : "Deploy"}
                    </button>
                  </div>
                  {pickedStation?.state === "assigned" && pickedStation.agent && (
                    <div style={{ fontSize: 11, color: portal.warnText }}>
                      Replaces {pickedStation.agent.name} — they move to bench
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      <div style={{ padding: "12px 20px", fontSize: 12, color: portal.textSubtle }}>
        Target: 10% of the ward's stations in reserve · {total} for {wardName}
      </div>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------

export function AssignedAgents() {
  const { id } = useParams<{ id: string }>();
  const { workspace } = useWorkspaceContext();

  const [wards,          setWards]          = useState<AssignedWardSummary[]>([]);
  const [canAssign,      setCanAssign]      = useState(false);
  const [pendingCount,   setPendingCount]   = useState(0);
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);
  const [stations,       setStations]       = useState<AssignedStation[]>([]);
  const [bench,          setBench]          = useState<BenchAgent[]>([]);
  const [wardLoading,    setWardLoading]    = useState(false);
  const [toast,          setToast]          = useState("");

  // Load ward list
  useEffect(() => {
    if (!id) return;
    api.getAssignedWards(id)
      .then(({ wards: ws, can_assign, pending_count }) => {
        setWards(ws);
        setCanAssign(can_assign);
        setPendingCount(pending_count);
        if (ws.length > 0) setSelectedWardId(ws[0].id);
      })
      .catch(() => {});
  }, [id]);

  // Load selected ward detail
  useEffect(() => {
    if (!id || !selectedWardId) return;
    setWardLoading(true);
    api
      .getAssignedWard(id, selectedWardId)
      .then(({ stations: ss, bench: bb }) => {
        setStations(ss);
        setBench(bb);
      })
      .finally(() => setWardLoading(false));
  }, [id, selectedWardId]);

  async function handleDeploy(agentId: string, stationId: string, occupantId?: string) {
    if (!id) return;
    const agent = bench.find((b) => b.id === agentId)!;
    // If station is occupied, move occupant to bench first
    if (occupantId) await api.reassignAgent(id, occupantId, null);
    await api.deployBenchAgent(id, agentId, stationId);

    setStations((prev) =>
      prev.map((s) => {
        if (s.id === stationId) return { ...s, state: "assigned" as const, agent: { id: agentId, name: agent.name, phone_masked: agent.phone_masked } };
        return s;
      }),
    );
    if (occupantId) {
      setBench((prev) => {
        const displaced = stations.find((s) => s.id === stationId)?.agent;
        if (!displaced) return prev.filter((b) => b.id !== agentId);
        return prev.filter((b) => b.id !== agentId);
      });
    } else {
      setBench((prev) => prev.filter((b) => b.id !== agentId));
    }
    setWards((prev) =>
      prev.map((w) =>
        w.id === selectedWardId
          ? { ...w, assigned_count: w.assigned_count + (occupantId ? 0 : 1), bench_count: Math.max(0, w.bench_count - 1) }
          : w,
      ),
    );
    setToast(`${agent.name} deployed${occupantId ? " (previous agent moved to bench)" : ""}.`);
    setTimeout(() => setToast(""), 4000);
  }

  function handleReassigned(_agentId: string, newStationId: string | null, oldStationId: string | null) {
    setStations((prev) => prev.map((s) => {
      if (s.id === oldStationId) return { ...s, state: "gap" as const, agent: null };
      if (newStationId && s.id === newStationId) {
        const agent = prev.find((ps) => ps.id === oldStationId)?.agent ?? null;
        return { ...s, state: "assigned" as const, agent };
      }
      return s;
    }));
    setWards((prev) => prev.map((w) => {
      if (w.id === selectedWardId) {
        const delta = newStationId ? 0 : -1;
        return { ...w, assigned_count: Math.max(0, w.assigned_count + delta), bench_count: w.bench_count + (newStationId ? 0 : 1) };
      }
      return w;
    }));
    setToast(newStationId ? "Agent reassigned." : "Agent moved to bench.");
    setTimeout(() => setToast(""), 4000);
  }

  const selectedWard = wards.find((w) => w.id === selectedWardId);

  return (
    <>
      <div style={{ flex: 1, minWidth: 0, padding: "24px 24px 48px" }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          <Link to={`/workspaces/${workspace.id}`} style={{ color: portal.textSubtle, textDecoration: "none" }}>
            {selectedWard?.name ?? "Agents"}
          </Link>
          {" / Agents"}
        </div>

        {/* Title row */}
        <div
          style={{
            display: "flex", alignItems: "flex-end", justifyContent: "space-between",
            gap: 16, marginBottom: 20, flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>
              Assigned agents
            </div>
            <div style={{ fontSize: 14, color: portal.textSubtle }}>
              Who is placed at each polling station, and who's on the bench in each ward.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Link
              to={`/workspaces/${workspace.id}/agents/pending`}
              style={{
                display: "flex", alignItems: "center", height: 32, padding: "0 12px",
                borderRadius: 8, background: portal.brand, color: portal.inverse,
                fontSize: 14, fontWeight: 500, textDecoration: "none",
              }}
            >
              Review queue{pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Two-panel row */}
          <div style={{ display: "flex", gap: 16, alignItems: "stretch", height: 540 }}>
            <WardList
              wards={wards}
              selectedId={selectedWardId}
              onSelect={(wardId) => {
                setSelectedWardId(wardId);
                setStations([]);
                setBench([]);
              }}
            />
            <StationsPanel
              key={selectedWardId ?? "none"}
              ward={selectedWard}
              stations={stations}
              loading={wardLoading}
              canAssign={canAssign}
              workspaceId={id!}
              onReassigned={handleReassigned}
            />
          </div>

          {/* Bench + extras */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {selectedWard && (
              <BenchPanel
                wardName={selectedWard.name}
                bench={bench}
                allStations={stations}
                canAssign={canAssign}
                onDeploy={handleDeploy}
              />
            )}

            {!canAssign && (
              <div
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "12px 16px", borderRadius: 8,
                  background: portal.brandSubtlest, color: portal.brandText,
                  fontSize: 13, lineHeight: "19px",
                }}
              >
                <span
                  style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: portal.brand, marginTop: 6, flexShrink: 0,
                  }}
                />
                <span>
                  You can view all assignments here. Your campaign manager deploys bench agents and approves station changes.
                </span>
              </div>
            )}

            {toast && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 16px", borderRadius: 8,
                  background: "#E3FCEF", color: "#164B35", fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 700 }}>✓</span>
                <span>{toast}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
