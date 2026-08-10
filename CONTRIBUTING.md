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

## Pull requests

Keep a PR focused, and state: the problem, the approach, the compatibility impact, and how you verified it. The default conversion formula, the output order, the public types and the minimum Node/PostCSS versions are all part of the compatibility contract.

Conventional Commits are preferred for commit messages, for example:

```text
feat: add foldable profile preset
fix: preserve signed fractional hairlines
docs: clarify container ownership
```

By contributing you agree that your contribution is released under this project's MIT License.
