import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { BookOpen, Clipboard, Clock, Edit2, Play, Trash2 } from "lucide";
import type { BrainBundle, BrainItem } from "../models/brain.js";
import type {
	ParsedDocument,
	SavedDocument,
	ThemeName,
	UserProfile,
} from "../models/types.js";
import { tokenize } from "../services/rsvp-engine.js";
import {
	deleteSavedDocument,
	getSavedDocuments,
	loadBrainBundle,
	saveBrainBundle,
	saveDocument,
	saveProfile,
} from "../services/storage-service.js";
import { applyTheme, getResolvedTheme } from "../services/theme-service.js";
import { trackEvent } from "../utils/analytics.js";
import { emitProfileUpdated, navigate, showToast } from "../utils/events.js";
import { icon } from "../utils/icons.js";
import { countWords, estimateReadingMinutes } from "../utils/text-utils.js";
import "./start-preview-dialog.ts";
import "./ui/file-uploader.ts";
import "./ui/input.ts";

@customElement("app-page")
export class AppPage extends LitElement {
	protected override createRenderRoot() {
		return this;
	}

	@property({ type: Object }) profile!: UserProfile;
	@state() private pastedText = "";
	@state() private error = "";
	@state() private inputTab: "file" | "text" | "brain" = "file";
	@state() private brain: BrainBundle | null = null;
	@state() private brainQuery = "";
	@state() private loadedDocTitle = "";
	@state() private loadedDocText = "";
	@state() private customTitle = "";
	@state() private savedDocs: SavedDocument[] = [];
	@state() private welcomeDismissed = false;
	@state() private recentMinimized = false;
	@state() private previewOpen = false;

	private static readonly WELCOME_DISMISSED_KEY = "speeedy:welcome-dismissed";
	private static readonly RECENT_MINIMIZED_KEY = "speeedy:recent-minimized";
	/** Auto-open start preview when a file has at least this many words. */
	private static readonly PREVIEW_AUTO_OPEN_WORDS = 400;

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		this.welcomeDismissed =
			localStorage.getItem(AppPage.WELCOME_DISMISSED_KEY) !== null;
		this.recentMinimized =
			localStorage.getItem(AppPage.RECENT_MINIMIZED_KEY) === "1";
		this.savedDocs = await getSavedDocuments();
		this.brain = await loadBrainBundle();
		if (this.brain) this.inputTab = "brain";

		const isFirstVisit =
			(this.profile?.sessions?.length ?? 0) === 0 &&
			this.savedDocs.length === 0;
		if (isFirstVisit) {
			this.pastedText = DEMO_TEXT;
			this.loadedDocTitle = "Demo: så funkar snabbläsning";
			this.loadedDocText = DEMO_TEXT;
			this.customTitle = "Demo: så funkar snabbläsning";
			this.inputTab = "text";
		}

