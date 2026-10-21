/** Téléchargements côté navigateur : un fichier texte, un objet JSON, une image SVG ou PNG. */

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Le navigateur a pris le fichier : l'adresse temporaire peut être libérée.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(filename: string, text: string, mime = "text/plain") {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function downloadJson(filename: string, data: unknown) {
  downloadText(filename, JSON.stringify(data, null, 2) + "\n", "application/json");
}

/** Plus grand côté d'une image PNG : au-delà, certains navigateurs refusent de dessiner (limite du canvas). */
const MAX_PNG_SIDE = 8192;

/**
 * Image PNG d'un SVG autonome (fond blanc), en doublant la résolution quand la taille le permet.
 * L'image est chargée depuis une adresse temporaire : la CSP du site l'autorise (`img-src blob:`).
 */
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const scale = Math.min(2, MAX_PNG_SIDE / Math.max(width, height, 1));
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.width = width;
    image.height = height;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("L'image n'a pas pu être dessinée."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Le navigateur ne permet pas de dessiner l'image.");
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("L'image PNG n'a pas pu être créée."))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
