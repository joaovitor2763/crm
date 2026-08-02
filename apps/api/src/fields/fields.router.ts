import { PermissionAction } from "@crm/db";
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
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import type { AuthedTrpcContext } from "../trpc/context.types";
import { AuthMiddleware } from "../trpc/middlewares/auth.middleware";
import {
	customRecordCreateInput,
	fieldCreateInput,
	fieldIdInput,
	fieldPermissionInput,
	fieldSchemaInput,
	fieldUpdateInput,
	objectDefinitionCreateInput,
	recordCustomValuesInput,
	recordRelationCreateInput,
	relationDefinitionCreateInput,
} from "./fields.contracts";
import { FieldsService } from "./fields.service";

@Router({ alias: "fields" })
@UseMiddlewares(AuthMiddleware)
export class FieldsRouter {
	constructor(
		@Inject(FieldsService) private readonly fields: FieldsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
	) {}

	@Query({ input: fieldSchemaInput })
	schema(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof fieldSchemaInput>,
	) {
		return this.fields.schema(ctx.principal, input.objectKey);
	}

	@Mutation({ input: objectDefinitionCreateInput })
	createObject(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof objectDefinitionCreateInput>,
	) {
		this.manage(ctx);
		return this.fields.createObjectDefinition(input, ctx.principal);
	}

	@Mutation({ input: fieldCreateInput })
	create(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof fieldCreateInput>,
	) {
		this.manage(ctx);
		return this.fields.createField(input, ctx.principal);
	}

	@Mutation({ input: fieldUpdateInput })
	update(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof fieldUpdateInput>,
	) {
		this.manage(ctx);
		return this.fields.updateField(input, ctx.principal);
	}

	@Mutation({ input: fieldIdInput })
	archive(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof fieldIdInput>,
	) {
		this.manage(ctx);
		return this.fields.archiveField(input.id, ctx.principal);
	}

	@Mutation({ input: fieldPermissionInput })
	setPermission(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof fieldPermissionInput>,
	) {
		this.manage(ctx);
		return this.fields.setPermission(input, ctx.principal);
	}

	@Mutation({ input: relationDefinitionCreateInput })
	createRelationDefinition(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof relationDefinitionCreateInput>,
	) {
		this.manage(ctx);
		return this.fields.createRelationDefinition(input, ctx.principal);
	}

	@Mutation({ input: recordRelationCreateInput })
	createRecordRelation(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof recordRelationCreateInput>,
	) {
		this.manage(ctx);
		return this.fields.createRecordRelation(input, ctx.principal);
	}

	@Mutation({ input: customRecordCreateInput })
	createCustomRecord(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof customRecordCreateInput>,
	) {
		this.manage(ctx);
		return this.fields.createCustomRecord(input, ctx.principal);
	}

	@Mutation({ input: recordCustomValuesInput })
	async setRecordValues(
		@Ctx() ctx: AuthedTrpcContext,
		@Input() input: z.infer<typeof recordCustomValuesInput>,
	) {
		const resource = resourceForObject(input.objectKey);
		if (
			resource === CRM_RESOURCE.contacts ||
			resource === CRM_RESOURCE.companies ||
			resource === CRM_RESOURCE.deals
		) {
			await this.accessControl.assertRecord(
				ctx.principal,
				resource,
				PermissionAction.UPDATE,
				input.recordId,
			);
		} else {
			this.accessControl.assert(
				ctx.principal,
				resource,
				PermissionAction.UPDATE,
			);
		}
		return this.fields.setRecordValues(input, ctx.principal);
	}

	private manage(ctx: AuthedTrpcContext) {
		this.accessControl.assert(
			ctx.principal,
			CRM_RESOURCE.fields,
			PermissionAction.MANAGE,
		);
	}
}

function resourceForObject(objectKey: string): string {
	if (objectKey === "contacts") return CRM_RESOURCE.contacts;
	if (objectKey === "companies") return CRM_RESOURCE.companies;
	if (objectKey === "deals") return CRM_RESOURCE.deals;
	return objectKey;
}
