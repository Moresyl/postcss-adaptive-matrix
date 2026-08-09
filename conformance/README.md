# Conformance Suite

> 本文档使用英文，因为这套用例是给**其它语言的实现**做验收用的规范，而不是本项目的使用说明。
> 使用说明请见 [docs/](../docs/)。

A language-neutral description of what this compiler must produce.

Every case is plain data — CSS text and JSON. Nothing in this directory imports
the reference implementation, so any implementation in any language can be
validated against it by walking `cases/` and comparing strings.

The suite is the normative definition of the transform. When behaviour and suite
disagree, the suite wins until a case is deliberately updated in the same commit
that changes the behaviour.

## Layout

```
cases/<group>/<name>/
  case.json      required — metadata and plugin options
  input.css      required — source stylesheet
  expected.css   required — exact expected output
```

## `case.json`

```jsonc
{
  "description": "One sentence describing the guarantee under test.",
  "from": "/project/src/app.css",   // optional, default "/project/src/app.css"
  "options": { },                    // optional, default {}
  "warnings": ["substring"]          // optional, default []
}
```

- `options` is passed verbatim to the compiler.
- `warnings` lists substrings that must each appear in exactly one emitted
  warning. The count must match the number of warnings emitted.

### Encoding regular expressions

JSON has no regex literal, so options that accept a pattern also accept a
tagged object:

```json
{ "$regex": "\\.module\\.css$", "$flags": "i" }
```

An implementation without regex support may skip cases that use this form and
must report them as skipped rather than passed.

## The universal invariant

Beyond matching `expected.css`, every case must satisfy one rule that has no
fixture of its own:

> Compiling `expected.css` again must return it byte for byte.

It has no fixture because it is not a feature — it has to hold everywhere. A
package that ships pre-compiled CSS goes through the consuming application's
pipeline a second time, and a framework preset can register the compiler twice
without saying so. Neither situation announces itself, so an implementation that
is idempotent for the cases someone thought to write down is not idempotent.

Three behaviours exist only to satisfy it: bounded expressions that already
carry a viewport unit are left alone, ignore directives survive into the output,
and the root foundation is introduced by a marker comment that suppresses a
second injection.

## Deliberately out of scope

Options that take a **callback** (`designWidth` as a function, function file
matchers) cannot be expressed as data and are therefore not covered here. They
are exercised by the reference implementation's own unit tests. Keeping them out
of the suite is intentional: the suite must stay portable.

## Running

```bash
npm test                    # verifies every case
npm run conformance:update  # rewrites expected.css from current behaviour
```

`conformance:update` is a snapshot refresh. Always read the resulting diff — an
unexpected change there is a behaviour regression, not a formatting detail.

## Output normalisation

Comparison is done on the exact output string with only these normalisations:

1. `\r\n` is normalised to `\n`.
2. A single trailing newline is ignored.

Whitespace inside the CSS is significant, because preserving author formatting
is itself a guarantee of this compiler.
