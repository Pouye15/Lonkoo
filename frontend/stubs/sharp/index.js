// Stub : sharp (et libvips, LGPL-3.0) ne sont volontairement pas installés.
// L'optimisation d'images de Next.js est désactivée (images.unoptimized dans next.config.ts).
throw new Error(
  "sharp est remplacé par un stub (licence LGPL de libvips). Utiliser images.unoptimized.",
);
