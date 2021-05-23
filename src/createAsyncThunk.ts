import { Dispatch, AnyAction } from 'redux'
import {
  createAction,
  PayloadAction,
  ActionCreatorWithPreparedPayload,
} from './createAction'
import { ThunkDispatch } from 'redux-thunk'
import { FallbackIfUnknown, IsAny, IsUnknown } from './tsHelpers'
import { nanoid } from './nanoid'

// @ts-ignore we need the import of these types due to a bundling issue.
type _Keep = PayloadAction | ActionCreatorWithPreparedPayload<any, unknown>

export type BaseThunkAPI<
  S,
  E,
  D extends Dispatch = Dispatch,
  RejectedValue = undefined,
  RejectedMeta = unknown,
  FulfilledValue = unknown,
  FulfilledMeta = unknown
> = {
  dispatch: D
  getState: () => S
  extra: E
  requestId: string
  signal: AbortSignal
  rejectWithValue: IsUnknown<
    RejectedMeta,
    (value: RejectedValue) => RejectWithValue<RejectedValue, RejectedMeta>,
    (
      value: RejectedValue,
      meta: RejectedMeta
    ) => RejectWithValue<RejectedValue, RejectedMeta>
  >
  fulfillWithValue: IsUnknown<
    FulfilledMeta,
    (value: FulfilledValue) => FulfillWithMeta<FulfilledValue, FulfilledMeta>,
    (
      value: FulfilledValue,
      meta: FulfilledMeta
    ) => FulfillWithMeta<FulfilledValue, FulfilledMeta>
  >
}

/**
 * @public
 */
export interface SerializedError {
  name?: string
  message?: string
  stack?: string
  code?: string
}

const commonProperties: Array<keyof SerializedError> = [
  'name',
  'message',
  'stack',
  'code',
]

class RejectWithValue<Payload, RejectedMeta> {
  constructor(
    public readonly payload: Payload,
    public readonly meta: RejectedMeta
  ) {}
}

class FulfillWithMeta<Payload, FulfilledMeta> {
  constructor(
    public readonly payload: Payload,
    public readonly meta: FulfilledMeta
  ) {}
}

// Reworked from https://github.com/sindresorhus/serialize-error
export const miniSerializeError = (value: any): SerializedError => {
  if (typeof value === 'object' && value !== null) {
    const simpleError: SerializedError = {}
    for (const property of commonProperties) {
      if (typeof value[property] === 'string') {
        simpleError[property] = value[property]
      }
    }

    return simpleError
  }

  return { message: String(value) }
}

type AsyncThunkConfig = {
  state?: unknown
  dispatch?: Dispatch
  extra?: unknown
  rejectValue?: unknown
  serializedErrorType?: unknown
  pendingMeta?: unknown
  fulfilledMeta?: unknown
  rejectedMeta?: unknown
}

type GetState<ThunkApiConfig> = ThunkApiConfig extends {
  state: infer State
}
  ? State
  : unknown
type GetExtra<ThunkApiConfig> = ThunkApiConfig extends { extra: infer Extra }
  ? Extra
  : unknown
type GetDispatch<ThunkApiConfig> = ThunkApiConfig extends {
  dispatch: infer Dispatch
}
  ? FallbackIfUnknown<
      Dispatch,
      ThunkDispatch<
        GetState<ThunkApiConfig>,
        GetExtra<ThunkApiConfig>,
        AnyAction
      >
    >
  : ThunkDispatch<GetState<ThunkApiConfig>, GetExtra<ThunkApiConfig>, AnyAction>

type GetThunkAPI<ThunkApiConfig, FulfilledValue> = BaseThunkAPI<
  GetState<ThunkApiConfig>,
  GetExtra<ThunkApiConfig>,
  GetDispatch<ThunkApiConfig>,
  GetRejectValue<ThunkApiConfig>,
  GetRejectedMeta<ThunkApiConfig>,
  FulfilledValue,
  GetFulfilledMeta<ThunkApiConfig>
>

type GetRejectValue<ThunkApiConfig> = ThunkApiConfig extends {
  rejectValue: infer RejectValue
}
  ? RejectValue
  : unknown

