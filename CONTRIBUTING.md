# Contributing

**English** · [简体中文](./CONTRIBUTING.zh-CN.md)

Thank you for wanting to improve postcss-adaptive-matrix.

## Before you start

- For a bug, search the existing issues first, and include the minimal CSS, the configuration, the actual output and the expected output.
- For new syntax or a change to default behaviour, open a discussion or issue describing the use case first.
- Do not open a public issue for a security problem; follow [SECURITY.md](./SECURITY.md).

## Local development

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

`npm run docs:build` builds the site and checks the generated local-search index offline: bilingual API queries, locale loading fallback, and every indexed page/heading target. This is not browser interaction or visual acceptance. The default deployment base is `/postcss-adaptive-matrix/`; set `DOCS_BASE=/` for a domain-root deployment before building. A changed base requires rebuilding, not editing generated HTML in place. Keep the same environment for the build and its automatic search check.

## Performance measurements

The throughput corpora are generated synthetic CSS shaped like component libraries, utility frameworks and applications, not downloaded bundles or browser-rendering benchmarks. Run `npm run bench:check -- --cache-churn` to add 4000 distinct custom properties with custom-property conversion enabled. Before timing, the built compiler must change every declaration value while retaining names and counts, without warnings, both with libraries disabled and with all built-ins enabled. This preflight is outside the timed region; separate tests check numeric output and idempotence. It does not prove arbitrary CSS is correct or represent every watch-build workload.

Run `npm run build` followed by `npm run bench:check` to measure the shipped artifacts against a real PostCSS parse-and-print baseline. The report uses medians over 20 timed passes after 5 warmup passes. Optional environment variables `BENCH_ITERATIONS` and `BENCH_WARMUP` override these counts: iterations must be a positive safe integer, warmup a nonnegative safe integer. Invalid values fail instead of producing an empty or misleading report. Setting warmup to zero is useful for investigation but is not comparable to the default warmed measurement.

Record the Node version, machine, configuration and corpus when comparing results. Passing the relative budget is a regression check, not proof of superiority over another compiler.

Use `npm run bench:api` to additionally compare the reusable programmatic compiler, with and without the optional Safari 14 / Chrome 90 compatibility audit. These extra measurements use the same files and warmup/median settings; they are observational and do not yet have a CI budget. Negative deltas can result from measurement noise.

The main throughput measurement rotates baseline/compiler/library execution order each round to reduce time-order bias. The API comparison separately rotates plugin/API/audited-API order; its plugin median is measured independently from the main table. Rotation cannot eliminate system load, garbage collection or thermal noise; repeat unexpected results before attributing them to the compiler. Budgets remain unchanged; results from the earlier sequential sampling method are not a controlled before/after comparison.

Run `npm run verify:libraries -- vant nutui` to inspect selected published component-library styles. The report includes the package version and cache provenance. Existing `.libcheck` packages are reused; `CLEAN=1` removes the scratch directory after the run, not before it, so it does not refresh that run's inputs. This optional network check returns nonzero for unknown names, missing or unreadable styles, malformed CSS, missing prefixes, wrong routes, compiler warnings, non-idempotent output or seam findings. Runtime-only libraries without stylesheets are reported as skipped, not statically verified. It does not certify design widths or browser rendering.

## Pull requests

For an isolated compatibility-detector comparison, run `npx tsx bench/compat-compare.ts <commit-sha>`. Only use a trusted repository commit: the tool bundles and executes that revision's detector with current dependencies in memory. It checks output equality on the synthetic corpora before alternating old/new timed calls. It neither checks out that commit nor measures a complete historical package, and its ratios are not whole-build speedups.

Keep a PR focused, and state: the problem, the approach, the compatibility impact, and how you verified it. The default conversion formula, the output order, the public types and the minimum Node/PostCSS versions are all part of the compatibility contract.

Conventional Commits are preferred for commit messages, for example:

```text
feat: add foldable profile preset
fix: preserve signed fractional hairlines
docs: clarify container ownership
```

By contributing you agree that your contribution is released under this project's MIT License.
