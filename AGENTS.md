## Design Context

### Users
Power users and developers managing large numbers of tabs. They're context-switching frequently, often mid-task — every interaction needs to feel instant. Keyboard-first orientation; they notice friction immediately and appreciate when UI gets out of their way. The job to be done: capture tabs without losing flow, recall them without hunting.

### Brand Personality
**Words:** Precise. Terminal. Satisfying.

The extension should feel like a well-made command-line tool that happens to have a UI — opinionated, no fuss, confident. Not trying to be friendly or decorative. Every action produces a clear, immediate response.

Emotional goal: the small dopamine hit of a clean `git commit` — task done, cursor ready.

### Aesthetic Direction
**Terminal-inspired, refined — not retro cosplay.**

Take the phosphor green / black CRT monitor as a *source of DNA*, not a costume. The result should feel modern and sharp, not nostalgic or novelty. Think: what if Linear had been designed by someone who spent their formative years staring at a VT100?

- **Background:** Near-black with a very slight warm-tinted dark (`#0d0f0d` or `#0e1210`) — just enough to read as "terminal" not "dark mode generic"
- **Accent:** Phosphor green, desaturated enough to be readable — around `#3dba6e` / `#40c070` range. Not eye-searing `#00ff00`, not generic `#22c55e`.
- **Surface layers:** Charcoal with green tint (`#131a13`, `#182018`) — every layer slightly greener than pure grey
- **Text:** Off-white with slight green cast (`#dff0df`) and dimmed (`#7a9a7a`)
- **Monospace moments:** Keyboard hints and timestamps — lean into `monospace` for these specifically
- **No gradients, no glows, no shadows** unless they serve function. Borders and flat color carry the design.

**Anti-references:** Anything that looks like a Halloween terminal (green glow blobs, scan-line overlays, blinking cursors as decoration). Also avoid generic dark-mode SaaS (pure charcoal + blue accent = could be any Tailwind app).

**References:** Linear's density and precision. Raycast's responsiveness. A well-configured Neovim colorscheme.

### Design Principles

1. **Speed is the feature.** Interactions must feel instant — transitions max 150ms, no loading spinners for local storage operations. The UI confirms before the user doubts.

2. **Terminal DNA, not terminal costume.** Use monospace selectively, keep phosphor green purposeful. The aesthetic should be recognizable but not distracting from the actual task.

3. **Every pixel earns its place.** No decorative elements. No padding added for breathing room that wasn't needed. Density is respectful of power users' attention.

4. **Micro-feedback > macro-animation.** A crisp border flash on save is better than a slide-in modal. Satisfaction comes from precision, not theater.

5. **Hierarchy through restraint.** Type weight, color, and size carry the information hierarchy. Nothing needs a drop shadow or gradient to feel elevated.
