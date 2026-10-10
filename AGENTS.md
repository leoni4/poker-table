Always use ASD-STE100 Simplified Technical English (STE) when describing anything to the user.

# AGENTS.md

This file is the entry point to the `@leoni4/poker-table` repository instructions.

It is written for AI agents and human contributors.

`@leoni4/poker-table` is a TypeScript engine for a single No-Limit Texas Hold'em table on Node.js (ESM, Node >= 18).

It is used for poker bots, simulations, training, and game servers.

The library is a reusable public package. Correct poker rules, exact chip accounting, stable public APIs, reproducibility, and performance are more important than adding features quickly.

## Core priorities

When working in this repository, use this priority order:

1. Preserve poker-rule correctness and exact chip accounting.
2. Preserve public API compatibility unless a breaking change is explicitly requested.
3. Preserve deterministic and reproducible behaviour where the existing API supports it.
4. Preserve serialization and persisted-model compatibility when practical.
5. Keep runtime performance suitable for large numbers of simulated hands.
6. Keep the implementation understandable and maintainable.

Do not improve one of these areas by silently breaking another.

# Repository source of truth

Use the repository as the source of truth.

Before making assumptions, inspect:

- `package.json`;
- the lockfile;
- `README.md`;
- source code;
- tests;
- build configuration;
- exported types;
- existing examples;
- the nearest `AGENTS.md`, if one exists.

Do not rely on remembered package behaviour when the repository can answer the question.

Do not assume a dependency version from documentation text. Read the installed or declared version.

# General guidelines

- Use the package manager defined by the repository.
- Use existing `package.json` scripts instead of inventing equivalent commands.
- Make the smallest change that fully solves the requested task.
- Do not refactor unrelated code.
- Do not introduce a dependency when the current stack can solve the problem reasonably well.
- Do not change table defaults or betting rules as incidental cleanup.
- Do not change public behaviour during a formatting, typing, documentation, or performance-only task.
- Prefer extending existing abstractions over creating parallel implementations.
- Do not modify generated build output manually when a source file can be changed instead.

# Public library contract

This is a public reusable library.

Treat the following as part of the compatibility surface when they are publicly exposed:

- exported functions;
- exported classes;
- exported types and interfaces;
- constructor parameters;
- method parameters;
- return values;
- configuration objects;
- enum or string values;
- default values;
- package entry points;
- serialization formats;
- documented runtime behaviour.

Before changing a public symbol, search for:

- its declaration;
- all internal usages;
- tests;
- README examples;
- exported entry points;
- compatibility aliases;
- serialization code.

Do not remove, rename, or change a public API only because another API looks cleaner.

If a breaking change is required, make the break explicit.

Do not hide a breaking change inside a refactor.

# Semantic versioning

Treat semantic versioning as part of the package contract.

A change can require a major version when it intentionally breaks supported public behaviour.

A change can require a minor version when it adds backward-compatible functionality.

A compatible bug fix can normally use a patch version.

Do not change the package version unless the user asks for a release or version change.

Do not infer the required release version without first identifying the compatibility effect of the change.

# Technology

- Language: TypeScript (strict), ESM output (`"type": "module"`, `.js` import suffixes in source).
- Runtime: Node.js >= 18.
- Package manager: npm (`package-lock.json`).
- Build: `tsc` into `dist/`.
- Tests: Vitest (`tests/`), plus `tests/esm-smoke-test.mjs` against the build.
- Lint and format: ESLint, Prettier, Husky hooks.

Main scripts:

- `npm test` — Vitest;
- `npm run typecheck`;
- `npm run lint`;
- `npm run build`;
- `npm run test:esm` — requires a fresh build;
- `npm run prepack` — full release validation.

# Project structure

- `src/index.ts` — the package entry point. Only symbols exported here are public.
- `src/holdem-table.ts` — `HoldemTable`, the primary public API (seat, start hand, apply action, state views, history, results).
- `src/core/` — cards, `ChipAmount` (`bigint`) money helpers, `Result`, errors, table config and state types.
- `src/table/` — seat management, rebuys, button, blinds and hand flow.
- `src/betting/` — legal actions, call and minimum-raise calculation, betting-round state.
- `src/pot/` — main pot and side pot calculation, rake, payouts.
- `src/hand-eval/` — hand evaluation and comparison.
- `src/deck/` — deck, shuffle, dealing.
- `src/rng/` — `Rng` interface, `SeededRng`, `CryptoRng`, factory.
- `src/history/` — hand history events and replay.
- `tests/` — mirrors `src/`; `tests/docs/readme-examples.test.ts` checks README examples; `tests/table/*regression*` keeps audit regressions.

Do not move responsibilities between modules without a concrete reason.

# Poker rule invariants

Changes to the engine can change game results even when the diff is small.

