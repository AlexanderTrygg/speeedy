/**
 * Exports readable texts from the Obsidian vault (Personlig Hjärna) into one
 * file the app imports: hjarnan/hjarnan.json in this project, in iCloud, so
 * the phone reaches it through the Files app.
 *
 * - raw/ PDFs: the OCR sidecar in meta/ocr/ when the vault has one (no new
 *   OCR is run), otherwise the PDF's own text layer via pdftotext.
 * - raw/ markdown and text: lecture transcripts and notes.
 * - wiki/guides/: the läsguider.
 *
 * Skips raw/inbox (not ingested yet), raw/assets and raw/personal. Only reads
 * the vault. The output holds course literature, so it stays out of git.
 *
 *   npm run hjarnan [-- --vault <path>] [--med-personligt]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BRAIN_FORMAT,
	BRAIN_VERSION,
	type BrainBundle,
	type BrainItem,
} from "../src/models/brain.ts";
import {
	cleanExtractedText,
	markdownToReadable,
} from "../src/services/text-cleanup.ts";
import { countWords } from "../src/utils/text-utils.ts";

const PROJECT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_VAULT = resolve(
	PROJECT,
	"../../30-RESOURCES/30.02-Obsidian - Personlig Hjärna/Personlig Hjärna",
);

const args = process.argv.slice(2);
const vaultArg = args.indexOf("--vault");
const VAULT = vaultArg >= 0 ? resolve(args[vaultArg + 1]) : DEFAULT_VAULT;
const SKIP = new Set([
	"inbox",
	"assets",
	...(args.includes("--med-personligt") ? [] : ["personal"]),
]);
const OUT = join(PROJECT, "hjarnan", "hjarnan.json");
/** Below this, a PDF without an OCR sidecar is a scan nobody has OCR'd yet. */
const MIN_WORDS = 40;

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		if (name.startsWith(".")) return [];
		const path = join(dir, name);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

function id(rel: string): string {
	return createHash("sha1").update(rel).digest("hex").slice(0, 12);
}

function pdfText(path: string): string {
	try {
		return execFileSync("pdftotext", ["-enc", "UTF-8", path, "-"], {
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(
				"pdftotext saknas — installera med: brew install poppler",
			);
		}
		return "";
	}
}

function item(
	rel: string,
	title: string,
	group: string,
	kind: BrainItem["kind"],
	origin: BrainItem["origin"],
	text: string,
): BrainItem {
	return {
		id: id(rel),
		title,
		group,
		kind,
		origin,
		path: rel,
		text,
		wordCount: countWords(text),
	};
}

if (!existsSync(join(VAULT, "raw"))) {
	console.error(`Hittar inte valvet: ${VAULT}`);
	process.exit(1);
}

const items: BrainItem[] = [];
const skipped: string[] = [];

for (const path of walk(join(VAULT, "raw"))) {
	const rel = relative(VAULT, path);
	const [, top, ...rest] = rel.split("/");
	if (SKIP.has(top)) continue;
	const ext = extname(path).toLowerCase();
	const title = basename(path, extname(path));
	const group = rest.length > 1 ? rest[rest.length - 2] : top;

	if (ext === ".pdf") {
		const ocr = join(
			VAULT,
			"meta/ocr",
			relative(join(VAULT, "raw"), path),
		).replace(/\.pdf$/i, ".txt");
		const fromOcr = existsSync(ocr);
		const text = cleanExtractedText(
			fromOcr ? readFileSync(ocr, "utf8") : pdfText(path),
		);
		if (countWords(text) < MIN_WORDS) {
			skipped.push(`${rel} (ingen text — behöver OCR i valvet)`);
			continue;
		}
		items.push(item(rel, title, group, "källa", fromOcr ? "ocr" : "pdf", text));
	} else if (ext === ".md" || ext === ".txt") {
		const raw = readFileSync(path, "utf8");
		const text =
			ext === ".md" ? markdownToReadable(raw) : cleanExtractedText(raw);
		if (countWords(text) < MIN_WORDS) continue;
		items.push(item(rel, title, group, "källa", "markdown", text));
	} else {
		skipped.push(`${rel} (${ext} — öppna filen direkt i appen)`);
	}
}

const guides = join(VAULT, "wiki/guides");
if (existsSync(guides)) {
	for (const path of walk(guides).filter((p) => p.endsWith(".md"))) {
		const rel = relative(VAULT, path);
		const text = markdownToReadable(readFileSync(path, "utf8"));
		const title = basename(path, ".md").replace(/^Läsguide – /, "");
		items.push(item(rel, title, "Läsguider", "läsguide", "markdown", text));
	}
}

const collator = new Intl.Collator("sv", { numeric: true });
items.sort(
	(a, b) =>
		collator.compare(a.group, b.group) || collator.compare(a.title, b.title),
);

const bundle: BrainBundle = {
	format: BRAIN_FORMAT,
	version: BRAIN_VERSION,
	generatedAt: new Date().toISOString(),
	items,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(bundle));

const words = items.reduce((n, i) => n + i.wordCount, 0);
const byOrigin = (o: BrainItem["origin"]) =>
	items.filter((i) => i.origin === o).length;
console.log(
	`${items.length} texter, ${words.toLocaleString("sv")} ord → ${relative(PROJECT, OUT)}`,
);
console.log(
	`  OCR från valvet: ${byOrigin("ocr")} · PDF-text: ${byOrigin("pdf")} · markdown: ${byOrigin("markdown")}`,
);
for (const s of skipped) console.log(`  hoppade över: ${s}`);
