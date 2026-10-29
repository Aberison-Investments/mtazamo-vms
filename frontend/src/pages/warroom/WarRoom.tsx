import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotifications } from "../../notifications";
import {
  api,
  type GeoFeatureCollection,
  type WarRoomStation,
  type WarRoomLeaderboardEntry,
  type WarRoomSummary,
  type WarRoomCountyRegion,
  type TierFormContext,
  type TierFormCandidateEntry,
} from "../../api";
import { portal } from "../../portalTheme";
import { makeProjector, type ProjFeature } from "../../projector";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";

// ---- colour scale -----------------------------------------------------------

const TEAL_SEQ = ["#E3F0F3", "#B0D5DF", "#7FB6C6", "#4E8FA3", "#2F6B7E"] as const;
const NO_DATA_CLR = "#EBECF0";
const TEAL_SELECTED = "#172B4D";

function shareToTeal(share: number): string {
  // share: 0→1 (candidate votes / total valid in region). Scale caps at 70%.
  const idx = Math.min(4, Math.floor((share / 0.7) * 5));
  return TEAL_SEQ[Math.max(0, idx)];
}

function reportToTeal(pct: number): string {
  const idx = Math.min(4, Math.floor(pct * 5));
  return TEAL_SEQ[Math.max(0, idx)];
}

// ---- helpers -----------------------------------------------------------------

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-KE");
}

function statusChip(status: WarRoomStation["status"]): { label: string; bg: string; fg: string } {
  const map = {
    pending:   { label: "Pending",    bg: "#F1F2F4", fg: "#44546F" },
    submitted: { label: "Unverified", bg: "#F8E6A0", fg: "#7F5F01" },
    queried:   { label: "Queried",    bg: "#FFD5CC", fg: "#AE2A19" },
    verified:  { label: "Verified",   bg: "#E3FCEF", fg: "#164B35" },
  };
  return map[status] ?? map.pending;
}

// ---- region aggregation ------------------------------------------------------

interface HeatRegion {
  id: string;
  name: string;
  votes: number[];          // per-candidate totals
  totalValid: number;
  totalStations: number;
  reportingStations: number;
}

function aggregateRegions(
  stations: WarRoomStation[],
  idFn: (s: WarRoomStation) => string,
  nameFn: (s: WarRoomStation) => string,
  candidateIds: string[],
): Record<string, HeatRegion> {
  const acc: Record<string, HeatRegion> = {};
  for (const s of stations) {
    const id = idFn(s);
    if (!id) continue;
    if (!acc[id]) acc[id] = { id, name: nameFn(s), votes: new Array(candidateIds.length).fill(0), totalValid: 0, totalStations: 0, reportingStations: 0 };
    const r = acc[id];
    r.totalStations++;
    if (s.status !== "pending") {
      r.reportingStations++;
      let tot = 0;
      for (const v of s.votes) {
        const ci = candidateIds.indexOf(v.candidate_id);
        if (ci >= 0) r.votes[ci] += v.votes;
        tot += v.votes;
      }
      r.totalValid += tot;
    }
  }
  return acc;
}

// ---- SVG heat map ------------------------------------------------------------

function HeatGeoMap({
  geoJson, regionColor, selectedId, hoveredId,
  onSelect, onHover, onHoverEnd,
}: {
  geoJson: GeoFeatureCollection;
  regionColor: (id: string) => string;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string, name: string) => void;
  onHover: (id: string, name: string) => void;
  onHoverEnd: () => void;
}) {
  const W = 560, H = 480;

  const paths = useMemo(() => {
    if (!geoJson.features.length) return [];
    const features = geoJson.features as unknown as ProjFeature[];
    const proj = makeProjector(features, W, H);
    return features.map((f) => {
      const [cx, cy] = proj.centroidFor(f);
      return { id: f.properties.id, name: f.properties.name, d: proj.pathFor(f), cx, cy };
    });
  }, [geoJson]);

  if (!paths.length) return (
    <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: portal.textSubtle, fontSize: 13 }}>
      No boundary data available for this level.
    </div>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* Pass 1: fills */}
      {paths.map((p) => {
        const isSel = p.id === selectedId;
        const isHov = p.id === hoveredId;
        const fill = isSel ? TEAL_SELECTED : regionColor(p.id);
        return (
          <path key={p.id} d={p.d}
            fill={fill} fillOpacity={isHov && !isSel ? 0.75 : 0.85}
            stroke="none"
            onClick={() => onSelect(p.id, p.name)}
            onMouseEnter={() => onHover(p.id, p.name)}
            onMouseLeave={onHoverEnd}
            style={{ cursor: "pointer", transition: "fill-opacity 120ms" }}
          >
            <title>{p.name}</title>
          </path>
        );
      })}
      {/* Pass 2: borders */}
      {paths.map((p) => (
        <path key={`s-${p.id}`} d={p.d} fill="none"
          stroke="#FFFFFF" strokeWidth={p.id === selectedId ? 3 : 1.2}
          pointerEvents="none" />
      ))}
      {/* Pass 3: labels */}
      {paths.map((p) => {
        const isSel = p.id === selectedId;
        return (
          <text key={`t-${p.id}`} x={p.cx} y={p.cy}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={10} fontWeight={600}
            fill={isSel ? "#FFFFFF" : "#172B4D"}
            pointerEvents="none" fontFamily={portal.font}
          >
            {p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name}
          </text>
        );
      })}
    </svg>
  );
}

// ---- region info panel -------------------------------------------------------

