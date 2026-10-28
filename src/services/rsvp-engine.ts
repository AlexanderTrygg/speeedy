import type { OrpResult, ReaderSettings } from "../models/types.js";

const COMMON_WORDS = new Set([
	// English
	"the",
	"a",
	"an",
	"is",
	"it",
	"in",
	"on",
	"at",
	"to",
	"of",
	"and",
	"or",
	"but",
	"for",
	"nor",
	"so",
	"yet",
	"as",
	"if",
	"be",
	"do",
	"go",
	"by",
	"up",
	"my",
	"we",
	"he",
	"she",
	"they",
	// Polish
	"i",
	"w",
	"z",
	"na",
	"jest",
	"się",
	"nie",
	"że",
	"do",
	"od",
	"a",
	"o",
	"dla",
	"co",
	"jak",
	"ale",
	"za",
	"ze",
	"tego",
	"tej",
	"ten",
	"ta",
	"to",
	// Czech
	"a",
	"v",
	"na",
	"je",
	"se",
	"že",
	"s",
	"z",
	"do",
	"o",
	"ale",
	"za",
	"co",
	"jak",
	"ve",
	"pro",
	"k",
	"ze",
	"ve",
	"ten",
	"ta",
	"to",
	// Slovak
	"a",
	"v",
	"na",
	"je",
	"sa",
	"že",
	"s",
	"z",
	"do",
	"o",
	"ale",
	"za",
	"čo",
	"ako",
	"ve",
	"pre",
	"k",
	"ze",
	"ten",
	"tá",
	"to",
	// Serbo-Croatian (Latin & Cyrillic)
	"i",
	"u",
	"se",
	"na",
	"je",
	"za",
	"sa",
	"kao",
	"a",
	"o",
	"od",
	"do",
	"što",
	"ali",
	"iz",
	"pa",
	"čak",
	"te",
	"će",
	"ovo",
	"он",
	"она",
	"оно",
	"и",
	"у",
	"се",
	"на",
	"је",
	// Slovene
	"je",
	"v",
	"in",
	"se",
	"na",
	"za",
	"s",
	"z",
	"ki",
	"od",
	"do",
	"pa",
	"toda",
	"ali",
	"kaj",
	"kot",
	"kako",
	"ta",
	"to",
	"tega",
	// Bulgarian (Cyrillic)
	"и",
	"в",
	"на",
	"се",
	"е",
	"да",
	"с",
	"за",
	"не",
	"от",
	"като",
	"а",
	"о",
	"това",
	"тази",
	"този",
	"което",
	"който",
	"която",
	// Swedish
	"och",
	"att",
	"det",
	"som",
	"en",
	"är",
	"av",
	"för",
	"med",
	"till",
	"den",
	"har",
	"de",
	"inte",
	"om",
	"ett",
	"han",
	"men",
	"var",
	"jag",
	"sig",
	"från",
	"vi",
	"så",
	"kan",
	"man",
	"när",
	"år",
	"ska",
	"vid",
	"där",
	"nu",
	"du",
	"hon",
	"eller",
]);

export interface TokenContext {
	paragraphStart?: boolean;
	inQuotes?: boolean;
	inParens?: boolean;
	inBrackets?: boolean;
	/** True if this token ends with )" or ]" (closing aside then quote). */
	closesAside?: boolean;
}

export interface WordToken {
	text: string;
	pauseMultiplier: number;
	context?: TokenContext;
}

export interface PlaybackState {
	playing: boolean;
	wordIndex: number;
	displayWordIndex: number;
	totalWords: number;
	currentTokens: WordToken[];
	currentOrp: OrpResult | null;
	elapsedMs: number;
	startTime: number | null;
	baseWpm: number;
	currentWpm: number;
}

export type EngineEventType = "word" | "complete" | "progress" | "stateChange";

export type EngineListener = (state: PlaybackState) => void;

export class RSVPEngine {
	private _tokens: WordToken[] = [];
	get tokens(): WordToken[] {
		return this._tokens;
	}
	private state: PlaybackState = this.emptyState();
	private timerId: ReturnType<typeof setTimeout> | null = null;
	private listeners: Map<EngineEventType, EngineListener[]> = new Map();

