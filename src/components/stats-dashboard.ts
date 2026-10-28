import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Flame, TrendingUp, Trophy, Zap } from "lucide";
import type { UserProfile } from "../models/types.js";
import {
	formatDuration,
	formatNumber,
	getAverageWpm,
	getDailyWordsRead,
	getRecentWpms,
	getTodayWords,
} from "../services/stats-service.js";
import { icon } from "../utils/icons.js";
import "./ui/page-nav.js";
import "./ui/stat-card.js";

@customElement("stats-dashboard")
export class StatsDashboard extends LitElement {
	protected override createRenderRoot() {
		return this;
	}

	@property({ type: Object }) profile!: UserProfile;
	@state() private activeTab: "overview" | "sessions" | "goals" = "overview";

	override render() {
		return html`
      <div class="min-h-screen bg-base-100 flex flex-col">
        <speeedy-page-nav label="Statistik" back-route="app"></speeedy-page-nav>
        <main class="flex-1 max-w-4xl mx-auto w-full px-4 py-10">
          ${this.renderTabs()}
          <div class="mt-8">
            ${this.activeTab === "overview" ? this.renderOverview() : ""}
            ${this.activeTab === "sessions" ? this.renderSessions() : ""}
            ${this.activeTab === "goals" ? this.renderGoals() : ""}
          </div>
        </main>
      </div>
    `;
	}

	private renderTabs() {
		const tabs = [
			{ id: "overview", label: "Översikt" },
			{ id: "sessions", label: "Pass" },
			{ id: "goals", label: "Mål" },
		] as const;
		return html`
      <div class="tabs tabs-bordered">
        ${tabs.map(
					(tab) => html`
          <button
            class="tab ${this.activeTab === tab.id ? "tab-active" : ""}"
            @click=${() => {
							this.activeTab = tab.id;
						}}
          >${tab.label}</button>
        `,
				)}
      </div>
    `;
	}

	private renderOverview() {
		const p = this.profile;
		const avgWpm = getAverageWpm(p);
		const todayWords = getTodayWords(p);
		const goalTarget = p.goals?.target ?? 10000;
		const goalProgress =
			goalTarget > 0 ? Math.min(100, (todayWords / goalTarget) * 100) : 0;

		return html`
      <div class="flex flex-col gap-8">

        <div class="flex flex-col gap-3">
          <div class="border border-primary/20 bg-primary/5 rounded-xl px-6 py-5 flex items-center justify-between">
            <div>
              <div class="text-xs uppercase tracking-widest text-primary font-medium mb-1">Snittempo</div>
              <div class="text-5xl font-extralight tabular-nums text-base-content leading-none">
                ${avgWpm > 0 ? avgWpm : "—"}
              </div>
              <div class="text-sm text-ui-muted mt-1 font-light">ord per minut</div>
            </div>
            <div class="opacity-20">${icon(Zap, "w-12 h-12 text-primary")}</div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div class="border border-base-200 rounded-xl px-4 py-3">
              <div class="text-xs text-ui-muted-subtle uppercase tracking-widest mb-1">Lästa ord</div>
              <div class="text-xl font-light tabular-nums">${formatNumber(p.totalWordsRead)}</div>
            </div>
            <div class="border border-base-200 rounded-xl px-4 py-3">
              <div class="text-xs text-ui-muted-subtle uppercase tracking-widest mb-1">Tid</div>
              <div class="text-xl font-light tabular-nums">${formatDuration(p.totalTimeMs)}</div>
            </div>
            <div class="border border-base-200 rounded-xl px-4 py-3">
              <div class="text-xs text-ui-muted-subtle uppercase tracking-widest mb-1">Pass</div>
              <div class="text-xl font-light tabular-nums">${p.sessions.length}</div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="border border-orange-500/20 bg-orange-500/5 rounded-xl px-5 py-4">
            <div class="text-xs uppercase tracking-widest text-ui-muted-subtle font-medium mb-1">Svit just nu</div>
            <div class="flex items-end gap-2">
              <span class="text-4xl font-light tabular-nums">${p.currentStreak}</span>
              <span class="flex items-center gap-1 text-ui-muted mb-1 text-sm">dagar ${icon(Flame, "w-4 h-4 text-orange-400")}</span>
            </div>
          </div>
          <div class="border border-yellow-500/20 bg-yellow-500/5 rounded-xl px-5 py-4">
            <div class="text-xs uppercase tracking-widest text-ui-muted-subtle font-medium mb-1">Längsta svit</div>
            <div class="flex items-end gap-2">
              <span class="text-4xl font-light tabular-nums">${p.bestStreak}</span>
              <span class="flex items-center gap-1 text-ui-muted mb-1 text-sm">dagar ${icon(Trophy, "w-4 h-4 text-yellow-400")}</span>
            </div>
          </div>
        </div>

        <div class="border border-base-200 rounded-xl px-5 py-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs uppercase tracking-widest text-ui-muted">Idag</span>
            <span class="text-sm font-mono tabular-nums text-ui-muted">${formatNumber(todayWords)} / ${formatNumber(goalTarget)}</span>
          </div>
          <progress class="progress progress-primary w-full" value=${goalProgress} max="100" aria-label="Dagens läsmål: ${Math.round(goalProgress)} % klart"></progress>
        </div>

        <div class="border border-base-200 rounded-xl px-5 py-5">
          <div class="flex items-center gap-2 text-xs uppercase tracking-widest text-ui-muted mb-4">${icon(TrendingUp, "w-3.5 h-3.5")} Tempo över tid</div>
          ${this.renderWpmChart()}
        </div>

        <div class="border border-base-200 rounded-xl px-5 py-5">
          <div class="text-xs uppercase tracking-widest text-ui-muted mb-4">Lästa ord (senaste 14 dagarna)</div>
          ${this.renderDailyChart()}
        </div>

      </div>
    `;
	}

