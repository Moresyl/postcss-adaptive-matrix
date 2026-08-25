/**
 * CSS `<number>` grammar shared by length conversion and media parsing.
 *
 * A decimal point must have digits after it; `10.` is tokenised as a number
 * followed by a delimiter, not as one CSS number. Scientific notation is part
 * of the grammar and is emitted by minifiers and generated stylesheets.
 */
export const CSS_NUMBER_SOURCE = String.raw`[+-]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?`