		document.addEventListener("paste", this.handleGlobalPaste);
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		document.removeEventListener("paste", this.handleGlobalPaste);
	}

	private dismissWelcome(): void {
		localStorage.setItem(AppPage.WELCOME_DISMISSED_KEY, "1");
		this.welcomeDismissed = true;
	}

	/**
	 * Intercepts Ctrl+V / Cmd+V anywhere on the page.
	 * If the paste doesn't land inside a real text field, auto-load
	 * the pasted content into the reader textarea and switch to the text tab.
	 */
	private handleGlobalPaste = (e: ClipboardEvent): void => {
		// Let the browser handle paste that lands in a real input/textarea.
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement
		)
			return;

		const text = e.clipboardData?.getData("text/plain")?.trim();
		if (!text) return;

		this.pastedText = text;
		this.loadedDocTitle = "";
		this.loadedDocText = "";
		this.customTitle = "";
		this.inputTab = "text";
		this.error = "";
		showToast("Text hämtad från urklipp ✓", "success");
		trackEvent("clipboard-paste", { words: text.split(/\s+/).length });
	};

	/**
	 * Explicit clipboard read via the Clipboard API button.
	 * Prompts the browser for clipboard-read permission if needed.
	 */
	private pasteFromClipboard = async (): Promise<void> => {
		try {
			const text = await navigator.clipboard.readText();
			if (!text.trim()) {
				showToast("Urklipp är tomt", "error");
				return;
			}
			this.pastedText = text.trim();
			this.loadedDocTitle = "";
			this.loadedDocText = "";
			this.customTitle = "";
			this.error = "";
			showToast("Text hämtad från urklipp ✓", "success");
			trackEvent("clipboard-paste", { words: text.trim().split(/\s+/).length });
		} catch {
			// Permission denied or clipboard unavailable — fail silently.
			showToast(
				"Kunde inte läsa urklipp — klistra in direkt i textrutan",
				"error",
			);
		}
	};

	private handleFileParsed = (
		e: CustomEvent<{ doc: ParsedDocument }>,
	): void => {
		const doc = e.detail.doc;
		this.pastedText = doc.text;
		this.loadedDocTitle = doc.title;
		this.loadedDocText = doc.text;
		this.customTitle = doc.title;
		this.error = "";
		this.inputTab = "text";
		const ext = doc.title.includes(".")
			? (doc.title.split(".").pop()?.toLowerCase() ?? "unknown")
			: "unknown";
		trackEvent("file-uploaded", { type: ext, words: doc.wordCount });
		if (doc.wordCount >= AppPage.PREVIEW_AUTO_OPEN_WORDS) {
			this.previewOpen = true;
			trackEvent("preview-opened", {
				source: "auto-upload",
				words: doc.wordCount,
			});
		}
	};

	private handleBrainImported = async (
		e: CustomEvent<{ bundle: BrainBundle }>,
	): Promise<void> => {
		const { bundle } = e.detail;
		try {
			await saveBrainBundle(bundle);
		} catch (err) {
			console.error("[speeedy] Failed to save brain bundle:", err);
			showToast("Kunde inte spara texterna från hjärnan.", "error");
			return;
		}
		this.brain = bundle;
		this.brainQuery = "";
		this.inputTab = "brain";
		this.error = "";
		showToast(`${bundle.items.length} texter från hjärnan ✓`, "success");
	};

	/** A saved copy of a vault text, matched by title, so progress carries over. */
	private savedCopy(item: BrainItem): SavedDocument | undefined {
		return this.savedDocs.find((d) => d.title === item.title);
	}

	private openBrainItem(item: BrainItem): void {
		const saved = this.savedCopy(item);
		if (saved && saved.completionPercent > 0 && saved.completionPercent < 98) {
			navigate(
				"reader",
				{ title: saved.title, text: saved.text, wordCount: saved.wordCount },
				saved.id,
				saved.resumeWordIndex,
			);
			return;
		}
		this.handleFileParsed(
			new CustomEvent("file-parsed", {
				detail: {
					doc: {
						title: item.title,
						text: item.text,
						wordCount: item.wordCount,
					},
				},
			}),
		);
	}

	private handleFileError = (e: CustomEvent<{ message: string }>): void => {
		this.error = e.detail.message;
		showToast(e.detail.message, "error");
	};

	private openPreview = (): void => {
		if (!this.pastedText.trim()) {
			this.error =
				"Inget att visa än. Klistra in text eller välj en fil först.";
			return;
		}
		this.error = "";
		this.previewOpen = true;
		trackEvent("preview-opened", {
			source: "manual",
			words: countWords(this.pastedText),
		});
	};

	private handleStartReading = async (startWordIndex = 0): Promise<void> => {
		const text = this.pastedText.trim();
		if (!text) {
			this.error =
				"Inget att läsa än. Klistra in text eller välj en fil först.";
			return;
		}
		const wordCount = countWords(text);
		const tokenCount = tokenize(text).length;
		const safeStart = Math.max(
			0,
			Math.min(startWordIndex, Math.max(0, tokenCount - 1)),
		);
		const baseTitle =
			this.customTitle.trim() || this.loadedDocTitle || "Inklistrad text";
		const isModified =
			this.loadedDocText.length > 0 && text !== this.loadedDocText;
		const title = isModified ? `${baseTitle} – redigerad` : baseTitle;
		const completionPercent =
			wordCount > 0 ? Math.round((safeStart / wordCount) * 100) : 0;
		let saved: SavedDocument;
		try {
			saved = await saveDocument({
				title,
				text,
				wordCount,
				resumeWordIndex: safeStart,
				completionPercent,
			});
		} catch (err) {
			console.error("[speeedy] Failed to save document:", err);
			this.error =
				"Kunde inte spara dokumentet. Försök igen eller klistra in en kortare text.";
			showToast(this.error, "error");
			return;
		}
		trackEvent("reader-opened", {
			source: this.loadedDocTitle ? "file" : "paste",
			words: wordCount,
			startWordIndex: safeStart,
		});
		this.previewOpen = false;
		this.loadedDocTitle = "";
		this.loadedDocText = "";
		this.customTitle = "";
		this.pastedText = "";
		navigate(
			"reader",
			{ title: saved.title, text: saved.text, wordCount: saved.wordCount },
			saved.id,
			saved.resumeWordIndex,
		);
	};

	private cycleTheme(): void {
		const current: ThemeName = this.profile?.settings?.theme ?? "system";
		const effective =
			current === "system" ? getResolvedTheme(current) : current;
		const next: ThemeName = effective === "light" ? "dark" : "light";
		applyTheme(next);
		const updated: UserProfile = {
			...this.profile,
			settings: { ...this.profile.settings, theme: next },
		};
		saveProfile(updated);
		emitProfileUpdated(updated);
	}

	private themeIcon(theme: ThemeName) {
		const effective = theme === "system" ? getResolvedTheme(theme) : theme;
		if (effective === "dark") {
			return html`<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
              </svg>`;
		}
		return html`<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M12 3v2m0 14v2M3 12H1m22 0h-2M4.929 4.929l1.414 1.414m11.314 11.314l1.414 1.414M4.929 19.071l1.414-1.414m11.314-11.314l1.414-1.414M12 8a4 4 0 100 8 4 4 0 000-8z"/>
            </svg>`;
	}

	override render() {
		const theme: ThemeName = this.profile?.settings?.theme ?? "system";
		const effectiveTheme = theme === "system" ? getResolvedTheme(theme) : theme;
		const themeTitle =
			effectiveTheme === "dark"
				? "Tema: mörkt — tryck för ljust"
				: "Tema: ljust — tryck för mörkt";
		return html`
      <div class="h-screen flex flex-col bg-base-100 overflow-hidden relative">

        <nav class="px-4 md:px-10 py-3 md:py-4 flex items-center justify-between shrink-0 gap-2 min-h-[48px]">
          <div class="flex items-center gap-2 md:gap-3 min-w-0">
            <span class="text-sm md:text-base tracking-[0.2em] md:tracking-[0.25em] font-light text-base-content select-none truncate">speed reader</span>
          </div>
          <div class="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button type="button" class="btn btn-ghost btn-sm gap-1.5 min-h-[44px] min-w-[44px] touch-manipulation" @click=${() => navigate("profile")}>
              ${
								this.profile?.avatarImage
									? html`<img src=${this.profile.avatarImage} alt="Profil" class="w-6 h-6 rounded-full object-cover shrink-0" />`
									: html`<span class="text-base leading-none">${this.profile?.avatarEmoji ?? "📚"}</span>`
							}
              <span class="hidden sm:inline">${this.profile?.displayName ?? "Profil"}</span>
            </button>
            <button type="button" class="btn btn-ghost btn-sm gap-2 min-h-[44px] min-w-[44px] touch-manipulation" @click=${() => navigate("stats")}>
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
              </svg>
              <span class="hidden sm:inline">Statistik</span>
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-circle min-h-[44px] min-w-[44px] touch-manipulation"
              title="${themeTitle}"
              aria-label="${themeTitle}"
              @click=${this.cycleTheme}
            >
              ${this.themeIcon(theme)}
            </button>
          </div>
        </nav>


        <main class="flex-1 flex flex-col items-center justify-center px-4 min-h-0 overflow-auto">

          <div class="mb-5 md:mb-6 text-center select-none">
            <h1 class="text-2xl sm:text-3xl font-extralight tracking-tight text-base-content leading-tight mb-1">
              Vad vill du läsa <span class="font-semibold">idag?</span>
            </h1>
            ${
							(this.profile?.sessions?.length ?? 0) > 0
								? html`
              <p class="text-xs text-ui-muted-subtle font-light">
                Ditt snitt: <span class="font-mono text-ui-muted">${Math.round((this.profile?.sessions?.reduce((sum, s) => sum + s.wpm, 0) ?? 0) / Math.max(this.profile?.sessions?.length ?? 1, 1))} ord/min</span>
              </p>`
								: html`
              <p class="text-xs text-ui-muted-subtle font-light">
                Välj en fil, en text från hjärnan eller klistra in text
              </p>`
						}
          </div>

          ${
						this.profile?.onboardingSeen &&
						(this.profile?.sessions?.length ?? 0) === 0
							? html`
            <div class="welcome-banner w-full max-w-xl mb-4 ${this.welcomeDismissed ? "dismissed" : ""}">
              <div class="rounded-xl bg-primary/8 border border-primary/20 px-4 py-3 flex items-start gap-3 relative">
                <div class="text-sm text-ui-muted font-light leading-relaxed pr-8">
                  En demotext är laddad — tryck <strong class="font-medium text-base-content">Börja läsa</strong> för att prova,
                  eller klistra in din egen text.
                </div>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs btn-circle absolute top-2 right-2 text-ui-muted-subtle hover:text-base-content"
                  aria-label="Stäng tipset"
                  @click=${this.dismissWelcome}
                >
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            </div>
          `
							: ""
					}

          <div class="w-full max-w-xl">
            <div class="bg-base-100 border border-base-200 rounded-xl md:rounded-2xl shadow-sm overflow-hidden">
              <div class="flex border-b border-base-200">
                ${(["brain", "file", "text"] as const).map(
									(tab) => html`
                  <button
                    type="button"
                    class="flex-1 py-3.5 md:py-3 text-sm transition-colors min-h-[44px] touch-manipulation
                      ${
												this.inputTab === tab
													? "text-base-content font-medium border-b-2 border-primary -mb-px"
													: "text-ui-muted hover:text-base-content"
											}"
                    @click=${() => {
											this.inputTab = tab;
											this.error = "";
										}}
                  >${{ brain: "Hjärnan", file: "Fil", text: "Text" }[tab]}</button>
                `,
								)}
              </div>

              <div class="p-4 md:p-6">
                ${this.inputTab === "brain" ? this.renderBrainTab() : ""}
                ${this.inputTab === "file" ? this.renderFileTab() : ""}
                ${this.inputTab === "text" ? this.renderTextTab() : ""}
              </div>

              ${
								this.error
									? html`
                <div class="mx-5 mb-4 flex items-center gap-2 text-error text-sm">
                  <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  ${this.error}
                </div>`
									: ""
							}
            </div>
          </div>
        </main>

        ${this.savedDocs.length > 0 ? this.renderLibrary() : ""}

        <start-preview-dialog
          .open=${this.previewOpen}
          .title=${this.customTitle.trim() || this.loadedDocTitle || "Välj var du vill börja"}
          .text=${this.pastedText}
          @preview-close=${() => {
						this.previewOpen = false;
					}}
          @preview-start=${(e: CustomEvent<{ startWordIndex: number }>) => {
						void this.handleStartReading(e.detail.startWordIndex);
					}}
        ></start-preview-dialog>

        <footer class="shrink-0 px-4 md:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-base-200/60">
          <span class="text-xs tracking-[0.3em] text-ui-muted-subtle font-light">speed reader</span>
        </footer>
      </div>
    `;
	}

	private renderFileTab() {
		return html`
      <speeedy-file-uploader
        label="Släpp en fil här eller tryck för att välja"
        hint="PDF · DOCX · TXT · EPUB · RTF · HTML · ODT · med flera · upp till 50 MB"
        @file-parsed=${this.handleFileParsed}
        @file-error=${this.handleFileError}
      ></speeedy-file-uploader>
    `;
	}

	private renderBrainTab() {
		const importer = (label: string, hint: string, compact: boolean) => html`
      <speeedy-file-uploader
        label=${label}
        hint=${hint}
        ?compact=${compact}
        @brain-imported=${this.handleBrainImported}
        @file-parsed=${this.handleFileParsed}
        @file-error=${this.handleFileError}
      ></speeedy-file-uploader>
    `;
		const where =
			"iCloud Drive › Struktur › 10-PROJECTS › 10.7-Speed Reader › hjarnan";

		if (!this.brain) {
			return html`
        <div class="flex flex-col gap-4">
          <p class="text-sm text-ui-muted font-light leading-relaxed">
            Läs kurslitteratur, transkript och läsguider ur Personlig Hjärna utan att
            köra OCR igen. Kör <code class="font-mono text-xs bg-base-200 px-1 py-0.5 rounded">npm run hjarnan</code>
            på datorn och välj sedan filen <span class="font-medium text-base-content">hjarnan.json</span> här.
          </p>
          ${importer("Välj hjarnan.json", where, false)}
        </div>
      `;
		}

		const q = this.brainQuery.trim().toLocaleLowerCase("sv");
		const items = q
			? this.brain.items.filter((i) =>
					`${i.title} ${i.group}`.toLocaleLowerCase("sv").includes(q),
				)
			: this.brain.items;
		const groups = new Map<string, BrainItem[]>();
		for (const item of items) {
			groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
		}
		const wpm = this.profile?.settings.wpm ?? 300;
		const exported = new Date(this.brain.generatedAt).toLocaleDateString("sv", {
			day: "numeric",
			month: "short",
		});
		const originLabel: Record<BrainItem["origin"], string> = {
			ocr: "OCR",
			pdf: "PDF",
			markdown: "text",
		};

		return html`
      <div class="flex flex-col gap-3">
        <input
          type="search"
          class="input input-bordered input-sm w-full"
          placeholder="Sök bland ${this.brain.items.length} texter…"
          aria-label="Sök i hjärnan"
          .value=${this.brainQuery}
          @input=${(e: InputEvent) => {
						this.brainQuery = (e.target as HTMLInputElement).value;
					}}
        />
        <div class="flex flex-col gap-4 max-h-[46vh] overflow-y-auto -mx-1 px-1 scrollbar-thin">
          ${
						items.length === 0
							? html`<p class="text-sm text-ui-muted text-center py-6">Inget matchar "${this.brainQuery}".</p>`
							: [...groups].map(
									([group, list]) => html`
            <section>
              <h3 class="text-xs uppercase tracking-widest text-ui-muted-subtle font-medium mb-1.5">${group}</h3>
              <ul class="flex flex-col gap-1">
                ${list.map((item) => {
									const saved = this.savedCopy(item);
									const pct = saved?.completionPercent ?? 0;
									const status =
										pct >= 98 ? "Läst" : pct > 0 ? `Fortsätt ${pct} %` : "";
									return html`
                  <li>
                    <button
                      type="button"
                      class="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-base-200 hover:border-primary/40 transition-colors min-h-[44px] touch-manipulation"
                      @click=${() => this.openBrainItem(item)}
                    >
                      <span class="flex-1 min-w-0">
                        <span class="block text-sm text-base-content truncate">${item.title}</span>
                        <span class="block text-xs text-ui-muted-subtle font-light">
                          ${item.kind === "läsguide" ? "Läsguide" : originLabel[item.origin]}
                          · ${item.wordCount.toLocaleString("sv")} ord
                          · ~${estimateReadingMinutes(item.wordCount, wpm)}
                        </span>
                      </span>
                      ${status ? html`<span class="text-xs text-primary font-medium shrink-0">${status}</span>` : ""}
                    </button>
                  </li>
                `;
								})}
              </ul>
            </section>
          `,
								)
					}
        </div>
        <div class="flex items-center justify-between gap-3 pt-1">
          <span class="text-xs text-ui-muted-subtle">Exporterad ${exported}</span>
          <div class="w-44">${importer("Uppdatera", "", true)}</div>
        </div>
      </div>
    `;
	}

	private loadDemoText(): void {
		this.pastedText = DEMO_TEXT;
		this.loadedDocTitle = "Demo: så funkar snabbläsning";
		this.loadedDocText = DEMO_TEXT;
		this.customTitle = "Demo: så funkar snabbläsning";
		trackEvent("demo-loaded");
	}

	private renderTextTab() {
		const words = countWords(this.pastedText);
		const wpm = this.profile?.settings.wpm ?? 300;
		const estTimeLabel = words > 0 ? estimateReadingMinutes(words, wpm) : "";
		const timeDisplay = estTimeLabel
			? ` · ~${estTimeLabel} i ${wpm} ord/min`
			: "";

		return html`
      <div class="flex flex-col gap-4">
        ${
					this.loadedDocTitle
						? html`
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/8 border border-primary/15">
            <svg class="w-3.5 h-3.5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span class="text-xs text-primary font-medium truncate">${this.loadedDocTitle}</span>
            <span class="text-xs text-ui-muted ml-auto shrink-0">hämtad ✓</span>
          </div>
        `
						: ""
				}
        ${
					!this.pastedText
						? html`
          <div class="flex gap-2">
            <button
              class="btn btn-outline btn-sm flex-1 gap-2 border-dashed"
              @click=${this.loadDemoText}
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
              Prova en demo
            </button>
            <button
              class="btn btn-outline btn-sm gap-2 border-dashed"
              title="Hämta text från urklipp"
              @click=${() => void this.pasteFromClipboard()}
            >
              ${icon(Clipboard, "w-3.5 h-3.5")}
              Klistra in
            </button>
          </div>
        `
						: ""
				}
        <speeedy-input
          id="doc-title-input"
          label="Titel"
          placeholder="Inklistrad text"
          .value=${this.customTitle}
          @change=${(e: CustomEvent<{ value: string }>) => {
						this.customTitle = e.detail.value;
					}}
        ></speeedy-input>
        <speeedy-textarea
          id="doc-text-input"
          label="Text att läsa"
          placeholder="Klistra in din text här…"
          .value=${this.pastedText}
          min-height="7rem"
          max-height="14rem"
          @change=${(e: CustomEvent<{ value: string }>) => {
						this.pastedText = e.detail.value;
					}}
        ></speeedy-textarea>
        ${
					words >= AppPage.PREVIEW_AUTO_OPEN_WORDS
						? html`
          <p class="text-xs text-ui-muted font-light leading-relaxed -mt-1">
            Långt dokument — använd <span class="text-base-content/80">Förhandsvisa</span> för att hoppa förbi förord och innehållsförteckning.
          </p>
        `
						: ""
				}
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-ui-muted font-mono">
            ${words > 0 ? `${words.toLocaleString()} ord${timeDisplay}` : ""}
          </span>
          <div class="flex gap-2 flex-wrap justify-end">
            ${
							this.pastedText
								? html`
              <button class="btn btn-ghost btn-sm" @click=${() => {
								this.pastedText = "";
								this.loadedDocTitle = "";
								this.loadedDocText = "";
								this.customTitle = "";
							}}>Rensa</button>
            `
								: ""
						}
            <button
              class="btn btn-outline btn-sm"
              data-umami-event="open-preview"
              ?disabled=${!this.pastedText.trim()}
              @click=${this.openPreview}
            >Förhandsvisa</button>
            <button
              class="btn btn-primary btn-sm"
              data-umami-event="begin-reading"
              ?disabled=${!this.pastedText.trim()}
              @click=${() => void this.handleStartReading()}
            >Börja läsa</button>
          </div>
        </div>
      </div>
    `;
	}

	private renderLibrary() {
		return html`
      <div class="w-full max-w-xl mt-4 mb-4 px-4 md:ml-4">
        <div class="flex items-center justify-between mb-3 px-1">
          <div class="flex items-center gap-2">
            ${icon(BookOpen, "w-3.5 h-3.5 text-ui-muted-subtle")}
            <span class="text-xs uppercase tracking-widest text-ui-muted-subtle font-medium">Senast</span>
          <button
              class="btn btn-ghost btn-xs btn-circle ml-1"
              title="${this.recentMinimized ? "Visa alla" : "Minimera"}"
              aria-label="${this.recentMinimized ? "Visa senaste dokument" : "Minimera senaste dokument"}"
              aria-expanded="${!this.recentMinimized}"
              @click=${() => {
								this.recentMinimized = !this.recentMinimized;
								localStorage.setItem(
									AppPage.RECENT_MINIMIZED_KEY,
									this.recentMinimized ? "1" : "0",
								);
							}}
            >
              <svg class="w-3.5 h-3.5 transition-transform duration-200 ${this.recentMinimized ? "rotate-180" : ""}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
          </div>
          ${
						this.savedDocs.length > 3 && !this.recentMinimized
							? html`
            <button class="btn btn-ghost btn-xs text-xs text-ui-muted" @click=${() => {
							sessionStorage.setItem("speeedy:profile-tab", "library");
							navigate("profile");
						}}>Visa alla →</button>
          `
							: ""
					}
        </div>

        <div
          class="flex flex-col gap-1.5 overflow-y-auto pr-2 scrollbar-thin transition-all duration-300 ease-out"
          style="max-height: ${this.recentMinimized ? "0px" : "220px"}; opacity: ${this.recentMinimized ? "0" : "1"}; margin-top: ${this.recentMinimized ? "-1rem" : "0"}"
        >
          ${this.savedDocs.length > 0 ? this.savedDocs.slice(0, 15).map((doc) => this.renderDocCard(doc)) : ""}
        </div>
      </div>
    `;
	}

	private renderDocCard(doc: SavedDocument) {
		const pct = doc.completionPercent;
		const resumeLabel =
			pct >= 98 ? "Läs igen" : pct > 0 ? `Fortsätt ${pct} %` : "Läs";
		const date = new Date(doc.savedAt).toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
		});

		return html`
      <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-base-200 hover:border-primary/30 transition-colors group">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-base-content truncate">${doc.title}</div>
          <div class="flex items-center gap-2 mt-0.5">
            ${icon(Clock, "w-3 h-3 text-ui-muted-subtle")}
            <span class="text-xs text-ui-muted-subtle font-light">${date} · ${doc.wordCount.toLocaleString()} ord</span>
          </div>
          ${
						pct > 0 && pct < 98
							? html`
            <div class="w-full h-0.5 bg-base-300 rounded-full mt-1.5 overflow-hidden">
              <div class="h-full bg-primary/50 rounded-full" style="width: ${pct}%"></div>
            </div>
          `
							: ""
					}
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <button
            class="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 transition-opacity text-ui-muted hover:text-base-content"
            title="Redigera"
            aria-label="Redigera ${doc.title}"
            @click=${() => {
							this.customTitle = doc.title;
							this.pastedText = doc.text;
							this.loadedDocTitle = doc.title;
							this.loadedDocText = doc.text;
							this.inputTab = "text";
							window.scrollTo({ top: 0, behavior: "smooth" });
						}}
          >
            ${icon(Edit2, "w-3.5 h-3.5")}
          </button>
          <button
            class="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 transition-opacity text-error/60 hover:text-error"
            title="Ta bort"
            aria-label="Ta bort ${doc.title}"
            @click=${async () => {
							await deleteSavedDocument(doc.id);
							this.savedDocs = await getSavedDocuments();
						}}
          >
            ${icon(Trash2, "w-3.5 h-3.5")}
          </button>
          <button
            class="btn btn-primary btn-xs gap-1.5 rounded-lg ml-1"
            data-umami-event="library-resume"
            @click=${() => {
							const resumeIndex = pct >= 98 ? 0 : doc.resumeWordIndex;
							trackEvent("reader-opened", {
								source: "library",
								words: doc.wordCount,
							});
							navigate(
								"reader",
								{ title: doc.title, text: doc.text, wordCount: doc.wordCount },
								doc.id,
								resumeIndex,
							);
						}}
          >
            ${icon(Play, "w-3 h-3")} ${resumeLabel}
          </button>
        </div>
      </div>
    `;
	}
}

const DEMO_TEXT = `När du läser en rad text glider inte ögonen jämnt fram. De hoppar. Hoppen kallas sackader och sker tre till fyra gånger i sekunden, och under själva hoppet läser du ingenting.

Här kommer orden till dig i stället, ett i taget, på samma plats. Blicken står still. Den röda bokstaven är ordets fokuspunkt, där hjärnan känner igen ordet snabbast.

Efter varje mening kommer en kort paus. Den finns där för att arbetsminnet ska hinna knyta ihop meningen innan nästa börjar. Pausen finns kvar även när du ökar tempot.

Tappade du tråden? Svep åt höger för att gå tillbaka till början av meningen, och svep igen för meningen före. Svep åt vänster för att hoppa fram. Tryck på texten för att pausa.

En vuxen läser ungefär tvåhundrafemtio ord i minuten. Börja där, och höj tempot först när det känns lätt.`;

declare global {
	interface HTMLElementTagNameMap {
		"app-page": AppPage;
	}
}