	private emptyState(): PlaybackState {
		return {
			playing: false,
			wordIndex: 0,
			displayWordIndex: 0,
			totalWords: 0,
			currentTokens: [],
			currentOrp: null,
			elapsedMs: 0,
			startTime: null,
			baseWpm: 300,
			currentWpm: 300,
		};
	}

	load(text: string, settings: ReaderSettings): void {
		this.stop();
		this._tokens = tokenize(text, settings);
		this.state = {
			...this.emptyState(),
			totalWords: this._tokens.length,
			baseWpm: settings.wpm,
		};
		this.updateCurrentDisplay();
		this.emit("stateChange", this.state);
	}

	play(settings: ReaderSettings): void {
		if (this.state.wordIndex >= this.tokens.length) {
			this.state.wordIndex = 0;
		}
		this.state.playing = true;
		if (!this.state.startTime) {
			this.state.startTime = Date.now() - this.state.elapsedMs;
		}
		this.state.baseWpm = settings.wpm;
		this.emit("stateChange", this.state);
		this.scheduleNext(settings);
	}

	pause(): void {
		this.clearTimer();
		this.state.playing = false;
		this.state.wordIndex = this.state.displayWordIndex;
		if (this.state.startTime) {
			this.state.elapsedMs = Date.now() - this.state.startTime;
			this.state.startTime = null;
		}
		this.updateCurrentDisplay();
		this.emit("stateChange", this.state);
	}

	stop(): void {
		this.clearTimer();
		this.state = {
			...this.emptyState(),
			totalWords: this.tokens.length,
			baseWpm: this.state.baseWpm,
		};
		this.emit("stateChange", this.state);
	}

	seekBy(delta: number): void {
		const newIndex = Math.max(
			0,
			Math.min(this.tokens.length - 1, this.state.wordIndex + delta),
		);
		this.state.wordIndex = newIndex;
		if (!this.state.playing) {
			this.updateCurrentDisplay();
		}
		this.emit("stateChange", this.state);
	}

	seekToWord(index: number): void {
		this.state.wordIndex = Math.max(0, Math.min(this.tokens.length - 1, index));
		// Keeps a second rewind tap, or a pause, from snapping back to the old word.
		this.state.displayWordIndex = this.state.wordIndex;
		if (!this.state.playing) {
			this.updateCurrentDisplay();
		}
		this.emit("stateChange", this.state);
	}

	/**
	 * Jump to the start of the sentence being read. Pressed again right at a
	 * sentence start, it goes one sentence further back.
	 */
	rewindSentence(): void {
		const idx = this.currentIndex();
		let start = sentenceStartIndex(this._tokens, idx);
		if (idx - start <= 1 && start > 0) {
			start = sentenceStartIndex(this._tokens, start - 1);
		}
		this.seekToWord(start);
	}

	/** Jump to the start of the next sentence. */
	forwardSentence(): void {
		const idx = this.currentIndex();
		for (let i = idx; i < this._tokens.length - 1; i++) {
			if (endsSentence(this._tokens[i])) {
				this.seekToWord(i + 1);
				return;
			}
		}
	}

	/** Index of the word on screen (wordIndex runs one chunk ahead while playing). */
	private currentIndex(): number {
		return this.state.playing
			? this.state.displayWordIndex
			: this.state.wordIndex;
	}

	setWpm(settings: ReaderSettings): void {
		this.state.baseWpm = settings.wpm;
		if (this.state.playing) {
			this.clearTimer();
			this.scheduleNext(settings, true);
		}
	}

	getState(): PlaybackState {
		return { ...this.state };
	}

	on(event: EngineEventType, listener: EngineListener): void {
		const existing = this.listeners.get(event) ?? [];
		this.listeners.set(event, [...existing, listener]);
	}

	off(event: EngineEventType, listener: EngineListener): void {
		const existing = this.listeners.get(event) ?? [];
		this.listeners.set(
			event,
			existing.filter((l) => l !== listener),
		);
	}

