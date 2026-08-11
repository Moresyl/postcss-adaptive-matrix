/**
 * Every option, as data.
 *
 * Prose explains why an option exists; this says what it is — name, type,
 * range, default, and the shape of everything nested under it. That is the form
 * an editor can validate against and a model can read without inferring a type
 * system from paragraphs, and it is published at `/schema/options.json`.
 *
 * Two things keep it honest rather than decorative. The property tables are
 * typed as `Fields<T>` over the real interfaces, so a new option that is not
 * described here fails `tsc` — and so does a described option that no longer
 * exists. And every `default` is read out of `resolveOptions()` rather than
 * restated, so the published default is the one the compiler actually applies.
 *
 * `x-` keywords carry what JSON Schema has no vocabulary for: the Chinese half
 * of each description, and the JavaScript-only forms — a `RegExp`, a predicate
 * function — that a JSON document cannot express but a config file can.
 */
import { resolveOptions } from '../../src/core/options.js'
import type {
  AdaptiveMatrixOptions,
  AdaptiveProfile,
  AdaptiveQuery,
  AdaptiveRoute,
  LibraryAdaptation,
  MediaMatcher,
  RootFoundationOptions,
} from '../../src/core/types.js'

/** A described field: a JSON Schema subschema, in both languages. */
interface Field {
  description: string
  'x-description-zh': string
  [keyword: string]: unknown
}

/**
 * One entry per property of `T`, no more and no less.
 *
 * `Required<T>` is what makes an optional property mandatory *here*: the
 * schema has to describe an option whether or not callers have to pass it.
 */
type Fields<T> = { [K in keyof Required<T>]: Field }

const DEFAULTS = resolveOptions()

const PATTERN = {
  description: 'A substring, or a regular expression in a JavaScript config.',
  'x-description-zh': '子串匹配；在 JavaScript 配置里也可以写正则。',
  type: 'string',
  'x-also': 'RegExp',
}

const FILE_MATCHER = {
  description:
    'A path substring, a regular expression, or a predicate over the file path.',
  'x-description-zh': '路径子串、正则，或一个接收文件路径的判断函数。',
  type: 'string',
  'x-also': 'RegExp | ((file: string) => boolean)',
}

/** `T | readonly T[]`, which nearly every matching option accepts. */
function oneOrMany(item: object, doc: Field): Field {
  return { ...doc, oneOf: [item, { type: 'array', items: item }] }
}

const QUERY: Fields<AdaptiveQuery> = {
  type: {
    description: 'Whether the wrapper is a media query or a container query.',
    'x-description-zh': '包裹层用媒体查询还是容器查询。',
    type: 'string',
    enum: ['media', 'container'],
    default: 'media',
  },
  condition: {
    description: 'The query condition, written as it would appear in CSS.',
    'x-description-zh': '查询条件，按 CSS 里的写法书写。',
    type: 'string',
    examples: ['(min-width: 768px)'],
  },
  name: {
    description: 'Container name, for a container query that targets one.',
    'x-description-zh': '容器名，仅在容器查询需要指定容器时使用。',
    type: 'string',
  },
}

