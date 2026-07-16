# Answer + evidence viewer design QA

## Comparison target

- Source visual truth: `/Users/jignasupathak/Documents/Codex/hackathon-brainstorming/WonderDrive/design/wonderdrive-answer-evidence-no-scroll.png`
- Browser implementation: `/Users/jignasupathak/Documents/Codex/hackathon-brainstorming/WonderDrive/artifacts/answer-surface-audit/09-balanced-evidence-arrows.png`
- Full-view comparison: `/Users/jignasupathak/Documents/Codex/hackathon-brainstorming/WonderDrive/artifacts/answer-surface-audit/10-balanced-evidence-comparison.png`
- Focused answer comparison: `/Users/jignasupathak/Documents/Codex/hackathon-brainstorming/WonderDrive/artifacts/answer-surface-audit/11-balanced-evidence-focused.png`
- Viewport: 1600 × 900
- State: one researched turn with five sourced images; first image selected; next-direction choices visible

## Full-view comparison evidence

The implementation preserves the approved structure: the written answer remains in the primary card, Deep Dive sits immediately below that answer, one selected image receives the largest visual area, its explanation lives beside it, all images remain available in a horizontal selector, and the two direction choices remain visible without document scrolling.

The reference board uses public-space example content while the verified journey uses live city-memory data. The content difference is expected; hierarchy, density, placement, and interaction model are the comparison targets.

## Focused-region evidence

The focused comparison confirms that the answer, evidence viewer, annotation panel, thumbnail rail, and direction cards share the same visual hierarchy as the selected concept. The implementation uses a slightly wider evidence allocation to keep the real image notes readable. No content overlaps, clips, or crosses component borders.

## Required fidelity surfaces

- Typography: existing WonderDrive display and body families remain intact. The answer heading, evidence title, notes headings, and direction questions retain a clear hierarchy.
- Layout: the answer and evidence viewer form one contained surface. Deep Dive is directly beneath the written answer rather than below the entire card.
- Image behavior: the selected image uses `object-fit: contain`; visible previous/next controls sit on the large image; thumbnails never stretch, remain horizontally scrollable, and expose selected and focus states.
- Image information: accepted items carry a title, evidence role, why it was included, exactly two visible observations, and a takeaway. Unmatched, generic, duplicate-source, or inconsistently sized notes are omitted rather than receiving filler copy.
- Accessibility: the selector is keyboard navigable with Left/Right/Home/End; selected state uses `aria-pressed`; source links remain available; the Deep Dive dialog closes with Escape and restores focus.
- Direction visibility: both next-direction cards and their secondary actions are fully visible in the verified 1600 × 900 viewport without page scrolling.

## Findings

No actionable P0, P1, or P2 issues remain.

- Accepted QA fixture: the browser capture retains several historical-map crops solely to exercise the arrow and thumbnail states. New research output deduplicates by source page and will not emit this set.
- Accepted difference: the implementation shows one coherent answer block in the overview and keeps the complete answer in Deep Dive so the primary direction choice stays above the fold.

## Comparison history

### Iteration 1

- [P1] Allowing an arbitrary prose-height clamp could cut the written answer mid-sentence.
- Fix: render one complete answer block in the overview and preserve the full response in Deep Dive.

### Iteration 2

- [P2] Expanding the overview prose moved the direction selector below the initial viewport.
- Fix: restored the compact answer overview, tightened the evidence viewer, and kept Deep Dive directly below the answer.
- Post-fix evidence: `06-final-evidence-viewer.png`, `07-final-design-comparison.png`, and `08-final-focused-comparison.png`.

### Iteration 3

- [P1] Images without a source-matched note received generic caption-based fallback copy, making the evidence feel fixture-like and sometimes unrelated.
- [P2] The large selected image depended on the thumbnail rail and keyboard navigation; it had no visible previous/next affordance.
- Fix: require source-matched, image-specific notes with explicit word budgets; reject weak and duplicate-source entries; add Phosphor previous/next controls and a visible image counter on the large image.
- Post-fix evidence: `09-balanced-evidence-arrows.png`, `10-balanced-evidence-comparison.png`, and `11-balanced-evidence-focused.png`.

## Interaction and browser verification

