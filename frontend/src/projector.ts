/**
 * Minimal Web-Mercator projection + SVG path builder for rendering GeoJSON
 * polygons as an SVG choropleth (no map tiles, no external deps). Fits the given
 * features to a viewport, preserving aspect ratio. Good enough for a
 * country-scale choropleth of Kenya.
 */

type Ring = number[][]; // [lng, lat][]
type PolyCoords = Ring[]; // Polygon: [ring, ...holes]
type MultiCoords = PolyCoords[]; // MultiPolygon

export interface ProjFeature {
  geometry: { type: string; coordinates: unknown };
  properties: { id: string; name: string; [k: string]: unknown };
}

// Spherical Mercator, in radians. BOTH axes must share the same units, otherwise
// the map is squashed: x is longitude in radians, y is the Mercator latitude
// term (also radian-scaled). Using raw degrees for x while y is radian-scaled
// made spanX (~8) dwarf spanY (~0.18) for Kenya, collapsing it to a flat line.
function mercX(lng: number): number {
  return (lng * Math.PI) / 180;
}

function mercY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  return Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360));
}

function polygonsOf(geometry: ProjFeature['geometry']): PolyCoords[] {
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as MultiCoords;
  if (geometry.type === 'Polygon') return [geometry.coordinates as PolyCoords];
  return [];
}

export interface Projector {
  pathFor: (f: ProjFeature) => string;
  centroidFor: (f: ProjFeature) => [number, number];
}

export function makeProjector(features: ProjFeature[], width: number, height: number, pad = 14): Projector {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const f of features) {
    for (const poly of polygonsOf(f.geometry)) {
      for (const ring of poly) {
        for (const [lng, lat] of ring) {
          const x = mercX(lng);
          const y = mercY(lat);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const usedW = spanX * scale;
  const usedH = spanY * scale;
  const offsetX = pad + (width - 2 * pad - usedW) / 2;
  const offsetY = pad + (height - 2 * pad - usedH) / 2;

  const px = (lng: number) => offsetX + (mercX(lng) - minX) * scale;
  const py = (lat: number) => offsetY + (maxY - mercY(lat)) * scale; // invert y

  const pathFor = (f: ProjFeature): string => {
    let d = '';
    for (const poly of polygonsOf(f.geometry)) {
      for (const ring of poly) {
        ring.forEach(([lng, lat], i) => {
          d += (i === 0 ? 'M' : 'L') + px(lng).toFixed(1) + ',' + py(lat).toFixed(1);
        });
        d += 'Z';
      }
    }
    return d;
  };

  const centroidFor = (f: ProjFeature): [number, number] => {
    // Use the largest ring (by vertex count) and average its projected points.
    let best: Ring | null = null;
    for (const poly of polygonsOf(f.geometry)) {
      const ring = poly[0];
      if (ring && (!best || ring.length > best.length)) best = ring;
    }
    if (!best) return [width / 2, height / 2];
    let sx = 0, sy = 0;
    for (const [lng, lat] of best) {
      sx += px(lng);
      sy += py(lat);
    }
    return [sx / best.length, sy / best.length];
  };

  return { pathFor, centroidFor };
}
