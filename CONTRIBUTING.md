# Contributing

Use `npx tsx bench/index.ts --fresh` after building to compare a reused plugin against a new plugin instance for each corpus pass, with libraries disabled and enabled. Initialization is inside the fresh measurement; each instance still processes all files in its pass. CSS equivalence is checked first. The process and modules stay warm, so this is not cold process startup. These optional results are observational and do not change CI budgets.

For a local viewport-observer comparison, run `npx tsx bench/runtime.ts <trusted-commit-hash>`. It compares the baseline runtime source with the working tree using current shared dependencies. Output equivalence is checked before alternating timings. Setup/teardown and direct unchanged/changing updates use a simulated host; results do not measure browser event dispatch, layout or rendering.

Token lookup changes can be compared with `npm run bench:tokens -- <trusted-commit-hash>`.
The comparison compiles that revision's token module against current shared dependencies,
checks identical query results, and measures collection plus queries for small and larger
definition sets. It excludes CSS parsing and is observational, not a performance gate or
a whole-release comparison. Only use revisions whose code you trust.

**English** · [简体中文](./CONTRIBUTING.zh-CN.md)

Thank you for wanting to improve postcss-adaptive-matrix.

## Before you start

- For a bug, search the existing issues first, and include the minimal CSS, the configuration, the actual output and the expected output.
- For new syntax or a change to default behaviour, open a discussion or issue describing the use case first.
- Do not open a public issue for a security problem; follow [SECURITY.md](./SECURITY.md).

## Local development

The published package supports Node 18+, but the development test runner does not support Node 18. The installed Vitest version declares Node `^20.0.0 || ^22.0.0 || >=24.0.0`; the full verification matrix uses Node 20, 22 and 24, with an additional Windows/Node 24 job. Node 24 is the locally verified environment for the commands below. A separate Node 18 runtime smoke job exercises the built ESM, CommonJS and CLI artifacts without running Vitest. Runtime compatibility and contributor-tool requirements are separate contracts.

```bash
git clone https://github.com/Moresyl/postcss-adaptive-matrix.git
cd postcss-adaptive-matrix
npm ci
npm run check
```

Code expectations:

- follow the existing TypeScript style, and keep each function to one job;
- public API additions need tests, types and documentation;
- cover the happy path, the boundaries and the error path;
- never leak file contents, environment variables or credentials in an error;
- run `npm run check` and `npm run pack:check` before committing.

## Documentation builds

`npm run docs:typecheck` checks Vue scripts and templates with strict template checking; it also runs inside `npm run typecheck`. A regression fixture proves that invalid template expressions are rejected. This does not add Vue-specific ESLint rules.

`npm run docs:build` builds the site and checks the generated local-search indexes offline: bilingual API queries, locale isolation, and every indexed page/heading target. Production search loads only the current language's index; development retains the shared index for live updates. It also traverses static JavaScript imports, re-exports and HTML module preloads to keep search and playground code outside eager page dependency graphs. These are build checks, not browser interaction, network timing or visual acceptance. The default deployment base is `/postcss-adaptive-matrix/`; set `DOCS_BASE=/` for a domain-root deployment before building. A changed base requires rebuilding, not editing generated HTML in place. Keep the same environment for the build and its automatic checks.

`DOCS_BASE` controls page paths, whereas `SITE_URL` controls absolute links in the AI indexes and the schema `$id`. For a custom domain, set both before building; `SITE_URL` must include the matching deployment path. For example, in PowerShell: `$env:DOCS_BASE='/'; $env:SITE_URL='https://docs.example.com/'; npm run docs:build`. These values describe deployment configuration; a successful local build does not verify that the domain serves the files. The build also compares generated Markdown, AI indexes, schema and favicon against source content.

Omitting the trailing `/` is accepted and normalized automatically. `SITE_URL` remains optional; explicit values must be HTTP(S) URLs without credentials, query strings or fragments.

## Performance measurements

Run `npm run bench:continuity -- a3025cc` for a source-level analyzer comparison, replacing the hash with an available trusted baseline commit. The script executes that revision's analyzer with current dependencies, verifies identical findings, and alternates timing against the working tree on synthetic 2- and 40-breakpoint corpora. This is not a whole-release comparison or CI gate. Output differences fail before timing; the same iteration and warmup environment variables apply.

