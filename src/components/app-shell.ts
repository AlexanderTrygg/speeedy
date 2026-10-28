import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ParsedDocument, Route, UserProfile } from "../models/types.js";
import { audioService } from "../services/audio-service.js";
import { loadProfile, saveProfile } from "../services/storage-service.js";
import { createDocFromText } from "../services/text-parser.js";
import { applyTheme } from "../services/theme-service.js";

import "./app-page.ts";
import "./profile-page.ts";
import "./global-tooltip.ts";
import "./rsvp-reader.ts";
import "./stats-dashboard.ts";
import "./toast-container.ts";
import { showToast } from "../utils/events.js";

@customElement("app-shell")
export class AppShell extends LitElement {
	protected override createRenderRoot() {
		return this;
	}

	@state() private route: Route = "app";
	@state() private pendingDoc: ParsedDocument | null = null;
	@state() private pendingSavedDocId: string | null = null;
	@state() private pendingResumeIndex = 0;
	@state() private profile: UserProfile | null = null;

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		this.profile = await loadProfile();
		applyTheme(this.profile.settings.theme);
		this.handleHashChange();
		window.addEventListener("hashchange", this.handleHashChange);
		window.addEventListener("speeedy:navigate", this.handleNavigate);
		window.addEventListener(
			"speeedy:profile-updated",
			this.handleProfileUpdated,
		);
		window.addEventListener(
			"unhandledrejection",
			this.handleUnhandledRejection,
		);
		document.addEventListener("pointerdown", this.handleGlobalClick, {
			capture: true,
		});
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		window.removeEventListener("hashchange", this.handleHashChange);
		window.removeEventListener("speeedy:navigate", this.handleNavigate);
		window.removeEventListener(
			"speeedy:profile-updated",
			this.handleProfileUpdated,
		);
		window.removeEventListener(
			"unhandledrejection",
			this.handleUnhandledRejection,
		);
		document.removeEventListener("pointerdown", this.handleGlobalClick, {
			capture: true,
		});
	}

	private handleGlobalClick = (e: PointerEvent): void => {
		audioService.initOnInteraction();

		if (!this.profile) return;
		const s = this.profile.settings;
		if (!(s.clickSoundEnabled ?? false)) return;

		const el = e.target as Element | null;
		if (!el) return;
		const btn = el.closest(
			"button, a[href], [role='button'], [role='switch'], label[for]",
		) as HTMLElement | null;
		if (
			!btn ||
			btn.hasAttribute("disabled") ||
			(btn as HTMLButtonElement).disabled
		)
			return;

		if (
			btn.hasAttribute("data-mute-toggle") ||
			btn.closest("[data-mute-toggle]")
		)
			return;

		const overrideType = btn.getAttribute("data-click-sound");
		if (
			overrideType === "tick" ||
			overrideType === "comma" ||
			overrideType === "sentence"
		) {
			audioService.playTick(overrideType, s.clickSoundPitch ?? 1.0);
			return;
		}
		if (
			btn.closest(".rsvp-open-btn") ||
			btn.closest(".rsvp-done-btn") ||
			btn.classList.contains("theme-button") ||
			btn.tagName === "A"
		) {
			audioService.playTick("sentence", s.clickSoundPitch ?? 1.0);
			return;
		}
		if (
			btn.classList.contains("hud-tool-btn") ||
			btn.closest(".hud-tool-btn") ||
			btn.closest(".rsvp-prefs-menu")
		) {
			audioService.playTick("tick", s.clickSoundPitch ?? 1.0);
			return;
		}
		audioService.playTick("comma", s.clickSoundPitch ?? 1.0);
	};

	private handleHashChange = (): void => {
		const hash = window.location.hash.replace("#/", "").replace("#", "");
		if (hash.startsWith("read/")) {
			const encoded = hash.replace("read/", "");
			try {
				const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
				const binary = atob(base64);
				const bytes = new Uint8Array(binary.length);
				for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
				const text = new TextDecoder().decode(bytes);

				this.pendingDoc = createDocFromText(text, "Shared Reading");
				this.route = "reader";
			} catch (e) {
				console.error("Failed to parse read link:", e);
				this.route = "app";
			}
		} else if (hash === "stats") {
			this.route = "stats";
		} else if (hash === "profile") {
			this.route = "profile";
		} else if (hash === "reader") {
			this.route = "reader";
		} else {
			this.route = "app";
		}
		window.scrollTo(0, 0);
	};

	private handleNavigate = (e: Event): void => {
		const ce = e as CustomEvent<{
			route: Route;
			doc?: ParsedDocument;
			savedDocId?: string;
			resumeWordIndex?: number;
		}>;
		if (ce.detail.doc) this.pendingDoc = ce.detail.doc;
		if (ce.detail.savedDocId != null)
			this.pendingSavedDocId = ce.detail.savedDocId;
		if (ce.detail.resumeWordIndex != null)
			this.pendingResumeIndex = ce.detail.resumeWordIndex;
		window.location.hash = `/${ce.detail.route}`;
	};

	private handleUnhandledRejection = (e: PromiseRejectionEvent): void => {
		const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
		if (!msg) return;
		const isInternal =
			e.reason instanceof TypeError || /cannot read propert/i.test(msg);
		showToast(
			isInternal ? "Something went wrong. Refresh the page." : msg,
			"error",
		);
	};

	private handleProfileUpdated = async (e: Event): Promise<void> => {
		const ce = e as CustomEvent<{ profile: UserProfile }>;
		this.profile = ce.detail.profile;
		await saveProfile(this.profile);
		applyTheme(this.profile.settings.theme);
	};

	override render() {
		if (!this.profile) {
			return html`
        <div class="flex items-center justify-center min-h-screen">
          <span class="loading loading-ring loading-lg text-primary"></span>
        </div>
      `;
		}

		return html`
      <div class="page-shell">
        <div class="page-enter">
          ${this.renderRoute()}
        </div>

        <toast-container></toast-container>
        <global-tooltip></global-tooltip>
      </div>
    `;
	}

	private renderRoute() {
		switch (this.route) {
			case "reader":
				return html`
          <rsvp-reader
            .profile=${this.profile}
            .pendingDoc=${this.pendingDoc}
            .savedDocId=${this.pendingSavedDocId}
            .resumeWordIndex=${this.pendingResumeIndex}
          ></rsvp-reader>
        `;
			case "stats":
				return html`<stats-dashboard .profile=${this.profile}></stats-dashboard>`;
			case "profile":
				return html`<profile-page .profile=${this.profile}></profile-page>`;
			default:
				return html`<app-page .profile=${this.profile}></app-page>`;
		}
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"app-shell": AppShell;
	}
}