type GetPendingMeta<ThunkApiConfig> = ThunkApiConfig extends {
  pendingMeta: infer PendingMeta
}
  ? PendingMeta
  : unknown

type GetFulfilledMeta<ThunkApiConfig> = ThunkApiConfig extends {
  fulfilledMeta: infer FulfilledMeta
}
  ? FulfilledMeta
  : unknown

type GetRejectedMeta<ThunkApiConfig> = ThunkApiConfig extends {
  rejectedMeta: infer RejectedMeta
}
  ? RejectedMeta
  : unknown

type GetSerializedErrorType<ThunkApiConfig> = ThunkApiConfig extends {
  serializedErrorType: infer GetSerializedErrorType
}
  ? GetSerializedErrorType
  : SerializedError

type MaybePromise<T> = T | Promise<T>

/**
 * A type describing the return value of the `payloadCreator` argument to `createAsyncThunk`.
 * Might be useful for wrapping `createAsyncThunk` in custom abstractions.
 *
 * @public
 */
export type AsyncThunkPayloadCreatorReturnValue<
  Returned,
  ThunkApiConfig extends AsyncThunkConfig
> = MaybePromise<
  | IsUnknown<
      GetFulfilledMeta<ThunkApiConfig>,
      Returned,
      FulfillWithMeta<Returned, GetFulfilledMeta<ThunkApiConfig>>
    >
  | RejectWithValue<
      GetRejectValue<ThunkApiConfig>,
      GetRejectedMeta<ThunkApiConfig>
    >
>
/**
 * A type describing the `payloadCreator` argument to `createAsyncThunk`.
 * Might be useful for wrapping `createAsyncThunk` in custom abstractions.
 *
 * @public
 */
export type AsyncThunkPayloadCreator<
  Returned,
  ThunkArg = void,
  ThunkApiConfig extends AsyncThunkConfig = {}
> = (
  arg: ThunkArg,
  thunkAPI: GetThunkAPI<ThunkApiConfig, Returned>
) => AsyncThunkPayloadCreatorReturnValue<Returned, ThunkApiConfig>

/**
 * A ThunkAction created by `createAsyncThunk`.
 * Dispatching it returns a Promise for either a
 * fulfilled or rejected action.
 * Also, the returned value contains an `abort()` method
 * that allows the asyncAction to be cancelled from the outside.
 *
 * @public
 */
export type AsyncThunkAction<
  Returned,
  ThunkArg,
  ThunkApiConfig extends AsyncThunkConfig
> = (
  dispatch: GetDispatch<ThunkApiConfig>,
  getState: () => GetState<ThunkApiConfig>,
  extra: GetExtra<ThunkApiConfig>
) => Promise<
  | ReturnType<AsyncThunkFulfilledActionCreator<Returned, ThunkArg>>
  | (ReturnType<AsyncThunkRejectedActionCreator<ThunkArg, unknown>> & {
      meta: { rejectedWithValue: false }
    })
  | (ReturnType<AsyncThunkRejectedActionCreator<ThunkArg, ThunkApiConfig>> & {
      meta: { rejectedWithValue: true; aborted: false; condition: false }
    })
> & {
  abort(reason?: string): void
  requestId: string
  arg: ThunkArg
  unwrap(): Promise<Returned>
}

type AsyncThunkActionCreator<
  Returned,
  ThunkArg,
  ThunkApiConfig extends AsyncThunkConfig
> = IsAny<
  ThunkArg,
  // any handling
  (arg: ThunkArg) => AsyncThunkAction<Returned, ThunkArg, ThunkApiConfig>,
  // unknown handling
  unknown extends ThunkArg
    ? (arg: ThunkArg) => AsyncThunkAction<Returned, ThunkArg, ThunkApiConfig> // argument not specified or specified as void or undefined
    : [ThunkArg] extends [void] | [undefined]
    ? () => AsyncThunkAction<Returned, ThunkArg, ThunkApiConfig> // argument contains void
    : [void] extends [ThunkArg] // make optional
    ? (arg?: ThunkArg) => AsyncThunkAction<Returned, ThunkArg, ThunkApiConfig> // argument contains undefined
    : [undefined] extends [ThunkArg]
    ? WithStrictNullChecks<
        // with strict nullChecks: make optional
        (
          arg?: ThunkArg
        ) => AsyncThunkAction<Returned, ThunkArg, ThunkApiConfig>,
        // without strict null checks this will match everything, so don't make it optional
        (arg: ThunkArg) => AsyncThunkAction<Returned, ThunkArg, ThunkApiConfig>
      > // default case: normal argument
    : (arg: ThunkArg) => AsyncThunkAction<Returned, ThunkArg, ThunkApiConfig>