Treat these areas as rule-sensitive:

- seating, sitting out, removal, and rebuys;
- dealer button movement, including heads-up rules;
- small blind, big blind, ante, and straddle posting;
- short forced bets and all-in forced bets;
- action order on each street;
- legal action calculation (`getAvailableActions`, `getCallAmount`, `getMinimumRaiseSize`);
- betting-round completion and street transitions;
- run-out when no more betting is possible;
- showdown, hand evaluation, and tie handling;
- pot, side pot, rake, and payout calculation.

Do not change one of these behaviours as incidental cleanup.

If a task intentionally changes rule semantics:

1. Identify the old behaviour.
2. Identify the new behaviour.
3. Explain why the change is required.
4. Add or update focused tests.
5. Check the effect on public API, state snapshots, and hand history.
6. Check whether README text or examples must change.

# Betting semantics

These documented rules are part of the public contract:

- `BET` is valid only when the street has no current wager.
- `RAISE` is valid only when a wager exists.
- `RAISE.amount` is the raise increment, not the final total-to amount.
- `PlayerState.committed` is the live wager on the current street. Antes are dead money and are not included.
- A short all-in is an `ALL_IN`. It is not a full raise unless it reaches the minimum-raise rules, and it must not reopen action incorrectly.

Consumers must be able to rely on the exported betting helpers. Keep them consistent with what `applyAction` accepts.

# Chip accounting

`ChipAmount` is `bigint`. Chip arithmetic must stay exact.

- Do not convert chip amounts to `number`.
- Do not introduce rounding or floating-point arithmetic for chips.
- The sum of all stacks, live wagers, and pots must stay constant during a hand, except for rake.
- Odd-chip splits and rake must follow the existing rules.

When changing pots, payouts, or rake, verify: side pot eligibility, folded contributions, all-in caps, split pots, odd chips, rake, and `HandResult` / `POT_DISTRIBUTED` output.

# Errors and `Result`

Normal game-flow errors are returned as `Result<T, Error>` with an error code. They are not thrown.

Do not change a returned error into a thrown exception, or the reverse, without an explicit request.

Error codes are part of the public contract.

# Information hiding

`getState()` is a privileged snapshot with all hole cards.

`getStateForPlayer(playerId)` and spectator views must not leak hidden cards of other players, or remaining deck cards.

Hand history is a privileged audit log. `CARDS_DEALT` contains all hole cards.

When changing state, views, or history, verify that no new field leaks private information into a player view.

# Randomness and reproducibility

All randomness must go through the `Rng` interface in `src/rng/`.

- With `rngSeed`, a table owns one `SeededRng` stream. Without it, `CryptoRng` is used.
- Do not use `Math.random()`.
- Two fresh tables with the same seed and the same seat/action sequence must receive the same cards.
- The stream advances between hands.

Changing the number or order of random draws changes dealt cards for existing seeds. Treat it as a behaviour change.

`HandHistory` timestamps use wall-clock time and are not deterministic.

# State snapshots and hand history

`TableState`, `PlayerState`, `BettingRoundState`, `HandResult`, and history events are public data structures. Consumers can store them or send them over the network.

When changing them:

- preserve existing fields and their meaning when practical;
- preserve optional-field semantics;
- keep history replay (`src/history/replay.ts`) consistent with recorded events;
- test the affected flow.

Do not claim compatibility without checking.

# Performance

Callers can simulate very large numbers of hands.

Pay attention to hot paths:

- hand evaluation;
- legal action calculation;
- `applyAction`;
- pot calculation;
- state snapshot creation;
- shuffling and dealing.

Avoid unnecessary allocations and accidental `O(n²)` work in these paths.

Do not sacrifice rule correctness for speed.

When adding a cache, its key and invalidation must include every input that can change the result.

# TypeScript

TypeScript correctness is mandatory.

Respect the repository compiler configuration.

Do not weaken type safety only to make a change compile.

Avoid:

- unnecessary `any`;
- broad type assertions;
- ignored TypeScript errors;
- duplicated public types;
- unsafe non-null assertions.

Use explicit narrowing when values can be `null` or `undefined`.

Use named interfaces or types for meaningful public domain structures.

For function parameters:

- one required value can be passed directly;
- two or three simple required values can use positional parameters;
- many values or optional values should normally use a named parameter object.

Follow the established local API when compatibility is more important than this general rule.

# Exports

When adding or changing a public API, verify the complete export path.

A symbol can exist in the source tree but still not be part of the package API.

Check:

- local module exports;
- barrel exports;
- package entry points;
- generated declarations;
- package `exports`, when present.

Do not expose internal implementation types accidentally.

Do not remove an export as cleanup without checking compatibility.

# Tests

Tests for rule-sensitive code must verify behaviour, not only implementation details.

