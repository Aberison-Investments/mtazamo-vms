import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { makeProjector, type ProjFeature } from "../../projector";
import {
  api,
  type GeoFeatureCollection,
  type GeoItem,
  type Station,
  type Workspace,
  type WorkspaceGeoSummary,
} from "../../api";
import { portal } from "../../portalTheme";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";

// ---- coverage palette -------------------------------------------------------

// Continuous brand ramp: 0% = lightest tint, 100% = deep brand
function coverageColor(pct: number): string {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  const light = { r: 220, g: 238, b: 244 };
  const dark  = { r: 30,  g: 95,  b: 115 };
  const r = Math.round(light.r + (dark.r - light.r) * t);
  const g = Math.round(light.g + (dark.g - light.g) * t);
  const b = Math.round(light.b + (dark.b - light.b) * t);
  return `rgb(${r},${g},${b})`;
}

// ---- drill state ------------------------------------------------------------
//
// DrillState only changes when the MAP LEVEL changes (county→constituency).
// Ward selection is tracked separately so clicking a ward doesn't re-trigger
// the geography data fetch.

type MapLevel = "national" | "county" | "constituency";

interface DrillState {
  mapLevel: MapLevel | "ward-only";
  county: { id: string; name: string } | null;
  constituency: { id: string; name: string } | null;
}

function initDrillState(workspace: Workspace): DrillState {
  const county =
    workspace.county_id && workspace.county
      ? { id: workspace.county_id, name: workspace.county }
      : null;
  const constituency =
    workspace.constituency_id && workspace.constituency
      ? { id: workspace.constituency_id, name: workspace.constituency }
      : null;

  switch (workspace.scope) {
    case "national":
      return { mapLevel: "national", county: null, constituency: null };
    case "county":
      return { mapLevel: "county", county, constituency: null };
    case "constituency":
      return { mapLevel: "constituency", county, constituency };
    default: // ward / mca
      return { mapLevel: "ward-only", county, constituency };
  }
}

// ---- GeoJSON SVG map --------------------------------------------------------

interface MapProps {
  geoJson: GeoFeatureCollection;
  items: GeoItem[];
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
}