	getProgressPercent(): number {
		if (this.tokens.length === 0) return 0;
		return (this.state.wordIndex / this.tokens.length) * 100;
	}

	getEstimatedRemainingMs(settings: ReaderSettings): number {
		const total = this.tokens.length;
		const current = this.state.wordIndex;
		if (total === 0 || current >= total) return 0;

		const remainingTokens = this.tokens.slice(current);
		let totalMs = 0;

		const chunkSize = settings.chunkSize || 1;
		const limit = Math.min(remainingTokens.length, 2000);
		for (let i = 0; i < limit; i += chunkSize) {
			const chunkTokens = remainingTokens.slice(i, i + chunkSize);
			if (chunkTokens.length === 0) break;
			const wpm = effectiveWpm(
				settings,
				chunkTokens[0].text,
				current + i,
				total,
			);
			totalMs += chunkDelayMs(chunkTokens, wpm, settings);
		}

		if (remainingTokens.length > limit) {
			const avgPerWord = totalMs / limit;
			totalMs += avgPerWord * (remainingTokens.length - limit);
		}

		return totalMs;
	}

	private scheduleNext(settings: ReaderSettings, isReschedule = false): void {
		if (!this.state.playing || this.state.wordIndex >= this.tokens.length) {
			if (this.state.wordIndex >= this.tokens.length) {
				this.handleComplete();
			}
			return;
		}

		const chunkEnd = Math.min(
			this.state.wordIndex + settings.chunkSize,
			this.tokens.length,
		);
		const chunkTokens = this.tokens.slice(this.state.wordIndex, chunkEnd);

		this.state.currentTokens = chunkTokens;
		this.state.displayWordIndex = this.state.wordIndex;
		this.state.currentOrp = computeOrp(
			chunkTokens.map((t) => t.text).join(" "),
			settings.bionicFocusPosition,
		);

		if (!isReschedule) {
			this.emit("word", this.state);
			this.emit("progress", this.state);
		}

		const finalWpm = effectiveWpm(
			settings,
			chunkTokens[0].text,
			this.state.wordIndex,
			this.tokens.length,
		);
		this.state.currentWpm = Math.round(finalWpm);
		const delay = chunkDelayMs(chunkTokens, finalWpm, settings);

		if (!isReschedule) {
			this.state.wordIndex += settings.chunkSize;
		}

		this.timerId = setTimeout(() => {
			this.scheduleNext(settings);
		}, delay);
	}

	private handleComplete(): void {
		this.state.playing = false;
		if (this.state.startTime) {
			this.state.elapsedMs = Date.now() - this.state.startTime;
			this.state.startTime = null;
		}
		this.emit("complete", this.state);
		this.emit("stateChange", this.state);
	}

	private clearTimer(): void {
		if (this.timerId !== null) {
			clearTimeout(this.timerId);
			this.timerId = null;
		}
	}

	private updateCurrentDisplay(): void {
		if (this.tokens.length === 0) return;
		const token = this.tokens[this.state.wordIndex];
		this.state.currentTokens = [token];
		this.state.displayWordIndex = this.state.wordIndex;
		this.state.currentOrp = computeOrp(token.text);
		this.emit("word", this.state);
	}

	private emit(event: EngineEventType, state: PlaybackState): void {
		const listeners = this.listeners.get(event) ?? [];
		for (const listener of listeners) {
			listener({ ...state });
		}
	}
}

function segmentWords(para: string): string[] {
	if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
		const segmenter = new Intl.Segmenter(navigator.language || "en", {
			granularity: "word",
		});
		const segments = Array.from(segmenter.segment(para));
		const words: string[] = [];
		for (const seg of segments) {
			if (seg.isWordLike) {
				words.push(seg.segment);
			} else if (words.length > 0) {
				const punct = seg.segment.trim();
				if (punct.length > 0) words[words.length - 1] += punct;
			}
		}
		return words.filter((w) => w.length > 0);
	}
	return para.split(/\s+/).filter((w) => w.length > 0);
}

