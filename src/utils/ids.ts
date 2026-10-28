/**
 * crypto.randomUUID and crypto.subtle only exist in secure contexts (https or
 * localhost). Opened over plain http — e.g. the dev server from a phone on the
 * LAN — they are undefined, saving a document throws, and so does the toast
 * that should report it, so uploads seem to silently stop working.
 */
export function newId(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
		"",
	);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** SHA-256 hex digest, or a non-cryptographic FNV-1a hash where subtle is missing. */
export async function contentHash(text: string): Promise<string> {
	if (typeof crypto !== "undefined" && crypto.subtle) {
		const buf = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(text),
		);
		return Array.from(new Uint8Array(buf))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	}
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 0x01000193);
		h2 = Math.imul(h2 ^ c, 0x811c9dc5);
	}
	return `fnv-${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}-${text.length}`;
}
