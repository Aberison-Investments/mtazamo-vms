// Palette for the aspirant Account & Workspace portal, lifted from the
// "Atlassian-style (Teal)" design system shipped with the aspirant portal
// design zip (tokens.json). The workspace interior (Geography) keeps its own
// dark-teal palette in theme.ts.
export const portal = {
  brand: "#599BAE",
  brandHover: "#487E8C",
  brandPressed: "#386271",
  brandSubtlest: "#EEF6F8",
  brandText: "#386271",

  ink: "#172B4D",
  textSubtle: "#626F86",
  textSubtlest: "#8590A2",
  label: "#44546F",
  inverse: "#FFFFFF",

  canvas: "#FFFFFF",
  canvasSubtle: "#F7F8F9",
  neutral: "#F1F2F4",
  neutralHover: "#DCDFE4",

  border: "#DCDFE4",
  borderSubtle: "#F1F2F4",

  dangerText: "#BF2600",
  dangerBg: "#FFEBE6",
  successText: "#164B35",
  successBg: "#E3FCEF",
  successBold: "#1F845A",
  warnText: "#7F5F01",
  warnBg: "#FFF7D6",
  warnBold: "#FFAB00",

  avatarDark: "#294854",

  brandBorder: "#599BAE",

  font: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
  cardShadow: "0 1px 1px rgba(9,30,66,0.25),0 0 1px rgba(9,30,66,0.31)",
  modalShadow: "0 8px 12px rgba(9,30,66,0.15),0 0 1px rgba(9,30,66,0.31)",
} as const;

// Seat and segment catalogues mirror the design's Create-workspace script.
// `scope` drives how deep the geography selection cascades when creating a
// workspace: national (none) → county → constituency → ward.
export type Scope = "national" | "county" | "constituency" | "ward";

export interface SeatDef {
  id: string;
  label: string;
  desc: string;
  scope: Scope;
}

export const SEATS: SeatDef[] = [
  { id: "president", label: "President", desc: "National race · Forms 34A/34B/34C", scope: "national" },
  { id: "governor", label: "Governor", desc: "County-wide · Forms 37A/37B/37C", scope: "county" },
  { id: "senator", label: "Senator", desc: "County-wide · Forms 38A/38B/38C", scope: "county" },
  { id: "mp", label: "Member of Parliament", desc: "Constituency · Forms 35A/35B", scope: "constituency" },
  { id: "mca", label: "Member of County Assembly", desc: "Ward · Forms 36A/36B", scope: "ward" },
];

export const SEGMENTS = [
  { id: "primary", label: "Party primary", desc: "Party tally sheets on a configurable template" },
  { id: "general", label: "General election", desc: "Statutory IEBC forms, election day" },
];

export const seatLabel = (id: string) => SEATS.find((s) => s.id === id)?.label ?? id;
export const segmentLabel = (id: string) =>
  SEGMENTS.find((s) => s.id === id)?.label ?? id;
export const seatScope = (id: string): Scope =>
  SEATS.find((s) => s.id === id)?.scope ?? "county";

// The levels a scope needs, from broad to narrow.
export const scopeLevels = (scope: Scope): Array<"county" | "constituency" | "ward"> => {
  switch (scope) {
    case "national":
      return [];
    case "county":
      return ["county"];
    case "constituency":
      return ["county", "constituency"];
    case "ward":
      return ["county", "constituency", "ward"];
  }
};

// One-line human label for a workspace's geography scope, narrowest first.
export function geoScopeLabel(w: {
  scope: string;
  county: string | null;
  constituency: string | null;
  ward: string | null;
}): string {
  switch (w.scope) {
    case "national":
      return "All 47 counties";
    case "ward":
      return [w.ward, w.constituency, w.county && `${w.county} County`].filter(Boolean).join(" · ");
    case "constituency":
      return [w.constituency, w.county && `${w.county} County`].filter(Boolean).join(" · ");
    default:
      return w.county ? `${w.county} County` : "—";
  }
}