>

/**
 * Options object for `createAsyncThunk`.
 *
 * @public
 */
export type AsyncThunkOptions<
  ThunkArg = void,
  ThunkApiConfig extends AsyncThunkConfig = {}
> = {
  /**
   * A method to control whether the asyncThunk should be executed. Has access to the
   * `arg`, `api.getState()` and `api.extra` arguments.
   *
   * @returns `false` if it should be skipped
   */
  condition?(
    arg: ThunkArg,
    api: Pick<GetThunkAPI<ThunkApiConfig, unknown>, 'getState' | 'extra'>
  ): boolean | undefined
  /**
   * If `condition` returns `false`, the asyncThunk will be skipped.
   * This option allows you to control whether a `rejected` action with `meta.condition == false`
   * will be dispatched or not.
   *
   * @default `false`
   */
  dispatchConditionRejection?: boolean

  serializeError?: (x: unknown) => GetSerializedErrorType<ThunkApiConfig>

  /**
   * A function to use when generating the `requestId` for the request sequence.
   *
   * @default `nanoid`
   */
  idGenerator?: () => string
} & IsUnknown<
  GetPendingMeta<ThunkApiConfig>,
  {
    /**
     * A method to generate additional properties to be added to `meta` of the pending action.
     *
     * Using this optional overload will not modify the types correctly, this overload is only in place to support JavaScript users.
     * Please use the `ThunkApiConfig` parameter `pendingMeta` to get access to a correctly typed overload
     */
    getPendingMeta?(
      base: {
        arg: ThunkArg
        requestId: string
      },
      api: Pick<GetThunkAPI<ThunkApiConfig, unknown>, 'getState' | 'extra'>
    ): GetPendingMeta<ThunkApiConfig>
  },
  {
    /**
     * A method to generate additional properties to be added to `meta` of the pending action.
     */
    getPendingMeta(
      base: {
        arg: ThunkArg
        requestId: string
      },
      api: Pick<GetThunkAPI<ThunkApiConfig, unknown>, 'getState' | 'extra'>
    ): GetPendingMeta<ThunkApiConfig>
  }
>

export type AsyncThunkPendingActionCreator<
  ThunkArg,
  ThunkApiConfig = {}
> = ActionCreatorWithPreparedPayload<
  [string, ThunkArg, GetPendingMeta<ThunkApiConfig>?],
  undefined,
  string,
  never,
  {
    arg: ThunkArg
    requestId: string
    requestStatus: 'pending'
  } & GetPendingMeta<ThunkApiConfig>
>

export type AsyncThunkRejectedActionCreator<
  ThunkArg,
  ThunkApiConfig = {}
> = ActionCreatorWithPreparedPayload<
  [
    Error | null,
    string,
    ThunkArg,
    GetRejectValue<ThunkApiConfig>?,
    GetRejectedMeta<ThunkApiConfig>?
  ],
  GetRejectValue<ThunkApiConfig> | undefined,
  string,
  GetSerializedErrorType<ThunkApiConfig>,
  {
    arg: ThunkArg
    requestId: string
    rejectedWithValue: boolean
    requestStatus: 'rejected'
    aborted: boolean
    condition: boolean
  } & GetRejectedMeta<ThunkApiConfig>
>

export type AsyncThunkFulfilledActionCreator<
  Returned,
  ThunkArg,
  ThunkApiConfig = {}