export function tokenize(text: string, settings?: ReaderSettings): WordToken[] {
	const normalized = text
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	const paragraphs = normalized
		.split(/\n\n+/)
		.map((p) => p.trim())
		.filter(Boolean);
	if (paragraphs.length === 0) return [];

	const tokens: WordToken[] = [];
	let isFirstParagraph = true;
	for (const para of paragraphs) {
		const words = segmentWords(para);
		for (let i = 0; i < words.length; i++) {
			const word = words[i];
			const context: TokenContext = {};
			if (!isFirstParagraph && i === 0) context.paragraphStart = true;
			tokens.push({
				text: word,
				pauseMultiplier: getPauseMultiplier(word, settings?.commaAsPause),
				context: Object.keys(context).length > 0 ? context : undefined,
			});
		}
		isFirstParagraph = false;
	}

	assignQuoteParenContext(tokens, paragraphs);
	return tokens;
}

function assignQuoteParenContext(
	tokens: WordToken[],
	paragraphs: string[],
): void {
	const normalizedText = paragraphs.join("\n\n");
	let wordIndex = 0;
	let inWord = false;
	let inDoubleQuote = false;
	let inSingleQuote = false;
	let parenDepth = 0;
	let bracketDepth = 0;

	for (let i = 0; i < normalizedText.length; i++) {
		const c = normalizedText[i];

		if (c === " " || c === "\n") {
			if (inWord && wordIndex < tokens.length) {
				closesAsideFromToken(tokens[wordIndex]);
				wordIndex++;
			}
			inWord = false;
		} else {
			// Standard ASCII quotes
			if (c === '"') {
				inDoubleQuote = !inDoubleQuote;
			}
			// Slavic/European quotation marks: "..." (Polish/Czech/Slovak), »...« (Slovene), "..." (German style)
			// Using Unicode: \u201E (low-9), \u201D (high-9), \u00AB (guillemet left), \u00BB (guillemet right)
			else if (
				c === "\u201E" ||
				c === "\u201D" ||
				c === "\u00AB" ||
				c === "\u00BB"
			) {
				inDoubleQuote = !inDoubleQuote;
			} else if (c === "'") {
				const prev = i > 0 ? normalizedText[i - 1] : "";
				const next = i < normalizedText.length - 1 ? normalizedText[i + 1] : "";
				const isWordBefore = /[\p{L}\p{N}]/u.test(prev);
				const isWordAfter = /[\p{L}\p{N}]/u.test(next);

				if (isWordBefore && !isWordAfter) {
					inSingleQuote = false;
				} else if (!isWordBefore && isWordAfter) {
					inSingleQuote = true;
				}
			}
			// Single guillemets ‹...› used in some European languages
			// \u2039 = single left guillemet, \u203A = single right guillemet
			else if (c === "\u2039" || c === "\u203A") {
				inSingleQuote = !inSingleQuote;
			} else if (c === "(") parenDepth++;
			else if (c === ")") parenDepth--;
			else if (c === "[") bracketDepth++;
			else if (c === "]") bracketDepth--;

			if (!inWord && wordIndex < tokens.length) {
				const t = tokens[wordIndex];
				t.context = t.context ?? {};
				if (inDoubleQuote || inSingleQuote) t.context.inQuotes = true;
				if (parenDepth > 0) t.context.inParens = true;
				if (bracketDepth > 0) t.context.inBrackets = true;
			}
			inWord = true;
		}
	}
	if (inWord && wordIndex < tokens.length) {
		closesAsideFromToken(tokens[wordIndex]);
	}
}

function closesAsideFromToken(t: WordToken): void {
	const text = t.text.trim();
	// Include Slavic/European closing marks using Unicode escapes
	// \u201D = right double quote, \u201E = left double quote, \u00BB = right guillemet,
	// \u00AB = left guillemet, \u203A = single right guillemet, \u2039 = single left guillemet
	const slavicClosers = "\u201D\u201E\u00BB\u00AB\u203A\u2039";
	const closesAside =
		/[)"'\]]$/.test(text) ||
		new RegExp(`[)"']][${slavicClosers}]$`).test(text) ||
		/[)"'\]][,.;!?]$/.test(text) ||
		new RegExp(`[)"']][${slavicClosers}][,.;!?]$`).test(text);
	if (closesAside) {
		t.context = t.context ?? {};
		t.context.closesAside = true;
	}
}

