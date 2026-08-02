import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type {
	MiddlewareOptions,
	MiddlewareResponse,
	TRPCMiddleware,
} from "nestjs-trpc";
import { AccessControlService } from "../../access-control/access-control.service";
import { setRequestUserId } from "../../logging/request-context";
import type { AuthedTrpcContext, BaseTrpcContext } from "../context.types";

/** Google proves identity; CRM governance resolves the effective principal. */
@Injectable()
export class AuthMiddleware implements TRPCMiddleware {
	constructor(private readonly accessControl: AccessControlService) {}

	async use(opts: MiddlewareOptions): Promise<MiddlewareResponse> {
		const ctx = opts.ctx as BaseTrpcContext;
		const user = ctx.session?.user;

		if (!user) {
			throw new TRPCError({ code: "UNAUTHORIZED" });
		}

		// tRPC calls arrive as one HTTP request per batch, so the interceptor that
		// stamps `userId` for REST routes never runs. Stamp it here instead.
		setRequestUserId(user.id);
		const principal = await this.accessControl.forUser(user.id);

		const nextCtx: AuthedTrpcContext = { ...ctx, user, principal };
		return opts.next({ ctx: nextCtx });
	}
}
