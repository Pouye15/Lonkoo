/**
 * Moteur de rendu image par image de la séquence LONKOO.
 *
 * Chaque image est une fonction pure de son index (0 à 239) : le même index
 * produit toujours la même image, ce qui permet au scroll d'avancer et de
 * rembobiner la séquence avec une précision au dixième d'image, sans vidéo
 * ni sprite à télécharger.
 *
 * Chapitres
 *   0   à  60  Modéliser : le schéma se dessine, curseurs collaboratifs
 *   60  à 125  Valider   : balayage Nianthio, point de défaillance, réplique
 *   125 à 185  Générer   : bascule isométrique, extrusion, fichiers générés
 *   185 à 240  Déployer  : le système rejoint Dakar et irrigue le continent
 */

export const SCENE_W = 1600;
export const SCENE_H = 900;
export const TOTAL_FRAMES = 240;

export const CHAPTER_BOUNDS = [0, 60, 125, 185, 240] as const;

export interface FrameFonts {
  sans: string;
  mono: string;
}

export interface FrameViewport {
  width: number; // pixels CSS
  height: number; // pixels CSS
  dpr: number;
}

/* ------------------------------------------------------------------ */
/* Outils                                                              */
/* ------------------------------------------------------------------ */

const COLORS = {
  bg: [6, 24, 38],
  deep: [4, 17, 29],
  side: [9, 36, 62],
  brand: [18, 101, 221],
  brandSoft: [91, 155, 245],
  ice: [184, 250, 255],
  mint: [166, 245, 192],
  mist: [231, 242, 247],
  amber: [251, 133, 0],
  muted: [142, 163, 181],
} as const;

type ColorKey = keyof typeof COLORS;

const rgba = (key: ColorKey, a: number): string => {
  const c = COLORS[key];
  return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const frac = (v: number) => v - Math.floor(v);

/** Matrice affine au format canvas [a, b, c, d, e, f]. */
type Mat = readonly [number, number, number, number, number, number];

const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const scale = (sx: number, sy: number = sx): Mat => [sx, 0, 0, sy, 0, 0];
const rotate = (a: number): Mat => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, s, -s, c, 0, 0];
};
const apply = (m: Mat, x: number, y: number): readonly [number, number] => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
const setT = (ctx: CanvasRenderingContext2D, m: Mat) =>
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);

/* ------------------------------------------------------------------ */
/* Données de la scène                                                 */
/* ------------------------------------------------------------------ */

const NODE_W = 216;
const NODE_H = 80;
const NODE_R = 16;
const NODE_PERIMETER = 2 * (NODE_W + NODE_H) - (8 - 2 * Math.PI) * NODE_R;

interface SceneNode {
  id: string;
  label: string;
  tech: string;
  file: string;
  x: number;
  y: number;
  appear: number;
}

const NODES: readonly SceneNode[] = [
  { id: "users", label: "Clients mobiles", tech: "Android et USSD", file: "openapi.yaml", x: 200, y: 450, appear: 2 },
  { id: "gateway", label: "Passerelle API", tech: "Kong 3.6", file: "kong.yml", x: 520, y: 450, appear: 8 },
  { id: "payments", label: "Service paiements", tech: "Go 1.23", file: "Dockerfile", x: 840, y: 290, appear: 14 },
  { id: "auth", label: "Authentification", tech: "Keycloak 25", file: "realm.json", x: 840, y: 610, appear: 20 },
  { id: "queue", label: "File de messages", tech: "Redis Streams", file: "compose.yml", x: 1160, y: 290, appear: 26 },
  { id: "db", label: "Base de données", tech: "PostgreSQL 16", file: "main.tf", x: 1160, y: 610, appear: 32 },
];

const REPLICA = { label: "Réplique synchrone", tech: "PostgreSQL 16", file: "replica.tf", x: 1420, y: 610 };

const NODE_BY_ID: ReadonlyMap<string, SceneNode> = new Map(NODES.map((n) => [n.id, n]));

const EDGES = [
  { from: "users", to: "gateway", appear: 10 },
  { from: "gateway", to: "payments", appear: 16 },
  { from: "gateway", to: "auth", appear: 22 },
  { from: "payments", to: "queue", appear: 28 },
  { from: "payments", to: "db", appear: 34 },
  { from: "auth", to: "db", appear: 40 },
] as const;

