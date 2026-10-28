/** Texts exported from the Obsidian vault by scripts/hjarnan.ts. */

export const BRAIN_FORMAT = "speedreader-hjarnan";
export const BRAIN_VERSION = 1;

export interface BrainItem {
	/** Stable across exports: a hash of the vault path. */
	id: string;
	title: string;
	/** Course or folder, e.g. "Digitalisering och styrning", or "Läsguider". */
	group: string;
	kind: "källa" | "läsguide";
	/** Where the text came from: the vault's OCR sidecar, the PDF's text layer, or markdown. */
	origin: "ocr" | "pdf" | "markdown";
	/** Path inside the vault. */
	path: string;
	text: string;
	wordCount: number;
}

export interface BrainBundle {
	format: typeof BRAIN_FORMAT;
	version: number;
	generatedAt: string;
	items: BrainItem[];
}

export function isBrainBundle(value: unknown): value is BrainBundle {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		v.format === BRAIN_FORMAT &&
		typeof v.version === "number" &&
		Array.isArray(v.items) &&
		v.items.every(
			(i) =>
				i &&
				typeof i === "object" &&
				typeof (i as BrainItem).id === "string" &&
				typeof (i as BrainItem).title === "string" &&
				typeof (i as BrainItem).text === "string",
		)
	);
}
