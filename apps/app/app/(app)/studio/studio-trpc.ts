import type { UseMutationOptions } from "@tanstack/react-query";

/**
 * The generated revenue-account router currently exposes a few Prisma JSON
 * records that make TypeScript's proxy inference recursive. Keep that edge in
 * one typed adapter; inputs and outputs remain explicit at each Studio call.
 */
export function studioMutationOptions<TData, TVariables>(
	route: unknown,
	options: UseMutationOptions<TData, Error, TVariables>,
) {
	const mutationOptions = (
		route as {
			mutationOptions: (
				value: UseMutationOptions<TData, Error, TVariables>,
			) => UseMutationOptions<TData, Error, TVariables>;
		}
	).mutationOptions;
	return mutationOptions(options);
}
