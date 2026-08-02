import { Inject } from "@nestjs/common";
import {
	Ctx,
	Input,
	Mutation,
	Query,
	Router,
	UseMiddlewares,
} from "nestjs-trpc";
import type { z } from "zod";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	ontologyCreateDraftInput,
	ontologyPublishInput,
	ontologyReplaceDraftInput,
	ontologySchemaListInput,
	ontologyVersionIdInput,
} from "./ontology.contracts";
import { OntologyService } from "./ontology.service";

@Router({ alias: "ontology" })
@UseMiddlewares(AuthMiddleware)
export class OntologyRouter {
	constructor(
		@Inject(OntologyService) private readonly ontology: OntologyService,
	) {}

	@Query({ input: ontologySchemaListInput })
	list(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof ontologySchemaListInput>,
	) {
		return this.ontology.list(input, ctx.principal);
	}

	@Query({ input: ontologyVersionIdInput })
	detail(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof ontologyVersionIdInput>,
	) {
		return this.ontology.detail(input.id, ctx.principal);
	}

	@Query({ input: ontologyVersionIdInput })
	impactPreview(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof ontologyVersionIdInput>,
	) {
		return this.ontology.impactPreview(input.id, ctx.principal);
	}

	@Mutation({ input: ontologyCreateDraftInput })
	createDraft(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof ontologyCreateDraftInput>,
	) {
		return this.ontology.createDraft(input, ctx.principal);
	}

	@Mutation({ input: ontologyReplaceDraftInput })
	replaceDraft(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof ontologyReplaceDraftInput>,
	) {
		return this.ontology.replaceDraft(input, ctx.principal);
	}

	@Mutation({ input: ontologyPublishInput })
	publish(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof ontologyPublishInput>,
	) {
		return this.ontology.publish(input.id, input.confirmed, ctx.principal);
	}
}