function GeoMap({ geoJson, items, selectedId, onSelect }: MapProps) {
  const W = 560, H = 480;

  const coverageById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const item of items) m[item.id] = item.coverage_pct;
    return m;
  }, [items]);

  const paths = useMemo(() => {
    if (!geoJson.features.length) return [];
    const features = geoJson.features as unknown as ProjFeature[];
    const proj = makeProjector(features, W, H);
    return features.map((f) => {
      const [cx, cy] = proj.centroidFor(f);
      return { id: f.properties.id, name: f.properties.name, d: proj.pathFor(f), cx, cy };
    });
  }, [geoJson]);

  if (!paths.length) return null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* Pass 1: fills with click handlers */}
      {paths.map((p) => {
        const pct = coverageById[p.id] ?? 0;
        const active = p.id === selectedId;
        return (
          <path
            key={p.id}
            d={p.d}
            fill={coverageColor(pct)}
            fillOpacity={active ? 0.9 : 0.65}
            stroke="none"
            onClick={() => onSelect(p.id, p.name)}
            style={{ cursor: "pointer" }}
          >
            <title>{`${p.name} · ${pct}% covered`}</title>
          </path>
        );
      })}
      {/* Pass 2: strokes on top so boundaries are always visible regardless of fill order */}
      {paths.map((p) => {
        const active = p.id === selectedId;
        return (
          <path
            key={`s-${p.id}`}
            d={p.d}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={active ? 3 : 1.5}
            pointerEvents="none"
          />
        );
      })}
      {/* Pass 3: labels */}
      {paths.map((p) =>
        p.d ? (
          <text
            key={`t-${p.id}`}
            x={p.cx}
            y={p.cy}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fontWeight={600}
            fill="#172B4D"
            pointerEvents="none"
            fontFamily={portal.font}
          >
            {p.name.length > 14 ? p.name.slice(0, 13) + "…" : p.name}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ---- main page --------------------------------------------------------------

export function WorkspaceGeography() {
  const { id } = useParams<{ id: string }>();
  const { workspace, myRole } = useWorkspaceContext();

  // When the logged-in user is a ward admin, their specific ward (from tier context)
  const [wardFilter, setWardFilter] = useState<{ id: string; name: string } | null>(null);

  // When the logged-in user is a constituency agent, their specific constituency
  const [constituencyFilter, setConstituencyFilter] = useState<{ id: string; name: string } | null>(null);

  // When the logged-in user is a county agent, their specific county
  const [countyFilter, setCountyFilter] = useState<{ id: string; name: string } | null>(null);

  // mapLevel + parent region — only changes when the user drills into a new level
  const [drillState, setDrillState] = useState<DrillState | null>(null);

  // Ward selected within the constituency map (separate so it doesn't re-trigger data fetch)
  const [selectedWard, setSelectedWard] = useState<{ id: string; name: string } | null>(null);

  // Data for the current map level
  const [geoJson, setGeoJson] = useState<GeoFeatureCollection | null>(null);
  const [summary, setSummary] = useState<WorkspaceGeoSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Station data for selected ward
  const [stations, setStations] = useState<Station[] | null>(null);
  const [stationsLoading, setStationsLoading] = useState(false);

  const [search, setSearch] = useState("");

  const loadIdRef = useRef(0); // monotonic counter to ignore stale responses

  // Initialise drill state; ward/constituency officers also fetch their tier context to pin their area
  useEffect(() => {
    if (!id) return;
    if (myRole === 'ward') {
      api.getTierContext(id).then((ctx) => {
        if (ctx.ward_id) setWardFilter({ id: ctx.ward_id, name: ctx.geo_scope ?? 'Ward' });
      }).catch(() => {});
      setDrillState({ mapLevel: 'ward-only', county: null, constituency: null });
    } else if (myRole === 'county') {
      api.getTierContext(id).then((ctx) => {
        if (ctx.county_id && ctx.geo_scope) {
          const cf = { id: ctx.county_id, name: ctx.geo_scope };
          setCountyFilter(cf);
          setDrillState({ mapLevel: 'county', county: cf, constituency: null });
        } else {
          setDrillState(initDrillState(workspace));
        }
      }).catch(() => setDrillState(initDrillState(workspace)));
    } else if (myRole === 'constituency') {
      api.getTierContext(id).then((ctx) => {
        if (ctx.constituency_id && ctx.geo_scope) {
          const cf = { id: ctx.constituency_id, name: ctx.geo_scope };
          setConstituencyFilter(cf);
          const county = workspace.county_id && workspace.county
            ? { id: workspace.county_id, name: workspace.county }
            : null;
          setDrillState({ mapLevel: 'constituency', county, constituency: cf });
        } else {
          setDrillState(initDrillState(workspace));
        }
      }).catch(() => setDrillState(initDrillState(workspace)));
    } else {
      setDrillState(initDrillState(workspace));
    }
  }, [id, myRole]);

  // Load geography data when the map level changes
  useEffect(() => {
    if (!workspace || !drillState) return;

    const loadId = ++loadIdRef.current;

    setGeoJson(null);
    setSummary(null);
    setLoadError(null);
    setSelectedWard(null);
    setStations(null);

    const { mapLevel, county, constituency } = drillState;

    if (mapLevel === "ward-only") {
      // Ward admins: use their tier-context ward_id; MCA workspace: use workspace.ward_id
      const wardId = wardFilter?.id ?? workspace.ward_id;
      if (!wardId) return; // wardFilter not yet loaded — effect will re-run when it arrives
      setStationsLoading(true);
      api.workspaceWardStations(workspace.id, wardId).then((d) => {
        if (loadIdRef.current !== loadId) return;
        setStations(d.stations);
        setStationsLoading(false);
      }).catch(() => {
        if (loadIdRef.current === loadId) setStationsLoading(false);
      });
      return;
    }

    // Determine which GeoJSON + summary to fetch
    let geoJsonPromise: Promise<GeoFeatureCollection>;
    let summaryParams: { county_id?: string; constituency_id?: string } = {};

    if (mapLevel === "national") {
      geoJsonPromise = api.allCountiesGeojson();
    } else if (mapLevel === "county" && county) {
      geoJsonPromise = api.countyGeojson(county.id);
      if (workspace.scope === "national") {
        summaryParams = { county_id: county.id };
      }
    } else if (mapLevel === "constituency" && constituency) {
      geoJsonPromise = api.constituencyGeojson(constituency.id);
      summaryParams = { constituency_id: constituency.id };
    } else {
      return;
    }

    Promise.all([
      geoJsonPromise,
      api.workspaceGeography(workspace.id, summaryParams),
    ]).then(([geo, sum]) => {
      if (loadIdRef.current !== loadId) return;
      setGeoJson(geo);
      setSummary(sum);
    }).catch((err) => {
      if (loadIdRef.current !== loadId) return;
      setLoadError(err instanceof Error ? err.message : "Failed to load geography data");
    });
  }, [workspace, drillState, wardFilter]);

  // ---- handlers ---------------------------------------------------------------

  const handleMapSelect = useCallback((itemId: string, itemName: string) => {
    if (!drillState || !workspace) return;
    const { mapLevel } = drillState;

    if (mapLevel === "national") {
      setDrillState({ mapLevel: "county", county: { id: itemId, name: itemName }, constituency: null });
    } else if (mapLevel === "county") {
      setDrillState((prev) => prev ? { ...prev, mapLevel: "constituency", constituency: { id: itemId, name: itemName } } : prev);
    } else if (mapLevel === "constituency") {
      // Ward selected — load stations without changing the map level
      const ward = { id: itemId, name: itemName };
      setSelectedWard(ward);
      setStationsLoading(true);
      setStations(null);
      api.workspaceWardStations(workspace.id, itemId).then((d) => {
        setStations(d.stations);
        setStationsLoading(false);
      }).catch(() => setStationsLoading(false));
    }
  }, [drillState]);

  function resetToEntry() {
    if (!workspace) return;
    // County-pinned officers cannot navigate above their county
    if (countyFilter) {
      setDrillState({ mapLevel: "county", county: countyFilter, constituency: null });
      return;
    }
    setDrillState(initDrillState(workspace));
  }

  function resetToCounty(county: { id: string; name: string }) {
    setDrillState({ mapLevel: "county", county, constituency: null });
  }

  function resetToConstituency(constituency: { id: string; name: string }) {
    setDrillState((prev) => prev ? { ...prev, mapLevel: "constituency", constituency } : prev);
    setSelectedWard(null);
    setStations(null);
  }

  if (!drillState) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: portal.font,
          color: portal.textSubtle,
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  if (drillState.mapLevel === "ward-only") {
    const wardName = wardFilter?.name ?? workspace.ward ?? "Ward";
    return (
      <WardOnlyContent
        workspace={workspace}
        wardName={wardName}
        stations={stations}
        stationsLoading={stationsLoading}
      />
    );
  }

  return (
    <GeographyContent
      workspace={workspace}
      myRole={myRole}
      countyFilter={countyFilter}
      constituencyFilter={constituencyFilter}
      drillState={drillState}
      selectedWard={selectedWard}
      geoJson={geoJson}
      summary={summary}
      loadError={loadError}
      search={search}
      stations={stations}
      stationsLoading={stationsLoading}
      onSearch={setSearch}
      onMapSelect={handleMapSelect}
      onBreadcrumbRoot={resetToEntry}
      onBreadcrumbCounty={resetToCounty}
      onBreadcrumbConstituency={resetToConstituency}
    />
  );
}

// ---- content ----------------------------------------------------------------

interface ContentProps {
  workspace: Workspace;
  myRole: string;
  countyFilter: { id: string; name: string } | null;
  constituencyFilter: { id: string; name: string } | null;
  drillState: DrillState;
  selectedWard: { id: string; name: string } | null;
  geoJson: GeoFeatureCollection | null;
  summary: WorkspaceGeoSummary | null;
  loadError: string | null;
  search: string;
  stations: Station[] | null;
  stationsLoading: boolean;
  onSearch: (v: string) => void;
  onMapSelect: (id: string, name: string) => void;
  onBreadcrumbRoot: () => void;
  onBreadcrumbCounty: (c: { id: string; name: string }) => void;
  onBreadcrumbConstituency: (c: { id: string; name: string }) => void;
}

function GeographyContent({
  workspace,
  myRole,
  countyFilter,
  constituencyFilter,
  drillState,
  selectedWard,
  geoJson,
  summary,
  loadError,
  search,
  stations,
  stationsLoading,
  onSearch,
  onMapSelect,
  onBreadcrumbRoot,
  onBreadcrumbCounty,
  onBreadcrumbConstituency,
}: ContentProps) {
  const { mapLevel, county, constituency } = drillState;
  const [listCollapsed, setListCollapsed] = useState(false);

  // Officers pinned to a geo scope cannot navigate upward past their scope
  const isCountyPinned = myRole === 'county' && !!countyFilter;
  const isConstituencyPinned = myRole === 'constituency' && !!constituencyFilter;

  // Breadcrumb
  const breadcrumb = useMemo(() => {
    const parts: Array<{ label: string; onClick?: () => void }> = [];

    if (workspace.scope === "national") {
      if (!isCountyPinned) {
        parts.push({ label: "All counties", onClick: county ? onBreadcrumbRoot : undefined });
      }
      if (county) {
        parts.push({
          label: county.name + " County",
          onClick: constituency ? () => onBreadcrumbCounty(county) : undefined,
        });
      }
    } else if (workspace.scope === "county" && workspace.county) {
      parts.push({
        label: workspace.county + " County",
        // Constituency officers cannot navigate back up to county level
        onClick: constituency && !isConstituencyPinned ? onBreadcrumbRoot : undefined,
      });
    } else if (workspace.scope === "constituency" && workspace.constituency) {
      parts.push({ label: workspace.constituency });
    }

    if (constituency && mapLevel === "constituency") {
      parts.push({
        label: constituency.name,
        onClick: selectedWard ? () => onBreadcrumbConstituency(constituency) : undefined,
      });
    }

    if (selectedWard) {
      parts.push({ label: selectedWard.name });
    }

    return parts;
  }, [workspace, mapLevel, county, constituency, selectedWard, isConstituencyPinned, onBreadcrumbRoot, onBreadcrumbCounty, onBreadcrumbConstituency]);

  // Subtitle text
  const subtitle = useMemo(() => {
    if (mapLevel === "national" && !county) return "Agent and volunteer coverage across all 47 counties.";
    if (mapLevel === "national" && county && !constituency) return `Constituency boundaries within ${county.name} County.`;
    if (mapLevel === "national" && constituency) return `Ward boundaries within ${constituency.name}.`;
    if (mapLevel === "county" && !constituency) return `Agent and volunteer coverage across ${workspace.county ?? ""} County — the workspace's scope.`;
    if (mapLevel === "county" && constituency) return `Ward boundaries within ${constituency.name}.`;
    if (mapLevel === "constituency") return constituency ? `Ward boundaries within ${constituency.name}.` : "";
    return "";
  }, [mapLevel, county, constituency, workspace]);

  // Stats panel data: use selected ward > selected constituency > totals
  const statsSource = useMemo(() => {
    if (selectedWard && summary) {
      const ward = summary.items.find((i) => i.id === selectedWard.id);
      if (ward) return { item: ward, title: ward.name, levelTag: `Ward · ${constituency?.name ?? ""}` };
    }
    if (summary) {
      const regionName =
        mapLevel === "national" && !county ? "All counties" :
        mapLevel === "national" && county && !constituency ? county.name + " County" :
        constituency?.name ?? workspace.constituency ?? workspace.county ?? "";
      const levelTag =
        mapLevel === "national" && !county ? "National · 47 counties" :
        mapLevel === "county" ? `County · ${workspace.county ?? ""}` :
        `Constituency · ${workspace.county ?? ""} County`;
      return { item: { ...summary.totals, id: "", name: regionName }, title: regionName, levelTag };
    }
    return null;
  }, [selectedWard, summary, mapLevel, county, constituency, workspace]);

  // Filtered + sorted list
  const listItems = useMemo(() => {
    const q = search.toLowerCase();
    return (summary?.items ?? [])
      .filter((i) => i.name.toLowerCase().includes(q))
      .sort((a, b) => b.coverage_pct - a.coverage_pct);
  }, [summary, search]);

  const listHeader =
    mapLevel === "national" ? `Counties · ${summary?.items.length ?? "…"}` :
    mapLevel === "county" ? `Constituencies · ${summary?.items.length ?? "…"}` :
    `Wards · ${summary?.items.length ?? "…"}`;

  return (
    <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>

      {/* Breadcrumb */}
      <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        {breadcrumb.map((b, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <span style={{ color: portal.neutralHover }}>/</span>}
            <span
              onClick={b.onClick}
              style={{
                cursor: b.onClick ? "pointer" : "default",
                color: b.onClick ? portal.brandText : portal.ink,
                fontWeight: 600,
              }}
            >
              {b.label}
            </span>
          </span>
        ))}
      </div>

      {/* Title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Geography</div>
        <div style={{ fontSize: 14, color: portal.textSubtle }}>{subtitle}</div>
      </div>

      {loadError && (
        <div style={{ padding: "10px 14px", background: "#FFECEB", color: "#AE2A19", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
          {loadError}
        </div>
      )}

      {/* List (left, collapsible) · Map (centre, grows) · Stats (right) */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>

        {/* ---- Left: collapsible list ---- */}
        {listCollapsed ? (
          /* Collapsed: just a narrow expand button */
          <button
            onClick={() => setListCollapsed(false)}
            title="Show list"
            style={{
              flexShrink: 0, width: 28, alignSelf: "stretch",
              border: `1px solid ${portal.border}`, borderRadius: 8,
              background: portal.canvas, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: portal.textSubtle, fontSize: 13, padding: 0,
              fontFamily: "inherit",
            }}
          >
            ›
          </button>
        ) : (
          <div style={{
            flexShrink: 0, width: 236,
            border: `1px solid ${portal.border}`, borderRadius: 8, overflow: "hidden",
          }}>
            {/* Header with collapse button */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "8px 10px 8px 14px",
              borderBottom: `1px solid ${portal.border}`, background: portal.canvasSubtle,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase", color: portal.textSubtle }}>
                {listHeader}
              </span>
              <button
                onClick={() => setListCollapsed(true)}
                title="Collapse list"
                style={{
                  width: 24, height: 24, border: `1px solid ${portal.border}`, borderRadius: 6,
                  background: portal.canvas, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: portal.textSubtle, fontSize: 13, padding: 0, flexShrink: 0,
                  fontFamily: "inherit",
                }}
              >
                ‹
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: "8px 10px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
              <input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Filter…"
                style={{
                  width: "100%", height: 28, boxSizing: "border-box",
                  border: `1px solid ${portal.border}`, borderRadius: 6,
                  padding: "0 8px", fontSize: 13, background: portal.canvas,
                  color: portal.ink, fontFamily: "inherit",
                }}
              />
            </div>

            {/* Items */}
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {!summary && !loadError && (
                <div style={{ padding: "12px 14px", fontSize: 13, color: portal.textSubtle }}>Loading…</div>
              )}
              {listItems.map((item) => {
                const active = item.id === selectedWard?.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => onMapSelect(item.id, item.name)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "9px 14px", borderBottom: `1px solid ${portal.borderSubtle}`,
                      cursor: "pointer",
                      background: active ? portal.brandSubtlest : "transparent",
                    }}
                    onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = portal.canvasSubtle; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = active ? portal.brandSubtlest : "transparent"; }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: coverageColor(item.coverage_pct), flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: coverageColor(item.coverage_pct) }}>
                      {item.coverage_pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- Centre: map ---- */}
        <div style={{
          flex: 1, minWidth: 0,
          border: `1px solid ${portal.border}`, borderRadius: 8,
          padding: 12, position: "relative", background: portal.canvasSubtle,
        }}>
          {geoJson ? (
            <GeoMap
              geoJson={geoJson}
              items={summary?.items ?? []}
              selectedId={selectedWard?.id ?? null}
              onSelect={onMapSelect}
            />
          ) : (
            <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: portal.textSubtle, fontSize: 13 }}>
              {loadError ? "Map unavailable" : "Loading map…"}
            </div>
          )}
          {/* Legend */}
          <div style={{
            position: "absolute", bottom: 16, left: 16,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 11, color: portal.textSubtle,
            background: "rgba(255,255,255,0.9)", padding: "4px 8px", borderRadius: 6,
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: portal.textSubtle }}>Low</span>
              <span style={{ width: 80, height: 8, borderRadius: 4, background: "linear-gradient(to right, rgb(220,238,244), rgb(30,95,115))" }} />
              <span style={{ fontSize: 10, color: portal.textSubtle }}>High coverage</span>
            </span>
          </div>
        </div>

        {/* ---- Right: stats ---- */}
        {statsSource && (
          <StatsPanel
            title={statsSource.title}
            levelTag={statsSource.levelTag}
            totalStations={statsSource.item.total_stations}
            coveredStations={statsSource.item.covered_stations}
            coveragePct={statsSource.item.coverage_pct}
          />
        )}
      </div>

      {/* Stations grid (when ward selected) */}
      {selectedWard && (
        <div style={{ marginTop: 20 }}>
          <StationsGrid
            wardName={selectedWard.name}
            stations={stations}
            loading={stationsLoading}
          />
        </div>
      )}
    </div>
  );
}

// ---- stats panel ------------------------------------------------------------

function StatsPanel({
  title, levelTag, totalStations, coveredStations, coveragePct,
}: {
  title: string;
  levelTag: string;
  totalStations: number;
  coveredStations: number;
  coveragePct: number;
}) {
  const gap = totalStations - coveredStations;
  const color = coverageColor(coveragePct);
  return (
    <div style={{
      flexShrink: 0, width: 240,
      border: `1px solid ${portal.border}`, borderRadius: 8, padding: 16,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: portal.textSubtle, marginBottom: 2 }}>
        {levelTag}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color }}>{coveragePct}%</span>
        <span style={{ fontSize: 12, color: portal.textSubtle }}>agent coverage</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: portal.neutral, overflow: "hidden", marginBottom: 14 }}>
        <div style={{ height: "100%", width: `${coveragePct}%`, background: color }} />
      </div>
      {[
        { label: "Polling stations", value: fmt(totalStations) },
        { label: "Confirmed agents", value: fmt(coveredStations), sub: totalStations > 0 ? `${Math.round(coveredStations / totalStations * 100)}% of stations` : undefined, color: "#216E4E" },
        { label: "Volunteers", value: "—" },
        { label: "Bench (reserve agents)", value: "—", sub: "Swappable into any gap below" },
      ].map((s) => (
        <div key={s.label} style={{ padding: "10px 0", borderBottom: `1px solid ${portal.borderSubtle}` }}>
          <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 2 }}>{s.label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: s.color ?? portal.ink }}>{s.value}</div>
          {s.sub && <div style={{ fontSize: 11, color: portal.textSubtle, marginTop: 1 }}>{s.sub}</div>}
        </div>
      ))}
      {gap > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "10px 12px", borderRadius: 8,
          background: "#FFECEB", color: "#AE2A19",
          fontSize: 12, lineHeight: "17px", marginTop: 6,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#C9372C", marginTop: 5, flexShrink: 0 }} />
          <span>{fmt(gap)} stations still uncovered here.</span>
        </div>
      )}
    </div>
  );
}