- Clicking thumbnails changes the selected image and its accompanying notes.
- Clicking the large-image Next control changes the selected image, counter, and notes.
- ArrowRight changes selection; Left/Right/Home/End keyboard behavior is implemented.
- Deep Dive opens the complete answer dialog; Escape closes it and focus returns to the trigger.
- The source link remains available for the selected image.
- Browser console errors and warnings checked: none.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 21 tests.
- `node --experimental-loader ./tests/cloudflare-loader.mjs --import tsx --test tests/live-research.test.mjs`: passed, 15 tests.

final result: passed

---

# Full-width question-redraw control design QA

## Comparison target

- Source visual truth: `/Users/jignasupathak/.codex/generated_images/019f6bcb-8d7b-7e62-b81c-0b07a9e4a700/exec-2f2c2f75-b48b-4e8d-9324-82bc72c0e073.png`
- Browser implementation: `/Users/jignasupathak/Documents/Codex/hackathon-brainstorming/WonderDrive/.codex-redraw-inline-qa-1774x888.jpg`
- Combined comparison: `/Users/jignasupathak/Documents/Codex/hackathon-brainstorming/WonderDrive/.codex-redraw-inline-comparison.jpg`
- Matched comparison viewport: 1774 × 888
- Responsive verification viewport: 390 × 844 (375 CSS px page width)
- State: one researched turn with both next-direction choices visible and the replacement-question controls open

## Full-view comparison evidence

The implementation preserves the selected compact interaction: clicking “Try two different questions” transforms the existing secondary-action row in place instead of opening a popover or inserting another panel. The user's follow-up direction intentionally supersedes the earlier mock in one respect: the open controls now replace both secondary actions, including “Pick a path for me,” and use the full 580 px row.

The closed and open states both measure 46 px tall. At the matched desktop viewport, the direction region remains 210.59 px tall and the document remains exactly one viewport high (`scrollHeight = clientHeight = 888`). The inline control has no clipped content (`scrollHeight 44` inside a 46 px frame) and the document has no horizontal overflow.

## Required fidelity surfaces

- Interaction model: one click swaps the complete secondary-action row in place; close restores both original actions.
- Density: Practical, Surprising, Different direction, Optional note, close, and submit all fit in the original 46 px footprint.
- Optional note: the note input replaces the choice controls within the same frame; Enter submits and Escape returns to the choice controls.
- Visual language: existing paper, ink, sky, coral, border, typography, and Phosphor icon treatments are reused.
- Accessibility: the mode buttons expose `aria-pressed`; the opener exposes `aria-expanded` and `aria-controls`; icon-only close and submit actions have localized accessible names.
- Responsive behavior: at the mobile viewport, the full-width control measures 343 × 46 px with no internal or document-level horizontal overflow.

## Comparison history

### Iteration 1

- [P1] The earlier implementation inserted a large optional form below the choices and increased page height.
- Fix: replace the secondary-action row in place with a fixed-height inline control.

### Iteration 2

- [P2] The selected mock only replaced the “Two new questions” half of the row.
- Fix: apply the user's follow-up direction and replace the entire row, including “Pick a path for me,” so the controls use all available width.

### Iteration 3

- [P1] A broad inherited `.journey-secondary-actions button` rule forced nested mode/action buttons to 46 px each, producing 72 px of internal content inside the 46 px frame.
- Fix: scope the original card-button treatment to direct children only. Post-fix internal content measures 44 px and no longer clips.

## Interaction and browser verification

- Opened state replaces both secondary actions and preserves the exact closed-state height.
- Practical selection reports `aria-pressed="true"`.
- Optional note opens, accepts text, and returns to choices with Escape without changing geometry.
- Close restores the original two-button row.
- Desktop document remains 1774 px wide with no horizontal overflow; mobile document remains 375 px wide with no horizontal overflow.
- Browser console errors and warnings checked: none during feature verification.

## Validation

- `npm run typecheck`: passed.
- `npm run build`: passed as part of the full test command.
- Feature browser QA at desktop and mobile viewports: passed.
- Repository-wide lint remains blocked by two unrelated existing errors in the reduced-motion effect and `lib/live-research.ts`, plus three generator-script warnings.
- Repository-wide tests reach the existing localization completeness failure for “Taking over research in this tab…” and “Use this tab”; this feature introduces no missing localization keys.

final result: passed

---

# Journey tree implementation design QA

## Comparison target