const PROFILE: Fields<AdaptiveProfile> = {
  designWidth: {
    description: 'Width of the design canvas this profile was drawn on.',
    'x-description-zh': '该画布对应的设计稿宽度。',
    type: 'number',
    exclusiveMinimum: 0,
    examples: [375, 750, 1440],
    'x-also': '(context: { file, profile }) => number',
  },
  fluid: {
    description: 'The interval in which lengths are allowed to scale.',
    'x-description-zh': '长度允许缩放的视口区间。',
    type: 'object',
    required: ['minWidth', 'maxWidth'],
    additionalProperties: false,
    properties: {
      minWidth: {
        description: 'Below this width, every converted length holds still.',
        'x-description-zh': '低于该宽度后，转换出来的长度不再变化。',
        type: 'number',
        exclusiveMinimum: 0,
      },
      maxWidth: {
        description: 'Above this width, every converted length holds still.',
        'x-description-zh': '高于该宽度后，转换出来的长度不再变化。',
        type: 'number',
        exclusiveMinimum: 0,
      },
    },
  },
  query: {
    description:
      'Wrapper generated for `@adaptive <profile>`; `false` unwraps the block.',
    'x-description-zh': '`@adaptive <画布>` 生成的包裹层；`false` 表示不包裹。',
    oneOf: [
      { type: 'string' },
      { type: 'object', properties: QUERY, required: ['condition'] },
      { const: false },
    ],
  },
  unit: {
    description: 'Width unit the fluid half is written in.',
    'x-description-zh': '流体部分使用的宽度单位。',
    type: 'string',
    enum: ['vw', 'vi', 'cqw', 'cqi'],
  },
  strategy: {
    description:
      'How a length is written: a bounded `clamp()`, or a bare viewport unit for engines without it.',
    'x-description-zh':
      '长度的写法：带上下界的 `clamp()`，或面向不支持它的引擎输出裸视口单位。',
    type: 'string',
    enum: ['clamp', 'viewport'],
  },
  fontFluidity: {
    description: 'Per-profile override of the global `fontFluidity`.',
    'x-description-zh': '在该画布上覆盖全局的 `fontFluidity`。',
    type: 'number',
    minimum: 0,
    maximum: 1,
  },
  textAnchorWidth: {
    description:
      'Canvas the static `rem` half of a text size is measured against. Defaults to `designWidth`.',
    'x-description-zh': '文字尺寸中固定的 `rem` 部分所参照的画布，默认取 `designWidth`。',
    type: 'number',
    exclusiveMinimum: 0,
    'x-also': '(context: { file, profile }) => number',
  },
  rootMaxWidth: {
    description: 'Maximum width applied to the configured root inside this profile.',
    'x-description-zh': '在该画布内，为配置的根元素设置的最大宽度。',
    type: 'number',
    exclusiveMinimum: 0,
  },
}

const MEDIA: Fields<MediaMatcher> = {
  minWidth: {
    description: 'The rule must not apply below this width.',
    'x-description-zh': '规则在低于该宽度时不得生效。',
    type: 'number',
    minimum: 0,
  },
  maxWidth: {
    description: 'The rule must not apply above this width.',
    'x-description-zh': '规则在高于该宽度时不得生效。',
    type: 'number',
    minimum: 0,
  },
}

const MEDIA_MATCHER = {
  type: 'object',
  properties: MEDIA,
  additionalProperties: false,
  minProperties: 1,
}

const ROUTE: Fields<AdaptiveRoute> = {
  profile: {
    description:
      'Target canvas, or `false` to leave matching lengths in fixed pixels.',
    'x-description-zh': '目标画布；`false` 表示匹配到的长度保持固定像素。',
    oneOf: [{ type: 'string' }, { const: false }],
  },
  file: oneOrMany(FILE_MATCHER, {
    description: 'Stylesheet paths this route claims.',
    'x-description-zh': '该路由认领的样式文件路径。',
  }),
  selector: oneOrMany(PATTERN, {
    description:
      'Selectors this route claims, so inlined CSS still routes after the path is gone.',
    'x-description-zh': '该路由认领的选择器；即使被打包内联、路径丢失也仍能命中。',
  }),
  property: oneOrMany(
    { type: 'string' },
    {
      description: 'Custom-property prefixes, e.g. `--van-`. Routes tokens declared on `:root`.',
      'x-description-zh': '自定义属性前缀，例如 `--van-`；用于路由声明在 `:root` 上的变量。',
    },
  ),
  media: oneOrMany(MEDIA_MATCHER, {
    description:
      'Width band the rule must be confined to by its enclosing queries. Matched by implication, not by text.',
    'x-description-zh':
      '规则必须被其外层查询限制在该宽度区间内。按逻辑蕴含匹配，而不是比对文本。',
  }),
}

