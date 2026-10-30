The age engine. Why it's built this way: ADR 0001 (the age format) and ADR 0002 (its own parallel payload, typage for the header).

## Its interface

- The app imports only `@encryptee/engine` (`src/index.ts`) and, in the service worker, `@encryptee/engine/sw` (`src/sinks/sw-route.ts`): the two `exports` in `package.json`. A new capability for the app goes through `src/index.ts`; workers, chunks and formats stay inside.
- Every failure is an `EngineError` with an `EngineErrorCode` (`src/errors.ts`); its message is for developers and logs. A new code needs its text in `apps/web/src/strings.ts`, which TypeScript enforces.

## Rules

- Output stays byte-identical to typage's (ADR 0002). `test/payload.test.ts` compares the payload with typage's, `test/job.test.ts` decrypts both ways, and `test/vectors.test.ts` runs the CCTV vectors.
- `src/sinks/sw-stream.ts` is imported by the coordinator worker, the service worker and tests, so it uses only APIs all three have: nothing from the DOM or a worker's global scope.
- The workers (`*.worker.ts`) and `src/sinks/sw-route.ts` typecheck with the worker's lib (`tsconfig.worker.json`), the rest with the DOM's (`tsconfig.json`). A file only workers import goes in `tsconfig.json`'s `exclude`, like `src/workers/pipeline.ts`.

## Tests

`test/*.test.ts` run in Vitest's browser mode, in real Chromium, Firefox and WebKit (`vitest.config.ts`). The `age` CLI runs in Node, reached through the browser commands in `vitest.config.ts` and typed in `test/helpers.ts`.

The seams, in place of mocks:

- `chooseSaveLocationIn(environment, …)` takes a `SaveEnvironment` (`src/sinks/save-location.ts`): a fake browser, with its capabilities, pickers and whether OPFS opens (`test/save-location.test.ts`).
- The `memory` save location collects a job's output in a Blob, and `discard` drops it after counting it. `encrypt` and `decrypt` in `test/helpers.ts` run whole jobs into `memory`.
- A job's `tuning` sets its workers, batch size, window and cipher backend. `SMALL_BATCHES` makes small files cross batch boundaries, and `backend` forces `noble` or `webcrypto`.
- `scryptLogN` in a passphrase's credentials: `TEST_LOG_N` keeps scrypt fast.