- Desktop source truth: `design/journey-graph-vision/01-whole-tree-overview.png`
- Mobile source truth: `design/journey-graph-vision/mobile-v2/01-vertical-tree-overview.png`
- Desktop implementation: `artifacts/journey-map-implementation/15-tree-desktop.png`
- Mobile implementation: `artifacts/journey-map-implementation/18-tree-mobile-final.png`
- Desktop combined comparison: `artifacts/journey-map-implementation/20-tree-desktop-comparison.png`
- Mobile combined comparison: `artifacts/journey-map-implementation/21-tree-mobile-comparison.png`
- Viewports: 1440 × 1000 desktop and 390 × 844 mobile
- State: five-turn saved journey, current route selected, open questions visible, Topics density

## Full-view comparison evidence

The implementation preserves the approved information model: one directed graph, a visually dominant current route, open questions attached to their true parent, semantic detail controls, selection details, a minimap on desktop, and a top-to-bottom mobile hierarchy. The live fixture contains different content and a different branch shape than the concept board; structure and interaction behavior are the comparison targets.

The mobile viewport reports `scrollWidth` equal to `clientWidth` (375 CSS px inside the 390 px browser viewport). Every rendered graph node remained between 20 and 356 CSS px, so no node or action requires horizontal panning.

## Focused-region evidence

The mobile comparison focuses on the graph viewport and confirms that depth moves downward, two-child rows fit within the screen, and the current route stays visually stronger. Browser measurements confirmed the selected-turn sheet is fixed to the bottom of the 844 px viewport (`top: 484`, `bottom: 844`) and the branch-confirmation sheet remains bottom anchored (`top: 568`, `bottom: 844`).

## Required fidelity surfaces

- Typography: existing WonderDrive Newsreader and IBM Plex Sans families, optical hierarchy, compact metadata, and localized scripts are preserved.
- Spacing and layout: desktop keeps the graph and inspector in stable adjacent regions; mobile uses the full width, vertical depth, two bounded columns, and no horizontal overflow.
- Colors and tokens: implementation uses the existing paper, ink, acid, sky, coral, line, and muted tokens. Current, selected, open, preview, dimmed, and focused states remain distinguishable without color alone.
- Image and asset quality: the graph contains no required photographic assets. All controls use the project’s existing Phosphor icon library; no placeholder icons remain.
- Copy and content: graph vocabulary is included across all ten non-English locale catalogs with placeholder parity.
- Accessibility: the outline exposes tree/treeitem semantics, expanded and selected state, Up/Down/Home/End/Left/Right navigation, full-card touch targets, accessible labels, and a non-spatial equivalent for every graph branch.

## Interaction and browser verification

- Graph and Outline views switch without losing selection.
- Overview, Topics, and Full cards change information density while preserving hierarchy.
- Search returns matching turns and open questions.
- Open-path mode preserves the graph and dims unrelated nodes.
- Focus branch adds breadcrumbs and a persistent Full tree return action.
- Selecting a graph node opens the desktop inspector or mobile bottom sheet.
- Choosing an open path creates a ghost node and confirmation sheet before live research.
- Canceling confirmation leaves the route unchanged.
- Desktop zoom, Fit all, and minimap are present.
- Mobile graph has no horizontal overflow at 390 × 844.
- Browser console errors and warnings checked: none.

## Comparison history

### Iteration 1

- [P1] The previous mobile design inherited horizontal graph growth and would push descendants off-screen.
- Fix: mobile uses a top-to-bottom route layout, bounds each level to two columns, and folds distant off-route subtrees into attached branch piles.
- Post-fix evidence: `18-tree-mobile-final.png` and `21-tree-mobile-comparison.png`.

### Iteration 2

- [P2] A sticky selected-turn inspector appeared too late in the mobile document instead of behaving like the approved partial sheet.
- Fix: mobile starts with an unobstructed graph; selecting a node opens a fixed, dismissible bottom sheet while the parent and children remain behind it.
- Post-fix evidence: browser geometry measurements at 390 × 844 and successful mobile selection/confirmation interaction tests.

### Iteration 3

- [P1] The first full test pass found the new graph vocabulary missing from non-English locale catalogs.
- Fix: added graph-specific translations for Spanish, French, German, Portuguese, Hindi, Bengali, Arabic, Simplified Chinese, Japanese, and Korean with exact placeholder parity.
- Post-fix evidence: complete `npm test` pass, including localization completeness.

## Findings

No actionable P0, P1, or P2 issues remain. The implementation intentionally uses real saved-journey content rather than the concept’s illustrative city-memory fixture.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed with two pre-existing generator-script warnings outside the runtime implementation.
- `npm test`: passed, 39 tests.
- Desktop and 390 × 844 mobile browser verification: passed.

final result: passed
