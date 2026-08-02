import type { Db } from "@crm/db";
import { PermissionAction } from "@crm/db";
import {
	Body,
	Controller,
	Get,
	Headers,
	Inject,
	Param,
	Post,
	Query,
} from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { CRM_RESOURCE } from "../access-control/access-control.constants";
import { AccessControlService } from "../access-control/access-control.service";
import { ApiCredentialsService } from "../api-credentials/api-credentials.service";
import { InjectDatabase } from "../database/database.constants";
import { FieldsService } from "../fields/fields.service";
import { LeadIngestionService } from "./lead-ingestion.service";
import { scopedContactUnitStateWhere } from "./scoped-unit-state";

@Controller("api/v1")
@AllowAnonymous()
export class PublicApiController {
	constructor(
		@Inject(ApiCredentialsService)
		private readonly credentials: ApiCredentialsService,
		@Inject(AccessControlService)
		private readonly accessControl: AccessControlService,
		@Inject(LeadIngestionService)
		private readonly leads: LeadIngestionService,
		@Inject(FieldsService)
		private readonly fields: FieldsService,
		@InjectDatabase() private readonly db: Db,
	) {}

	@Post("leads")
	async createLead(
		@Headers("authorization") authorization: string | undefined,
		@Body() body: unknown,
	) {
		const principal = await this.principal(authorization);
		const input =
			typeof body === "object" && body !== null
				? (body as Record<string, unknown>)
				: {};
		this.accessControl.assert(
			principal,
			CRM_RESOURCE.contacts,
			PermissionAction.CREATE,
		);
		if (typeof input.businessUnitId === "string") {
			await this.accessControl.assertAssignment(
				principal,
				CRM_RESOURCE.contacts,
				PermissionAction.CREATE,
				{
					businessUnitId:
						typeof input.businessUnitId === "string"
							? input.businessUnitId
							: undefined,
					teamId: typeof input.teamId === "string" ? input.teamId : undefined,
					ownerId:
						typeof input.ownerId === "string" ? input.ownerId : undefined,
				},
			);
		}
		return this.leads.ingest(body, principal);
	}

	@Get("contacts/:id")
	async contactById(
		@Headers("authorization") authorization: string | undefined,
		@Param("id") id: string,
	) {
		const principal = await this.principal(authorization);
		const scope = this.accessControl.contactWhere(
			principal,
			CRM_RESOURCE.contacts,
			PermissionAction.READ,
		);
		const contact = await this.db.contact.findFirstOrThrow({
			where: { AND: [{ id, archivedAt: null }, scope] },
			select: publicContactSelect(
				principal,
				this.accessControl.permission(
					principal,
					CRM_RESOURCE.contacts,
					PermissionAction.READ,
				),
			),
		});
		return {
			...contact,
			customValues: await this.fields.projectChannelValues(
				"contacts",
				contact.customValues,
				principal,
				"api",
			),
		};
	}

	@Get("contacts")
	async findContacts(
		@Headers("authorization") authorization: string | undefined,
		@Query("email") email?: string,
		@Query("limit") rawLimit?: string,
	) {
		const principal = await this.principal(authorization);
		const scope = this.accessControl.contactWhere(
			principal,
			CRM_RESOURCE.contacts,
			PermissionAction.READ,
		);
		const limit = Math.min(Math.max(Number(rawLimit) || 50, 1), 200);
		const contacts = await this.db.contact.findMany({
			where: {
				AND: [
					{ archivedAt: null },
					email ? { email: email.trim().toLowerCase() } : {},
					scope,
				],
			},
			take: limit,
			orderBy: { createdAt: "desc" },
			select: publicContactSelect(
				principal,
				this.accessControl.permission(
					principal,
					CRM_RESOURCE.contacts,
					PermissionAction.READ,
				),
			),
		});
		return Promise.all(
			contacts.map(async (contact) => ({
				...contact,
				customValues: await this.fields.projectChannelValues(
					"contacts",
					contact.customValues,
					principal,
					"api",
				),
			})),
		);
	}

	private async principal(authorization?: string) {
		const credentialId = await this.credentials.authenticate(authorization);
		return this.accessControl.forApiCredential(credentialId);
	}
}

function publicContactSelect(
	principal: Awaited<ReturnType<AccessControlService["forApiCredential"]>>,
	scope: ReturnType<AccessControlService["permission"]>,
) {
	return {
		id: true,
		firstName: true,
		lastName: true,
		email: true,
		phone: true,
		title: true,
		globalLifecycleStage: true,
		globalMarketingScore: true,
		utmSource: true,
		utmMedium: true,
		utmCampaign: true,
		customValues: true,
		unitStates: {
			where: scopedContactUnitStateWhere(principal, scope),
			select: {
				businessUnitId: true,
				teamId: true,
				lifecycleStage: true,
				marketingScore: true,
				marketingQualifiedAt: true,
			},
		},
		createdAt: true,
		updatedAt: true,
	} as const;
}
