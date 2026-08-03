import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "api/app-router";

/**
 * The API's own types, reachable from anywhere in the app.
 *
 * Prefer these over hand-written row types: `RouterOutputs["companies"]["list"]`
 * changes the moment the service's `select` does, which is the point.
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
