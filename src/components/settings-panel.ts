import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type {
	FontFamily,
	FontWeight,
	ReaderSettings,
	ThemeName,
} from "../models/types.js";
import { getResolvedTheme } from "../services/theme-service.js";
import { trackEvent } from "../utils/analytics.js";
import "./ui/range.js";
import "./ui/segmented.js";
import "./ui/toggle.js";

const TOOLTIPS = {
	sentencePause: "Extra tid efter punkt, frågetecken och utropstecken.",
	paragraphPause: "Extra paus när ett nytt stycke börjar.",
	commaPause: "Extra tid efter kommatecken och semikolon.",
	pauseFloor:
		"Håller en minsta paus vid komma, meningsslut och stycken, så att meningarna inte flyter ihop i högt tempo.",
	letterSpacing: "Avståndet mellan bokstäverna.",
	pivotOffset:
		"Flyttar fokuspunkten åt vänster eller höger om du vill fästa blicken utanför mitten.",
	speedRamp:
		"Ökar tempot gradvis i början av passet så att hjärnan hinner vänja sig.",
	bionicMode:
		"Fetmarkerar de första bokstäverna i varje ord för att leda blicken.",
	smartSpeed:
		"Anpassar tiden per ord efter längden: korta, vanliga ord går fortare och långa sammansättningar får mer tid.",
	peripheralContext:
		"Visar föregående och nästa ord svagt, så att du håller tråden.",
	orpGuides:
		"Små markeringar ovanför och under fokuspunkten som hjälper blicken att stå still.",
	colorizeQuotes: "Färgar ord inom citattecken (dialog).",
	colorizeParens: "Färgar ord inom parentes eller hakparentes (inskott).",
	irlenMode:
		"Färgtoning som minskar visuell stress och hjälper fokus (Irlens syndrom).",
	dyslexiaMode:
		"Använder OpenDyslexic, ett typsnitt gjort för att vara lättläst vid dyslexi.",
	contextPauseOnClose:
		"Lite extra paus efter ) eller ] så att inskottet hinner landa.",
	commaAsPause: "Ger kommatecken lika lång paus som meningsslut.",
	countdown: "Räknar ner 3-2-1 innan texten börjar.",
	clickSound: "Mjuka klick i takt med orden, för rytm och fokus.",
	fontWeight:
		"Tjockare text är lättare att följa. Många med dyslexi föredrar halvfet till fet.",
	irlenOpacity: "Hur stark färgtoningen är.",
};

const FONTS: FontFamily[] = [
	"JetBrains Mono",
	"Fira Mono",
	"Source Code Pro",
	"Inconsolata",
	"IBM Plex Mono",
];

@customElement("settings-panel")
export class SettingsPanel extends LitElement {
	protected override createRenderRoot() {
		return this;
	}

	@property({ type: Object }) settings!: ReaderSettings;

	private emit(partial: Partial<ReaderSettings>): void {
		this.dispatchEvent(
			new CustomEvent("settings-change", {
				detail: { ...this.settings, ...partial },
				bubbles: true,
				composed: true,
			}),
		);
	}

