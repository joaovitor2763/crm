import type { Session, SessionUser } from "@crm/auth";
import type { Request } from "express";
import type { EffectivePrincipal } from "../access-control/access-control.types";

export type BaseTrpcContext = {
	req?: Request;
	session: Session | null;
};

/** What every procedure behind `AuthMiddleware` sees. */
export type AuthedTrpcContext = BaseTrpcContext & {
	user: SessionUser;
	principal: EffectivePrincipal;
};
