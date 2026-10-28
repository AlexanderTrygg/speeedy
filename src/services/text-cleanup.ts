/**
 * Turns raw page text (pdf.js, pdftotext, OCR sidecars) and Obsidian markdown
 * into plain paragraphs for the RSVP engine. Pure string functions, so the
 * browser and scripts/hjarnan.ts share them.
 */

const TERMINAL_RE = /[.!?:;…"”»)\]]$/u;

/** Page numbers, "Sida 3", "12 | Kapitel 2" and similar. */
function isPageNumberLine(line: string): boolean {
	return (
		/^(sida|page|s\.)?\s*\d{1,4}\s*$/i.test(line) ||
		/^[–—-]\s*\d{1,4}\s*[–—-]$/.test(line)
	);
}

/** Header/footer key: case and digits ignored so "Kapitel 2 · 34" matches "Kapitel 2 · 35". */
function edgeKey(line: string): string {
	return line.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
}

/**
 * Lines repeated at the top or bottom of many pages: running heads, book
 * titles, chapter names. Needs at least three pages to tell them apart from text.
 */
function findRepeatedEdges(pages: string[][]): Set<string> {
	const counts = new Map<string, number>();
	for (const lines of pages) {
		const edges = new Set(
			[...lines.slice(0, 2), ...lines.slice(-2)].map(edgeKey),
		);
		for (const key of edges) {
			if (key.length > 0 && key.length <= 200)
				counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	const threshold = Math.max(3, Math.ceil(pages.length * 0.2));
	return new Set([...counts].filter(([, n]) => n >= threshold).map(([k]) => k));
}

function capsLetters(line: string): string | null {
	if (/\p{Ll}/u.test(line) || line.split(/\s+/).length > 6) return null;
	const letters = line.replace(/[^\p{Lu}]/gu, "");
	return letters.length >= 6 ? letters : null;
}

/**
 * Short all-caps lines repeated three or more times anywhere — margin
 * watermarks such as "© FÖRFATTARNA OCH STUDENTLITTERATUR", which OCR also
 * garbles into fragments of themselves. Fragments of a repeated line count too.
 */
function findWatermarks(lines: string[]): (line: string) => boolean {
	const counts = new Map<string, number>();
	for (const line of lines) {
		const key = capsLetters(line)?.slice(0, 10);
		if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const repeated = new Set(
		[...counts].filter(([, n]) => n >= 3).map(([k]) => k),
	);
	const full = lines
		.map(capsLetters)
		.filter((l): l is string => l !== null && repeated.has(l.slice(0, 10)));
	return (line) => {
		const letters = capsLetters(line);
		return letters !== null && full.some((w) => w.includes(letters));
	};
}

/** Joins "styr-\nning" to "styrning" but keeps "IT-\nbolag" and "e-\npost"-style real hyphens after capitals. */
function joinHyphenation(text: string): string {
	return text
		.replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
		.replace(/(\p{Lu})-\n(\p{L})/gu, "$1-$2");
}

/**
 * Cleans text extracted page by page from a PDF or an OCR sidecar
 * (pages separated by form feeds). Drops page numbers and running heads,
 * mends hyphenation and reflows lines into paragraphs, merging paragraphs
 * that a page or column break cut mid-sentence.
 */
export function cleanExtractedText(input: string | string[]): string {
	const rawPages = typeof input === "string" ? input.split("\f") : input;
	const pages = rawPages.map((page) =>
		page
			.replace(/\r\n?/g, "\n")
			.split("\n")
			.map((l) => l.replace(/[ \t ]+/g, " ").trim()),
	);
	const nonEmpty = pages.map((lines) => lines.filter((l) => l.length > 0));
	const repeated =
		pages.length >= 3 ? findRepeatedEdges(nonEmpty) : new Set<string>();
	const isWatermark = findWatermarks(nonEmpty.flat());

	const kept = pages.map((lines) => {
		const first = lines.findIndex((l) => l.length > 0);
		let last = -1;
		for (let i = lines.length - 1; i >= 0; i--) {
			if (lines[i].length > 0) {
				last = i;
				break;
			}
		}
		return lines
			.filter((line, i) => {
				if (line.length === 0) return true;
				if (isPageNumberLine(line) || isWatermark(line)) return false;
				const atEdge = i <= first + 1 || i >= last - 1;
				return !(atEdge && repeated.has(edgeKey(line)));
			})
			.join("\n");
	});

	const text = joinHyphenation(kept.join("\n\n"));
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((p) => p.replace(/\n/g, " ").replace(/ {2,}/g, " ").trim())
		.filter((p) => p.length > 0);

	const merged: string[] = [];
	for (const para of paragraphs) {
		const prev = merged[merged.length - 1];
		if (prev && !TERMINAL_RE.test(prev) && /^\p{Ll}/u.test(para)) {
			merged[merged.length - 1] =
				prev.endsWith("-") && /\p{Ll}-$/u.test(prev)
					? prev.slice(0, -1) + para
					: `${prev} ${para}`;
		} else {
			merged.push(para);
		}
	}
	return merged.join("\n\n");
}

/** Ends a heading or list item with a full stop so the reader pauses after it. */
function withStop(line: string): string {
	return TERMINAL_RE.test(line) ? line : `${line}.`;
}

/**
 * Obsidian markdown to readable prose: frontmatter, code, images, embeds,
 * comments and footnote markers go; links keep their label; headings, list
 * items and table rows become their own paragraphs.
 */
export function markdownToReadable(md: string): string {
	let text = md.replace(/\r\n?/g, "\n");
	text = text.replace(/^---\n[\s\S]*?\n---\n/, "");
	text = text.replace(/```[\s\S]*?```/g, "");
	text = text.replace(/%%[\s\S]*?%%/g, "").replace(/<!--[\s\S]*?-->/g, "");
	text = text
		.replace(/!\[\[[^\]]*\]\]/g, "")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
	text = text
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]#|]+)(#[^\]]*)?\]\]/g, "$1");
	text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
	text = text.replace(/\[\^[^\]]+\]/g, "");

	const out: string[] = [];
	let para: string[] = [];
	const flush = () => {
		if (para.length > 0) out.push(para.join(" "));
		para = [];
	};

	for (const raw of text.split("\n")) {
		let line = raw.trim();
		if (line.length === 0) {
			flush();
			continue;
		}
		if (/^\|?\s*:?-{3,}/.test(line) || /^(-{3,}|\*{3,})$/.test(line)) continue;
		line = line.replace(/^>\s*\[![^\]]*\][+-]?\s*/, "").replace(/^>\s?/, "");
		if (line.length === 0) continue;

		const heading = line.match(/^#{1,6}\s+(.*)$/);
		const item = line.match(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/);
		if (heading) {
			flush();
			out.push(withStop(heading[1]));
		} else if (line.startsWith("|")) {
			flush();
			const cells = line
				.replace(/^\||\|$/g, "")
				.split("|")
				.map((c) => c.trim())
				.filter(Boolean);
			if (cells.length > 0) out.push(withStop(cells.join(" — ")));
		} else if (item) {
			flush();
			out.push(withStop(item[1]));
		} else {
			para.push(line);
		}
	}
	flush();

	return out
		.map((p) =>
			p
				.replace(/(\*\*|__|==|~~)(.+?)\1/g, "$2")
				.replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s.,;:!?)]|$)/g, "$1$2")
				.replace(/`([^`]+)`/g, "$1")
				.replace(/<[^>]+>/g, "")
				.replace(/ {2,}/g, " ")
				.trim(),
		)
		.filter((p) => p.length > 0 && /[\p{L}\p{N}]/u.test(p))
		.join("\n\n");
}
