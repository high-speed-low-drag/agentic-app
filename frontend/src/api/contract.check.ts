/**
 * Compile-time contract drift guard (checked by `tsc -b`, never imported at runtime).
 *
 * Asserts that the hand-written types in ./schema.ts are structurally compatible with the
 * types generated from the backend OpenAPI spec (./openapi.d.ts, `make types`). If a backend
 * model gains, loses or retypes a field, `npm run build` fails here until schema.ts is fixed.
 *
 * Relaxations (deliberate): optionality and nullability are ignored on both sides (the backend
 * fills defaults, the frontend may be stricter or looser about null), and index signatures are
 * ignored next to known keys. Free-form objects (`params`, `params_schema`) are compared as
 * `Record<string, unknown>`.
 */
import type { components } from './openapi'
import type * as S from './schema'

type G = components['schemas']

/** Keys of T without string/number index signatures. */
type KnownKeys<T> = keyof {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K]
}

/** Deeply drop optionality, null/undefined and index signatures. */
type Loose<T> = T extends readonly (infer U)[]
  ? Loose<U>[]
  : T extends object
    ? [KnownKeys<T>] extends [never]
      ? Record<string, unknown>
      : { [K in KnownKeys<T>]-?: Loose<NonNullable<T[K]>> }
    : NonNullable<T>

/** Mutual assignability of the loosened types. */
type Compatible<A, B> = [Loose<A>] extends [Loose<B>]
  ? [Loose<B>] extends [Loose<A>]
    ? true
    : { error: 'generated type is not assignable to hand-written type'; got: Loose<B> }
  : { error: 'hand-written type is not assignable to generated type'; got: Loose<A> }

type Expect<T extends true> = T

/** params_schema is a JSON Schema object; the generated type is an opaque record. */
type GeneratorInfo = Omit<S.ProfileGeneratorInfo, 'params_schema'> & {
  params_schema: Record<string, unknown>
}

export type ContractChecks = [
  Expect<Compatible<S.Health, G['Health']>>,
  Expect<Compatible<S.NetworkItem, G['NetworkItem']>>,
  Expect<Compatible<S.NetworkTopology, G['NetworkTopology']>>,
  Expect<Compatible<S.EditableField, G['EditableField']>>,
  Expect<Compatible<S.NetworkOverride, G['NetworkOverride']>>,
  Expect<Compatible<GeneratorInfo, G['ProfileGeneratorInfo']>>,
  Expect<Compatible<S.ProfilePreviewRequest, G['ProfilePreviewRequest']>>,
  Expect<Compatible<S.ProfilePreviewResponse, G['ProfilePreviewResponse']>>,
  Expect<Compatible<S.ProfileUploadResponse, G['ProfileUploadInfo']>>,
  Expect<Compatible<S.CaseStudy, G['CaseStudy']>>,
  Expect<Compatible<S.CaseSummary, G['CaseSummary']>>,
  Expect<Compatible<S.ValidationResult, G['ValidationResult']>>,
  Expect<Compatible<S.RunInfo, G['RunInfo']>>,
  Expect<Compatible<S.ResultSummary, G['ResultSummary']>>,
  Expect<Compatible<S.TimeseriesResponse, G['TimeseriesResponse']>>,
  Expect<Compatible<S.EnvelopeResponse, G['EnvelopeResponse']>>,
  Expect<Compatible<S.HeatmapResponse, G['HeatmapResponse']>>,
  Expect<Compatible<S.SnapshotResponse, G['SnapshotResponse']>>,
]
