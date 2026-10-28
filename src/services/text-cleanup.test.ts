import { describe, expect, it } from "vitest";
import { cleanExtractedText, markdownToReadable } from "./text-cleanup.js";

describe("cleanExtractedText", () => {
	it("mends hyphenation and reflows lines into paragraphs", () => {
		const text =
			"Utifrån en etablerad forskning ser vi styr-\nning som en helhet.\n\nNytt stycke.";
		expect(cleanExtractedText(text)).toBe(
			"Utifrån en etablerad forskning ser vi styrning som en helhet.\n\nNytt stycke.",
		);
	});

	it("keeps hyphens after capitals", () => {
		expect(cleanExtractedText("nystartade IT-\nbolag växer.")).toBe(
			"nystartade IT-bolag växer.",
		);
	});

	it("merges a paragraph cut mid-sentence by a page break", () => {
		const pages =
			"Styrning är bredare än\f\nbehandling av ekonomisk information.";
		expect(cleanExtractedText(pages)).toBe(
			"Styrning är bredare än behandling av ekonomisk information.",
		);
	});

	it("drops page numbers and running heads", () => {
		const page = (n: number, body: string) =>
			`DIGITALISERING OCH STYRNING\n${body}\n${n}`;
		const text = [
			page(12, "Första sidan."),
			page(13, "Andra sidan."),
			page(14, "Tredje sidan."),
		].join("\f");
		expect(cleanExtractedText(text)).toBe(
			"Första sidan.\n\nAndra sidan.\n\nTredje sidan.",
		);
	});

	it("drops repeated all-caps watermarks and their OCR fragments", () => {
		const mark = "OFÖRFATTARNA OCH STUDENTLITTERATUR";
		const text = [
			`Första stycket.\n${mark}`,
			`${mark}\nAndra stycket.`,
			`Tredje stycket.\n${mark}\nTARNA OCH STUDENTLITTERATUR`,
		].join("\f");
		expect(cleanExtractedText(text)).toBe(
			"Första stycket.\n\nAndra stycket.\n\nTredje stycket.",
		);
	});

	it("keeps a heading that appears only once", () => {
		const text = ["INTRODUKTION\nText ett.", "Text två.", "Text tre."].join(
			"\f",
		);
		expect(cleanExtractedText(text)).toContain("INTRODUKTION");
	});
});

describe("markdownToReadable", () => {
	it("strips frontmatter, links and emphasis", () => {
		const md = `---
typ: läsguide
---

# Läsguide – Kapitel 1

Se [[Källa – Kapitel 1|källsidan]] och [[Digitalisering]]. Det är **viktigt** och *nytt*.`;
		expect(markdownToReadable(md)).toBe(
			"Läsguide – Kapitel 1.\n\nSe källsidan och Digitalisering. Det är viktigt och nytt.",
		);
	});

	it("turns list items and table rows into sentences", () => {
		const md = `- första punkten
- andra punkten!

| Begrepp | Betydelse |
|---|---|
| Plattform | Kopplar ihop grupper |`;
		expect(markdownToReadable(md)).toBe(
			"första punkten.\n\nandra punkten!\n\nBegrepp — Betydelse.\n\nPlattform — Kopplar ihop grupper.",
		);
	});

	it("removes callout markers, embeds and code", () => {
		const md =
			"> [!tip] Tänk på\n> Läs långsamt.\n\n![[bild.png]]\n\n```js\nconst x = 1;\n```";
		expect(markdownToReadable(md)).toBe("Tänk på Läs långsamt.");
	});
});