	private renderWpmChart() {
		const wpms = getRecentWpms(this.profile, 20);
		if (wpms.length < 2) {
			return html`<p class="text-sm text-ui-muted text-center py-8">För lite data än. Läs några pass så syns utvecklingen här.</p>`;
		}

		const max = Math.max(...wpms);
		const min = Math.min(...wpms);
		const range = max - min || 1;
		const width = 500;
		const height = 80;
		const pad = 4;
		const pts = wpms
			.map((v, i) => {
				const x = pad + (i / (wpms.length - 1)) * (width - pad * 2);
				const y = height - pad - ((v - min) / range) * (height - pad * 2);
				return `${x},${y}`;
			})
			.join(" ");

		return html`
      <svg viewBox="0 0 ${width} ${height}" class="w-full" style="height: 80px">
        <polyline
          points="${pts}"
          fill="none"
          stroke="oklch(var(--p))"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        ${wpms.map((v, i) => {
					const x = pad + (i / (wpms.length - 1)) * (width - pad * 2);
					const y = height - pad - ((v - min) / range) * (height - pad * 2);
					return html`
            <circle cx="${x}" cy="${y}" r="3" fill="oklch(var(--p))"/>
          `;
				})}
      </svg>
      <div class="flex justify-between text-xs text-ui-muted font-mono mt-1">
        <span>${min} ord/min</span>
        <span>${max} ord/min</span>
      </div>
    `;
	}

	private renderDailyChart() {
		const data = getDailyWordsRead(this.profile, 14);
		const maxWords = Math.max(...data.map((d) => d.words), 1);

		return html`
      <div class="flex items-end gap-1 h-16">
        ${data.map((d) => {
					const heightPct = (d.words / maxWords) * 100;
					const isToday = d.date === new Date().toISOString().split("T")[0];
					return html`
            <div class="flex-1 flex flex-col items-center gap-1" title="${d.date}: ${d.words.toLocaleString()} ord">
              <div
                class="w-full rounded-t transition-all duration-300 ${isToday ? "bg-primary" : "bg-base-300"}"
                style="height: ${Math.max(heightPct, 2)}%"
              ></div>
            </div>
          `;
				})}
      </div>
      <div class="flex justify-between text-xs text-ui-muted mt-1">
        <span>14 dagar sedan</span>
        <span>Idag</span>
      </div>
    `;
	}