The throughput corpora are generated synthetic CSS shaped like component libraries, utility frameworks and applications, not downloaded bundles or browser-rendering benchmarks. Run `npm run bench:check -- --cache-churn` to add 4000 distinct custom properties with custom-property conversion enabled. Before timing, the built compiler must change every declaration value while retaining names and counts, without warnings, both with libraries disabled and with all built-ins enabled. This preflight is outside the timed region; separate tests check numeric output and idempotence. It does not prove arbitrary CSS is correct or represent every watch-build workload.

Run `npm run build` followed by `npm run bench:check` to measure the shipped artifacts against a real PostCSS parse-and-print baseline. The report uses medians over 20 timed passes after 5 warmup passes. Optional environment variables `BENCH_ITERATIONS` and `BENCH_WARMUP` override these counts: iterations must be a positive safe integer, warmup a nonnegative safe integer. Invalid values fail instead of producing an empty or misleading report. Setting warmup to zero is useful for investigation but is not comparable to the default warmed measurement.

Record the Node version, machine, configuration and corpus when comparing results. Passing the relative budget is a regression check, not proof of superiority over another compiler.

Use `npm run bench:api` to additionally compare the reusable programmatic compiler, with and without the optional Safari 14 / Chrome 90 compatibility audit. These extra measurements use the same files and warmup/median settings; they are observational and do not yet have a CI budget. Negative deltas can result from measurement noise.

The main throughput measurement rotates baseline/compiler/library execution order each round to reduce time-order bias. The API comparison separately rotates plugin/API/audited-API order; its plugin median is measured independently from the main table. Rotation cannot eliminate system load, garbage collection or thermal noise; repeat unexpected results before attributing them to the compiler. Budgets remain unchanged; results from the earlier sequential sampling method are not a controlled before/after comparison.

Run `npm run verify:libraries -- vant nutui` to inspect selected published component-library styles. The report includes the package version and cache provenance. Existing `.libcheck` packages are reused; `CLEAN=1` removes the scratch directory after the run, not before it, so it does not refresh that run's inputs. This optional network check returns nonzero for unknown names, missing or unreadable styles, malformed CSS, missing prefixes, wrong routes, compiler warnings, non-idempotent output or seam findings. Runtime-only libraries without stylesheets are reported as skipped, not statically verified. It does not certify design widths or browser rendering.

## Publication preflight without publishing

Run `npm run prepublishOnly` to validate locally without uploading a package, pushing commits or creating a release. It sequentially runs `check` (including a fresh build, coverage and documentation build), `pack:check`, `smoke:runtime`, `bench:check` and `audit:check`, stopping at the first failure. The audit needs network access. Runtime smoke uses the current Node executable; it does not replace the CI platform matrix.

Normal `npm publish` also invokes this lifecycle script, but is a separate publishing action. Do not use it merely to validate a build. Passing this preflight does not prove real-browser behavior, live deployment or release availability.

## Pull requests

Library seam details include the selector, property, breakpoint and sampled values. `pre-existing` means the complete finding matches analysis of the original stylesheet; `new/changed` means it does not. Neither label proves design intent or causality, and both still fail the seam gate.

For libraries expected to remain unconverted, the verifier also compares the first output directly with the source CSS. An `UNEXPECTED REWRITE` fails the gate even if a second compilation is idempotent.

For an isolated compatibility-detector comparison, run `npx tsx bench/compat-compare.ts <commit-sha>`. Only use a trusted repository commit: the tool bundles and executes that revision's detector with current dependencies in memory. It checks output equality on the synthetic corpora before alternating old/new timed calls. It neither checks out that commit nor measures a complete historical package, and its ratios are not whole-build speedups.

Keep a PR focused, and state: the problem, the approach, the compatibility impact, and how you verified it. The default conversion formula, the output order, the public types and the minimum Node/PostCSS versions are all part of the compatibility contract.

Conventional Commits are preferred for commit messages, for example:

```text
feat: add foldable profile preset
fix: preserve signed fractional hairlines
docs: clarify container ownership
```

By contributing you agree that your contribution is released under this project's MIT License.
