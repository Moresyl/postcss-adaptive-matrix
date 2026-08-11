# Documentation for agents

**English** · [简体中文](./agents.zh-CN.md)

Most of the people who read this documentation next will not be people. A coding agent asked to wire this plugin into a project fetches one or two URLs and works from whatever is at them — it does not browse a sidebar, and it does not benefit from a search box. So the same documentation is published a second time in shapes a model can consume directly, generated from the same sources as the pages you are reading, which is what stops the two from drifting apart.

Everything below is a plain `GET`. Nothing needs a key, a session, or JavaScript.

## The entry point

| URL | What it is |
| --- | --- |
| [`/llms.txt`](https://moresyl.github.io/postcss-adaptive-matrix/llms.txt) | A curated index: one line per page, with a sentence on why you would open it |
| [`/llms-full.txt`](https://moresyl.github.io/postcss-adaptive-matrix/llms-full.txt) | Every page concatenated in reading order, for a model with the context window to spare |
| [`/zh/llms.txt`](https://moresyl.github.io/postcss-adaptive-matrix/zh/llms.txt) | The same index in Chinese |
| [`/zh/llms-full.txt`](https://moresyl.github.io/postcss-adaptive-matrix/zh/llms-full.txt) | The same full text in Chinese |

Both follow the [llms.txt](https://llmstxt.org) convention. Start with `llms.txt` — it is about 3 KB — and fetch the two pages the task actually needs. `llms-full.txt` is roughly 150 KB and is the right choice only when the task is open-ended.

## Any page, as Markdown

Every page is served as its own source. Append `.md` to the page's path:

```
https://moresyl.github.io/postcss-adaptive-matrix/docs/configuration.md
https://moresyl.github.io/postcss-adaptive-matrix/zh/docs/configuration.md
```

A directory index is `index.md` — `/docs/` is `/docs/index.md`. This is the same file the repository holds, not a rendering of it turned back into text: no navigation, no theme, no code-block chrome to strip.

Three buttons above the outline on every page use this: **Copy as Markdown**, **View raw Markdown**, and **Ask Claude**, which opens the page in a conversation with the question already attached.

## Every option, as data

```
https://moresyl.github.io/postcss-adaptive-matrix/schema/options.json
```

A [JSON Schema](https://json-schema.org/) draft 2020-12 document covering every option: its type, its permitted values, its range, and its default. Prose is the wrong shape for a question like *is `precision` an integer and what is its ceiling* — this answers it without being read as English at all.

Three things are worth knowing about it:

- **The defaults are the compiler's.** They are read out of the option resolver when the file is generated, not transcribed. A default that changes in the code changes here in the same commit.
- **The property tables are type-checked against the source interfaces.** An option that exists but is not described here fails the build, and so does a described option that no longer exists.
- **Both languages travel inside it.** `description` is English; `x-description-zh` is the Chinese. There is one document, not one per language, because a type is not a translation.

JSON cannot express a `RegExp` or a predicate function, and several options accept those. Where that is the case the schema describes the JSON-representable form and names the rest in `x-also`:

```json
"selectorExclude": {
  "type": "array",
  "items": { "type": "string", "x-also": "RegExp" }
}
```

## Getting a useful answer out of an agent

The plugin's whole premise is the thing a model is most likely to skip past, so it is worth stating in the prompt: **a `px` cannot be converted until you know which design file it was drawn on.** An agent that assumes one global design width will produce a configuration that compiles and is wrong — the pages will scale and the component library will not, or the other way round.

Two prompts that tend to work:

> Read `https://moresyl.github.io/postcss-adaptive-matrix/llms.txt`, then configure this project. Our app screens are drawn on a 375 canvas and our admin screens on 1440. We use Vant.

> Fetch `https://moresyl.github.io/postcss-adaptive-matrix/schema/options.json` and check my `postcss.config.js` against it. Explain any option whose value is not the default and why it might have been set.

If the answer needs to be verified rather than trusted, the [conformance suite](../conformance/README.md) is a set of input/output pairs as pure data, and the [CLI](./cli.md) compiles a stylesheet and prints the result without touching the build.

## Where to go next

- [Documentation index](./README.md) — the pages themselves
- [Configuration reference](./configuration.md) — the same options as prose
- [Playground](./playground.md) — the compiler running in the page, for checking an answer by hand