	private renderSessions() {
		const sessions = [...this.profile.sessions].reverse().slice(0, 50);
		if (sessions.length === 0) {
			return html`<p class="text-sm text-ui-muted text-center py-16">Inga pass än. Börja läsa!</p>`;
		}

		return html`
      <div class="flex flex-col gap-2">
        ${sessions.map(
					(s) => html`
          <div class="border border-base-200 rounded-xl hover:border-primary/30 transition-colors px-5 py-3">
              <div class="flex items-center justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium truncate">${s.sourceTitle}</div>
                  <div class="text-xs text-ui-muted mt-0.5">
                    ${new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div class="flex items-center gap-4 shrink-0 text-sm">
                  <div class="text-center">
                    <div class="font-mono font-medium tabular-nums">${s.wpm}</div>
                    <div class="text-xs text-ui-muted">ord/min</div>
                  </div>
                  <div class="text-center">
                    <div class="font-mono font-medium tabular-nums">${formatNumber(s.wordsRead)}</div>
                    <div class="text-xs text-ui-muted">ord</div>
                  </div>
                  <div class="text-center hidden sm:block">
                    <div class="font-mono font-medium tabular-nums">${s.completionPercent}%</div>
                    <div class="text-xs text-ui-muted">klart</div>
                  </div>
                </div>
              </div>
          </div>
        `,
				)}
      </div>
    `;
	}

	private renderGoals() {
		const p = this.profile;
		const todayWords = getTodayWords(p);
		const goalTarget = p.goals?.target ?? 10000;

		return html`
      <div class="flex flex-col gap-5 max-w-md">
        <div class="border border-base-200 rounded-xl px-5 py-5">
            <h3 class="font-medium mb-4 text-base-content">Dagligt mål</h3>
            <div class="flex items-center gap-4 mb-4">
              <label for="goal-input" class="sr-only">Dagligt mål i ord</label>
              <input
                id="goal-input"
                type="number" min="100" max="1000000" step="1000"
                class="input input-bordered w-36 font-mono tabular-nums"
                .value=${String(goalTarget)}
                @change=${(e: Event) => {
									const val = Number((e.target as HTMLInputElement).value);
									if (val > 0) {
										this.dispatchEvent(
											new CustomEvent("goal-update", {
												detail: { type: "words", target: val },
												bubbles: true,
												composed: true,
											}),
										);
									}
								}}
              />
              <span class="text-sm text-ui-muted">ord per dag</span>
            </div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-ui-muted">Idag</span>
              <span class="font-mono text-sm tabular-nums">${formatNumber(todayWords)} / ${formatNumber(goalTarget)}</span>
            </div>
            <progress
              class="progress progress-primary w-full"
              value=${Math.min(100, (todayWords / goalTarget) * 100)}
              max="100"
              aria-label="Dagens läsmål"
            ></progress>
        </div>

        <div class="border border-base-200 rounded-xl px-5 py-5">
            <h3 class="font-medium mb-3 text-base-content">Sviter</h3>
            <div class="flex gap-8">
              <div>
                <div class="flex items-center gap-2 text-3xl font-light tabular-nums">${p.currentStreak} ${icon(Flame, "w-5 h-5 text-orange-400")}</div>
                <div class="text-xs text-ui-muted mt-1">Svit just nu</div>
              </div>
              <div>
                <div class="flex items-center gap-2 text-3xl font-light tabular-nums">${p.bestStreak} ${icon(Trophy, "w-5 h-5 text-yellow-400")}</div>
                <div class="text-xs text-ui-muted mt-1">Längsta svit</div>
              </div>
            </div>
        </div>
      </div>
    `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"stats-dashboard": StatsDashboard;
	}
}