const LIBRARY: Fields<LibraryAdaptation> = {
  name: {
    description: 'Used in the derived profile name and in diagnostics.',
    'x-description-zh': '用于派生画布的命名与诊断信息。',
    type: 'string',
  },
  extends: {
    description: 'Built-in to start from, so one field can be corrected without restating the rest.',
    'x-description-zh': '要继承的内置条目，只改一个字段而不必重写其余部分。',
    type: 'string',
  },
  designWidth: {
    description:
      'Canvas the library was authored against, or `false` to keep its lengths in fixed pixels.',
    'x-description-zh': '该组件库绘制时使用的画布；`false` 表示其长度保持固定像素。',
    oneOf: [{ type: 'number', exclusiveMinimum: 0 }, { const: false }],
  },
  prefix: oneOrMany(
    { type: 'string' },
    {
      description: 'Class prefixes, without the dot.',
      'x-description-zh': '类名前缀，不带点。',
    },
  ),
  tokenPrefix: oneOrMany(
    { type: 'string' },
    {
      description: 'Custom-property prefixes, for a library themed through `:root` tokens.',
      'x-description-zh': '自定义属性前缀，用于通过 `:root` 变量做主题的组件库。',
    },
  ),
  file: oneOrMany(FILE_MATCHER, {
    description: 'Paths, for builds that keep vendor CSS in its own files.',
    'x-description-zh': '路径匹配，适用于第三方 CSS 仍保留独立文件的构建。',
  }),
  scoped: {
    description:
      'Requires `file` to match before `prefix` or `tokenPrefix` count, for one prefix spanning two canvases.',
    'x-description-zh':
      '要求先命中 `file`，`prefix` 与 `tokenPrefix` 才算数；用于同一前缀横跨两套画布的情况。',
    type: 'boolean',
    default: false,
  },
  basedOn: {
    description: "Profile whose fluid range, unit and strategy the derived canvas borrows.",
    'x-description-zh': '派生画布借用其流体区间、单位与输出策略的画布。',
    type: 'string',
  },
}

const ROOT: Fields<RootFoundationOptions> = {
  selector: {
    description: 'The element that carries the layout, such as `#app`.',
    'x-description-zh': '承载布局的元素，例如 `#app`。',
    type: 'string',
    minLength: 1,
  },
  center: {
    description: 'Centres the root column once a profile caps its width.',
    'x-description-zh': '当某个画布限制了宽度后，将根容器居中。',
    type: 'boolean',
  },
  container: {
    description: 'Makes the root a query container, which is what `cqw`/`cqi` measure against.',
    'x-description-zh': '把根元素声明为查询容器，`cqw`/`cqi` 即以它为基准。',
    type: 'boolean',
  },
  containerName: {
    description: 'Name given to that container.',
    'x-description-zh': '该容器的名称。',
    type: 'string',
  },
  safeAreaVariables: {
    description: 'Declares `env(safe-area-inset-*)` as custom properties, with zero fallbacks.',
    'x-description-zh': '把 `env(safe-area-inset-*)` 声明为自定义属性，并给出 0 兜底值。',
    type: 'boolean',
  },
  layer: {
    description: 'Cascade layer the foundation is written into, or `false` for none.',
    'x-description-zh': '基础样式写入的层叠层；`false` 表示不使用层。',
    oneOf: [{ type: 'string' }, { const: false }],
  },
  fixedContainingBlock: {
    description: 'Keeps `position: fixed` descendants aligned to the root column.',
    'x-description-zh': '让 `position: fixed` 的后代仍对齐到根容器这一列。',
    type: 'boolean',
  },
  logical: {
    description:
      'Whether the foundation writes logical properties. Set false for the physical spellings.',
    'x-description-zh': '基础样式是否使用逻辑属性；设为 false 则输出物理属性写法。',
    type: 'boolean',
    default: true,
  },
  injectTo: oneOrMany(FILE_MATCHER, {
    description:
      'Which files receive the foundation. Point it at the entry stylesheet in a per-component build.',
    'x-description-zh':
      '哪些文件会收到基础样式。单文件组件项目应指向入口样式表，避免每个组件各写一份。',
  }),
}