> = ActionCreatorWithPreparedPayload<
  [Returned, string, ThunkArg, GetFulfilledMeta<ThunkApiConfig>?],
  Returned,
  string,
  never,
  {
    arg: ThunkArg
    requestId: string
    requestStatus: 'fulfilled'
  } & GetFulfilledMeta<ThunkApiConfig>
>

/**
 * A type describing the return value of `createAsyncThunk`.
 * Might be useful for wrapping `createAsyncThunk` in custom abstractions.
 *
 * @public
 */
export type AsyncThunk<
  Returned,
  ThunkArg,
  ThunkApiConfig extends AsyncThunkConfig
> = AsyncThunkActionCreator<Returned, ThunkArg, ThunkApiConfig> & {
  pending: AsyncThunkPendingActionCreator<ThunkArg, ThunkApiConfig>
  rejected: AsyncThunkRejectedActionCreator<ThunkArg, ThunkApiConfig>
  fulfilled: AsyncThunkFulfilledActionCreator<
    Returned,
    ThunkArg,
    ThunkApiConfig
  >
  typePrefix: string
}

/**
 *
 * @param typePrefix
 * @param payloadCreator
 * @param options
 *
 * @public
 */
export function createAsyncThunk<
  Returned,
  ThunkArg = void,
  ThunkApiConfig extends AsyncThunkConfig = {}