const GRAPH_CENTER = { x: 810, y: 450 };

/* Carte de l'Afrique, projection équirectangulaire */
const MAP_K = 11;
const MAP_X0 = 400;
const MAP_Y0 = 46;
const mapX = (lon: number) => MAP_X0 + (lon + 20) * MAP_K;
const mapY = (lat: number) => MAP_Y0 + (38 - lat) * MAP_K;
const DAKAR = { x: mapX(-17.44), y: mapY(14.69) };

const AFRICA: ReadonlyArray<readonly [number, number]> = [
  [-5.9, 35.8], [-1.0, 35.1], [3.0, 36.8], [10.2, 37.2], [11.1, 33.2], [15.2, 32.3],
  [20.1, 32.1], [25.0, 31.6], [29.9, 31.2], [32.3, 31.3], [32.6, 29.9], [35.0, 24.0],
  [37.2, 19.6], [39.5, 15.6], [43.3, 12.5], [43.1, 11.6], [51.2, 11.8], [48.0, 4.5],
  [45.3, 2.0], [42.5, -0.4], [40.0, -3.3], [39.3, -6.8], [40.4, -10.5], [40.7, -14.5],
  [36.9, -17.9], [35.3, -22.0], [32.9, -25.9], [31.0, -29.9], [27.9, -33.0], [25.6, -34.0],
  [20.0, -34.8], [18.4, -34.0], [17.0, -29.0], [15.2, -26.6], [14.5, -22.9], [11.8, -17.2],
  [12.0, -15.2], [13.2, -8.8], [12.2, -6.0], [9.4, 0.4], [9.7, 4.0], [8.3, 4.5],
  [6.0, 4.3], [3.4, 6.4], [-0.2, 5.5], [-4.0, 5.2], [-7.5, 4.4], [-10.8, 6.3],
  [-13.2, 8.5], [-15.0, 10.8], [-16.5, 12.0], [-17.5, 14.7], [-16.0, 18.1], [-17.0, 21.0],
  [-14.5, 26.1], [-13.2, 27.6], [-9.8, 29.9], [-9.6, 32.3], [-7.6, 33.6], [-6.8, 34.0],
];

const MADAGASCAR: ReadonlyArray<readonly [number, number]> = [
  [49.3, -12.0], [50.5, -15.6], [49.4, -18.5], [47.1, -25.0], [45.0, -25.5],
  [43.5, -22.5], [44.3, -16.5], [46.3, -15.7], [48.0, -13.5],
];

const CITIES = [
  { name: "Bamako", lon: -8.0, lat: 12.6, ms: "16 ms" },
  { name: "Abidjan", lon: -4.0, lat: 5.35, ms: "18 ms" },
  { name: "Lagos", lon: 3.4, lat: 6.5, ms: "24 ms" },
  { name: "Casablanca", lon: -7.6, lat: 33.6, ms: "39 ms" },
  { name: "Kinshasa", lon: 15.3, lat: -4.3, ms: "47 ms" },
  { name: "Nairobi", lon: 36.8, lat: -1.3, ms: "68 ms" },
  { name: "Johannesburg", lon: 28.0, lat: -26.2, ms: "86 ms" },
] as const;

function inPolygon(lon: number, lat: number, poly: ReadonlyArray<readonly [number, number]>) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (!pi || !pj) continue;
    const intersect =
      pi[1] > lat !== pj[1] > lat &&
      lon < ((pj[0] - pi[0]) * (lat - pi[1])) / (pj[1] - pi[1]) + pi[0];
    if (intersect) inside = !inside;
  }
  return inside;
}

interface MapDot {
  x: number;
  y: number;
  d: number;
}