Prefer focused deterministic tests where practical.

Important test areas include:

- blind and ante posting;
- action order and legal actions;
- betting-round completion;
- side pots, split pots, rake;
- hand evaluation and ties;
- player and spectator views;
- hand history and replay;
- seeded determinism;
- README examples (`tests/docs/`);
- regression cases (`tests/table/*regression*`).

When fixing a bug, add a regression test when the failure can be reproduced reliably.

Do not replace a meaningful behavioural assertion with a weaker assertion only to make a test pass.

# Documentation

README examples are part of the user experience and can effectively become part of the API contract.

When a public API changes, check:

- README usage;
- API examples;
- configuration examples;
- migration notes, if present;
- comments describing defaults.

Do not document behaviour that was not verified.

Keep examples simple and executable when practical.

# Comments

Prefer self-explanatory code.

Use comments when they preserve information that the code cannot express clearly.

Useful comments can explain:

- a poker-rule invariant;
- a compatibility constraint;
- why an action is intentionally restricted;
- why random-number ordering matters;
- why a state or history field is kept for compatibility;
- why an apparently simpler algorithm is incorrect.

Do not add comments that only restate the code.

Remove or update stale comments.

# Dependencies

Do not add a dependency when a small implementation with the current stack is sufficient.

Before updating a dependency:

1. Confirm that the task requires the update.
2. Check public API or runtime effects.
3. Update the lockfile through the package manager.
4. Run relevant validation.

Do not update unrelated dependency versions.

# Generated files and build output

Do not manually edit compiled or generated output when source code is available.

Examples can include:

- `dist/`;
- generated declaration files;
- bundled JavaScript;
- coverage output.

Change the source of truth.

Generate derived files only when the repository workflow requires it.

Do not include unrelated generated changes.

# Git

Unless the user explicitly asks for the specific operation, do not:

- commit;
- stage files;
- push;
- merge;
- rebase;
- force-push;
- create tags;
- create releases;
- publish packages;
- modify remote branches.

Read-only Git commands are allowed.

Treat existing uncommitted changes as user-owned work.

Never discard unrelated user changes.

Do not use destructive Git commands to solve an implementation problem.

# Package publishing

Publishing changes external state.

Do not run:

- `npm publish`;
- `npm version`;
- Git tag creation;
- GitHub release creation;

unless the user explicitly asks for that operation.

Before a requested release:

1. Inspect the current version.
2. Identify whether the change is breaking, additive, or a fix.
3. Run the repository's release or prepublish validation.
4. Verify the package build.
5. Verify intended files are included in the package.
6. Report failures before publishing.

Never claim a package was published unless the command completed successfully.

# Change discipline

Make the smallest change that fully solves the requested task.

Do not:

- refactor unrelated code;
- rename unrelated symbols;
- change table defaults or rules as cleanup;
- change public APIs without need;
- combine a rule change with infrastructure cleanup;
- replace established architecture because another style looks cleaner;
- perform broad formatting;
- introduce speculative abstractions.

If unrelated problems are discovered, report them separately.

# Reuse before creating

Before adding a new:

- class;
- type;
- helper;
- betting helper;
- pot utility;
- money utility;
- state view;
- configuration layer;

search for the same concept and related names.

Prefer one source of truth.

A new abstraction must solve an actual current problem.

Do not add architectural layers for possible future use.

# Verification

Before declaring a task complete:

1. Review the diff.
2. Check for unrelated changes.
3. Run the smallest relevant tests.
4. Run TypeScript validation when relevant.
5. Run lint when relevant.
6. Run the package build when package output is affected.
7. Run broader tests when the change affects shared rule behaviour.
8. State what was verified.
9. State what was not verified.
10. Do not claim success for a command that did not complete successfully.

For rule changes, focused tests are necessary but can be insufficient.

Consider whether the change can affect:

- legal actions;
- pots and payouts;
- player views;
- hand history;
- deterministic behaviour.

# Error handling

When a change causes an error:

1. Stop expanding the scope.
2. Determine whether the current change caused it.
3. Find the smallest root cause.
4. Make the smallest correction.
5. Re-run the relevant validation.

Do not respond to a local error with a broad refactor.

Do not suppress errors only to make validation pass.

# Working on a task

Before making a change:

1. Read the applicable repository instructions.
2. Inspect the relevant source code.
3. Read related tests.
4. Search for existing implementations and usages.
5. Identify whether the task changes public API or poker-rule semantics.
6. Identify serialization or compatibility impact when relevant.
7. Make the smallest complete change.
8. Run relevant validation.
9. Report anything that remains unverified.

More specific nested `AGENTS.md` files can add or refine rules for their directory.

They must not silently weaken repository-wide compatibility or correctness requirements.