// ---- stations grid ----------------------------------------------------------

type StationState = "full" | "partial" | "gap";

const TAG_STYLE: Record<StationState, React.CSSProperties> = {
  full: { background: "#F1F2F4", color: portal.textSubtle },
  partial: { background: "#FFF7D6", color: "#974F0C" },
  gap: { background: "#FFECEB", color: "#AE2A19" },
};
const TAG_TEXT: Record<StationState, string> = {
  full: "Covered", partial: "Partial", gap: "No agent",
};

function StationsGrid({
  wardName, stations, loading,
}: {
  wardName: string;
  stations: Station[] | null;
  loading: boolean;
}) {
  return (
    <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px", borderBottom: `1px solid ${portal.border}`,
        background: portal.canvasSubtle,
      }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Polling stations in {wardName}</div>
      </div>
      {loading && (
        <div style={{ padding: 16, fontSize: 13, color: portal.textSubtle }}>Loading stations…</div>
      )}
      {!loading && stations && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {stations.map((s) => {
            const state: StationState = s.agent ? "full" : "gap";
            return (
              <div key={s.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px",
                borderBottom: `1px solid ${portal.borderSubtle}`,
                borderRight: `1px solid ${portal.borderSubtle}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}{s.stream_number != null ? ` · stream ${s.stream_number}` : ""}
                  </div>
                  <div style={{ fontSize: 11, color: portal.textSubtle }}>
                    {s.code ?? "—"}{s.agent ? ` · ${s.agent}` : ""}
                  </div>
                </div>
                <span style={{
                  display: "inline-flex", alignItems: "center", height: 20,
                  padding: "0 8px", borderRadius: 3, fontSize: 11, fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap",
                  ...TAG_STYLE[state],
                }}>
                  {TAG_TEXT[state]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- ward-only view (MCA scope) ---------------------------------------------

function WardOnlyContent({
  workspace, wardName, stations, stationsLoading,
}: {
  workspace: Workspace;
  wardName: string;
  stations: Station[] | null;
  stationsLoading: boolean;
}) {
  const consName = workspace.constituency ?? "";
  const countyName = workspace.county ? `${workspace.county} County` : "";

  const totalStations = stations?.length ?? 0;
  const coveredStations = stations?.filter((s) => s.agent).length ?? 0;
  const coveragePct = totalStations > 0 ? Math.round((coveredStations / totalStations) * 100) : 0;

  return (
    <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
      <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
        {[countyName, consName, wardName].filter(Boolean).join(" / ")}
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Geography</div>
        <div style={{ fontSize: 14, color: portal.textSubtle }}>{wardName} Ward</div>
      </div>

      {/* Stats + grid side by side */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        {stations && (
          <StatsPanel
            title={wardName}
            levelTag="Ward"
            totalStations={totalStations}
            coveredStations={coveredStations}
            coveragePct={coveragePct}
          />
        )}
        <div style={{ flex: 1, minWidth: 280 }}>
          <StationsGrid wardName={wardName} stations={stations} loading={stationsLoading} />
        </div>
      </div>
    </div>
  );
}

// ---- helpers ----------------------------------------------------------------

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