function getPauseMultiplier(word: string, commaAsPause = false): number {
	const last = word[word.length - 1];

	// Standard Western punctuation
	if (last === "." || last === "!" || last === "?") return 2.0;
	if (last === "," || last === ";") return commaAsPause ? 2.0 : 1.4;
	if (last === ":") return 1.4;

	// Slavic and European quotation marks (may appear at end of words)
	// Polish "..." low-9 high-9 quotes, Slovene »...« guillemets
	// \u201E = low-9 quote, \u201D = high-9 quote, \u00BB = right guillemet, \u203A = single right guillemet
	if (
		last === "\u201E" ||
		last === "\u201D" ||
		last === "\u00BB" ||
		last === "\u203A"
	)
		return 2.0;

	// CJK full-width punctuation
	if (last === "。" || last === "！" || last === "？") return 2.0;
	if (last === "，" || last === "；") return commaAsPause ? 2.0 : 1.4;
	if (last === "：") return 1.4;

	// Arabic/Hebrew question marks (RTL languages)
	if (last === "؟") return 2.0;

	return 1.0;
}

const WORD_CHAR_RE = /[\p{L}\p{N}]/u;

export function computeOrp(
	text: string,
	bionicFocusPosition: ReaderSettings["bionicFocusPosition"] = "balanced",
): OrpResult {
	const leadingMatch = text.match(/^[^\p{L}\p{N}]+/u);
	const trailingMatch = text.match(/[^\p{L}\p{N}]+$/u);

	const leading = leadingMatch ? leadingMatch[0] : "";
	const trailing = trailingMatch ? trailingMatch[0] : "";

	if (leading === text) {
		return { before: "", pivot: text, after: "" };
	}

	const coreStartIndex = leading.length;
	const coreEndIndex = text.length - trailing.length;
	const coreText = text.slice(coreStartIndex, coreEndIndex);

	const clean = coreText.replace(/[^\p{L}\p{N}]/gu, "");
	const len = clean.length;

	let pivotIndex: number;
	if (len <= 1) pivotIndex = 0;
	else if (len <= 5) pivotIndex = 1;
	else if (len <= 9) pivotIndex = 2;
	else pivotIndex = 3;

	if (bionicFocusPosition === "early" && pivotIndex > 0) {
		pivotIndex--;
	} else if (
		bionicFocusPosition === "late" &&
		pivotIndex < Math.min(len - 1, 4)
	) {
		pivotIndex++;
	}

	const originalPivotIndexInCoreText = findPivotInOriginal(
		coreText,
		pivotIndex,
	);
	const baseChar = String.fromCodePoint(
		coreText.codePointAt(originalPivotIndexInCoreText) ?? 0,
	);
	let pivotEndIndex = originalPivotIndexInCoreText + baseChar.length;

	while (pivotEndIndex < coreText.length) {
		const nextChar = String.fromCodePoint(
			coreText.codePointAt(pivotEndIndex) ?? 0,
		);
		if (/^\p{M}$/u.test(nextChar)) {
			pivotEndIndex += nextChar.length;
		} else {
			break;
		}
	}

	return {
		before: leading + coreText.slice(0, originalPivotIndexInCoreText),
		pivot: coreText.slice(originalPivotIndexInCoreText, pivotEndIndex),
		after: coreText.slice(pivotEndIndex) + trailing,
	};
}

function findPivotInOriginal(text: string, cleanIndex: number): number {
	let cleanCount = 0;
	for (let i = 0; i < text.length; ) {
		const cp = text.codePointAt(i) ?? 0;
		const char = String.fromCodePoint(cp);
		if (WORD_CHAR_RE.test(char)) {
			if (cleanCount === cleanIndex) return i;
			cleanCount++;
		}
		i += char.length;
	}
	return 0;
}