const OPTIONS: Fields<AdaptiveMatrixOptions> = {
  profiles: {
    description:
      'The design canvases, by name. Defaults to the app and desktop canvases of `appPcPreset()`.',
    'x-description-zh': '按名字组织的设计画布集合。默认为 `appPcPreset()` 的移动端与桌面端画布。',
    type: 'object',
    additionalProperties: {
      type: 'object',
      properties: PROFILE,
      required: ['designWidth', 'fluid'],
      additionalProperties: false,
    },
    propertyNames: {
      // `library:` is the registry's own namespace; a profile named into it
      // would be overwritten by the expansion and silently do nothing.
      pattern: '^(?!library:)',
    },
  },
  defaultProfile: {
    description: 'Canvas used by anything no route or `@adaptive` claims.',
    'x-description-zh': '未被路由或 `@adaptive` 认领的内容所使用的画布。',
    type: 'string',
    default: DEFAULTS.defaultProfile,
  },
  routes: {
    description: 'Evaluated in order; the first match wins. `@adaptive` always outranks these.',
    'x-description-zh': '按顺序求值，先匹配者胜出。`@adaptive` 始终优先于路由。',
    type: 'array',
    items: {
      type: 'object',
      properties: ROUTE,
      required: ['profile'],
      additionalProperties: false,
    },
    default: [],
  },
  libraries: {
    description:
      'Component libraries to adapt. `auto` activates every built-in; `false` turns the mechanism off.',
    'x-description-zh': '要适配的组件库。`auto` 启用全部内置条目；`false` 关闭该机制。',
    oneOf: [
      { const: 'auto' },
      { const: false },
      {
        type: 'array',
        items: {
          oneOf: [
            { type: 'string' },
            { type: 'object', properties: LIBRARY, additionalProperties: false },
          ],
        },
      },
    ],
    default: 'auto',
  },
  atRuleName: {
    description: 'The directive that selects a canvas.',
    'x-description-zh': '用于选择画布的指令名。',
    type: 'string',
    minLength: 1,
    default: DEFAULTS.atRuleName,
  },
  strategy: {
    description: 'Default output form for every profile that does not set its own.',
    'x-description-zh': '未单独设置的画布所使用的默认输出形式。',
    type: 'string',
    enum: ['clamp', 'viewport'],
    default: DEFAULTS.strategy,
  },
  unit: {
    description: 'Default width unit for every profile that does not set its own.',
    'x-description-zh': '未单独设置的画布所使用的默认宽度单位。',
    type: 'string',
    enum: ['vw', 'vi', 'cqw', 'cqi'],
    default: DEFAULTS.unit,
  },
  precision: {
    description: 'Decimal places kept in generated lengths.',
    'x-description-zh': '生成长度保留的小数位数。',
    type: 'integer',
    minimum: 0,
    maximum: 12,
    default: DEFAULTS.precision,
  },
  unitToConvert: {
    description:
      'Units read as design-canvas lengths. A list reads several in one pass, which is what mixing hand-written CSS with an atomic framework needs.',
    'x-description-zh':
      '被当作设计稿长度读取的单位。传数组可一次读取多种，手写 CSS 与原子化框架混用时正需要如此。',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' }, minItems: 1 }],
    default: DEFAULTS.unitToConvert,
  },
  rootValue: {
    description: 'Pixels per `rem`, used both when reading `rem` input and when writing text lengths.',
    'x-description-zh': '每 `rem` 对应的像素数；读取 `rem` 输入和写出文字长度时都会用到。',
    type: 'number',
    exclusiveMinimum: 0,
    default: DEFAULTS.rootValue,
  },
  minPixelValue: {
    description: 'Values at or below this stay in pixels.',
    'x-description-zh': '小于等于该值的长度保持像素。',
    type: 'number',
    minimum: 0,
    default: DEFAULTS.minPixelValue,
  },
  hairline: {
    description:
      'Absolute sizes at or below this stay in pixels. A hairline is a rendering decision, not a measurement.',
    'x-description-zh': '绝对值小于等于该数的长度保持像素。发丝线是渲染决策，不是测量值。',
    type: 'number',
    minimum: 0,
    default: DEFAULTS.hairline,
  },
  fontFluidity: {
    description:
      'Share of a text size expressed fluidly. `0` is plain `rem`; kept below `1` so browser zoom still reaches text.',
    'x-description-zh':
      '文字尺寸中流体部分的占比。`0` 表示纯 `rem`；保持小于 `1` 才能让浏览器缩放仍然生效。',
    type: 'number',
    minimum: 0,
    maximum: 1,
    default: DEFAULTS.fontFluidity,
  },
  textProperties: {
    description: 'Properties written with the text formula. Entries may end in `*`.',
    'x-description-zh': '按文字公式书写的属性。条目末尾可用 `*` 通配。',
    type: 'array',
    items: { type: 'string' },
    default: DEFAULTS.textProperties,
  },
  propList: {
    description:
      'Properties to convert. `*` matches everything, a leading `!` excludes, and a list of nothing but exclusions is rejected.',
    'x-description-zh':
      '要转换的属性。`*` 匹配全部，前置 `!` 表示排除；全是排除项的列表会被拒绝。',
    type: 'array',
    items: { type: 'string' },
    minItems: 1,
    default: DEFAULTS.propList,
  },
  selectorExclude: {
    description: 'Selectors left untouched.',
    'x-description-zh': '不做处理的选择器。',
    type: 'array',
    items: PATTERN,
    default: [],
  },
  valueExclude: {
    description: 'Declaration values left untouched.',
    'x-description-zh': '不做处理的声明值。',
    type: 'array',
    items: PATTERN,
    default: [],
  },
  include: oneOrMany(FILE_MATCHER, {
    description: 'Restricts the plugin to matching files.',
    'x-description-zh': '把插件限制在匹配的文件上。',
  }),
  exclude: oneOrMany(FILE_MATCHER, {
    description: 'Skips matching files entirely.',
    'x-description-zh': '完全跳过匹配的文件。',
  }),
  transformCustomProperties: {
    description:
      'Converts lengths in custom-property declarations the routing rules have not already claimed.',
    'x-description-zh': '转换自定义属性声明中的长度（路由已认领的部分不受此影响）。',
    type: 'boolean',
    default: DEFAULTS.transformCustomProperties,
  },
  preserveOriginal: {
    description: 'Keeps the original declaration in front of the generated one, as a fallback.',
    'x-description-zh': '在生成的声明之前保留原始声明，作为兜底。',
    type: 'boolean',
    default: DEFAULTS.preserveOriginal,
  },
  root: {
    description: 'The root foundation — the column, the container, the safe-area variables.',
    'x-description-zh': '根基础样式：布局列、查询容器与安全区变量。',
    oneOf: [
      {
        type: 'object',
        properties: ROOT,
        required: ['selector'],
        additionalProperties: false,
      },
      { const: false },
    ],
    default: false,
  },
  unknownProfile: {
    description: 'What to do when `@adaptive` names a canvas that does not exist.',
    'x-description-zh': '当 `@adaptive` 指定了不存在的画布时如何处理。',
    type: 'string',
    enum: ['warn', 'error', 'ignore'],
    default: DEFAULTS.unknownProfile,
  },
}

/** The published document. `base` is the site root, so `$id` resolves. */
export function optionsSchema(base: string): string {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `${base}schema/options.json`,
    title: 'postcss-adaptive-matrix options',
    'x-title-zh': 'postcss-adaptive-matrix 配置项',
    description:
      'Options accepted by adaptiveMatrix(). Descriptions are English; `x-description-zh` carries the Chinese. `x-also` names JavaScript-only forms — a RegExp, a predicate function — that this document cannot express but a config file accepts.',
    'x-description-zh':
      'adaptiveMatrix() 接受的配置项。`description` 为英文，中文在 `x-description-zh`。`x-also` 标注仅 JavaScript 可写的形式（正则、判断函数），JSON 无法表达但配置文件接受。',
    type: 'object',
    properties: OPTIONS,
    additionalProperties: false,
  }
  return `${JSON.stringify(schema, null, 2)}\n`
}