	override render() {
		const s = this.settings;
		const theme: ThemeName = s.theme ?? "system";
		const effectiveTheme = theme === "system" ? getResolvedTheme(theme) : theme;
		const themeOptions: ("light" | "dark")[] = ["light", "dark"];
		const themeLabels: Record<"light" | "dark", string> = {
			light: "☀️ Ljust",
			dark: "🌙 Mörkt",
		};

		return html`
      <div class="flex flex-col gap-0 p-4 md:px-5 overflow-x-hidden">

        <!-- Theme -->
        <section class="pb-6">
          <span class="text-xs uppercase tracking-widest text-ui-muted block mb-2">Tema</span>
          <speeedy-segmented
            group-label="Tema"
            .options=${themeOptions.map((t) => ({ value: t, label: themeLabels[t] }))}
            .value=${effectiveTheme}
            @change=${(e: CustomEvent) => {
							trackEvent("theme-changed", { theme: e.detail.value });
							this.emit({ theme: e.detail.value });
						}}
          ></speeedy-segmented>
        </section>

        <!-- Speed -->
        <section class="pb-6">
          <speeedy-range
            label="Hastighet"
            min="50" max="1600" step="25"
            .value=${s.wpm}
            unit=" ord/min"
            min-label="50"
            max-label="1600"
            @change=${(e: CustomEvent) => this.emit({ wpm: e.detail.value })}
          ></speeedy-range>
        </section>

        <!-- Font Size -->
        <section class="pb-6">
          <speeedy-range
            label="Textstorlek"
            min="16" max="256" step="4"
            .value=${s.fontSize}
            unit="px"
            @change=${(e: CustomEvent) => this.emit({ fontSize: e.detail.value })}
          ></speeedy-range>
        </section>

        <!-- Letter Spacing -->
        <section class="pb-6">
          <speeedy-range
            label="Teckenavstånd"
            min="0" max="0.5" step="0.01"
            .value=${s.letterSpacing}
            .format=${(v: number) => `${v.toFixed(2)}em`}
            min-label="0em"
            max-label="0.5em"
            tip=${TOOLTIPS.letterSpacing}
            @change=${(e: CustomEvent) => this.emit({ letterSpacing: e.detail.value })}
          ></speeedy-range>
        </section>

        <!-- Pivot Position -->
        <section class="pb-6">
          <speeedy-range
            label="Fokuspunktens läge"
            min="-30" max="30" step="1"
            .value=${s.pivotOffset ?? 0}
            .format=${(v: number) => (v === 0 ? "Mitten" : v > 0 ? `+${v}%` : `${v}%`)}
            min-label="-30%"
            max-label="+30%"
            tip=${TOOLTIPS.pivotOffset}
            @change=${(e: CustomEvent) => this.emit({ pivotOffset: e.detail.value })}
          ></speeedy-range>
        </section>

        <!-- Words per flash -->
        <section class="pb-6">
          <span class="text-xs uppercase tracking-widest text-ui-muted block mb-2">Ord per visning</span>
          <speeedy-segmented
            group-label="Ord per visning"
            .options=${[1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 1 ? "1 ord" : `${n} ord` }))}
            .value=${s.chunkSize}
            tip="Hur många ord som visas åt gången. Fler ord går fortare men kan sänka förståelsen."
            @change=${(e: CustomEvent) => this.emit({ chunkSize: e.detail.value })}
          ></speeedy-segmented>
        </section>

        <!-- Advanced timing -->
        <section class="border-t border-base-200 pt-6 pb-2" aria-labelledby="settings-advanced-heading">
          <h2 id="settings-advanced-heading" class="text-xs uppercase tracking-widest text-ui-muted font-medium mb-4">
            Avancerad timing
          </h2>
          <div class="flex flex-col gap-5">
            <speeedy-range
              label="Paus vid meningsslut"
              min="1" max="10" step="0.5"
              .value=${s.sentencePauseMultiplier}
              unit="×"
              min-label="1×"
              max-label="10×"
              tip=${TOOLTIPS.sentencePause}
              @change=${(e: CustomEvent) => this.emit({ sentencePauseMultiplier: e.detail.value })}
            ></speeedy-range>
            <speeedy-range
              label="Paus vid komma"
              min="1" max="10" step="0.5"
              .value=${s.commaPauseMultiplier ?? s.sentencePauseMultiplier}
              unit="×"
              min-label="1×"
              max-label="10×"
              tip=${TOOLTIPS.commaPause}
              @change=${(e: CustomEvent) => this.emit({ commaPauseMultiplier: e.detail.value })}
            ></speeedy-range>
            <speeedy-toggle
              label="Minsta paus i högt tempo"
              hint="Pauserna försvinner inte när tempot ökar"
              ?checked=${s.pauseFloor ?? true}
              tip=${TOOLTIPS.pauseFloor}
              @change=${(e: CustomEvent) => this.emit({ pauseFloor: e.detail.value })}
            ></speeedy-toggle>
            <speeedy-range
              label="Paus vid nytt stycke"
              hint="Extra tid när ett stycke börjar"
              min="1" max="3" step="0.1"
              .value=${s.paragraphPauseMultiplier ?? 1}
              .format=${(v: number) => `${v.toFixed(1)}×`}
              min-label="1×"
              max-label="3×"
              tip=${TOOLTIPS.paragraphPause}
              @change=${(e: CustomEvent) => this.emit({ paragraphPauseMultiplier: e.detail.value })}
            ></speeedy-range>
            <div class="flex flex-col gap-3">
              <speeedy-toggle
                label="Uppvärmning"
                hint="Ökar gradvis till måltempot"
                ?checked=${s.speedRampEnabled}
                tip=${TOOLTIPS.speedRamp}
                @change=${(e: CustomEvent) => this.emit({ speedRampEnabled: e.detail.value })}
              ></speeedy-toggle>
              ${
								s.speedRampEnabled
									? html`
                <speeedy-range
                  label="Måltempo"
                  min="50" max="1600" step="25"
                  .value=${s.speedRampTarget}
                  unit=" ord/min"
                  color="secondary"
                  min-label="50"
                  max-label="1600"
                  @change=${(e: CustomEvent) => this.emit({ speedRampTarget: e.detail.value })}
                ></speeedy-range>
              `
									: ""
							}
            </div>
          </div>
        </section>

        <!-- Accessibility & visuals -->
        <section class="border-t border-base-200 pt-6 pb-2" aria-labelledby="settings-a11y-heading">
          <h2 id="settings-a11y-heading" class="text-xs uppercase tracking-widest text-ui-muted font-medium mb-4">
            Tillgänglighet och utseende
          </h2>
          <div class="flex flex-col gap-6">
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <span class="text-xs uppercase tracking-widest text-ui-muted">Typsnitt</span>
                ${s.dyslexiaMode ? html`<span class="text-[10px] bg-warning text-warning-content px-1.5 py-0.5 rounded font-medium uppercase shrink-0">Dyslexiläge på</span>` : ""}
              </div>
              <div class="rounded-xl border border-base-200 bg-base-200/20 p-1.5 flex flex-col gap-0.5 ${s.dyslexiaMode ? "opacity-40 pointer-events-none grayscale" : ""}">
                ${FONTS.map(
									(font) => html`
                  <button
                    type="button"
                    class="btn btn-sm justify-start min-h-10 rounded-lg ${s.fontFamily === font ? "bg-base-100 shadow-sm font-semibold border border-primary/40" : "btn-ghost border border-transparent"}"
                    style="font-family: '${font}', monospace;"
                    @click=${() => this.emit({ fontFamily: font })}
                    ?disabled=${s.dyslexiaMode}
                    aria-pressed="${s.fontFamily === font}"
                  >${font}</button>
                `,
								)}
              </div>
            </div>
            <speeedy-range
              label="Textvikt"
              min="300" max="800" step="100"
              .value=${s.fontWeight ?? 400}
              .format=${(v: number) => {
								const labels: Record<number, string> = {
									300: "Tunn",
									400: "Normal",
									500: "Medel",
									600: "Halvfet",
									700: "Fet",
									800: "Extrafet",
								};
								return labels[v] ?? String(v);
							}}
              min-label="Tunn"
              max-label="Extrafet"
              tip=${TOOLTIPS.fontWeight}
              @change=${(e: CustomEvent) => this.emit({ fontWeight: e.detail.value as FontWeight })}
            ></speeedy-range>
            <div class="flex flex-col gap-3">
              <span class="text-xs uppercase tracking-widest text-ui-muted">Färgmarkeringar</span>
              <div class="rounded-xl border border-base-200/80 bg-base-100/40 p-3 flex flex-col gap-3">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-sm text-base-content">Fokusbokstav (ORP)</span>
                  <input
                    type="color" .value=${s.highlightColor}
                    aria-label="Färg på fokusbokstaven"
                    @input=${(e: InputEvent) => this.emit({ highlightColor: (e.target as HTMLInputElement).value })}
                    class="w-9 h-9 rounded-lg shrink-0 cursor-pointer border border-base-300 bg-transparent"
                  />
                </div>
                <div class="flex flex-col gap-2">
                  <speeedy-toggle
                    label="Färga dialog"
                    ?checked=${s.colorizeQuotes ?? false}
                    tip=${TOOLTIPS.colorizeQuotes}
                    @change=${(e: CustomEvent) => this.emit({ colorizeQuotes: e.detail.value })}
                  ></speeedy-toggle>
                  ${
										s.colorizeQuotes
											? html`
                    <div class="flex items-center justify-between gap-3 pl-0.5">
                      <span class="text-xs text-ui-muted-subtle">Färg på citat</span>
                      <input
                        type="color" .value=${s.quoteHighlightColor}
                        aria-label="Färg på citat"
                        @input=${(e: InputEvent) => this.emit({ quoteHighlightColor: (e.target as HTMLInputElement).value })}
                        class="w-9 h-9 rounded-lg shrink-0 cursor-pointer border border-base-300 bg-transparent"
                      />
                    </div>
                  `
											: ""
									}
                </div>
                <div class="flex flex-col gap-2">
                  <speeedy-toggle
                    label="Färga inskott ( ) [ ]"
                    ?checked=${s.colorizeParens ?? false}
                    tip=${TOOLTIPS.colorizeParens}
                    @change=${(e: CustomEvent) => this.emit({ colorizeParens: e.detail.value })}
                  ></speeedy-toggle>
                  ${
										s.colorizeParens
											? html`
                    <div class="flex items-center justify-between gap-3 pl-0.5">
                      <span class="text-xs text-ui-muted-subtle">Färg på inskott</span>
                      <input
                        type="color" .value=${s.parenHighlightColor}
                        aria-label="Färg på parenteser"
                        @input=${(e: InputEvent) => this.emit({ parenHighlightColor: (e.target as HTMLInputElement).value })}
                        class="w-9 h-9 rounded-lg shrink-0 cursor-pointer border border-base-300 bg-transparent"
                      />
                    </div>
                  `
											: ""
									}
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-4">
              <speeedy-toggle
                label="Dyslexivänligt typsnitt"
                ?checked=${s.dyslexiaMode}
                tip=${TOOLTIPS.dyslexiaMode}
                @change=${(e: CustomEvent) => {
									trackEvent("dyslexia-toggled", { enabled: e.detail.value });
									this.emit({ dyslexiaMode: e.detail.value });
								}}
              ></speeedy-toggle>
              <div>
                <span class="text-sm text-base-content block mb-2">Färgtoning (Irlen)</span>
                <speeedy-segmented
                  .options=${(
										["none", "peach", "mint", "parchment"] as const
									).map((mode) => {
										const colors: Record<string, string> = {
											peach: "background: #ffcc99; color: #4d2600;",
											mint: "background: #ccffdd; color: #004d1a;",
											parchment: "background: #f4ead5; color: #5c4d33;",
										};
										return {
											value: mode,
											label: (
												{
													none: "Av",
													peach: "Persika",
													mint: "Mint",
													parchment: "Pergament",
												} as const
											)[mode],
											style: mode === "none" ? "" : colors[mode],
										};
									})}
                  .value=${s.irlenMode ?? "none"}
                  @change=${(e: CustomEvent) => this.emit({ irlenMode: e.detail.value })}
                ></speeedy-segmented>
                ${
									s.irlenMode && s.irlenMode !== "none"
										? html`
                  <div class="mt-3">
                    <speeedy-range
                      label="Tonens styrka"
                      min="0.05" max="0.5" step="0.01"
                      .value=${s.irlenOpacity ?? 0.18}
                      .format=${(v: number) => `${Math.round(v * 100)}%`}
                      min-label="5%"
                      max-label="50%"
                      tip=${TOOLTIPS.irlenOpacity}
                      @change=${(e: CustomEvent) => this.emit({ irlenOpacity: e.detail.value })}
                    ></speeedy-range>
                  </div>
                `
										: ""
								}
              </div>
            </div>
            <div class="flex flex-col gap-4 pt-2 border-t border-base-200/60">
              <span class="text-xs uppercase tracking-widest text-ui-muted">Paus och ankare</span>
              <div>
                <span class="text-sm text-base-content block mb-2">Visning vid paus</span>
                <speeedy-segmented
                  .options=${(["focus", "context", "fulltext"] as const).map((v) => ({ value: v, label: ({ focus: "Ordet", context: "Sammanhang", fulltext: "Hela texten" } as const)[v] }))}
                  .value=${s.pauseView ?? "focus"}
                  @change=${(e: CustomEvent) => this.emit({ pauseView: e.detail.value })}
                ></speeedy-segmented>
              </div>
              <div>
                <span class="text-sm text-base-content block mb-2">Placering av bionisk markering</span>
                <speeedy-segmented
                  .options=${(["early", "balanced", "late"] as const).map((pos) => ({ value: pos, label: ({ early: "Tidigt", balanced: "Mitten", late: "Sent" } as const)[pos] }))}
                  .value=${s.bionicFocusPosition ?? "balanced"}
                  @change=${(e: CustomEvent) => this.emit({ bionicFocusPosition: e.detail.value })}
                ></speeedy-segmented>
              </div>
            </div>
          </div>
        </section>

        <!-- Reading features -->
        <section class="border-t border-base-200 pt-6 pb-2">
          <h2 class="text-xs uppercase tracking-widest text-ui-muted font-medium mb-4">Läsfunktioner</h2>
          <div class="flex flex-col gap-3">
            <speeedy-toggle
              label="Visa förloppsindikator"
              ?checked=${s.showProgress}
              @change=${(e: CustomEvent) => this.emit({ showProgress: e.detail.value })}
            ></speeedy-toggle>
            <speeedy-toggle
              label="Fokusläge"
              ?checked=${s.focusModeEnabled ?? false}
              tip="Döljer allt utom orden medan texten spelas. Tryck på läsytan eller mellanslag för att pausa och få tillbaka kontrollerna. Växla med F."
              @change=${(e: CustomEvent) => this.emit({ focusModeEnabled: e.detail.value })}
            ></speeedy-toggle>
            <speeedy-toggle
              label="Hjälpmarkeringar vid fokuspunkten"
              ?checked=${s.showOrpGuides}
              tip=${TOOLTIPS.orpGuides}
              @change=${(e: CustomEvent) => this.emit({ showOrpGuides: e.detail.value })}
            ></speeedy-toggle>
            <speeedy-toggle
              label="Dölj skiljetecken efter ord"
              ?checked=${s.hidePunctuationInDisplay ?? false}
              @change=${(e: CustomEvent) => this.emit({ hidePunctuationInDisplay: e.detail.value })}
            ></speeedy-toggle>
            <speeedy-toggle
              label="Ta bort källhänvisningar"
              ?checked=${s.removeCitations ?? false}
              tip="Tar bort hänvisningar som [1], [1-3] och (Smith m.fl., 2020), så att kurslitteratur läses utan avbrott."
              @change=${(e: CustomEvent) => this.emit({ removeCitations: e.detail.value })}
            ></speeedy-toggle>
            <speeedy-toggle
              label="Rullande text"
              ?checked=${s.tickerMode ?? false}
              tip="Texten rullar i sidled i ditt tempo i stället för att visas ett ord i taget. Tempo, paus och hopp fungerar som vanligt."
              @change=${(e: CustomEvent) => this.emit({ tickerMode: e.detail.value })}
            ></speeedy-toggle>
            <speeedy-toggle
              label="Smart tempo"
              ?checked=${s.smartSpeed}
              tip=${TOOLTIPS.smartSpeed}
              @change=${(e: CustomEvent) => this.emit({ smartSpeed: e.detail.value })}
            ></speeedy-toggle>
            <speeedy-toggle
              label="Bionisk läsning"
              ?checked=${s.bionicMode}
              tip=${TOOLTIPS.bionicMode}
              @change=${(e: CustomEvent) => {
								trackEvent("bionic-toggled", { enabled: e.detail.value });
								this.emit({ bionicMode: e.detail.value });
							}}
            ></speeedy-toggle>

            <div class="flex flex-col gap-2">
              <speeedy-toggle
                label="Ord runt omkring"
                ?checked=${s.peripheralContext}
                tip=${TOOLTIPS.peripheralContext}
                @change=${(e: CustomEvent) => this.emit({ peripheralContext: e.detail.value })}
              ></speeedy-toggle>
              ${
								s.peripheralContext
									? html`
                <div class="pl-1 mt-1">
                  <speeedy-range
                    label="Antal ord på varje sida"
                    min="1" max="3" step="1"
                    .value=${s.peripheralContextCount ?? 1}
                    min-label="1"
                    max-label="3"
                    @change=${(e: CustomEvent) => this.emit({ peripheralContextCount: e.detail.value })}
                  ></speeedy-range>
                </div>
              `
									: ""
							}
            </div>
          </div>
        </section>

        <!-- Audio -->
        <section class="border-t border-base-200 pt-6 pb-2">
          <h2 class="text-xs uppercase tracking-widest text-ui-muted font-medium mb-4">Ljud och fokus</h2>
          <div class="flex flex-col gap-5">
            <!-- Clicks -->
            <div class="flex flex-col gap-3">
              <speeedy-toggle
                label="Klickljud per ord"
                ?checked=${s.clickSoundEnabled ?? false}
                tip=${TOOLTIPS.clickSound}
                @change=${(e: CustomEvent) => this.emit({ clickSoundEnabled: e.detail.value })}
              ></speeedy-toggle>
              ${
								s.clickSoundEnabled
									? html`
                <div class="pl-1">
                  <speeedy-range
                    label="Klickets tonhöjd"
                    min="0.1" max="3.0" step="0.1"
                    .value=${s.clickSoundPitch ?? 1.0}
                    .format=${(v: number) => `${v.toFixed(1)}x`}
                    min-label="0.1x"
                    max-label="3.0x"
                    @change=${(e: CustomEvent) => this.emit({ clickSoundPitch: e.detail.value })}
                  ></speeedy-range>
                </div>
              `
									: ""
							}
            </div>
            <!-- Ambient -->
            <div class="flex flex-col gap-3">
              <div>
                <span class="text-sm text-base-content block mb-2">Bakgrundsbrus</span>
                <speeedy-segmented
                  .options=${(["none", "white", "pink", "brown"] as const).map(
										(n) => {
											const colors: Record<string, string> = {
												white: "background: #f8fafc; color: #0f172a;",
												pink: "background: #fce7f3; color: #831843;",
												brown: "background: #78350f; color: #fef3c7;",
											};
											return {
												value: n,
												label: (
													{
														none: "Av",
														white: "Vitt",
														pink: "Rosa",
														brown: "Brunt",
													} as const
												)[n],
												style: n === "none" ? "" : colors[n],
											};
										},
									)}
                  .value=${s.ambientNoise ?? "none"}
                  @change=${(e: CustomEvent) => {
										if (e.detail.value !== "none") {
											trackEvent("ambient-noise-changed", {
												type: e.detail.value,
											});
										}
										this.emit({ ambientNoise: e.detail.value });
									}}
                ></speeedy-segmented>
              </div>
              ${
								s.ambientNoise && s.ambientNoise !== "none"
									? html`
                <div class="pl-1">
                  <speeedy-range
                    label="Brusvolym"
                    min="0" max="1" step="0.05"
                    .value=${s.ambientVolume ?? 0.5}
                    .format=${(v: number) => `${Math.round(v * 100)}%`}
                    min-label="0%"
                    max-label="100%"
                    @change=${(e: CustomEvent) => this.emit({ ambientVolume: e.detail.value })}
                  ></speeedy-range>
                </div>
              `
									: ""
							}
            </div>
          </div>
        </section>

        <!-- Engine logic -->
        <section class="border-t border-base-200 pt-6 pb-4">
          <h2 class="text-xs uppercase tracking-widest text-ui-muted font-medium mb-4">Motor</h2>
          <div class="flex flex-col gap-4">
            <speeedy-toggle
              label="Nedräkning före start (3 s)"
              ?checked=${s.countdownEnabled ?? false}
              tip=${TOOLTIPS.countdown}
              @change=${(e: CustomEvent) => this.emit({ countdownEnabled: e.detail.value })}
            ></speeedy-toggle>
            <speeedy-toggle
              label="Lika lång paus vid komma som vid punkt"
              ?checked=${s.commaAsPause ?? false}
              tip=${TOOLTIPS.commaAsPause}
              @change=${(e: CustomEvent) => this.emit({ commaAsPause: e.detail.value })}
            ></speeedy-toggle>
            <speeedy-toggle
              label="Paus efter inskott"
              ?checked=${s.contextPauseOnClose ?? true}
              tip=${TOOLTIPS.contextPauseOnClose}
              @change=${(e: CustomEvent) => this.emit({ contextPauseOnClose: e.detail.value })}
            ></speeedy-toggle>
          </div>
        </section>

        <div class="h-2"></div>
      </div>
    `;
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"settings-panel": SettingsPanel;
	}
}
