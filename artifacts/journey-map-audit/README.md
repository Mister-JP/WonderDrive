# WonderDrive journey map audit and redesign proposal

Date: 2026-07-14

## Product interpretation

WonderDrive is an audience-directed curiosity performance. Each researched answer creates exactly two earned next questions. A choice advances the active path, the unchosen direction remains available, and revisiting an earlier turn can create a branch. The map is therefore not a transcript, progress tracker, or decorative timeline. Its job is to answer four questions quickly:

1. Where am I now?
2. How did I get here?
3. Which directions are still open?
4. What will happen if I choose or revisit one?

## Evidence captured

- `01-current-map-desktop.png`: current map at a 1265 × 712 desktop viewport.
- `02-current-map-mobile.png`: current map at a 375 × 812 phone viewport.

The available saved journeys contained one turn. The code and data contract were also inspected to evaluate how the page scales to multiple turns and branches.

## Current flow health

1. Open a saved journey — healthy. Library cards expose a clear Resume action and useful counts.
2. Switch from Stage to Journey map — mostly healthy. The view switcher is understandable, but it disappears from the primary navigation model and does not preserve state in the URL.
3. Orient within the map — poor. A large editorial heading and repeated journey title consume most of the first viewport before the graph appears.
4. Understand the graph — broken. Turns are rendered as an indented list with no connectors, no option-to-child relationship, and no visible open branch nodes.
5. Inspect and act on a turn — poor. Details and path actions are placed in a tall side panel below or outside the first viewport; on mobile the entire inspector follows the node list.

## Highest-impact findings

### 1. The page does not visualize the product's core model

`JourneyMap` maps over `journey.turns` in storage order and simulates hierarchy with `marginInlineStart: depth * 46`. This can show depth, but not which parent a node belongs to, which option created a child, or which unchosen options remain open. Different branches at the same depth are visually indistinguishable.

### 2. Page-level branding outranks the user task

The shared `.view-heading` uses a 4–7rem title and 60–110px top padding. That treatment is suitable for a library landing page but not for an interactive map. The real work starts below the fold on desktop and far below it on mobile.

### 3. Status language is overlapping and incomplete

The legend uses `current`, `visited`, and `selected`. A current node can also be selected, producing two symbols on the same card. Meanwhile the important domain states—chosen path, open path, delegated choice, and branch point—are not represented.

### 4. The inspector duplicates the Stage instead of supporting map decisions

The panel repeats the full question, a long research summary, topic, source count, two questions, a continue action, and explanatory text. It is too dense for a selection inspector and makes the graph narrower. The research summary and source detail already have a stronger home in Stage and the deeper-dive overlay.

### 5. Responsive behavior only stacks the desktop page

At the mobile breakpoint, the two columns become one and indentation is removed. This avoids horizontal overflow but erases hierarchy. The screen becomes heading → metadata → legend → flat card list → inspector, so users must scroll without understanding the structure.

### 6. Accessibility semantics do not match the visual interaction

The container declares `role="tree"`, but the implementation is a flat collection of `treeitem` buttons with no nested groups, `aria-level`, `aria-expanded`, or keyboard tree behavior. Status relies heavily on small shapes and color. Very small legend and metadata text also create legibility and zoom risks.

## Recommended redesign: Focused branch explorer

The map should become a compact workspace with three layers:

### Compact context bar

Keep the existing Stage / Map switcher. Under it, show one compact row with the journey title, `current turn / total turns`, and `open paths`. Remove the large slogan from this page.

### Branch canvas

Render one card per researched turn and one smaller card per still-open option. Connect parent turn → option → child turn. Emphasize only the active ancestry path; de-emphasize explored side branches without hiding them.

Node content should be short:

- Turn number and topic label
- Question, clamped to two lines
- One status chip: `You are here`, `Explored`, or `Branch point`
- Optional compact source count

Open option nodes should say `Open path`, show the question, and expose one clear `Explore this` action. A chosen option should become the labeled connector to its child, not another full action card.

### Inline turn expansion

Do not use a permanent inspector, drawer, or bottom sheet. Selecting a turn expands that node in place and reveals only its two option outcomes plus `Open full answer`. The graph remains the main interface instead of shrinking to make room for a second interface.

By default, show the active path and the current turn's two next questions. Keep open questions from earlier turns behind one clear `Other open paths (n)` disclosure until the user asks for them.

## Responsive model

- Desktop (≥ 1024px): horizontal active path; the selected turn expands inline to show exactly two next questions.
- Tablet (640–1023px): vertically flowing active path with the same inline expansion.
- Mobile (< 640px): an active-path outline first. Each turn expands to reveal its two path outcomes. Side branches live under `Other open paths (n)`.

## Implementation plan

### Phase 1 — fix hierarchy and page density

1. Extract the current map into `JourneyMap`, `JourneyGraph`, `TurnNode`, `OpenPathNode`, and `CollapsedOpenPaths` components.
2. Replace the shared `.view-heading` with a map-specific compact header.
3. Build a view model from `turns`, `parentTurnId`, `options`, and `actions`:
   - `turnById`
   - `childrenByTurnId`
   - `actionByOptionId`
   - `activeAncestorIds`
   - `openOptions`
4. Render explicit connectors and label the chosen/delegated edge using `JourneyAction`.
5. Expand the selected turn inline; keep the complete research summary and source details in Stage.

### Phase 2 — responsive and accessible behavior

1. Provide a semantic nested list equivalent for the graph instead of claiming incomplete ARIA tree behavior.
2. Use visible text chips in addition to color and shape.
3. Add 44px minimum action targets, strong focus states, and logical keyboard order.
4. Add the mobile active-path outline and collapsible side branches.
5. Preserve selected turn in the URL or query string so refresh/back behavior is predictable.

### Phase 3 — validation

Test with fixtures representing:

- one turn with two open paths;
- a three-turn linear active path;
- a branch from an earlier turn;
- two children from the same turn;
- a rejected/superseded option set;
- long questions, 200% zoom, keyboard-only use, and 375px width.

## Data note

The UI can derive most graph relationships from the existing contract. However, `openBranchCount` currently counts every proposed option across all turns. That number is useful as “open paths,” but not necessarily as “branch count.” Rename it in presentation or expose separate `openPathCount` and `branchPointCount` values to avoid misleading copy.

## Evidence limits

The captured local library had only one-turn journeys, so visual overlap between multiple rendered nodes could not be reproduced directly without spending a live research run. Multi-turn behavior was assessed from the current rendering code and domain model. Screenshots alone cannot confirm screen-reader output, full keyboard support, contrast ratios, or zoom/reflow behavior; those require interactive testing after implementation.