function RegionInfoPanel({
  region, candidates, leaderboard, candIdx, totalScopeValid, canDrill, drillLabel, onDrill,
}: {
  region: HeatRegion | null;
  candidates: WarRoomLeaderboardEntry[];
  leaderboard: WarRoomLeaderboardEntry[];
  candIdx: number | "total";
  totalScopeValid: number;
  canDrill: boolean;
  drillLabel: string;
  onDrill: () => void;
}) {
  const source = region ?? null;
  const totV = source ? (source.totalValid || 1) : (totalScopeValid || 1);

  const candVotes = source
    ? source.votes.map((v, i) => ({ candidate_id: candidates[i]?.candidate_id ?? "", name: candidates[i]?.name ?? "", votes: v }))
    : leaderboard.map((c) => ({ candidate_id: c.candidate_id, name: c.name, votes: c.votes }));

  const displayVal = source
    ? (candIdx === "total"
        ? `${source.reportingStations} / ${source.totalStations} reporting`
        : fmt(source.votes[candIdx as number] ?? 0) + " votes")
    : (candIdx === "total"
        ? fmt(leaderboard.reduce((s, c) => s + c.votes, 0)) + " votes total"
        : fmt(leaderboard[candIdx as number]?.votes ?? 0) + " votes");

  const fill = source
    ? (candIdx === "total"
        ? reportToTeal(source.reportingStations / source.totalStations)
        : shareToTeal((source.votes[candIdx as number] ?? 0) / totV))
    : portal.brand;

  return (
    <div style={{ padding: "14px", borderRadius: 8, background: portal.canvasSubtle, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: portal.textSubtle }}>
        {source ? "Selected area" : "Whole scope"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 12, height: 12, flexShrink: 0, borderRadius: 3, background: fill, boxShadow: "inset 0 0 0 1px rgba(9,30,66,0.12)" }} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: "20px" }}>{source?.name ?? "All areas"}</h2>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "28px", fontVariantNumeric: "tabular-nums" }}>{displayVal}</div>

      <div style={{ display: "flex", flexDirection: "column", fontSize: 13 }}>
        {candVotes.map((c, i) => (
          <div key={c.candidate_id} style={{ display: "flex", justifyContent: "space-between", gap: 8, minHeight: 28, alignItems: "center", borderTop: `1px solid ${portal.border}`, fontWeight: (candIdx === i) ? 700 : 400 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{fmt(c.votes)}</span>
          </div>
        ))}
        {source && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", minHeight: 28, alignItems: "center", borderTop: `1px solid ${portal.border}` }}>
              <span>Total valid votes</span>
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(source.totalValid)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", minHeight: 28, alignItems: "center", borderTop: `1px solid ${portal.border}` }}>
              <span>Stations reporting</span>
              <strong>{source.reportingStations} / {source.totalStations}</strong>
            </div>
          </>
        )}
      </div>

      {canDrill && (
        <button onClick={onDrill} style={{ alignSelf: "flex-start", height: 34, padding: "0 12px", border: 0, borderRadius: 6, background: portal.brand, color: "#FFFFFF", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Open {drillLabel} map
        </button>
      )}
    </div>
  );
}

// ---- candidate selector ------------------------------------------------------

function CandidateSelector({ candidates, selected, onChange }: {
  candidates: WarRoomLeaderboardEntry[];
  selected: number | "total";
  onChange: (v: number | "total") => void;
}) {
  const opts: Array<{ key: number | "total"; label: string }> = [
    ...candidates.map((c, i) => ({ key: i as number | "total", label: c.name.split(" ")[0] })),
    { key: "total" as const, label: "All votes" },
  ];
  return (
    <div role="radiogroup" aria-label="Colour map by"
      style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 8, background: portal.neutral }}>
      {opts.map((o) => {
        const on = o.key === selected;
        return (
          <button key={String(o.key)} type="button" role="radio" aria-checked={on}
            onClick={() => onChange(o.key)}
            style={{ height: 30, padding: "0 12px", border: 0, borderRadius: 6,
              background: on ? portal.canvas : "transparent",
              boxShadow: on ? "0 1px 1px rgba(9,30,66,0.25)" : "none",
              fontSize: 12, fontWeight: 600, color: on ? portal.ink : portal.label,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- geo tree (left panel) ---------------------------------------------------

function GeoTree({ regions, activeId, candIdx, onSelect, showHeader = false }: {
  regions: HeatRegion[];
  activeId: string | null;
  candIdx: number | "total";
  onSelect: (id: string, name: string) => void;
  showHeader?: boolean;
}) {
  const sorted = [...regions].sort((a, b) => {
    if (candIdx === "total") return b.reportingStations - a.reportingStations;
    return (b.votes[candIdx as number] ?? 0) - (a.votes[candIdx as number] ?? 0);
  });

  const colLabel = candIdx === "total" ? "Reporting" : "Vote share";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {showHeader && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 8px 6px", borderBottom: `1px solid ${portal.borderSubtle}`, marginBottom: 2 }}>
          <span style={{ flex: 1, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: portal.textSubtle }}>Area</span>
          <span style={{ width: 70, textAlign: "right", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: portal.textSubtle }}>{colLabel}</span>
        </div>
      )}
      {sorted.map((r) => {
        const active = r.id === activeId;
        const val = candIdx === "total" ? r.reportingStations : (r.votes[candIdx as number] ?? 0);
        const pct = candIdx === "total"
          ? (r.totalStations > 0 ? r.reportingStations / r.totalStations : 0)
          : (r.totalValid > 0 ? val / r.totalValid : 0);
        const barColor = active ? "#386271" : (r.reportingStations === 0 ? portal.neutral : portal.brand);
        const pctLabel = candIdx === "total"
          ? `${r.reportingStations}/${r.totalStations} stn`
          : `${Math.round(pct * 100)}% share`;
        return (
          <button key={r.id} type="button"
            onClick={() => onSelect(r.id, r.name)}
            title={candIdx === "total"
              ? `${r.name}: ${r.reportingStations} of ${r.totalStations} stations reporting`
              : `${r.name}: ${Math.round(pct * 100)}% vote share (${fmt(val)} votes)`}
            style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", minHeight: 32, padding: "4px 8px",
              border: 0, borderRadius: 6, background: active ? portal.brandSubtlest : "transparent",
              color: active ? portal.brandText : portal.ink, fontWeight: active ? 600 : 400,
              fontSize: 13, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
            <span style={{ width: 28, height: 4, borderRadius: 2, background: portal.neutralHover, flexShrink: 0, overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${Math.round(pct * 100)}%`, background: barColor }} />
            </span>
            <span style={{ width: 58, flexShrink: 0, textAlign: "right", fontSize: 10, color: portal.textSubtle, fontVariantNumeric: "tabular-nums", lineHeight: "13px" }}>
              {r.reportingStations === 0 ? "—" : pctLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---- leaderboard table -------------------------------------------------------

function Leaderboard({ entries, scopeRep, scopeTotal }: {
  entries: WarRoomLeaderboardEntry[];
  scopeRep: number;
  scopeTotal: number;
}) {
  const totalValid = entries.reduce((s, e) => s + e.votes, 0);
  return (
    <section style={{ background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Candidate leaderboard</h2>
        <span style={{ fontSize: 12, color: portal.textSubtle }}>{scopeRep} / {scopeTotal} stations reporting · includes unverified</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 640 }}>
          <thead>
            <tr style={{ background: portal.canvasSubtle }}>
              {["#", "Candidate", "Party", "Votes", "%", "Share"].map((h, i) => (
                <th key={h} style={{ padding: "8px 16px", textAlign: i === 0 || i >= 3 ? "right" : "left", fontWeight: 600, fontSize: 12, color: portal.label }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const pct = totalValid > 0 ? (e.votes / totalValid * 100) : 0;
              return (
                <tr key={e.candidate_id} style={{ borderTop: `1px solid ${portal.borderSubtle}`, background: e.is_ours ? portal.brandSubtlest : portal.canvas }}>
                  <td style={{ padding: "10px 16px", textAlign: "right", color: portal.textSubtle }}>{i + 1}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{e.name}</span>
                      {e.is_ours && <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "#D7EAEF", color: "#294854" }}>Our candidate</span>}
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", color: portal.label }}>{e.party}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(e.votes)}</td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(1)}%</td>
                  <td style={{ padding: "10px 16px", minWidth: 120 }}>
                    <div style={{ height: 8, borderRadius: 4, background: portal.neutral, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 4, width: `${Math.min(100, pct)}%`, background: e.is_ours ? portal.brand : "#8590A2" }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- station grid table ------------------------------------------------------

function StationGrid({ stations, search, onSearch }: {
  stations: WarRoomStation[];
  search: string;
  onSearch: (v: string) => void;
}) {
  const filtered = search
    ? stations.filter((s) => (s.name + " " + (s.code ?? "") + " " + s.ward_name).toLowerCase().includes(search.toLowerCase()))
    : stations;

  const counts = {
    verified:  stations.filter((s) => s.status === "verified").length,
    submitted: stations.filter((s) => s.status === "submitted").length,
    queried:   stations.filter((s) => s.status === "queried").length,
    pending:   stations.filter((s) => s.status === "pending").length,
  };

  return (
    <section style={{ background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>Polling stations</h2>
        <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search station, ward…"
          style={{ height: 34, padding: "0 12px", border: `1px solid ${portal.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: portal.ink, width: 220, background: portal.canvas }} />
        <div style={{ display: "flex", gap: 6, fontSize: 11, fontWeight: 700, flexWrap: "wrap" }}>
          <span style={{ padding: "2px 7px", borderRadius: 3, background: "#E3FCEF", color: "#164B35" }}>{counts.verified} Verified</span>
          <span style={{ padding: "2px 7px", borderRadius: 3, background: "#F8E6A0", color: "#7F5F01" }}>{counts.submitted} Unverified</span>
          <span style={{ padding: "2px 7px", borderRadius: 3, background: "#FFD5CC", color: "#AE2A19" }}>{counts.queried} Queried</span>
          <span style={{ padding: "2px 7px", borderRadius: 3, background: portal.neutral, color: portal.label }}>{counts.pending} Pending</span>
        </div>
      </div>
      <div style={{ overflowX: "auto", maxHeight: 480 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ background: portal.canvasSubtle }}>
              <Th left>Ward</Th>
              <Th left>Station</Th>
              <Th>Reg. voters</Th>
              <Th>Total valid</Th>
              <Th>Rejected</Th>
              <Th left>Status</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((s) => {
              const chip = statusChip(s.status);
              const isPending = s.status === "pending";
              return (
                <tr key={s.id} style={{ borderTop: `1px solid ${portal.borderSubtle}`, background: portal.canvas }}>
                  <td style={{ padding: "8px 16px", color: portal.textSubtle, fontSize: 12, whiteSpace: "nowrap" }}>{s.ward_name}</td>
                  <td style={{ padding: "8px 16px" }}>
                    <div style={{ fontWeight: 500 }}>{s.name}</div>
                    {s.code && <div style={{ fontSize: 11, fontFamily: "monospace", color: portal.textSubtle }}>{s.code}</div>}
                  </td>
                  <td style={{ padding: "8px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(s.registered_voters)}</td>
                  <td style={{ padding: "8px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{isPending ? "—" : fmt(s.total_votes)}</td>
                  <td style={{ padding: "8px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{isPending ? "—" : fmt(s.rejected_ballots)}</td>
                  <td style={{ padding: "8px 16px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: chip.bg, color: chip.fg }}>{chip.label}</span>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: portal.textSubtle }}>No stations match your search.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 200 && (
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${portal.border}`, fontSize: 12, color: portal.textSubtle }}>
          Showing first 200 of {fmt(filtered.length)} stations
        </div>
      )}
    </section>
  );
}

function Th({ children, left }: { children?: React.ReactNode; left?: boolean }) {
  return <th style={{ padding: "10px 16px", textAlign: left ? "left" : "right", fontWeight: 600, fontSize: 12, color: portal.label, whiteSpace: "nowrap" }}>{children}</th>;
}

// ---- county summary grid (national level) ------------------------------------

function CountySummaryGrid({ countyRegions, candidates }: {
  countyRegions: WarRoomCountyRegion[];
  candidates: WarRoomLeaderboardEntry[];
}) {
  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? countyRegions.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : countyRegions;

  const reporting = countyRegions.filter((r) => r.reporting_stations > 0).length;

  return (
    <section style={{ background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, flex: 1 }}>Counties</h2>
        <span style={{ fontSize: 12, color: portal.textSubtle }}>{reporting} of {countyRegions.length} counties reporting</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search county…"
          style={{ height: 34, padding: "0 12px", border: `1px solid ${portal.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: portal.ink, width: 200, background: portal.canvas }} />
      </div>
      <div style={{ overflowX: "auto", maxHeight: 480 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 500 + candidates.length * 80 }}>
          <thead>
            <tr style={{ background: portal.canvasSubtle }}>
              <Th left>County</Th>
              <Th>Reporting stations</Th>
              {candidates.map((c) => <Th key={c.candidate_id}>{c.name.split(" ")[0]}</Th>)}
              <Th>Total valid</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const hasData = r.reporting_stations > 0;
              return (
                <tr key={r.id} style={{ borderTop: `1px solid ${portal.borderSubtle}`, background: portal.canvas }}>
                  <td style={{ padding: "8px 16px", fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: "8px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.reporting_stations} / {r.total_stations}
                  </td>
                  {candidates.map((c) => {
                    const v = r.votes.find((vv) => vv.candidate_id === c.candidate_id);
                    return (
                      <td key={c.candidate_id} style={{ padding: "8px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {hasData ? fmt(v?.votes ?? 0) : "—"}
                      </td>
                    );
                  })}
                  <td style={{ padding: "8px 16px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {hasData ? fmt(r.total_valid) : "—"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={3 + candidates.length} style={{ padding: 24, textAlign: "center", color: portal.textSubtle }}>No counties match your search.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---- main heat-map war room --------------------------------------------------

type GeoLevel = "national" | "county" | "constituency";

function WarRoomHeatMap({
  workspaceId, runId,
  initialLevel = "national",
  initialCounty = null,
  initialConstituency = null,
  lockToLevel = false,
  lockedToCounty = false,
  formEntry = null,
}: {
  workspaceId: string;
  runId: string;
  initialLevel?: GeoLevel;
  initialCounty?: { id: string; name: string } | null;
  initialConstituency?: { id: string; name: string } | null;
  lockToLevel?: boolean;
  lockedToCounty?: boolean;
  formEntry?: { tier: "constituency" | "county" | "national"; geoId: string | null; geoName: string; formNumber: string } | null;
}) {
  const [level, setLevel]               = useState<GeoLevel>(initialLevel);
  const [county, setCounty]             = useState<{ id: string; name: string } | null>(initialCounty);
  const [constituency, setConstituency] = useState<{ id: string; name: string } | null>(initialConstituency);

  const [geoJson, setGeoJson]   = useState<GeoFeatureCollection | null>(null);
  const [summary, setSummary]   = useState<WarRoomSummary | null>(null);
  const [geoLoading, setGeoLoading]   = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  const [hoveredId, setHoveredId]       = useState<string | null>(null);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [candIdx, setCandIdx]           = useState<number | "total">(0);
  const [stationSearch, setStationSearch] = useState("");
  const [formDrawerOpen, setFormDrawerOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- load GeoJSON for current level ---------------------------------------
  useEffect(() => {
    setGeoJson(null);
    setGeoLoading(true);
    let p: Promise<GeoFeatureCollection>;
    if (level === "national") p = api.allCountiesGeojson();
    else if (level === "county" && county) p = api.countyGeojson(county.id);
    else if (level === "constituency" && constituency) p = api.constituencyGeojson(constituency.id);
    else return;
    p.then(setGeoJson).catch(() => {}).finally(() => setGeoLoading(false));
  }, [level, county?.id, constituency?.id]);

  // ---- load war room summary for current scope ------------------------------
  const loadSummary = useCallback(() => {
    const scope = level;
    const scopeId = level === "county" ? county?.id : level === "constituency" ? constituency?.id : undefined;
    setDataLoading(true);
    api.getWarRoomSummary(workspaceId, { run_id: runId, scope, scope_id: scopeId })
      .then(setSummary).catch(() => {}).finally(() => setDataLoading(false));
  }, [workspaceId, runId, level, county?.id, constituency?.id]);

  useEffect(() => {
    loadSummary();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(loadSummary, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadSummary]);

  // ---- derive candidate list from leaderboard ------------------------------
  const candidates = summary?.leaderboard ?? [];
  const candidateIds = candidates.map((c) => c.candidate_id);

  // ---- aggregate votes by child regions ------------------------------------
  const regions: Record<string, HeatRegion> = useMemo(() => {
    if (!summary) return {};
    if (level === "national") {
      // National scope: backend returns pre-aggregated county_regions to avoid
      // returning 46k+ station rows in one response.
      const countyRegions = summary.county_regions ?? [];
      const acc: Record<string, HeatRegion> = {};
      for (const r of countyRegions) {
        acc[r.id] = {
          id:                 r.id,
          name:               r.name,
          votes:              candidateIds.map((cid) => r.votes.find((v) => v.candidate_id === cid)?.votes ?? 0),
          totalValid:         r.total_valid,
          totalStations:      r.total_stations,
          reportingStations:  r.reporting_stations,
        };
      }
      return acc;
    }
    const stations = summary.stations;
    if (level === "county")
      return aggregateRegions(stations, (s) => s.constituency_id, (s) => s.constituency_name, candidateIds);
    // constituency
    return aggregateRegions(stations, (s) => s.ward_id, (s) => s.ward_name, candidateIds);
  }, [summary, level, candidateIds.join(",")]);

  const regionList = Object.values(regions);

  // ---- color function for map regions --------------------------------------
  function regionColor(id: string): string {
    const r = regions[id];
    if (!r || r.reportingStations === 0) return NO_DATA_CLR;
    if (candIdx === "total")
      return reportToTeal(r.reportingStations / r.totalStations);
    const share = r.totalValid > 0 ? (r.votes[candIdx as number] ?? 0) / r.totalValid : 0;
    return shareToTeal(share);
  }

  // ---- drill navigation ----------------------------------------------------
  function drillInto(id: string, name: string) {
    if (lockToLevel) return;
    setHoveredId(null);
    setSelectedId(null);
    setStationSearch("");
    if (level === "national") {
      setCounty({ id, name });
      setConstituency(null);
      setLevel("county");
    } else if (level === "county") {
      setConstituency({ id, name });
      setLevel("constituency");
    }
    // constituency level: clicking a ward highlights it but doesn't drill further
  }

  function handleMapClick(id: string, name: string) {
    if (level === "constituency") {
      setSelectedId((prev) => prev === id ? null : id);
    } else {
      drillInto(id, name);
    }
  }

  function handleTreeSelect(id: string, name: string) {
    if (level === "constituency") {
      setSelectedId((prev) => prev === id ? null : id);
    } else {
      drillInto(id, name);
    }
  }

  // ---- breadcrumb ----------------------------------------------------------
  const crumbs: Array<{ label: string; onClick?: () => void }> = [];

  // "National" link — hidden for county agents and constituency agents
  if (!lockToLevel && !lockedToCounty && level !== "national") {
    crumbs.push({ label: "National", onClick: () => { setLevel("national"); setCounty(null); setConstituency(null); setSelectedId(null); } });
  }

  // County link — shown at constituency level for everyone except those locked to constituency
  if (county && level === "constituency" && !lockToLevel) {
    crumbs.push({ label: county.name + " County", onClick: () => { setLevel("county"); setConstituency(null); setSelectedId(null); } });
  }

  // Current scope label (no click — it's where you are)
  if (constituency && level === "constituency") {
    crumbs.push({ label: constituency.name });
  } else if (county && level === "county") {
    crumbs.push({ label: county.name + " County" });
  } else if (level === "national") {
    crumbs.push({ label: "National" });
  }

  // ---- hover/selected info panel source ------------------------------------
  const activeId = hoveredId ?? selectedId;
  const activeRegion = activeId ? (regions[activeId] ?? null) : null;
  const totalScopeValid = summary?.leaderboard.reduce((s, e) => s + e.votes, 0) ?? 0;
  // County agents CAN drill (into constituencies/wards); only lockToLevel blocks drill-down
  const canDrill = activeId != null && level !== "constituency" && !lockToLevel;
  const drillLabel = level === "national" ? "county" : "constituency";

  // ---- filtered stations (for constituency level ward selection) -----------
  const displayedStations = useMemo(() => {
    if (!summary) return [];
    if (level === "constituency" && selectedId) {
      return summary.stations.filter((s) => s.ward_id === selectedId);
    }
    return summary.stations;
  }, [summary, level, selectedId]);

  // ---- coverage ------------------------------------------------------------
  const coverage = summary?.coverage;
  const childNoun = level === "national" ? "Counties" : level === "county" ? "Constituencies" : "Wards";

  // ---- legend entries ------------------------------------------------------
  const legendStops: Array<[string, string]> = [
    [NO_DATA_CLR, "No data"],
    [TEAL_SEQ[0], "< 20%"],
    [TEAL_SEQ[2], "20–50%"],
    [TEAL_SEQ[4], "> 50%"],
  ];
  const metricLabel = candIdx === "total" ? "Stations reporting" : `Votes — ${candidates[candIdx as number]?.name ?? ""}`;

  const loading = geoLoading || dataLoading;
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  return (
    // overflow:hidden on the container so both panels manage their own scroll
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

      {/* ── Left: geo tree (sticky, collapsible) ── */}
      <aside style={{
        flexShrink: 0,
        width: treeCollapsed ? 40 : 240,
        transition: "width 180ms ease-out",
        borderRight: `1px solid ${portal.border}`,
        background: portal.canvas,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}>
        {treeCollapsed ? (
          /* Collapsed rail — just the expand toggle */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 8 }}>
            <button
              onClick={() => setTreeCollapsed(false)}
              title="Show areas"
              style={{ width: 28, height: 28, border: `1px solid ${portal.border}`, borderRadius: 6, background: portal.canvas, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: portal.textSubtle, padding: 0 }}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                <path d="M6 4l4 4-4 4" />
              </svg>
            </button>
            {/* Rotated label */}
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: portal.textSubtle, writingMode: "vertical-rl", transform: "rotate(180deg)", marginTop: 8 }}>
              Areas
            </span>
          </div>
        ) : (
          <>
            {/* Header with collapse button */}
            <div style={{ flexShrink: 0, padding: "12px 12px 8px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: portal.textSubtle }}>
                Results by area
              </span>
              <button
                onClick={() => setTreeCollapsed(true)}
                title="Collapse"
                style={{ width: 24, height: 24, border: `1px solid ${portal.border}`, borderRadius: 6, background: portal.canvas, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: portal.textSubtle, padding: 0, flexShrink: 0 }}
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                  <path d="M10 4l-4 4 4 4" />
                </svg>
              </button>
            </div>
            {/* Scrollable tree list */}
            <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
              {loading && !regionList.length ? (
                <div style={{ padding: "12px 8px", fontSize: 13, color: portal.textSubtle }}>Loading…</div>
              ) : (
                <GeoTree
                  regions={regionList}
                  activeId={activeId}
                  candIdx={candIdx}
                  onSelect={handleTreeSelect}
                  showHeader
                />
              )}
            </div>
          </>
        )}
      </aside>

      {/* ── Right: main content (independently scrollable) ── */}
      {/* main is a plain scroll box — the inner div holds the flex column so items
          size to their natural height and scroll rather than compressing. */}
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto", background: portal.canvasSubtle }}>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Breadcrumb + title */}
        <div>
          {crumbs.length > 0 && (
            <nav style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: portal.textSubtle, marginBottom: 6, flexWrap: "wrap" }}>
              {crumbs.map((c, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {i > 0 && <span style={{ color: portal.neutralHover }}>›</span>}
                  <span onClick={c.onClick} style={{ cursor: c.onClick ? "pointer" : "default", color: c.onClick ? portal.brandText : portal.ink, fontWeight: 600 }}>{c.label}</span>
                </span>
              ))}
            </nav>
          )}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, marginBottom: 3 }}>
                {constituency?.name ?? county?.name ?? "National"}
              </h1>
              <div style={{ fontSize: 13, color: portal.textSubtle }}>
                {level === "constituency" ? `${regionList.length} wards` : level === "county" ? `${regionList.length} constituencies` : `47 counties`}
                {coverage && ` · ${coverage.reporting_stations} / ${coverage.total_stations} stations reporting`}
              </div>
            </div>
            {formEntry && (
              <button onClick={() => setFormDrawerOpen(true)}
                style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px", border: 0, borderRadius: 8, background: portal.brand, color: "#FFFFFF", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M8 3v10M3 8h10" /></svg>
                Enter Form {formEntry.formNumber}
              </button>
            )}
          </div>
        </div>

        {/* Coverage progress */}
        {coverage && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {coverage.reporting_stations} / {coverage.total_stations} stations reporting · {coverage.pct}%
              </div>
              <div style={{ height: 6, borderRadius: 3, background: portal.neutral, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${coverage.pct}%`, background: portal.brand, borderRadius: 3, transition: "width 400ms ease-out" }} />
              </div>
            </div>
          </div>
        )}

        {/* Heat map section */}
        <section style={{ background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
          {/* Header: child noun + candidate selector */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: portal.label }}>
              <strong style={{ color: portal.ink }}>{childNoun}</strong>
              {" · "}
              {metricLabel}
            </div>
            {candidates.length > 0 && (
              <CandidateSelector candidates={candidates} selected={candIdx} onChange={setCandIdx} />
            )}
          </div>

          {/* Map + info panel */}
          <div style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
            {/* Map */}
            <div style={{ flex: "999 1 380px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {geoJson ? (
                <HeatGeoMap
                  geoJson={geoJson}
                  regionColor={regionColor}
                  selectedId={selectedId}
                  hoveredId={hoveredId}
                  onSelect={handleMapClick}
                  onHover={(id, name) => { setHoveredId(id); void name; }}
                  onHoverEnd={() => setHoveredId(null)}
                />
              ) : (
                <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: portal.textSubtle, fontSize: 13 }}>
                  {geoLoading ? "Loading map…" : "Map unavailable"}
                </div>
              )}

              {/* Legend */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: portal.textSubtle, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, color: portal.ink }}>
                  {candIdx === "total" ? "Reporting" : "Vote share"}
                </span>
                {legendStops.map(([col, lbl]) => (
                  <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: col, boxShadow: "inset 0 0 0 1px rgba(9,30,66,0.12)", flexShrink: 0 }} />
                    {lbl}
                  </span>
                ))}
                {TEAL_SELECTED && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: TEAL_SELECTED, boxShadow: "inset 0 0 0 1px rgba(9,30,66,0.12)", flexShrink: 0 }} />
                    Selected
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: portal.textSubtle }}>
                {level === "constituency" ? "Click a ward to filter the station list." : "Click a region to drill down into it."}
              </div>
            </div>

            {/* Info panel + ranked list */}
            <div style={{ flex: "1 1 240px", maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
              <RegionInfoPanel
                region={activeRegion}
                candidates={candidates}
                leaderboard={summary?.leaderboard ?? []}
                candIdx={candIdx}
                totalScopeValid={totalScopeValid}
                canDrill={canDrill}
                drillLabel={drillLabel}
                onDrill={() => { if (activeId && activeRegion) drillInto(activeId, activeRegion.name); }}
              />

              {/* Ranked list */}
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label }}>{childNoun} ranked</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 260, overflowY: "auto" }}>
                <GeoTree
                  regions={regionList}
                  activeId={activeId}
                  candIdx={candIdx}
                  onSelect={handleTreeSelect}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Leaderboard */}
        {(summary?.leaderboard.length ?? 0) > 0 && (
          <Leaderboard
            entries={summary!.leaderboard}
            scopeRep={coverage?.reporting_stations ?? 0}
            scopeTotal={coverage?.total_stations ?? 0}
          />
        )}

        {/* Station grid — hidden at national level (county_regions used instead) */}
        {level !== "national" && (
          <StationGrid
            stations={displayedStations}
            search={stationSearch}
            onSearch={setStationSearch}
          />
        )}
        {level === "national" && (summary?.county_regions?.length ?? 0) > 0 && (
          <CountySummaryGrid countyRegions={summary!.county_regions!} candidates={candidates} />
        )}
      </div>
      </main>

      {/* Tier form drawer (county / national agents) */}
      {formEntry && (
        <TierFormDrawer
          workspaceId={workspaceId}
          runId={runId}
          tier={formEntry.tier}
          geoId={formEntry.geoId}
          geoName={formEntry.geoName}
          formNumber={formEntry.formNumber}
          open={formDrawerOpen}
          onClose={() => setFormDrawerOpen(false)}
        />
      )}
    </div>
  );
}

// ---- ward reconciliation view -----------------------------------------------

function WardReconcileView({
  workspaceId, runId, wardId, wardName, canVerify, onRefresh,
}: {
  workspaceId: string; runId: string; wardId: string; wardName: string;
  canVerify: boolean; onRefresh: () => void;
}) {
  const [stations, setStations]               = useState<WarRoomStation[]>([]);
  const [leaderboard, setLeaderboard]         = useState<WarRoomLeaderboardEntry[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [search, setSearch]                   = useState("");
  const [reviewId, setReviewId]               = useState<string | null>(null);
  const [confirmVerifyTarget, setConfirmVerifyTarget] = useState<WarRoomStation | null>(null);
  const [queryOpenId, setQueryOpenId]         = useState<string | null>(null);
  const [queryNote, setQueryNote]             = useState("");
  const [busy, setBusy]                       = useState<string | null>(null);
  const [amendMode, setAmendMode]             = useState(false);
  const [amendVotes, setAmendVotes]           = useState<Record<string, number>>({});
  const [amendRejected, setAmendRejected]     = useState<number | "">("");
  const [amendNote, setAmendNote]             = useState("");
  const { add: addNotif, update: updateNotif } = useNotifications();

  function enterAmendMode(s: WarRoomStation) {
    const votes: Record<string, number> = {};
    s.votes.forEach((v) => { votes[v.candidate_id] = v.votes; });
    setAmendVotes(votes);
    setAmendRejected(s.rejected_ballots ?? 0);
    setAmendNote("");
    setAmendMode(true);
  }

  function exitAmendMode() {
    setAmendMode(false);
    setAmendVotes({});
    setAmendRejected("");
    setAmendNote("");
  }

  const load = useCallback(() => {
    setLoading(true);
    api.getWarRoomSummary(workspaceId, { run_id: runId, scope: "ward", scope_id: wardId })
      .then((res) => { setStations(res.stations); setLeaderboard(res.leaderboard); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId, runId, wardId]);

  useEffect(() => { load(); }, [load]);

  async function doVerify(s: WarRoomStation) {
    if (!s.result_id || busy) return;
    setConfirmVerifyTarget(null);
    setReviewId(null);
    setBusy(s.id);
    const toastId = addNotif(`Verifying ${s.name}…`, "loading");
    try {
      await api.verifyResult(workspaceId, runId, s.result_id);
      updateNotif(toastId, `${s.name} marked as verified`, "success");
      load(); onRefresh();
    } catch {
      updateNotif(toastId, `Failed to verify ${s.name}`, "error");
    } finally { setBusy(null); }
  }

  async function doQuery(s: WarRoomStation) {
    if (!s.result_id || !queryNote.trim() || busy) return;
    setBusy(s.id);
    try {
      await api.queryResult(workspaceId, runId, s.result_id, queryNote.trim());
      setQueryOpenId(null); setQueryNote(""); setReviewId(null);
      load(); onRefresh();
    } catch { /* ignore */ }
    finally { setBusy(null); }
  }

  async function doAmend(s: WarRoomStation) {
    if (!s.result_id || !amendNote.trim() || busy) return;
    setBusy(s.id);
    const toastId = addNotif("Saving amendment…", "loading");
    try {
      await api.amendResult(workspaceId, runId, s.result_id, {
        candidates: s.votes.map((v) => ({ candidate_id: v.candidate_id, votes: amendVotes[v.candidate_id] ?? v.votes })),
        rejected_ballots: typeof amendRejected === "number" ? amendRejected : s.rejected_ballots ?? 0,
        note: amendNote.trim(),
      });
      updateNotif(toastId, `${s.name} amended and verified`, "success");
      exitAmendMode(); setReviewId(null);
      load(); onRefresh();
    } catch {
      updateNotif(toastId, "Failed to save amendment.", "error");
    } finally { setBusy(null); }
  }

  const counts = {
    verified:  stations.filter((s) => s.status === "verified").length,
    submitted: stations.filter((s) => s.status === "submitted").length,
    queried:   stations.filter((s) => s.status === "queried").length,
    pending:   stations.filter((s) => s.status === "pending").length,
  };
  const verifiedStations = stations.filter((s) => s.status === "verified");
  const verPct = stations.length > 0 ? Math.round(verifiedStations.length / stations.length * 100) : 0;
  const totalReg = stations.reduce((a, s) => a + (s.registered_voters ?? 0), 0);
  const verReg = verifiedStations.reduce((a, s) => a + (s.registered_voters ?? 0), 0);

  // Aggregate totals for verified stations only (sticky footer)
  const aggVotes: number[] = leaderboard.map((_, ci) =>
    verifiedStations.reduce((a, s) => a + (s.votes[ci]?.votes ?? 0), 0)
  );
  const aggValid = verifiedStations.reduce((a, s) => a + (s.total_votes ?? 0), 0);
  const aggRej   = verifiedStations.reduce((a, s) => a + (s.rejected_ballots ?? 0), 0);

  const filtered = search.trim()
    ? stations.filter((s) => (s.name + " " + (s.code ?? "")).toLowerCase().includes(search.toLowerCase()))
    : stations;

  const reviewStation = reviewId ? stations.find((s) => s.id === reviewId) ?? null : null;

  if (loading) return <div style={{ padding: 32, color: portal.textSubtle, fontSize: 14 }}>Loading ward data…</div>;

  // per-candidate column width — 80px each
  const candCols = leaderboard.map(() => "80px").join(" ");
  const gridCols = `156px minmax(200px,1fr) 80px ${candCols} 88px 72px 108px 168px`;

  function chipStyle(status: WarRoomStation["status"]): { bg: string; fg: string; label: string } {
    return {
      pending:   { bg: "#F1F2F4", fg: "#44546F", label: "Pending" },
      submitted: { bg: "#F8E6A0", fg: "#7F5F01", label: "Unverified" },
      verified:  { bg: "#E3FCEF", fg: "#164B35", label: "Verified" },
      queried:   { bg: "#FFD5CC", fg: "#AE2A19", label: "Queried" },
    }[status] ?? { bg: "#F1F2F4", fg: "#44546F", label: status };
  }

  return (
    <div style={{ position: "relative", background: portal.canvasSubtle }}>
      {/* Main content — outer shell handles page scroll */}
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Header */}
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{wardName} Ward</h1>
          <div style={{ marginTop: 4, fontSize: 13, color: portal.textSubtle }}>
            {stations.length} polling stations · {fmt(totalReg)} registered voters
          </div>
        </div>

        {/* Candidate leaderboard */}
        {leaderboard.length > 0 && (
          <section style={{ background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Candidate leaderboard</h2>
              <span style={{ fontSize: 12, color: portal.textSubtle }}>{stations.filter(s => s.status !== "pending").length} of {stations.length} stations reporting · includes unverified</span>
            </div>
            {(() => {
              const totalValid = leaderboard.reduce((a, e) => a + e.votes, 0) || 1;
              return leaderboard.map((e, i) => {
                const pct = (e.votes / totalValid * 100);
                return (
                  <div key={e.candidate_id} style={{ display: "grid", gridTemplateColumns: "40px minmax(160px,2fr) 80px 96px 60px minmax(120px,2fr)", minHeight: 40, alignItems: "center", borderTop: `1px solid ${portal.borderSubtle}`, background: e.is_ours ? portal.brandSubtlest : portal.canvas, fontSize: 14 }}>
                    <div style={{ padding: "0 12px", textAlign: "right", color: portal.textSubtle }}>{i + 1}</div>
                    <div style={{ padding: "0 12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{e.name}</span>
                      {e.is_ours && <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "#D7EAEF", color: "#294854" }}>Our candidate</span>}
                    </div>
                    <div style={{ padding: "0 12px", color: portal.label }}>{e.party}</div>
                    <div style={{ padding: "0 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(e.votes)}</div>
                    <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(1)}%</div>
                    <div style={{ padding: "0 12px" }}>
                      <div style={{ height: 8, borderRadius: 4, background: portal.neutral, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, borderRadius: 4, background: e.is_ours ? portal.brand : "#8590A2" }} />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </section>
        )}

        {/* Reconciliation table */}
        <section style={{ background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
          {/* Section header */}
          <div style={{ padding: 16, background: "#EEF6F8", borderBottom: "1px solid #D7EAEF", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Ward reconciliation — {wardName}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#44546F" }}>Verify Form 34A submissions against the physical forms before they roll up into Form 34B.</p>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12, fontWeight: 600 }}>
              <span style={{ padding: "4px 9px", borderRadius: 3, background: "#E3FCEF", color: "#164B35" }}>{counts.verified} Verified</span>
              <span style={{ padding: "4px 9px", borderRadius: 3, background: "#F8E6A0", color: "#7F5F01" }}>{counts.submitted} Unverified</span>
              <span style={{ padding: "4px 9px", borderRadius: 3, background: "#FFD5CC", color: "#AE2A19" }}>{counts.queried} Queried</span>
              <span style={{ padding: "4px 9px", borderRadius: 3, background: "#F1F2F4", color: "#44546F" }}>{counts.pending} Pending</span>
            </div>
            {/* Verification progress bar */}
            <div style={{ flexBasis: "100%", height: 6, borderRadius: 3, background: "#D7EAEF", overflow: "hidden" }}>
              <div style={{ height: 6, width: `${verPct}%`, background: "#1F845A", transition: "width 400ms" }} />
            </div>
          </div>

          {/* Search bar */}
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", justifyContent: "flex-end" }}>
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search station or code…"
              style={{ height: 34, padding: "0 12px", border: `1px solid ${portal.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: portal.ink, width: 240, background: portal.canvas }}
            />
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto", maxHeight: 600 }}>
            <div style={{ minWidth: 900 + leaderboard.length * 80, fontSize: 13 }}>
              {/* Sticky header */}
              <div style={{ position: "sticky", top: 0, zIndex: 2, display: "grid", gridTemplateColumns: gridCols, minHeight: 44, alignItems: "center", background: portal.canvasSubtle, borderBottom: `1px solid ${portal.border}`, fontSize: 12, fontWeight: 600, color: portal.label }}>
                <div style={{ padding: "0 12px" }}>Station code</div>
                <div style={{ padding: "0 12px" }}>Station name</div>
                <div style={{ padding: "0 12px", textAlign: "right" }}>Reg.</div>
                {leaderboard.map((c) => (
                  <div key={c.candidate_id} style={{ padding: "0 12px", textAlign: "right", lineHeight: "15px" }}>
                    {c.name.split(" ")[0]}<br /><span style={{ fontWeight: 500, color: portal.textSubtle }}>{c.party}</span>
                  </div>
                ))}
                <div style={{ padding: "0 12px", textAlign: "right" }}>Total valid</div>
                <div style={{ padding: "0 12px", textAlign: "right" }}>Rejected</div>
                <div style={{ padding: "0 12px" }}>Status</div>
                <div style={{ padding: "0 12px" }}>Action</div>
              </div>

              {/* Rows */}
              {filtered.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: portal.textSubtle }}>
                  {stations.length === 0 ? "No stations in this ward yet." : "No stations match your search."}
                </div>
              )}
              {filtered.map((s) => {
                const isPending = s.status === "pending";
                const chip = chipStyle(s.status);
                const isQueryOpen = queryOpenId === s.id;
                const rowBg = s.status === "queried" ? "#FFECEB" : s.status === "verified" ? portal.canvas : portal.canvas;
                const isReviewing = reviewId === s.id;
                const edge = isReviewing ? "inset 3px 0 0 #599BAE" : "none";
                return (
                  <div key={s.id}>
                    <div style={{ display: "grid", gridTemplateColumns: gridCols, height: 44, alignItems: "center", borderBottom: `1px solid ${portal.borderSubtle}`, background: isReviewing ? "#EEF6F8" : rowBg, boxShadow: edge }}>
                      <div style={{ padding: "0 12px", fontFamily: "monospace", fontSize: 12, color: portal.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.code ?? "—"}</div>
                      <div style={{ padding: "0 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: portal.label }}>{fmt(s.registered_voters)}</div>
                      {leaderboard.map((_, ci) => (
                        <div key={ci} style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {isPending ? "—" : fmt(s.votes[ci]?.votes ?? 0)}
                        </div>
                      ))}
                      <div style={{ padding: "0 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{isPending ? "—" : fmt(s.total_votes)}</div>
                      <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{isPending ? "—" : fmt(s.rejected_ballots)}</div>
                      <div style={{ padding: "0 12px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: chip.bg, color: chip.fg }}>{chip.label}</span>
                      </div>
                      <div style={{ padding: "0 12px", display: "flex", gap: 6, alignItems: "center" }}>
                        {isPending && <span style={{ color: "#8590A2" }}>—</span>}
                        {canVerify && (s.status === "submitted" || s.status === "queried") && (
                          <button onClick={() => { setReviewId(s.id); setQueryOpenId(null); }} style={{ height: 28, padding: "0 12px", border: 0, borderRadius: 6, background: "#599BAE", color: "#FFFFFF", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Review</button>
                        )}
                        {canVerify && (s.status === "submitted" || s.status === "queried") && (
                          <button onClick={() => { setQueryOpenId(isQueryOpen ? null : s.id); setQueryNote(""); setReviewId(null); }} style={{ height: 28, padding: "0 10px", border: `1px solid ${portal.border}`, borderRadius: 6, background: portal.canvas, color: "#AE2A19", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Query</button>
                        )}
                        {s.status === "verified" && <span style={{ fontSize: 12, color: "#1F845A", fontWeight: 600 }}>✓ Verified</span>}
                      </div>
                    </div>

                    {/* Inline query form */}
                    {isQueryOpen && (
                      <div style={{ padding: "12px 16px 14px 168px", background: "#FFECEB", borderBottom: `1px solid #FFD5CC`, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <label style={{ flex: "1 1 400px", display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 600, color: "#44546F" }}>
                          Query to agent at {s.name}
                          <textarea rows={2} value={queryNote} onChange={(e) => setQueryNote(e.target.value)}
                            placeholder="Describe the issue, e.g. photo shows different figures than submitted"
                            style={{ boxSizing: "border-box", width: "100%", padding: "8px 10px", border: `1px solid ${portal.border}`, borderRadius: 6, background: portal.canvas, fontFamily: "inherit", fontSize: 13, fontWeight: 400, color: portal.ink, resize: "vertical" }} />
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => { setQueryOpenId(null); setQueryNote(""); }} style={{ height: 36, padding: "0 12px", border: 0, borderRadius: 6, background: "transparent", color: portal.label, fontFamily: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
                          <button onClick={() => doQuery(s)} disabled={!queryNote.trim() || busy !== null} style={{ height: 36, padding: "0 14px", border: 0, borderRadius: 6, background: queryNote.trim() ? "#DE350B" : portal.neutral, color: queryNote.trim() ? "#FFFFFF" : portal.textSubtle, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: queryNote.trim() ? "pointer" : "default" }}>
                            {busy === s.id ? "Sending…" : "Send query"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Sticky totals footer */}
              {verifiedStations.length > 0 && (
                <div style={{ position: "sticky", bottom: 0, zIndex: 2, display: "grid", gridTemplateColumns: gridCols, minHeight: 52, alignItems: "center", background: "#E3FCEF", borderTop: "2px solid #1F845A", fontWeight: 700, color: "#164B35" }}>
                  <div style={{ padding: "0 12px" }}>Ward total so far</div>
                  <div style={{ padding: "0 12px", fontWeight: 500, fontSize: 12 }}>{counts.verified} verified stations only · {fmt(verReg)} reg. voters</div>
                  <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(verReg)}</div>
                  {aggVotes.map((v, i) => (
                    <div key={i} style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</div>
                  ))}
                  <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(aggValid)}</div>
                  <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(aggRej)}</div>
                  <div /><div />
                </div>
              )}
            </div>
          </div>

          {/* Info footer */}
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${portal.border}`, display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#44546F" }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="#487E8C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}><circle cx="8" cy="8" r="6.5" /><path d="M8 7.5v4M8 5v.2" /></svg>
            The constituency agent sees verified station figures from this ward in real time as you verify them.
          </div>
        </section>
      </div>

      {/* Review panel — right drawer */}
      {reviewStation && (
        <>
          <div onClick={() => { setReviewId(null); exitAmendMode(); }} style={{ position: "fixed", inset: 0, background: "rgba(9,30,66,0.2)", zIndex: 50 }} />
          <aside style={{ position: "fixed", top: 56, right: 0, bottom: 0, zIndex: 51, width: 680, maxWidth: "100%", background: portal.canvas, boxShadow: portal.modalShadow, display: "flex", flexDirection: "column" }}>
            {/* Panel header */}
            <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${portal.border}`, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.textSubtle, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {amendMode ? "Amend Form 34A" : "Review Form 34A"}
                </div>
                <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 600 }}>{reviewStation.name}</h2>
                {reviewStation.code && <div style={{ marginTop: 4, fontFamily: "monospace", fontSize: 12, color: portal.label }}>{reviewStation.code}</div>}
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {(() => { const c = chipStyle(reviewStation.status); return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: c.bg, color: c.fg }}>{c.label}</span>; })()}
                  {reviewStation.submitted_at && <span style={{ fontSize: 12, color: portal.textSubtle }}>Submitted {new Date(reviewStation.submitted_at).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })} EAT</span>}
                </div>
              </div>
              <button onClick={() => { setReviewId(null); exitAmendMode(); }} style={{ width: 36, height: 36, flexShrink: 0, border: 0, borderRadius: 6, background: "transparent", color: portal.label, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 22 }}>
              {/* Form photo */}
              <section>
                <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>Photo of Form 34A</h3>
                {reviewStation.form_image_path ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <a href={reviewStation.form_image_path} target="_blank" rel="noopener noreferrer" style={{ display: "block", borderRadius: 8, overflow: "hidden", border: `1px solid ${portal.border}` }}>
                      <img src={reviewStation.form_image_path} alt="Form 34A" style={{ width: "100%", maxHeight: 300, objectFit: "contain", background: portal.canvasSubtle, display: "block" }} />
                    </a>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <a href={reviewStation.form_image_path} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: portal.brandText }}>View full size ↗</a>
                    </div>
                  </div>
                ) : (
                  <div style={{ height: 120, borderRadius: 8, background: portal.canvasSubtle, border: `1px solid ${portal.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: portal.textSubtle }}>
                    No photo uploaded
                  </div>
                )}
              </section>

              {/* Tallies */}
              <section>
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>
                  {amendMode ? "Amended tallies" : "Tallies as submitted"}
                </h3>
                {reviewStation.votes.map((v, i) => (
                  <div key={v.candidate_id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, padding: "0 8px", margin: "0 -8px", borderBottom: `1px solid ${portal.borderSubtle}`, fontSize: 14 }}>
                    <span style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{v.candidate_name ?? `Candidate ${i + 1}`}</span>{" "}<span style={{ color: portal.textSubtle }}>{v.candidate_party}</span></span>
                    {amendMode ? (
                      <input
                        type="number"
                        min={0}
                        value={amendVotes[v.candidate_id] ?? v.votes}
                        onChange={(e) => setAmendVotes((prev) => ({ ...prev, [v.candidate_id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        style={{ width: 80, height: 32, border: `1px solid ${portal.brand}`, borderRadius: 6, padding: "0 8px", fontSize: 14, fontWeight: 600, textAlign: "right", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                      />
                    ) : (
                      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(v.votes)}</span>
                    )}
                  </div>
                ))}
                {(() => {
                  const amendTotal = amendMode ? Object.values(amendVotes).reduce((a, b) => a + b, 0) : null;
                  return (
                    <div style={{ display: "flex", justifyContent: "space-between", minHeight: 40, alignItems: "center", background: portal.canvasSubtle, padding: "0 10px", margin: "6px -10px 0", borderRadius: 6, fontSize: 14, fontWeight: 700 }}>
                      <span>Total valid votes</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{amendMode ? fmt(amendTotal!) : fmt(reviewStation.total_votes)}</span>
                    </div>
                  );
                })()}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                  <div style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${amendMode ? portal.brand : portal.border}` }}>
                    <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 2 }}>Rejected</div>
                    {amendMode ? (
                      <input
                        type="number"
                        min={0}
                        value={amendRejected}
                        onChange={(e) => setAmendRejected(Math.max(0, parseInt(e.target.value) || 0))}
                        style={{ width: "100%", height: 28, border: "none", padding: 0, fontSize: 16, fontWeight: 700, fontFamily: "inherit", outline: "none", background: "transparent", boxSizing: "border-box" }}
                      />
                    ) : (
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(reviewStation.rejected_ballots)}</div>
                    )}
                  </div>
                  {[
                    { label: "Registered", val: fmt(reviewStation.registered_voters) },
                    { label: "Turnout", val: reviewStation.total_votes != null && reviewStation.registered_voters ? ((reviewStation.total_votes + (reviewStation.rejected_ballots ?? 0)) / reviewStation.registered_voters * 100).toFixed(1) + "%" : "—" },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${portal.border}` }}>
                      <div style={{ fontSize: 12, color: portal.textSubtle }}>{item.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{item.val}</div>
                    </div>
                  ))}
                </div>
                {reviewStation.query_note && !amendMode && (
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 6, background: "#FFF7D6", border: "1px solid #F8E6A0", fontSize: 13, color: "#7F5F01" }}>
                    <strong>Query note:</strong> {reviewStation.query_note}
                  </div>
                )}
                {/* Amendment note input */}
                {amendMode && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: portal.label, marginBottom: 6 }}>
                      Reason for amendment <span style={{ color: "#AE2A19" }}>*</span>
                    </div>
                    <textarea
                      value={amendNote}
                      onChange={(e) => setAmendNote(e.target.value)}
                      placeholder="Describe why you are changing these figures (e.g. transcription error on agent's submission)…"
                      rows={3}
                      style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${amendNote.trim() ? portal.border : "#AE2A19"}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", color: portal.ink, background: portal.canvas }}
                    />
                    {!amendNote.trim() && (
                      <div style={{ fontSize: 12, color: "#AE2A19", marginTop: 4 }}>A reason is required before saving.</div>
                    )}
                  </div>
                )}
              </section>

              {/* Submitted by */}
              {reviewStation.agent_name && (
                <section>
                  <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>Submitted by</h3>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 8, border: `1px solid ${portal.border}` }}>
                    <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: "50%", background: "#D7EAEF", color: "#294854", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
                      {reviewStation.agent_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{reviewStation.agent_name}</div>
                      <div style={{ color: portal.label }}>Station agent</div>
                      {reviewStation.submitted_at && <div style={{ color: portal.textSubtle }}>{new Date(reviewStation.submitted_at).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })} EAT · confirmed by SMS code</div>}
                    </div>
                  </div>
                </section>
              )}

              {/* Station contact */}
              {reviewStation.agent_phone && (
                <section>
                  <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>Station contact</h3>
                  <div style={{ padding: 12, borderRadius: 8, background: portal.canvasSubtle, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                    <div>
                      <div style={{ color: portal.textSubtle }}>Agent phone</div>
                      <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{reviewStation.agent_phone}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <a href={`tel:${reviewStation.agent_phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 6, border: `1px solid ${portal.border}`, background: portal.canvas, color: portal.ink, fontWeight: 600, textDecoration: "none", fontSize: 13 }}>
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3.5 2h2.5l1 3-1.5 1a8 8 0 0 0 4.5 4.5l1-1.5 3 1v2.5a1.5 1.5 0 0 1-1.5 1.5A11.5 11.5 0 0 1 2 3.5 1.5 1.5 0 0 1 3.5 2z" /></svg>
                        Call
                      </a>
                      <a href={`sms:${reviewStation.agent_phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 6, border: `1px solid ${portal.border}`, background: portal.canvas, color: portal.ink, fontWeight: 600, textDecoration: "none", fontSize: 13 }}>
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M2 3.5h12v8H6l-3 2.5v-2.5H2z" /></svg>
                        SMS
                      </a>
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Panel footer actions */}
            {canVerify && (
              <div style={{ padding: "14px 20px", borderTop: `1px solid ${portal.border}`, display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                {amendMode ? (
                  <>
                    <button onClick={exitAmendMode} style={{ height: 40, padding: "0 14px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, color: portal.ink, fontFamily: "inherit", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                      Cancel
                    </button>
                    <button
                      onClick={() => doAmend(reviewStation)}
                      disabled={!amendNote.trim() || !!busy}
                      style={{ height: 40, padding: "0 18px", border: 0, borderRadius: 8, background: (!amendNote.trim() || !!busy) ? portal.neutral : "#1F845A", color: (!amendNote.trim() || !!busy) ? portal.textSubtle : "#FFFFFF", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: (!amendNote.trim() || !!busy) ? "default" : "pointer" }}
                    >
                      {busy === reviewStation.id ? "Saving…" : "Save amendment & verify"}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setReviewId(null); setQueryOpenId(reviewStation.id); setQueryNote(""); }} style={{ height: 40, padding: "0 14px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, color: "#AE2A19", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Query</button>
                    <button onClick={() => enterAmendMode(reviewStation)} style={{ height: 40, padding: "0 14px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, color: portal.ink, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Amend tallies</button>
                    <button onClick={() => setConfirmVerifyTarget(reviewStation)} disabled={!!busy} style={{ height: 40, padding: "0 18px", border: 0, borderRadius: 8, background: busy ? portal.neutral : "#1F845A", color: busy ? portal.textSubtle : "#FFFFFF", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
                      Confirm verified
                    </button>
                  </>
                )}
              </div>
            )}
          </aside>
        </>
      )}

      {/* Confirm verify modal */}
      {confirmVerifyTarget && (
        <>
          <div onClick={() => setConfirmVerifyTarget(null)} style={{ position: "fixed", inset: 0, background: "rgba(9,30,66,0.54)", zIndex: 70 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: portal.canvas, borderRadius: 14, boxShadow: portal.modalShadow, padding: "28px 24px", width: "100%", maxWidth: 420, zIndex: 71, fontFamily: portal.font }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#E3FCEF", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <svg viewBox="0 0 16 16" fill="none" stroke="#1F845A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                <path d="M3 8.5l3 3 7-7" />
              </svg>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Mark as verified?</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: portal.ink, marginBottom: 4 }}>{confirmVerifyTarget.name}</div>
            <div style={{ fontSize: 13, color: portal.label, lineHeight: "20px", marginBottom: 24 }}>
              Confirm the numbers match the signed physical Form 34A. This will include the station's figures in the ward tally and notify the constituency agent.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmVerifyTarget(null)} style={{ flex: 1, height: 42, border: "none", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={() => doVerify(confirmVerifyTarget)} style={{ flex: 2, height: 42, border: "none", borderRadius: 8, background: "#1F845A", color: "#FFFFFF", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Yes, mark as verified
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- reusable tier form drawer (34B / 34C / 34D etc.) -----------------------

function TierFormDrawer({
  workspaceId, runId,
  tier, geoId, geoName, formNumber,
  open, onClose,
}: {
  workspaceId: string;
  runId: string;
  tier: "constituency" | "county" | "national";
  geoId: string | null;
  geoName: string;
  formNumber: string;
  open: boolean;
  onClose: () => void;
}) {
  const { add: addNotif, update: updateNotif } = useNotifications();

  const [tierFormCtx, setTierFormCtx]       = useState<TierFormContext | null>(null);
  const [tierFormLoading, setTierFormLoading] = useState(false);
  const [formEntries, setFormEntries]         = useState<Record<string, string>>({});
  const [formRejected, setFormRejected]       = useState("");
  const [uploadedPaths, setUploadedPaths]     = useState<string[]>([]);
  const [uploadedUrls, setUploadedUrls]       = useState<string[]>([]);
  const [uploadingCount, setUploadingCount]   = useState(0);
  const [busy, setBusy]                       = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load form context each time drawer opens
  useEffect(() => {
    if (!open) return;
    setTierFormLoading(true);
    api.getTierForm(workspaceId, runId, tier, geoId ?? undefined)
      .then((ctx) => {
        setTierFormCtx(ctx);
        if (ctx.form) {
          const entries: Record<string, string> = {};
          for (const e of ctx.form.candidate_data) entries[e.candidate_id] = String(e.form_votes);
          setFormEntries(entries);
          setFormRejected(ctx.form.rejected_ballots_form != null ? String(ctx.form.rejected_ballots_form) : "");
          setUploadedPaths(ctx.form.form_image_paths ?? []);
          setUploadedUrls(ctx.form.form_image_urls ?? []);
        } else {
          const entries: Record<string, string> = {};
          for (const c of ctx.candidates) entries[c.id] = "";
          setFormEntries(entries);
          setFormRejected("");
          setUploadedPaths([]);
          setUploadedUrls([]);
        }
      })
      .catch(() => {})
      .finally(() => setTierFormLoading(false));
  }, [open, workspaceId, runId, tier, geoId]);

  const platform       = tierFormCtx?.platform_totals;
  const formCandidates = tierFormCtx?.candidates ?? [];
  const isSubmitted    = tierFormCtx?.form?.status === "submitted";

  const formTotalValid = formCandidates.reduce((s, c) => {
    const v = parseInt(formEntries[c.id] ?? "0", 10);
    return s + (isNaN(v) ? 0 : v);
  }, 0);
  const formRejectedNum = parseInt(formRejected, 10);

  async function pickImages(files: FileList | null) {
    if (!files) return;
    const newFiles = Array.from(files);
    setUploadingCount((n) => n + newFiles.length);
    for (const file of newFiles) {
      try {
        const res = await api.uploadTierFormImage(workspaceId, file);
        setUploadedPaths((prev) => [...prev, res.path]);
        setUploadedUrls((prev) => [...prev, res.url]);
      } catch {
        // silently ignore failed individual uploads
      } finally {
        setUploadingCount((n) => n - 1);
      }
    }
  }

  function removeUploadedImage(i: number) {
    setUploadedPaths((prev) => prev.filter((_, j) => j !== i));
    setUploadedUrls((prev) => prev.filter((_, j) => j !== i));
  }

  // No pending images to upload — they're uploaded on pick
  async function uploadPendingImages(): Promise<string[]> {
    return [...uploadedPaths];
  }

  function buildPayload(imagePaths: string[]) {
    const candidateData: TierFormCandidateEntry[] = formCandidates.map((c) => ({
      candidate_id: c.id,
      form_votes: parseInt(formEntries[c.id] ?? "0", 10) || 0,
      platform_votes: platform?.candidates.find((p) => p.candidate_id === c.id)?.platform_votes ?? 0,
    }));
    return {
      tier,
      geo_id: geoId,
      candidate_data: candidateData,
      total_valid_form: formTotalValid,
      total_valid_platform: platform?.total_valid ?? null,
      rejected_ballots_form: isNaN(formRejectedNum) ? null : formRejectedNum,
      rejected_ballots_platform: platform?.rejected_ballots ?? null,
      discrepancy_flags: [],
      has_discrepancy: false,
      form_image_paths: imagePaths,
    };
  }

  async function doSaveDraft() {
    if (busy) return;
    setBusy("save");
    const tid = addNotif("Saving draft…", "loading");
    try {
      const paths = await uploadPendingImages();
      const res = await api.saveTierFormDraft(workspaceId, runId, buildPayload(paths));
      setUploadedPaths(res.form.form_image_paths ?? []);
      setUploadedUrls(res.form.form_image_urls ?? []);
      updateNotif(tid, "Draft saved.", "success");
    } catch { updateNotif(tid, "Failed to save draft.", "error"); }
    finally { setBusy(null); }
  }

  async function doSubmit() {
    if (busy) return;
    setConfirmOpen(false);
    setBusy("submit");
    const tid = addNotif(`Submitting Form ${formNumber}…`, "loading");
    try {
      const paths = await uploadPendingImages();
      const res = await api.submitTierForm(workspaceId, runId, buildPayload(paths));
      setTierFormCtx((prev) => prev ? { ...prev, form: res.form } : prev);
      setUploadedPaths(res.form.form_image_paths ?? []);
      setUploadedUrls(res.form.form_image_urls ?? []);
      updateNotif(tid, `Form ${formNumber} submitted.`, "success");
    } catch { updateNotif(tid, "Submission failed.", "error"); }
    finally { setBusy(null); }
  }

  if (!open) return null;

  return (
    <>
      <div onClick={() => { if (!busy) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(9,30,66,0.25)", zIndex: 60 }} />
      <aside style={{ position: "fixed", top: 56, right: 0, bottom: 0, zIndex: 61, width: 680, maxWidth: "100%", background: portal.canvas, boxShadow: portal.modalShadow, display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${portal.border}`, display: "flex", gap: 10, alignItems: "flex-start", background: "#EEF6F8" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 3, background: portal.brand, color: "#FFFFFF", letterSpacing: "0.04em" }}>Form {formNumber}</span>
              {isSubmitted && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "#E3FCEF", color: "#164B35" }}>Submitted</span>}
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{geoName}</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#44546F" }}>
              Enter the candidate totals exactly as they appear on your signed physical Form {formNumber}.
            </p>
          </div>
          <button onClick={onClose} disabled={!!busy} style={{ width: 34, height: 34, flexShrink: 0, border: 0, borderRadius: 6, background: "transparent", color: portal.label, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        {/* Body */}
        {tierFormLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: portal.textSubtle, fontSize: 14 }}>Loading…</div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Totals */}
            <section>
              <h3 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700 }}>Your Form {formNumber} totals</h3>
              <p style={{ margin: "0 0 14px", fontSize: 12, color: portal.textSubtle }}>
                Enter the candidate totals as written on your signed physical Form {formNumber}.
              </p>

              {isSubmitted ? (
                <div style={{ borderRadius: 8, border: "1px solid #ABF5D1", overflow: "hidden" }}>
                  <div style={{ padding: "8px 14px", background: "#E3FCEF", fontSize: 11, fontWeight: 700, color: "#164B35", textTransform: "uppercase", letterSpacing: "0.04em" }}>Submitted</div>
                  {(tierFormCtx?.form?.candidate_data ?? []).map((e) => {
                    const cname = formCandidates.find((c) => c.id === e.candidate_id)?.name ?? e.candidate_id;
                    return (
                      <div key={e.candidate_id} style={{ display: "flex", justifyContent: "space-between", minHeight: 36, alignItems: "center", padding: "0 14px", borderTop: "1px solid #D3F5E4", fontSize: 13 }}>
                        <span>{cname}</span>
                        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(e.form_votes)}</span>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", justifyContent: "space-between", minHeight: 40, alignItems: "center", padding: "0 14px", borderTop: "2px solid #ABF5D1", fontWeight: 700, fontSize: 14, background: "#F4FFF8" }}>
                    <span>Total valid votes</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(tierFormCtx?.form?.total_valid_form)}</span>
                  </div>
                  {tierFormCtx?.form?.rejected_ballots_form != null && (
                    <div style={{ display: "flex", justifyContent: "space-between", minHeight: 34, alignItems: "center", padding: "0 14px", borderTop: "1px solid #D3F5E4", fontSize: 13, color: portal.label, background: "#F4FFF8" }}>
                      <span>Rejected ballots</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(tierFormCtx.form.rejected_ballots_form)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {formCandidates.map((c) => (
                    <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: portal.textSubtle }}>{c.party}</div>
                      </div>
                      <input type="number" min={0} value={formEntries[c.id] ?? ""} placeholder="0"
                        onChange={(e) => setFormEntries((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        style={{ height: 40, padding: "0 12px", border: `1.5px solid ${portal.border}`, borderRadius: 6, fontSize: 15, fontFamily: "inherit", fontVariantNumeric: "tabular-nums", color: portal.ink, background: portal.canvas, width: "100%", boxSizing: "border-box" }} />
                    </div>
                  ))}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, alignItems: "center", marginTop: 6, paddingTop: 10, borderTop: `2px solid ${portal.border}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>Total valid votes (auto)</div>
                    <div style={{ height: 40, padding: "0 12px", borderRadius: 6, background: portal.canvasSubtle, border: `1px solid ${portal.border}`, display: "flex", alignItems: "center", justifyContent: "flex-end", fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fmt(formTotalValid)}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 13, color: portal.label }}>Rejected ballots</div>
                    <input type="number" min={0} value={formRejected} placeholder="0"
                      onChange={(e) => setFormRejected(e.target.value)}
                      style={{ height: 40, padding: "0 12px", border: `1.5px solid ${portal.border}`, borderRadius: 6, fontSize: 15, fontFamily: "inherit", fontVariantNumeric: "tabular-nums", color: portal.ink, background: portal.canvas, width: "100%", boxSizing: "border-box" }} />
                  </div>
                </div>
              )}
            </section>

            {/* Photo upload */}
            <section>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Photo of Form {formNumber}</h3>
                  <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>All pages of your physical form. Multiple images allowed.</div>
                </div>
                {!isSubmitted && (
                  <button onClick={() => fileInputRef.current?.click()}
                    style={{ height: 34, padding: "0 12px", border: `1px solid ${portal.border}`, borderRadius: 6, background: portal.canvas, color: portal.ink, fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    + Add photo
                  </button>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => pickImages(e.target.files)} style={{ display: "none" }} />

              {/* Uploaded images grid */}
              {uploadedUrls.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
                  {uploadedUrls.map((url, i) => (
                    <div key={url} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: `1px solid ${portal.border}`, aspectRatio: "4/3" }}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt={`p${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </a>
                      {!isSubmitted && (
                        <button onClick={() => removeUploadedImage(i)} style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, border: 0, borderRadius: "50%", background: "rgba(9,30,66,0.6)", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 9, height: 9 }}><path d="M4 4l8 8M12 4l-8 8" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Uploading indicator */}
              {uploadingCount > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 6, background: portal.brandSubtlest, border: `1px solid ${portal.border}`, fontSize: 13, color: portal.brandText, marginBottom: 8 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, animation: "mtazamo-spin 0.8s linear infinite", flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                  Uploading {uploadingCount} photo{uploadingCount !== 1 ? "s" : ""}…
                </div>
              )}

              {/* Drop zone — always visible when not submitted */}
              {!isSubmitted && (
                <button onClick={() => fileInputRef.current?.click()}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 52, border: `2px dashed ${portal.border}`, borderRadius: 8, background: portal.canvasSubtle, color: portal.textSubtle, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20, opacity: 0.6 }}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 12l3-3 3 3M12 9v9" /></svg>
                  Add photo
                </button>
              )}
            </section>
          </div>
        )}

        {/* Footer */}
        {!isSubmitted && !tierFormLoading && (
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${portal.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={doSaveDraft} disabled={!!busy || formCandidates.length === 0}
              style={{ height: 40, padding: "0 16px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, color: portal.ink, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
            <button onClick={() => setConfirmOpen(true)} disabled={!!busy || formCandidates.length === 0 || formTotalValid === 0}
              style={{ height: 40, padding: "0 18px", border: 0, borderRadius: 8, background: (busy || formTotalValid === 0) ? portal.neutral : portal.brand, color: (busy || formTotalValid === 0) ? portal.textSubtle : "#FFFFFF", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: (busy || formTotalValid === 0) ? "default" : "pointer" }}>
              {busy === "submit" ? "Submitting…" : `Submit Form ${formNumber}`}
            </button>
          </div>
        )}
      </aside>

      {/* Confirm modal */}
      {confirmOpen && (
        <>
          <div onClick={() => setConfirmOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(9,30,66,0.54)", zIndex: 80 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: portal.canvas, borderRadius: 14, boxShadow: portal.modalShadow, padding: "28px 24px", width: "100%", maxWidth: 440, zIndex: 81, fontFamily: portal.font }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: portal.brandSubtlest, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <svg viewBox="0 0 16 16" fill="none" stroke={portal.brand} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}><path d="M3 8.5l3 3 7-7" /></svg>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Submit Form {formNumber}?</div>
            <div style={{ fontSize: 14, color: portal.label, lineHeight: "21px", marginBottom: 20 }}>
              You are submitting the {formNumber} totals for <strong>{geoName}</strong>. Once submitted this cannot be edited. Confirm the totals match your signed physical Form {formNumber}.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmOpen(false)} style={{ flex: 1, height: 42, border: "none", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={doSubmit} style={{ flex: 2, height: 42, border: "none", borderRadius: 8, background: portal.brand, color: "#FFFFFF", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Yes, submit Form {formNumber}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ---- constituency reconcile view (Form 34B) ----------------------------------

function ConstituencyReconcileView({
  workspaceId, runId, constituencyId, constituencyName, formNumber, isReadOnly,
}: {
  workspaceId: string;
  runId: string;
  constituencyId: string;
  constituencyName: string;
  formNumber: string; // e.g. "34B"
  isReadOnly: boolean;
}) {
  // station data
  const [stations, setStations]       = useState<WarRoomStation[]>([]);
  const [leaderboard, setLeaderboard] = useState<WarRoomLeaderboardEntry[]>([]);
  const [loading, setLoading]         = useState(true);

  // table controls
  const [search, setSearch]           = useState("");
  const [wardFilter, setWardFilter]   = useState<string | null>(null);

  // map state
  const [geoJson, setGeoJson]         = useState<GeoFeatureCollection | null>(null);
  const [geoLoading, setGeoLoading]   = useState(true);
  const [hoveredWardId, setHoveredWardId] = useState<string | null>(null);
  const [candIdx, setCandIdx]         = useState<number | "total">(0);

  // 34A review drawer
  const [reviewId, setReviewId]       = useState<string | null>(null);

  // Form drawer open/close only — all form state lives in TierFormDrawer
  const [formDrawerOpen, setFormDrawerOpen] = useState(false);

  // ---- load station data -------------------------------------------------------
  const loadStations = useCallback(() => {
    setLoading(true);
    api.getWarRoomSummary(workspaceId, { run_id: runId, scope: "constituency", scope_id: constituencyId })
      .then((res) => { setStations(res.stations); setLeaderboard(res.leaderboard); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId, runId, constituencyId]);

  useEffect(() => { loadStations(); }, [loadStations]);

  // ---- load ward boundary geoJson for the constituency -------------------------
  useEffect(() => {
    setGeoLoading(true);
    api.constituencyGeojson(constituencyId)
      .then(setGeoJson).catch(() => {}).finally(() => setGeoLoading(false));
  }, [constituencyId]);

  // ---- wards list for filter ---------------------------------------------------
  const wards = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stations) { if (s.ward_id) map.set(s.ward_id, s.ward_name); }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [stations]);

  // ---- ward regions for map coloring ------------------------------------------
  const candidateIds = leaderboard.map((c) => c.candidate_id);
  const wardRegions = useMemo(
    () => Object.values(aggregateRegions(stations, (s) => s.ward_id, (s) => s.ward_name, candidateIds)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stations, candidateIds.join(",")],
  );

  function wardRegionColor(wardId: string): string {
    const r = wardRegions.find((w) => w.id === wardId);
    if (!r || r.reportingStations === 0) return NO_DATA_CLR;
    if (candIdx === "total") return reportToTeal(r.reportingStations / r.totalStations);
    const share = r.totalValid > 0 ? (r.votes[candIdx as number] ?? 0) / r.totalValid : 0;
    return shareToTeal(share);
  }

  // ---- filtered stations -------------------------------------------------------
  const filteredStations = useMemo(() => {
    let list = stations;
    if (wardFilter) list = list.filter((s) => s.ward_id === wardFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => (s.name + " " + (s.code ?? "") + " " + s.ward_name).toLowerCase().includes(q));
    }
    return list;
  }, [stations, wardFilter, search]);


  // ---- status counts -----------------------------------------------------------
  const counts = useMemo(() => ({
    verified:  stations.filter((s) => s.status === "verified").length,
    submitted: stations.filter((s) => s.status === "submitted").length,
    queried:   stations.filter((s) => s.status === "queried").length,
    pending:   stations.filter((s) => s.status === "pending").length,
  }), [stations]);

  const verPct = stations.length > 0 ? Math.round(counts.verified / stations.length * 100) : 0;

  // ---- review station (34A drawer) -------------------------------------------
  const reviewStation = reviewId ? stations.find((s) => s.id === reviewId) ?? null : null;

  // ---- chip style --------------------------------------------------------------
  function chipStyle(status: WarRoomStation["status"]): { bg: string; fg: string; label: string } {
    return {
      pending:   { bg: "#F1F2F4", fg: "#44546F", label: "Pending" },
      submitted: { bg: "#F8E6A0", fg: "#7F5F01", label: "Unverified" },
      verified:  { bg: "#E3FCEF", fg: "#164B35", label: "Verified" },
      queried:   { bg: "#FFD5CC", fg: "#AE2A19", label: "Queried" },
    }[status] ?? { bg: "#F1F2F4", fg: "#44546F", label: status };
  }

  // ---- grid columns -----------------------------------------------------------
  const candCols = leaderboard.map(() => "80px").join(" ");
  const gridCols = `156px minmax(190px,1fr) 110px 80px ${candCols} 88px 72px 108px 120px`;

  if (loading) return <div style={{ padding: 32, color: portal.textSubtle, fontSize: 14 }}>Loading constituency data…</div>;

  const totalReg = stations.reduce((a, s) => a + (s.registered_voters ?? 0), 0);

  return (
    <div style={{ position: "relative", background: portal.canvasSubtle }}>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{constituencyName} Constituency</h1>
            <div style={{ marginTop: 4, fontSize: 13, color: portal.textSubtle }}>
              {stations.length} polling stations across {wards.length} wards · {fmt(totalReg)} registered voters
            </div>
          </div>
          {!isReadOnly && (
            <button
              onClick={() => setFormDrawerOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 18px", border: 0, borderRadius: 8, background: portal.brand, color: "#FFFFFF", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M8 3v10M3 8h10" /></svg>
              Enter Form {formNumber}
            </button>
          )}
        </div>

        {/* Coverage progress */}
        <div style={{ padding: "10px 16px", background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{counts.verified} of {stations.length} stations verified · {verPct}%</span>
            <div style={{ display: "flex", gap: 6, fontSize: 11, fontWeight: 700, flexWrap: "wrap" }}>
              <span style={{ padding: "2px 7px", borderRadius: 3, background: "#E3FCEF", color: "#164B35" }}>{counts.verified} Verified</span>
              <span style={{ padding: "2px 7px", borderRadius: 3, background: "#F8E6A0", color: "#7F5F01" }}>{counts.submitted} Unverified</span>
              <span style={{ padding: "2px 7px", borderRadius: 3, background: "#FFD5CC", color: "#AE2A19" }}>{counts.queried} Queried</span>
              <span style={{ padding: "2px 7px", borderRadius: 3, background: portal.neutral, color: portal.label }}>{counts.pending} Pending</span>
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: portal.neutral, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${verPct}%`, background: "#1F845A", borderRadius: 3, transition: "width 400ms" }} />
          </div>
        </div>

        {/* ── Ward heat map ─────────────────────────────────────────── */}
        <section style={{ background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
          {/* Header: metric label + candidate selector */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: portal.label }}>
              <strong style={{ color: portal.ink }}>Wards</strong>
              {" · "}
              {candIdx === "total" ? "Stations reporting" : `Votes — ${leaderboard[candIdx as number]?.name ?? ""}`}
              {wardFilter && (
                <span style={{ marginLeft: 10 }}>
                  <span style={{ padding: "2px 8px", borderRadius: 3, background: portal.brandSubtlest, color: portal.brandText, fontSize: 12, fontWeight: 600 }}>
                    {wardRegions.find((r) => r.id === wardFilter)?.name ?? "Ward"} selected
                  </span>
                  <button onClick={() => { setWardFilter(null); setSearch(""); }} style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: portal.textSubtle, background: "none", border: "none", cursor: "pointer", padding: 0 }}>✕ clear</button>
                </span>
              )}
            </div>
            {leaderboard.length > 0 && (
              <CandidateSelector candidates={leaderboard} selected={candIdx} onChange={setCandIdx} />
            )}
          </div>

          {/* Map + right panel */}
          <div style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
            {/* Map */}
            <div style={{ flex: "999 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {geoJson ? (
                <HeatGeoMap
                  geoJson={geoJson}
                  regionColor={wardRegionColor}
                  selectedId={wardFilter}
                  hoveredId={hoveredWardId}
                  onSelect={(id) => setWardFilter((prev) => prev === id ? null : id)}
                  onHover={(id) => setHoveredWardId(id)}
                  onHoverEnd={() => setHoveredWardId(null)}
                />
              ) : (
                <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: portal.textSubtle, fontSize: 13 }}>
                  {geoLoading ? "Loading ward map…" : "Map unavailable for this constituency."}
                </div>
              )}

              {/* Legend */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: portal.textSubtle, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, color: portal.ink }}>{candIdx === "total" ? "Reporting" : "Vote share"}</span>
                {([
                  [NO_DATA_CLR, "No data"],
                  [TEAL_SEQ[0], "< 20%"],
                  [TEAL_SEQ[2], "20–50%"],
                  [TEAL_SEQ[4], "> 50%"],
                ] as [string, string][]).map(([col, lbl]) => (
                  <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 13, height: 13, borderRadius: 3, background: col, boxShadow: "inset 0 0 0 1px rgba(9,30,66,0.12)", flexShrink: 0 }} />
                    {lbl}
                  </span>
                ))}
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 13, height: 13, borderRadius: 3, background: TEAL_SELECTED, boxShadow: "inset 0 0 0 1px rgba(9,30,66,0.12)", flexShrink: 0 }} />
                  Selected
                </span>
              </div>
              <div style={{ fontSize: 11, color: portal.textSubtle }}>
                Click a ward to filter the station list below.
              </div>
            </div>

            {/* Right: info panel + ranked wards list */}
            <div style={{ flex: "1 1 220px", maxWidth: 300, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Info panel for hovered/selected ward */}
              <RegionInfoPanel
                region={wardRegions.find((r) => r.id === (hoveredWardId ?? wardFilter)) ?? null}
                candidates={leaderboard}
                leaderboard={leaderboard}
                candIdx={candIdx}
                totalScopeValid={leaderboard.reduce((s, e) => s + e.votes, 0)}
                canDrill={false}
                drillLabel=""
                onDrill={() => {}}
              />

              {/* Wards ranked list */}
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label }}>Wards ranked</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 260, overflowY: "auto" }}>
                <GeoTree
                  regions={wardRegions}
                  activeId={hoveredWardId ?? wardFilter}
                  candIdx={candIdx}
                  onSelect={(id) => setWardFilter((prev) => prev === id ? null : id)}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Candidate leaderboard */}
        {leaderboard.length > 0 && (
          <section style={{ background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Candidate leaderboard</h2>
              <span style={{ fontSize: 12, color: portal.textSubtle }}>From {counts.verified + counts.submitted} reporting stations · includes unverified</span>
            </div>
            {(() => {
              const totalValid = leaderboard.reduce((a, e) => a + e.votes, 0) || 1;
              return leaderboard.map((e, i) => {
                const pct = e.votes / totalValid * 100;
                return (
                  <div key={e.candidate_id} style={{ display: "grid", gridTemplateColumns: "40px minmax(160px,2fr) 80px 96px 60px minmax(120px,2fr)", minHeight: 40, alignItems: "center", borderTop: `1px solid ${portal.borderSubtle}`, background: e.is_ours ? portal.brandSubtlest : portal.canvas, fontSize: 14 }}>
                    <div style={{ padding: "0 12px", textAlign: "right", color: portal.textSubtle }}>{i + 1}</div>
                    <div style={{ padding: "0 12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{e.name}</span>
                      {e.is_ours && <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "#D7EAEF", color: "#294854" }}>Our candidate</span>}
                    </div>
                    <div style={{ padding: "0 12px", color: portal.label }}>{e.party}</div>
                    <div style={{ padding: "0 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(e.votes)}</div>
                    <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(1)}%</div>
                    <div style={{ padding: "0 12px" }}>
                      <div style={{ height: 8, borderRadius: 4, background: portal.neutral, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, borderRadius: 4, background: e.is_ours ? portal.brand : "#8590A2" }} />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </section>
        )}

        {/* Station reconciliation table */}
        <section style={{ background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px 10px", background: "#EEF6F8", borderBottom: "1px solid #D7EAEF" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Polling stations — {constituencyName}</h2>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "#44546F" }}>
                  Each row is a station's Form {formNumber.replace("B", "A")} submission. Click "View 34A" to inspect a station's data.
                </p>
              </div>
            </div>
          </div>

          {/* Search + ward filter bar */}
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search station, code…"
              style={{ height: 34, padding: "0 12px", border: `1px solid ${portal.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: portal.ink, width: 220, background: portal.canvas }} />
            {wards.length > 1 && (
              <select value={wardFilter ?? ""} onChange={(e) => setWardFilter(e.target.value || null)}
                style={{ height: 34, padding: "0 10px", border: `1px solid ${portal.border}`, borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: portal.ink, background: portal.canvas }}>
                <option value="">All wards</option>
                {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            )}
            <span style={{ fontSize: 12, color: portal.textSubtle, marginLeft: "auto" }}>{filteredStations.length} of {stations.length} stations</span>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto", maxHeight: 580 }}>
            <div style={{ minWidth: 900 + leaderboard.length * 80, fontSize: 13 }}>
              {/* Header */}
              <div style={{ position: "sticky", top: 0, zIndex: 2, display: "grid", gridTemplateColumns: gridCols, minHeight: 44, alignItems: "center", background: portal.canvasSubtle, borderBottom: `1px solid ${portal.border}`, fontSize: 12, fontWeight: 600, color: portal.label }}>
                <div style={{ padding: "0 12px" }}>Station code</div>
                <div style={{ padding: "0 12px" }}>Station name</div>
                <div style={{ padding: "0 12px" }}>Ward</div>
                <div style={{ padding: "0 12px", textAlign: "right" }}>Reg.</div>
                {leaderboard.map((c) => (
                  <div key={c.candidate_id} style={{ padding: "0 12px", textAlign: "right", lineHeight: "15px" }}>
                    {c.name.split(" ")[0]}<br /><span style={{ fontWeight: 400, color: portal.textSubtle }}>{c.party}</span>
                  </div>
                ))}
                <div style={{ padding: "0 12px", textAlign: "right" }}>Total valid</div>
                <div style={{ padding: "0 12px", textAlign: "right" }}>Rejected</div>
                <div style={{ padding: "0 12px" }}>Status</div>
                <div style={{ padding: "0 12px" }}>Action</div>
              </div>

              {/* Rows */}
              {filteredStations.length === 0 && (
                <div style={{ padding: 24, textAlign: "center", color: portal.textSubtle }}>
                  {stations.length === 0 ? "No stations in this constituency yet." : "No stations match your search."}
                </div>
              )}
              {filteredStations.map((s) => {
                const isPending = s.status === "pending";
                const chip = chipStyle(s.status);
                const isReviewing = reviewId === s.id;
                return (
                  <div key={s.id}>
                    <div style={{ display: "grid", gridTemplateColumns: gridCols, height: 44, alignItems: "center", borderBottom: `1px solid ${portal.borderSubtle}`, background: isReviewing ? "#EEF6F8" : portal.canvas, boxShadow: isReviewing ? "inset 3px 0 0 #599BAE" : "none" }}>
                      <div style={{ padding: "0 12px", fontFamily: "monospace", fontSize: 12, color: portal.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.code ?? "—"}</div>
                      <div style={{ padding: "0 12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{s.name}</div>
                      <div style={{ padding: "0 12px", fontSize: 12, color: portal.textSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.ward_name}</div>
                      <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: portal.label }}>{fmt(s.registered_voters)}</div>
                      {leaderboard.map((_, ci) => (
                        <div key={ci} style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {isPending ? "—" : fmt(s.votes[ci]?.votes ?? 0)}
                        </div>
                      ))}
                      <div style={{ padding: "0 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{isPending ? "—" : fmt(s.total_votes)}</div>
                      <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{isPending ? "—" : fmt(s.rejected_ballots)}</div>
                      <div style={{ padding: "0 12px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: chip.bg, color: chip.fg }}>{chip.label}</span>
                      </div>
                      <div style={{ padding: "0 12px" }}>
                        {!isPending && (
                          <button
                            onClick={() => { setReviewId(isReviewing ? null : s.id); }}
                            style={{ height: 28, padding: "0 10px", border: `1px solid ${portal.border}`, borderRadius: 6, background: isReviewing ? "#D7EAEF" : portal.canvas, color: portal.brandText, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            View 34A
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Aggregate footer */}
              {stations.filter((s) => s.status !== "pending").length > 0 && (() => {
                const rep = stations.filter((s) => s.status !== "pending");
                const aggVotes = leaderboard.map((_, ci) => rep.reduce((a, s) => a + (s.votes[ci]?.votes ?? 0), 0));
                const aggValid = rep.reduce((a, s) => a + (s.total_votes ?? 0), 0);
                const aggRej   = rep.reduce((a, s) => a + (s.rejected_ballots ?? 0), 0);
                return (
                  <div style={{ position: "sticky", bottom: 0, zIndex: 2, display: "grid", gridTemplateColumns: gridCols, minHeight: 52, alignItems: "center", background: "#EEF6F8", borderTop: "2px solid #599BAE", fontWeight: 700, color: "#294854" }}>
                    <div style={{ padding: "0 12px" }}>Platform total</div>
                    <div style={{ padding: "0 12px", fontWeight: 500, fontSize: 12, color: portal.textSubtle }}>{rep.length} reporting · incl. unverified</div>
                    <div /><div />
                    {aggVotes.map((v, i) => <div key={i} style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</div>)}
                    <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(aggValid)}</div>
                    <div style={{ padding: "0 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(aggRej)}</div>
                    <div /><div />
                  </div>
                );
              })()}
            </div>
          </div>
        </section>
      </div>

      {/* ── 34A review drawer ─────────────────────────────────────────── */}
      {reviewStation && (
        <>
          <div onClick={() => setReviewId(null)} style={{ position: "fixed", inset: 0, background: "rgba(9,30,66,0.2)", zIndex: 50 }} />
          <aside style={{ position: "fixed", top: 56, right: 0, bottom: 0, zIndex: 51, width: 680, maxWidth: "100%", background: portal.canvas, boxShadow: portal.modalShadow, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${portal.border}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: portal.textSubtle }}>Form {formNumber.replace("B", "A")} — Station submission</div>
                <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 600 }}>{reviewStation.name}</h2>
                {reviewStation.code && <div style={{ marginTop: 3, fontFamily: "monospace", fontSize: 12, color: portal.label }}>{reviewStation.code}</div>}
                <div style={{ marginTop: 6, fontSize: 12, color: portal.textSubtle }}>{reviewStation.ward_name} Ward</div>
                <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(() => { const c = chipStyle(reviewStation.status); return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: c.bg, color: c.fg }}>{c.label}</span>; })()}
                  {reviewStation.submitted_at && <span style={{ fontSize: 12, color: portal.textSubtle }}>Submitted {new Date(reviewStation.submitted_at).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })} EAT</span>}
                </div>
              </div>
              <button onClick={() => setReviewId(null)} style={{ width: 34, height: 34, flexShrink: 0, border: 0, borderRadius: 6, background: "transparent", color: portal.label, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Photo */}
              <section>
                <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Form {formNumber.replace("B", "A")} photo</h3>
                {reviewStation.form_image_path ? (
                  <a href={reviewStation.form_image_path} target="_blank" rel="noopener noreferrer" style={{ display: "block", borderRadius: 8, overflow: "hidden", border: `1px solid ${portal.border}` }}>
                    <img src={reviewStation.form_image_path} alt={`Form ${formNumber.replace("B", "A")}`} style={{ width: "100%", maxHeight: 280, objectFit: "contain", background: portal.canvasSubtle, display: "block" }} />
                  </a>
                ) : (
                  <div style={{ height: 100, borderRadius: 8, background: portal.canvasSubtle, border: `1px solid ${portal.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: portal.textSubtle }}>
                    No photo uploaded
                  </div>
                )}
              </section>
              {/* Tallies */}
              <section>
                <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Tallies as submitted</h3>
                {reviewStation.votes.map((v, i) => (
                  <div key={v.candidate_id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 40, padding: "0 6px", margin: "0 -6px", borderBottom: `1px solid ${portal.borderSubtle}`, fontSize: 13 }}>
                    <span style={{ flex: 1 }}><span style={{ fontWeight: 600 }}>{v.candidate_name ?? `Candidate ${i + 1}`}</span>{" "}<span style={{ color: portal.textSubtle, fontSize: 12 }}>{v.candidate_party}</span></span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(v.votes)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", minHeight: 40, alignItems: "center", background: portal.canvasSubtle, padding: "0 8px", margin: "6px -8px 0", borderRadius: 6, fontWeight: 700, fontSize: 14 }}>
                  <span>Total valid votes</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(reviewStation.total_votes)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                  {[
                    { label: "Rejected", val: fmt(reviewStation.rejected_ballots) },
                    { label: "Registered", val: fmt(reviewStation.registered_voters) },
                    { label: "Turnout", val: reviewStation.total_votes != null && reviewStation.registered_voters ? ((reviewStation.total_votes + (reviewStation.rejected_ballots ?? 0)) / reviewStation.registered_voters * 100).toFixed(1) + "%" : "—" },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${portal.border}`, textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: portal.textSubtle }}>{item.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{item.val}</div>
                    </div>
                  ))}
                </div>
                {reviewStation.query_note && (
                  <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 6, background: "#FFF7D6", border: "1px solid #F8E6A0", fontSize: 13 }}>
                    <strong style={{ color: "#7F5F01" }}>Query note:</strong> {reviewStation.query_note}
                  </div>
                )}
              </section>
              {/* Agent */}
              {reviewStation.agent_name && (
                <section>
                  <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Submitted by</h3>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, borderRadius: 8, border: `1px solid ${portal.border}` }}>
                    <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: "#D7EAEF", color: "#294854", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                      {reviewStation.agent_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{reviewStation.agent_name}</div>
                      {reviewStation.agent_phone && <div style={{ color: portal.textSubtle }}>{reviewStation.agent_phone}</div>}
                    </div>
                    {reviewStation.agent_phone && (
                      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                        <a href={`tel:${reviewStation.agent_phone}`} style={{ display: "inline-flex", alignItems: "center", height: 32, padding: "0 10px", borderRadius: 6, border: `1px solid ${portal.border}`, background: portal.canvas, color: portal.ink, fontWeight: 600, textDecoration: "none", fontSize: 12 }}>Call</a>
                        <a href={`sms:${reviewStation.agent_phone}`} style={{ display: "inline-flex", alignItems: "center", height: 32, padding: "0 10px", borderRadius: 6, border: `1px solid ${portal.border}`, background: portal.canvas, color: portal.ink, fontWeight: 600, textDecoration: "none", fontSize: 12 }}>SMS</a>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </aside>
        </>
      )}

      <TierFormDrawer
        workspaceId={workspaceId}
        runId={runId}
        tier="constituency"
        geoId={constituencyId}
        geoName={`${constituencyName} Constituency`}
        formNumber={formNumber}
        open={formDrawerOpen}
        onClose={() => setFormDrawerOpen(false)}
      />
    </div>
  );
}

// ---- no active run -----------------------------------------------------------

function NoRunState({ canManage }: { canManage: boolean }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
      <div style={{ maxWidth: 480, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: portal.brandSubtlest, color: portal.brandHover, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M1.5 8h3l2-5 3 10 2-5h3" /></svg>
        </div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>No run is active</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: "23px", color: portal.label }}>
          {canManage
            ? "Create a live run for polling day, or a rehearsal to test your agent network first."
            : "The war room will become available once your campaign manager opens a run."}
        </p>
        {canManage && <div style={{ marginTop: 4, fontSize: 13, color: portal.textSubtle }}>Use the run selector in the top bar to create a new run.</div>}
      </div>
    </div>
  );
}

// ---- main WarRoom export ----------------------------------------------------

// IEBC form series by seat (34=president, 35=MP, 36=MCA, 37=governor, 38=senator)
const FORM_SERIES: Record<string, string> = {
  president:    "34",
  governor:     "37",
  senator:      "38",
  mp:           "35",
  mca:          "36",
};
function tierFormNumber(seat: string, tier: "constituency" | "county" | "national"): string {
  const series = FORM_SERIES[seat] ?? "34";
  const suffix: Record<string, string> = { constituency: "B", county: "C", national: "D" };
  return series + (suffix[tier] ?? "B");
}

export function WarRoom() {
  const { workspace, myRole, viewedRun, runs } = useWorkspaceContext();
  const canManage      = myRole === "aspirant" || myRole === "campaign_manager";
  const isWardAdmin    = myRole === "ward";
  const isConstAgent   = myRole === "constituency";
  const isCountyAgent  = myRole === "county";
  const isNationalAgent = myRole === "national";
  const isViewingClosed = viewedRun != null && viewedRun.status !== "open" && viewedRun.status !== "tallying";

  const [tierCtx, setTierCtx] = useState<{
    ward_id?: string | null;
    constituency_id?: string | null;
    county_id?: string | null;
    geo_scope?: string | null;
  } | null>(null);

  useEffect(() => {
    if (isWardAdmin || isConstAgent || isCountyAgent || isNationalAgent) {
      api.getTierContext(workspace.id)
        .then((ctx) => setTierCtx({ ward_id: ctx.ward_id, constituency_id: ctx.constituency_id, county_id: ctx.county_id, geo_scope: ctx.geo_scope }))
        .catch(() => {});
    }
  }, [isWardAdmin, isConstAgent, isCountyAgent, isNationalAgent, workspace.id]);

  const runBadgeBg = viewedRun?.type === "live" ? "#386271" : viewedRun ? "#FFAB00" : portal.neutral;
  const runBadgeFg = viewedRun?.type === "live" ? "#FFFFFF" : viewedRun ? "#172B4D" : portal.label;
  const runBadgeLabel = viewedRun?.type === "live" ? "LIVE" : viewedRun ? "REHEARSAL" : null;
  const statusLabel: Record<string, string> = { open: "OPEN", tallying: "TALLYING", certified: "CLOSED", archived: "ARCHIVED" };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, ...((isWardAdmin || isConstAgent) ? {} : { overflow: "hidden" }) }}>
      {/* Run status strip */}
      <div style={{ minHeight: 48, padding: "6px 24px", borderBottom: `1px solid ${portal.border}`, background: portal.canvas, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{viewedRun?.name ?? "No runs yet"}</span>
        {runBadgeLabel && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 3, background: runBadgeBg, color: runBadgeFg }}>{runBadgeLabel}</span>
        )}
        {viewedRun?.status && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 3, background: portal.brandSubtlest, color: portal.brandText }}>
            {statusLabel[viewedRun.status] ?? viewedRun.status.toUpperCase()}
          </span>
        )}
        {isViewingClosed && (
          <span style={{ fontSize: 12, color: portal.textSubtle, marginLeft: 4 }}>· Read-only</span>
        )}
      </div>

      {/* Content */}
      {runs.length === 0 ? (
        <NoRunState canManage={canManage} />
      ) : !viewedRun ? (
        <div style={{ padding: 32, color: portal.textSubtle, fontSize: 14 }}>Select a run from the selector above.</div>
      ) : isWardAdmin ? (
        tierCtx?.ward_id ? (
          <WardReconcileView
            workspaceId={workspace.id}
            runId={viewedRun.id}
            wardId={tierCtx.ward_id}
            wardName={tierCtx.geo_scope ?? "Your ward"}
            canVerify={!isViewingClosed}
            onRefresh={() => {}}
          />
        ) : (
          <div style={{ padding: 32, color: portal.textSubtle, fontSize: 14 }}>Loading your ward context…</div>
        )
      ) : isConstAgent ? (
        tierCtx?.constituency_id ? (
          <ConstituencyReconcileView
            workspaceId={workspace.id}
            runId={viewedRun.id}
            constituencyId={tierCtx.constituency_id}
            constituencyName={tierCtx.geo_scope ?? "Your constituency"}
            formNumber={tierFormNumber(workspace.seat ?? "president", "constituency")}
            isReadOnly={isViewingClosed}
          />
        ) : (
          <div style={{ padding: 32, color: portal.textSubtle, fontSize: 14 }}>Loading your constituency context…</div>
        )
      ) : isCountyAgent ? (
        tierCtx?.county_id ? (
          <WarRoomHeatMap
            workspaceId={workspace.id}
            runId={viewedRun.id}
            initialLevel="county"
            initialCounty={{ id: tierCtx.county_id, name: tierCtx.geo_scope ?? "Your county" }}
            lockedToCounty
            formEntry={!isViewingClosed ? {
              tier: "county",
              geoId: tierCtx.county_id,
              geoName: `${tierCtx.geo_scope ?? "Your county"} County`,
              formNumber: tierFormNumber(workspace.seat ?? "president", "county"),
            } : null}
          />
        ) : (
          <div style={{ padding: 32, color: portal.textSubtle, fontSize: 14 }}>Loading your county context…</div>
        )
      ) : isNationalAgent ? (
        <WarRoomHeatMap
          workspaceId={workspace.id}
          runId={viewedRun.id}
          initialLevel="national"
          formEntry={!isViewingClosed ? {
            tier: "national",
            geoId: null,
            geoName: "National Tallying Centre",
            formNumber: tierFormNumber(workspace.seat ?? "president", "national"),
          } : null}
        />
      ) : (
        <WarRoomHeatMap
          workspaceId={workspace.id}
          runId={viewedRun.id}
          initialLevel={workspace.scope === "constituency" ? "constituency" : workspace.scope === "county" ? "county" : "national"}
          initialCounty={workspace.county_id && workspace.county ? { id: workspace.county_id, name: workspace.county } : null}
          initialConstituency={workspace.constituency_id && workspace.constituency ? { id: workspace.constituency_id, name: workspace.constituency } : null}
        />
      )}
    </div>
  );
}