let mapDotsCache: MapDot[] | null = null;
function getMapDots(): MapDot[] {
  if (mapDotsCache) return mapDotsCache;
  const dots: MapDot[] = [];
  const step = 1.35;
  let row = 0;
  for (let lat = 37.5; lat >= -35.5; lat -= step, row++) {
    const shift = row % 2 === 0 ? 0 : step / 2;
    for (let lon = -18.5 + shift; lon <= 52; lon += step) {
      if (inPolygon(lon, lat, AFRICA) || inPolygon(lon, lat, MADAGASCAR)) {
        const x = mapX(lon);
        const y = mapY(lat);
        dots.push({ x, y, d: Math.hypot(x - DAKAR.x, y - DAKAR.y) });
      }
    }
  }
  mapDotsCache = dots;
  return dots;
}

/* ------------------------------------------------------------------ */
/* Géométrie des liaisons                                              */
/* ------------------------------------------------------------------ */

interface Curve {
  x1: number; y1: number;
  c1x: number; c1y: number;
  c2x: number; c2y: number;
  x2: number; y2: number;
  length: number;
}

function makeCurve(x1: number, y1: number, x2: number, y2: number): Curve {
  const dx = (x2 - x1) * 0.5;
  const curve: Curve = { x1, y1, c1x: x1 + dx, c1y: y1, c2x: x2 - dx, c2y: y2, x2, y2, length: 0 };
  let len = 0;
  let [px, py] = [x1, y1];
  for (let i = 1; i <= 24; i++) {
    const [qx, qy] = pointOnCurve(curve, i / 24);
    len += Math.hypot(qx - px, qy - py);
    px = qx;
    py = qy;
  }
  curve.length = len;
  return curve;
}

function pointOnCurve(c: Curve, t: number): readonly [number, number] {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return [
    a * c.x1 + b * c.c1x + d * c.c2x + e * c.x2,
    a * c.y1 + b * c.c1y + d * c.c2y + e * c.y2,
  ];
}

const EDGE_CURVES: ReadonlyArray<{ curve: Curve; from: SceneNode; to: SceneNode; appear: number }> =
  EDGES.flatMap((e) => {
    const from = NODE_BY_ID.get(e.from);
    const to = NODE_BY_ID.get(e.to);
    if (!from || !to) return [];
    return [{
      from,
      to,
      appear: e.appear,
      curve: makeCurve(from.x + NODE_W / 2, from.y, to.x - NODE_W / 2, to.y),
    }];
  });

/* ------------------------------------------------------------------ */
/* Caméra                                                              */
/* ------------------------------------------------------------------ */

const CAMERA_KEYS: ReadonlyArray<readonly [number, number]> = [
  [0, 720], [60, 800], [86, 1080], [118, 1160], [150, 810], [200, 600], [239, 800],
];

function cameraFocus(f: number) {
  for (let i = 0; i < CAMERA_KEYS.length - 1; i++) {
    const a = CAMERA_KEYS[i];
    const b = CAMERA_KEYS[i + 1];
    if (!a || !b) continue;
    if (f <= b[0]) return lerp(a[1], b[1], easeInOut(seg(f, a[0], b[0])));
  }
  return CAMERA_KEYS[CAMERA_KEYS.length - 1]?.[1] ?? SCENE_W / 2;
}

/* ------------------------------------------------------------------ */
/* Valeurs exposées à l'interface                                      */
/* ------------------------------------------------------------------ */

export function chapterAt(frame: number): number {
  for (let i = CHAPTER_BOUNDS.length - 2; i >= 0; i--) {
    const start = CHAPTER_BOUNDS[i];
    if (start !== undefined && frame >= start) return i;
  }
  return 0;
}

export function chapterProgress(frame: number, chapter: number): number {
  const a = CHAPTER_BOUNDS[chapter] ?? 0;
  const b = CHAPTER_BOUNDS[chapter + 1] ?? TOTAL_FRAMES;
  return seg(frame, a, b);
}

export function resilienceAt(frame: number): number {
  return Math.round(71 + 25 * easeInOut(seg(frame, 104, 118)));
}

/* ------------------------------------------------------------------ */
/* Rendu                                                               */
/* ------------------------------------------------------------------ */

