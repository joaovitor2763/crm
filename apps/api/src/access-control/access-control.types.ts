import type {
	AccessScope,
	AuditActorType,
	PermissionAction,
	UserAccessStatus,
} from "@crm/db";

export type EffectivePermission = {
	resource: string;
	action: PermissionAction;
	scope: AccessScope;
};

export type EffectiveFieldPermission = {
	fieldId: string;
	canRead: boolean;
	canUpdate: boolean;
};

export type EffectivePrincipal = {
	actorType: AuditActorType;
	actorId: string;
	userId: string | null;
	roleId: string;
	roleKey: string;
	isAdmin: boolean;
	status: UserAccessStatus;
	primaryBusinessUnitId: string | null;
	primaryTeamId: string | null;
	businessUnitIds: string[];
	businessUnitTreeIds: string[];
	teamIds: string[];
	managedTeamIds: string[];
	permissions: EffectivePermission[];
	fieldPermissions: EffectiveFieldPermission[];
};