>(
  typePrefix: string,
  payloadCreator: AsyncThunkPayloadCreator<Returned, ThunkArg, ThunkApiConfig>,
  options?: AsyncThunkOptions<ThunkArg, ThunkApiConfig>
): AsyncThunk<Returned, ThunkArg, ThunkApiConfig> {
  type RejectedValue = GetRejectValue<ThunkApiConfig>
  type PendingMeta = GetPendingMeta<ThunkApiConfig>
  type FulfilledMeta = GetFulfilledMeta<ThunkApiConfig>
  type RejectedMeta = GetRejectedMeta<ThunkApiConfig>

  const fulfilled: AsyncThunkFulfilledActionCreator<
    Returned,
    ThunkArg,
    ThunkApiConfig
  > = createAction(
    typePrefix + '/fulfilled',
    (result: Returned, requestId: string, arg: ThunkArg, meta?: any) => {
      return {
        payload: result,
        meta: {
          ...((meta as any) || {}),
          arg,
          requestId,
          requestStatus: 'fulfilled' as const,
        },
      }
    }
  )

  const pending: AsyncThunkPendingActionCreator<
    ThunkArg,
    ThunkApiConfig
  > = createAction(
    typePrefix + '/pending',
    (requestId: string, arg: ThunkArg, meta?: PendingMeta) => {
      return {
        payload: undefined,
        meta: {
          ...((meta as any) || {}),
          arg,
          requestId,
          requestStatus: 'pending' as const,
        },
      }
    }
  )

  const rejected: AsyncThunkRejectedActionCreator<
    ThunkArg,
    ThunkApiConfig
  > = createAction(
    typePrefix + '/rejected',
    (
      error: Error | null,
      requestId: string,
      arg: ThunkArg,
      payload?: RejectedValue,
      meta?: RejectedMeta
    ) => {
      const rejectedWithValue = !!payload
      const aborted = !!error && error.name === 'AbortError'
      const condition = !!error && error.name === 'ConditionError'

      return {
        payload,
        error: ((options && options.serializeError) || miniSerializeError)(
          error || 'Rejected'
        ) as GetSerializedErrorType<ThunkApiConfig>,
        meta: {
          ...((meta as any) || {}),
          arg,
          requestId,
          rejectedWithValue,
          requestStatus: 'rejected' as const,
          aborted,
          condition,
        },
      }
    }
  )

  let displayedWarning = false

  const AC =
    typeof AbortController !== 'undefined'
      ? AbortController
      : class implements AbortController {
          signal: AbortSignal = {
            aborted: false,
            addEventListener() {},
            dispatchEvent() {
              return false
            },
            onabort() {},
            removeEventListener() {},
          }
          abort() {
            if (process.env.NODE_ENV !== 'production') {
              if (!displayedWarning) {
                displayedWarning = true
                console.info(
                  `This platform does not implement AbortController. 
If you want to use the AbortController to react to \`abort\` events, please consider importing a polyfill like 'abortcontroller-polyfill/dist/abortcontroller-polyfill-only'.`
                )
              }
            }
          }
        }

  function actionCreator(
    arg: ThunkArg
  ): AsyncThunkAction<Returned, ThunkArg, ThunkApiConfig> {
    return (dispatch, getState, extra) => {
      const requestId = (options?.idGenerator ?? nanoid)()

      const abortController = new AC()
      let abortReason: string | undefined

      const abortedPromise = new Promise<never>((_, reject) =>
        abortController.signal.addEventListener('abort', () =>
          reject({ name: 'AbortError', message: abortReason || 'Aborted' })
        )
      )

      let started = false
      function abort(reason?: string) {
        if (started) {
          abortReason = reason
          abortController.abort()
        }
      }

      const promise = (async function () {
        let finalAction: ReturnType<typeof fulfilled | typeof rejected>
        try {
          if (
            options &&
            options.condition &&
            options.condition(arg, { getState, extra }) === false
          ) {
            // eslint-disable-next-line no-throw-literal
            throw {
              name: 'ConditionError',
              message: 'Aborted due to condition callback returning false.',
            }
          }
          started = true
          dispatch(
            pending(
              requestId,
              arg,
              options?.getPendingMeta?.({ requestId, arg }, { getState, extra })
            )
          )
          finalAction = await Promise.race([
            abortedPromise,
            Promise.resolve(
              payloadCreator(arg, {
                dispatch,
                getState,
                extra,
                requestId,
                signal: abortController.signal,
                rejectWithValue: ((
                  value: RejectedValue,
                  meta?: RejectedMeta
                ) => {
                  return new RejectWithValue(value, meta)
                }) as any,
                fulfillWithValue: ((value: unknown, meta?: FulfilledMeta) => {
                  return new FulfillWithMeta(value, meta)
                }) as any,
              })
            ).then((result) => {
              if (result instanceof RejectWithValue) {
                return rejected(
                  null,
                  requestId,
                  arg,
                  result.payload,
                  result.meta
                )
              }
              if (result instanceof FulfillWithMeta) {
                return fulfilled(result.payload, requestId, arg, result.meta)
              }
              return fulfilled(result as any, requestId, arg)
            }),
          ])
        } catch (err) {
          finalAction = rejected(err, requestId, arg)
        }
        // We dispatch the result action _after_ the catch, to avoid having any errors
        // here get swallowed by the try/catch block,
        // per https://twitter.com/dan_abramov/status/770914221638942720
        // and https://github.com/reduxjs/redux-toolkit/blob/e85eb17b39a2118d859f7b7746e0f3fee523e089/docs/tutorials/advanced-tutorial.md#async-error-handling-logic-in-thunks

        const skipDispatch =
          options &&
          !options.dispatchConditionRejection &&
          rejected.match(finalAction) &&
          (finalAction as any).meta.condition

        if (!skipDispatch) {
          dispatch(finalAction)
        }
        return finalAction
      })()
      return Object.assign(promise as Promise<any>, {
        abort,
        requestId,
        arg,
        unwrap() {
          return promise.then<any>(unwrapResult)
        },
      })
    }
  }

  return Object.assign(
    actionCreator as AsyncThunkActionCreator<
      Returned,
      ThunkArg,
      ThunkApiConfig
    >,
    {
      pending,
      rejected,
      fulfilled,
      typePrefix,
    }
  )
}

interface UnwrappableAction {
  payload: any
  meta?: any
  error?: any
}

type UnwrappedActionPayload<T extends UnwrappableAction> = Exclude<
  T,
  { error: any }
>['payload']

/**
 * @public
 */
export function unwrapResult<R extends UnwrappableAction>(
  action: R
): UnwrappedActionPayload<R> {
  if (action.meta && action.meta.rejectedWithValue) {
    throw action.payload
  }
  if (action.error) {
    throw action.error
  }
  return action.payload
}

type WithStrictNullChecks<True, False> = undefined extends boolean
  ? False
  : True