function smartWpm(base: number, word: string): number {
	const clean = word.replace(/[^\p{L}\p{N}]/gu, "");
	const len = clean.length;
	const isCommon = COMMON_WORDS.has(clean.toLowerCase());

	if (isCommon || len <= 3) return Math.min(base * 1.3, 1600);
	// Swedish and German compounds ("användbarhetsutvärdering") need far more time.
	if (len >= 16) return Math.max(base * 0.5, 50);
	if (len >= 12) return Math.max(base * 0.62, 50);
	if (len >= 8) return Math.max(base * 0.75, 50);
	if (len >= 6) return Math.max(base * 0.9, 50);
	return base;
}

/**
 * Minimum extra pause in ms after a comma, a sentence end and before a new
 * paragraph, at the default multiplier. Proportional pauses shrink with speed,
 * so without a floor sentences run together above ~600 WPM — the moment
 * comprehension needs the break the most.
 */
export const PAUSE_FLOOR_MS = { comma: 80, sentence: 250, paragraph: 300 };

const DEFAULT_PAUSE_MULTIPLIER = 2;
const DEFAULT_PARAGRAPH_MULTIPLIER = 1.8;

function effectiveWpm(
	settings: ReaderSettings,
	word: string,
	index: number,
	total: number,
): number {
	const base = settings.speedRampEnabled
		? rampWpm(settings.wpm, settings.speedRampTarget, index, total)
		: settings.wpm;
	return settings.smartSpeed ? smartWpm(base, word) : base;
}

/** How long a chunk stays on screen, punctuation and paragraph pauses included. */
export function chunkDelayMs(
	chunk: WordToken[],
	wpm: number,
	settings: ReaderSettings,
): number {
	const first = chunk[0];
	const last = chunk[chunk.length - 1];
	const base = (60000 / wpm) * chunk.length;
	const extra = last.pauseMultiplier - 1;

	let pause = 0;
	if (extra > 0) {
		const isSentenceEnd = last.pauseMultiplier >= 2;
		const mult = isSentenceEnd
			? settings.sentencePauseMultiplier
			: (settings.commaPauseMultiplier ?? settings.sentencePauseMultiplier);
		const floor = isSentenceEnd
			? PAUSE_FLOOR_MS.sentence
			: PAUSE_FLOOR_MS.comma;
		pause = base * extra * mult;
		if (settings.pauseFloor ?? true) {
			pause = Math.max(pause, (floor * mult) / DEFAULT_PAUSE_MULTIPLIER);
		}
	}
	let delay = base + pause;

	const paragraphMult = settings.paragraphPauseMultiplier ?? 1;
	if (paragraphMult > 1 && first.context?.paragraphStart) {
		let paragraphPause = delay * (paragraphMult - 1);
		if (settings.pauseFloor ?? true) {
			paragraphPause = Math.max(
				paragraphPause,
				(PAUSE_FLOOR_MS.paragraph * (paragraphMult - 1)) /
					(DEFAULT_PARAGRAPH_MULTIPLIER - 1),
			);
		}
		delay += paragraphPause;
	}
	if (settings.contextPauseOnClose && last.context?.closesAside) delay *= 1.15;
	return delay;
}

function endsSentence(token: WordToken): boolean {
	return token.pauseMultiplier >= 2;
}

/** First word of the sentence containing `index`. */
export function sentenceStartIndex(tokens: WordToken[], index: number): number {
	let i = Math.max(0, Math.min(index, tokens.length - 1));
	while (i > 0) {
		if (tokens[i].context?.paragraphStart) return i;
		if (endsSentence(tokens[i - 1])) return i;
		i--;
	}
	return 0;
}

const RAMP_WORDS = 30;

function rampWpm(
	startWpm: number,
	targetWpm: number,
	currentIndex: number,
	_totalWords: number,
): number {
	if (currentIndex >= RAMP_WORDS) return targetWpm;
	const progress = currentIndex / RAMP_WORDS;
	return startWpm + (targetWpm - startWpm) * progress;
}