const scanX = (f: number) => lerp(40, 1580, easeInOut(seg(f, 66, 98)));

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  family: string,
  size: number,
  maxWidth: number,
) {
  ctx.font = `${weight} ${size}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w > maxWidth) {
    ctx.font = `${weight} ${(size * maxWidth) / w}px ${family}`;
  }
}

function pill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  family: string,
  size: number,
  stroke: ColorKey,
  textColor: ColorKey,
  alpha: number,
) {
  if (alpha <= 0.01) return;
  ctx.font = `500 ${size}px ${family}`;
  const w = ctx.measureText(text).width + size * 1.8;
  const h = size * 2.1;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = rgba("bg", 0.92);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba(stroke, 0.6);
  ctx.stroke();
  ctx.fillStyle = rgba(textColor, 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
  ctx.globalAlpha = 1;
}

function drawCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  color: ColorKey,
  family: string,
  size: number,
  alpha: number,
) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 20);
  ctx.lineTo(x + 5.5, y + 14.5);
  ctx.lineTo(x + 10, y + 23);
  ctx.lineTo(x + 13.5, y + 21.5);
  ctx.lineTo(x + 9, y + 13);
  ctx.lineTo(x + 16.5, y + 13);
  ctx.closePath();
  ctx.fillStyle = rgba(color, 1);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = rgba("bg", 1);
  ctx.stroke();

  ctx.font = `600 ${size}px ${family}`;
  const w = ctx.measureText(name).width + size * 1.4;
  const h = size * 1.9;
  ctx.beginPath();
  ctx.roundRect(x + 14, y + 22, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = color === "amber" ? rgba("bg", 1) : rgba("mist", 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(name, x + 14 + size * 0.7, y + 22 + h / 2 + 0.5);
  ctx.globalAlpha = 1;
}

function pathPoint(points: ReadonlyArray<readonly [number, number]>, t: number) {
  const n = points.length - 1;
  const pos = clamp01(t) * n;
  const i = Math.min(n - 1, Math.floor(pos));
  const a = points[i];
  const b = points[i + 1];
  if (!a || !b) return points[0] ?? ([0, 0] as const);
  const local = easeInOut(pos - i);
  return [lerp(a[0], b[0], local), lerp(a[1], b[1], local)] as const;
}

const AMINATA_PATH = NODES.map((n) => [n.x + 60, n.y + 26] as const);
const KOFFI_PATH: ReadonlyArray<readonly [number, number]> = [
  [380, 520], [690, 400], [700, 560], [1000, 300], [1010, 520], [1050, 680],
];

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  frame: number,
  vp: FrameViewport,
  fonts: FrameFonts,
  options: { transparent?: boolean } = {},
): void {
  const f = Math.max(0, Math.min(TOTAL_FRAMES - 1, frame));
  const { width: cw, height: ch, dpr } = vp;

  /* Fond : transparent pour laisser apparaître la vidéo de l'arrière-plan */
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.setLineDash([]);
  if (options.transparent) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!options.transparent) {
    ctx.fillStyle = rgba("bg", 1);
    ctx.fillRect(0, 0, cw, ch);
  }

  /* Caméra : la scène agrandie pour plus d'impact visuel */
  let fit = Math.min(cw / 1360, ch / 770);
  if (cw < 900) fit = Math.max(fit, cw / 1040);
  const sceneWpx = SCENE_W * fit;
  let ox: number;
  if (sceneWpx <= cw) {
    ox = (cw - sceneWpx) / 2;
  } else {
    ox = cw / 2 - cameraFocus(f) * fit;
    ox = Math.min(0, Math.max(cw - sceneWpx, ox));
  }
  const oy = (ch - SCENE_H * fit) / 2;
  const base: Mat = [fit * dpr, 0, 0, fit * dpr, ox * dpr, oy * dpr];
  const minText = (px: number) => Math.max(px, (px * 0.62) / fit);

  /* Transformation du graphe : plat, puis isométrique, puis rétréci vers Dakar */
  const isoT = easeInOut(seg(f, 127, 152));
  const extrudeT = easeOut(seg(f, 140, 164));
  const shrinkT = easeInOut(seg(f, 186, 208));
  const graphAlpha = 1 - seg(f, 198, 210);
  const k = (1 - 0.2 * isoT) * lerp(1, 0.05, shrinkT);
  const G: Mat = mul(
    translate(lerp(GRAPH_CENTER.x, DAKAR.x, shrinkT), lerp(GRAPH_CENTER.y, DAKAR.y, shrinkT)),
    mul(scale(k), mul(scale(1, 1 - 0.423 * isoT), mul(rotate((isoT * Math.PI) / 4), translate(-GRAPH_CENTER.x, -GRAPH_CENTER.y)))),
  );
  const depth = 36 * extrudeT;

  /* Sol en grille de points, qui bascule avec le graphe */
  const gridAlpha = 0.09 * (1 - seg(f, 186, 200)) * (0.4 + 0.6 * seg(f, 0, 20));
  if (gridAlpha > 0.003) {
    setT(ctx, base);
    ctx.fillStyle = rgba("mist", 1);
    for (let gx = -240; gx <= 1860; gx += 40) {
      for (let gy = -240; gy <= 1140; gy += 40) {
        const d = Math.hypot(gx - GRAPH_CENTER.x, gy - GRAPH_CENTER.y);
        const a = gridAlpha * clamp01(1 - d / 1050);
        if (a < 0.004) continue;
        const [px, py] = apply(G, gx, gy);
        ctx.globalAlpha = a;
        ctx.fillRect(px - 1.2, py - 1.2, 2.4, 2.4);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* Balayage de l'audit Nianthio */
  const sx = scanX(f);
  const scanAlpha = seg(f, 64, 70) * (1 - seg(f, 96, 102));

  const validOf = (x: number) => clamp01((sx - (x - NODE_W / 2)) / 120);
  const db = NODE_BY_ID.get("db");
  const alert = db ? clamp01((sx - (db.x - NODE_W / 2)) / 60) * (1 - seg(f, 110, 118)) : 0;
  const replicaT = easeInOut(seg(f, 100, 116));
  const replicaAlpha = seg(f, 100, 106);
  const replicaX = db ? lerp(db.x, REPLICA.x, replicaT) : REPLICA.x;

  /* Carte de l'Afrique */
  const mapAlpha = seg(f, 188, 200);
  if (mapAlpha > 0.003) {
    setT(ctx, base);
    const radius = easeOut(seg(f, 190, 224)) * 1050;
    ctx.fillStyle = rgba("mist", 1);
    for (const dot of getMapDots()) {
      const a = 0.3 * mapAlpha * clamp01((radius - dot.d) / 90);
      if (a < 0.004) continue;
      const near = dot.d < 70;
      ctx.globalAlpha = near ? Math.min(1, a * 2.6) : a;
      ctx.fillStyle = near ? rgba("brandSoft", 1) : rgba("mist", 1);
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, near ? 2.6 : 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* Arcs vers les capitales */
    CITIES.forEach((city, i) => {
      const start = 206 + i * 2.6;
      const p = easeInOut(seg(f, start, start + 12));
      if (p <= 0) return;
      const cx = mapX(city.lon);
      const cy = mapY(city.lat);
      const dx = cx - DAKAR.x;
      const dy = cy - DAKAR.y;
      const len = Math.hypot(dx, dy);
      let nx = -dy / len;
      let ny = dx / len;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const qx = (DAKAR.x + cx) / 2 + nx * len * 0.24;
      const qy = (DAKAR.y + cy) / 2 + ny * len * 0.24;
      const at = (t: number) => {
        const u = 1 - t;
        return [u * u * DAKAR.x + 2 * u * t * qx + t * t * cx, u * u * DAKAR.y + 2 * u * t * qy + t * t * cy] as const;
      };

      ctx.beginPath();
      ctx.moveTo(DAKAR.x, DAKAR.y);
      const steps = 40;
      for (let s = 1; s <= Math.ceil(steps * p); s++) {
        const [px, py] = at(Math.min(p, s / steps));
        ctx.lineTo(px, py);
      }
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = rgba("brandSoft", 0.55 * mapAlpha);
      ctx.stroke();

      if (p >= 1) {
        const t = frac((f - start - 12) / 16);
        const [px, py] = at(t);
        ctx.fillStyle = rgba("ice", 0.9);
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const arrive = seg(f, start + 10, start + 15);
      if (arrive > 0) {
        ctx.globalAlpha = arrive;
        ctx.fillStyle = rgba("ice", 1);
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba("ice", 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.stroke();

        const nameSize = minText(13);
        ctx.font = `500 ${nameSize}px ${fonts.sans}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = rgba("mist", 0.9);
        ctx.fillText(city.name, cx + 14, cy);
        const nameW = ctx.measureText(city.name).width;
        ctx.font = `400 ${minText(12)}px ${fonts.mono}`;
        ctx.fillStyle = rgba("ice", 0.85);
        ctx.fillText(city.ms, cx + 14 + nameW + 8, cy + 0.5);
        ctx.globalAlpha = 1;
      }
    });

    /* Dakar */
    for (let r = 0; r < 3; r++) {
      const phase = frac(f / 22 + r / 3);
      ctx.strokeStyle = rgba("brandSoft", (1 - phase) * 0.55 * mapAlpha);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(DAKAR.x, DAKAR.y, 8 + phase * 52, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = rgba("ice", mapAlpha);
    ctx.beginPath();
    ctx.arc(DAKAR.x, DAKAR.y, 6, 0, Math.PI * 2);
    ctx.fill();

    const labelA = seg(f, 212, 222);
    if (labelA > 0) {
      ctx.globalAlpha = labelA;
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.font = `600 ${minText(20)}px ${fonts.sans}`;
      ctx.fillStyle = rgba("mist", 1);
      ctx.fillText("Release Git v2.4.0", DAKAR.x - 22, DAKAR.y - 4);
      ctx.font = `500 ${minText(14)}px ${fonts.mono}`;
      ctx.fillStyle = rgba("ice", 1);
      ctx.fillText("MCP · Orion Sync", DAKAR.x - 22, DAKAR.y + 18);
      ctx.globalAlpha = 1;
    }
  }

  if (graphAlpha > 0.003) {
    ctx.globalAlpha = 1;

    /* Liaisons */
    EDGE_CURVES.forEach((edge, index) => {
      const drawP = easeOut(seg(f, edge.appear, edge.appear + 12));
      if (drawP <= 0) return;
      const valid = Math.min(validOf(edge.from.x), validOf(edge.to.x));
      const edgeAlert = edge.to.id === "db" ? alert : 0;
      setT(ctx, mul(base, G));
      ctx.beginPath();
      ctx.moveTo(edge.curve.x1, edge.curve.y1);
      ctx.bezierCurveTo(edge.curve.c1x, edge.curve.c1y, edge.curve.c2x, edge.curve.c2y, edge.curve.x2, edge.curve.y2);
      ctx.lineWidth = 1.6;
      if (edgeAlert > 0.05) {
        ctx.setLineDash([7, 7]);
        ctx.lineDashOffset = -f * 1.6;
        ctx.strokeStyle = rgba("amber", 0.75 * edgeAlert * graphAlpha);
      } else {
        ctx.setLineDash([edge.curve.length * drawP, edge.curve.length]);
        ctx.lineDashOffset = 0;
        ctx.strokeStyle = valid > 0
          ? rgba("brandSoft", (0.25 + 0.4 * valid) * graphAlpha)
          : rgba("mist", 0.24 * graphAlpha);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      /* Paquets de données, position dérivée de l'index d'image */
      const packetA = seg(f, 46, 58) * drawP * graphAlpha;
      if (packetA > 0.01) {
        setT(ctx, base);
        for (let p = 0; p < 2; p++) {
          const t = frac(f / 26 + p * 0.5 + index * 0.13);
          const [lx, ly] = pointOnCurve(edge.curve, t);
          const [px, py] = apply(G, lx, ly);
          const color: ColorKey = edgeAlert > 0.5 ? "amber" : "ice";
          ctx.fillStyle = rgba(color, 0.16 * packetA);
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = rgba(color, 0.95 * packetA);
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    /* Liaison vers la réplique */
    if (db && replicaAlpha > 0) {
      const curve = makeCurve(db.x + NODE_W / 2, db.y, replicaX - NODE_W / 2, REPLICA.y);
      if (curve.x2 > curve.x1) {
        setT(ctx, mul(base, G));
        ctx.beginPath();
        ctx.moveTo(curve.x1, curve.y1);
        ctx.lineTo(curve.x2, curve.y2);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = rgba("mint", 0.7 * replicaAlpha * graphAlpha);
        ctx.stroke();
        setT(ctx, base);
        for (let p = 0; p < 2; p++) {
          const t = frac(f / 18 + p * 0.5);
          const [px, py] = apply(G, lerp(curve.x1, curve.x2, t), curve.y1);
          ctx.fillStyle = rgba("mint", 0.9 * replicaAlpha * graphAlpha * seg(f, 112, 118));
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    /* Nœuds, triés d'arrière en avant pour la profondeur isométrique */
    type DrawItem = {
      x: number; y: number; label: string; tech: string; file: string;
      draw: number; valid: number; alert: number; alpha: number; order: number; replica: boolean;
    };
    const items: DrawItem[] = NODES.map((n, i) => ({
      x: n.x,
      y: n.y,
      label: n.label,
      tech: n.tech,
      file: n.file,
      draw: easeOut(seg(f, n.appear, n.appear + 10)),
      valid: validOf(n.x),
      alert: n.id === "db" ? alert : 0,
      alpha: graphAlpha,
      order: i,
      replica: false,
    }));
    if (replicaAlpha > 0) {
      items.push({
        x: replicaX,
        y: REPLICA.y,
        label: REPLICA.label,
        tech: REPLICA.tech,
        file: REPLICA.file,
        draw: 1,
        valid: 1,
        alert: 0,
        alpha: replicaAlpha * graphAlpha,
        order: NODES.length,
        replica: true,
      });
    }
    items.sort((a, b) => a.x + a.y - (b.x + b.y));

    for (const n of items) {
      if (n.draw <= 0) continue;
      const slices = depth > 0.5 ? 8 : 0;
      for (let s = 0; s <= slices; s++) {
        const off = slices === 0 ? 0 : (depth * s) / slices;
        setT(ctx, mul(base, mul(translate(0, -off), G)));
        ctx.globalAlpha = n.alpha;
        ctx.beginPath();
        ctx.roundRect(n.x - NODE_W / 2, n.y - NODE_H / 2, NODE_W, NODE_H, NODE_R);
        if (s < slices) {
          ctx.fillStyle = rgba("side", 1);
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = rgba(n.alert > 0.3 ? "amber" : "brand", 0.35);
          ctx.stroke();
          continue;
        }

        ctx.fillStyle = rgba("deep", 1);
        ctx.fill();
        const blueFill = n.valid * (1 - n.alert);
        if (blueFill > 0) {
          ctx.fillStyle = rgba(n.replica ? "mint" : "brand", (n.replica ? 0.1 : 0.18) * blueFill);
          ctx.fill();
        }
        if (n.alert > 0) {
          ctx.fillStyle = rgba("amber", 0.12 * n.alert);
          ctx.fill();
        }

        ctx.lineWidth = 1.6;
        if (n.valid < 1) {
          ctx.setLineDash([NODE_PERIMETER * n.draw, NODE_PERIMETER]);
          ctx.strokeStyle = rgba("mist", 0.5 * (1 - n.valid));
          ctx.stroke();
          ctx.setLineDash([]);
        }
        if (n.valid > 0) {
          const strokeKey: ColorKey = n.alert > 0.5 ? "amber" : n.replica ? "mint" : "brandSoft";
          ctx.strokeStyle = rgba(strokeKey, 0.9 * Math.max(n.valid, n.alert));
          ctx.stroke();
        }

        /* Anneaux d'alerte */
        if (n.alert > 0.02) {
          for (let r = 0; r < 2; r++) {
            const phase = frac(f / 16 + r * 0.5);
            const grow = phase * 22;
            ctx.beginPath();
            ctx.roundRect(n.x - NODE_W / 2 - grow, n.y - NODE_H / 2 - grow, NODE_W + grow * 2, NODE_H + grow * 2, NODE_R + grow);
            ctx.strokeStyle = rgba("amber", (1 - phase) * 0.5 * n.alert);
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
        }

        /* Pastille d'état */
        const dotKey: ColorKey = n.alert > 0.5 ? "amber" : n.valid >= 1 ? "mint" : n.valid > 0 ? "brandSoft" : "muted";
        ctx.fillStyle = rgba(dotKey, n.draw);
        ctx.beginPath();
        ctx.arc(n.x - NODE_W / 2 + 18, n.y - NODE_H / 2 + 18, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* Étiquettes toujours droites, posées sur la face supérieure */
      const top = mul(translate(0, -depth), G);
      const [lx, ly] = apply(top, n.x, n.y);
      const labelA = seg(f, (NODES[n.order]?.appear ?? 100) + 6, (NODES[n.order]?.appear ?? 100) + 14) * n.alpha;
      const finalLabelA = n.replica ? n.alpha : labelA;
      if (finalLabelA > 0.01 && shrinkT < 0.6) {
        setT(ctx, base);
        const maxW = (NODE_W - 36) * lerp(1, 0.74, isoT);
        ctx.globalAlpha = finalLabelA * (1 - shrinkT / 0.6);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        fitText(ctx, n.label, 600, fonts.sans, minText(17), maxW);
        ctx.fillStyle = rgba("mist", 1);
        ctx.fillText(n.label, lx, ly - (fit < 0.45 ? 0 : 9));
        if (fit >= 0.45) {
          fitText(ctx, n.tech, 400, fonts.mono, minText(12.5), maxW);
          ctx.fillStyle = rgba("muted", 1);
          ctx.fillText(n.tech, lx, ly + 13);
        }
        ctx.globalAlpha = 1;
      }

      /* Fichiers générés qui émergent des blocs */
      const chipStart = 150 + n.order * 4;
      const chipP = easeOut(seg(f, chipStart, chipStart + 12));
      const chipA = chipP * (1 - seg(f, 182, 192)) * n.alpha;
      if (chipA > 0.01) {
        setT(ctx, base);
        const rise = 46 + 34 * chipP;
        ctx.strokeStyle = rgba("brandSoft", 0.35 * chipA);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, ly - 26);
        ctx.lineTo(lx, ly - rise + 12);
        ctx.stroke();
        pill(ctx, lx, ly - rise, n.file, fonts.mono, minText(12), "brandSoft", "ice", chipA);
      }
    }

    /* Messages d'audit */
    if (db) {
      const [ax, ay] = apply(mul(base, G), db.x, db.y - 74);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pill(ctx, ax / dpr, ay / dpr, "Point de défaillance unique", fonts.sans, minText(13) * fit, "amber", "amber", alert * graphAlpha);
      const okA = seg(f, 114, 120) * (1 - seg(f, 128, 136)) * graphAlpha;
      const [rx, ry] = apply(mul(base, G), REPLICA.x, REPLICA.y - 74);
      pill(ctx, rx / dpr, ry / dpr, "Réplique ajoutée", fonts.sans, minText(13) * fit, "mint", "mint", okA);
    }
  }

  /* Ligne de balayage */
  if (scanAlpha > 0.01) {
    setT(ctx, base);
    const band = ctx.createLinearGradient(sx - 160, 0, sx + 8, 0);
    band.addColorStop(0, rgba("brand", 0));
    band.addColorStop(1, rgba("brand", 0.22 * scanAlpha));
    ctx.fillStyle = band;
    ctx.fillRect(sx - 160, 120, 168, 660);
    ctx.fillStyle = rgba("ice", 0.85 * scanAlpha);
    ctx.fillRect(sx, 120, 1.5, 660);
    pill(ctx, sx, 104, "Audit Nianthio", fonts.mono, minText(12), "ice", "ice", scanAlpha);
  }

  /* Curseurs collaboratifs */
  const cursorA = seg(f, 3, 9) * (1 - seg(f, 60, 70));
  if (cursorA > 0.01) {
    setT(ctx, base);
    const [ax, ay] = pathPoint(AMINATA_PATH, seg(f, 4, 46));
    const [kx, ky] = pathPoint(KOFFI_PATH, seg(f, 10, 58));
    drawCursor(ctx, ax, ay, "Aminata", "brand", fonts.sans, minText(12), cursorA);
    drawCursor(ctx, kx, ky, "Koffi", "amber", fonts.sans, minText(12), cursorA);
  }

  /* Vignettage cinéma */
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vignette = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  vignette.addColorStop(0, rgba("bg", 0));
  vignette.addColorStop(1, rgba("bg", options.transparent ? 0.5 : 0.7));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, cw, ch);
}
