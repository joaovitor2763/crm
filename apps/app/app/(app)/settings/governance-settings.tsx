"use client";

import Add from "@carbon/icons-react/es/Add";
import Edit from "@carbon/icons-react/es/Edit";
import Password from "@carbon/icons-react/es/Password";
import UserAccessLocked from "@carbon/icons-react/es/UserAccessLocked";
import UserAccessUnlocked from "@carbon/icons-react/es/UserAccessUnlocked";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@crm/ui/components/dialog";
import { Field, FieldGroup, FieldLabel } from "@crm/ui/components/field";
import { Icon } from "@crm/ui/components/icon";
import { Input } from "@crm/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Spinner } from "@crm/ui/components/spinner";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsIndex, parseAsString, useQueryState } from "nuqs";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

type Overview = RouterOutputs["governance"]["overview"];
type User = Overview["users"][number];

const NONE = "__none__";

export function GovernanceSettings() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const overview = useQuery(trpc.governance.overview.queryOptions());
	const refresh = async (message: string) => {
		await queryClient.invalidateQueries(trpc.governance.overview.queryFilter());
		toast.success(message);
	};
	const fail = (error: { message: string }) => toast.error(error.message);
	const createUnit = useMutation(
		trpc.governance.createBusinessUnit.mutationOptions({
			onSuccess: () => refresh("Business unit created."),
			onError: fail,
		}),
	);
	const createTeam = useMutation(
		trpc.governance.createTeam.mutationOptions({
			onSuccess: () => refresh("Team created."),
			onError: fail,
		}),
	);
	const createRole = useMutation(
		trpc.governance.createRole.mutationOptions({
			onSuccess: () => refresh("Role created."),
			onError: fail,
		}),
	);
	const setPermission = useMutation(
		trpc.governance.setRolePermission.mutationOptions({
			onSuccess: () => refresh("Role permission updated."),
			onError: fail,
		}),
	);
	const data = overview.data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Governance</CardTitle>
				<CardDescription>
					One role per user, with visibility composed from business units and
					teams.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4 xl:grid-cols-3">
					<CreateUnitForm data={data} mutate={createUnit.mutate} />
					<CreateTeamForm data={data} mutate={createTeam.mutate} />
					<CreateRoleForm mutate={createRole.mutate} />
				</div>

				{data ? (
					<PermissionForm data={data} mutate={setPermission.mutate} />
				) : null}
			</CardContent>
		</Card>
	);
}

export function UserManagement() {
	const trpc = useTRPC();
	const cache = useCrmCache();
	const overview = useQuery(trpc.governance.overview.queryOptions());
	const capabilities = useQuery(trpc.governance.capabilities.queryOptions());
	const [q, setQ] = useQueryState("q", parseAsString.withDefault(""));
	const [pageIndex, setPageIndex] = useQueryState(
		"page",
		parseAsIndex.withDefault(0),
	);
	const [editingUserId, setEditingUserId] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [passwordUser, setPasswordUser] = useState<User | null>(null);
	const [statusUser, setStatusUser] = useState<User | null>(null);
	const deferredQ = useDeferredValue(q.trim().toLowerCase());
	const setUser = useMutation(
		trpc.governance.setUserAccess.mutationOptions({
			onSuccess: async (_result, variables) => {
				await cache.users();
				setEditingUserId((current) =>
					current === variables.userId ? null : current,
				);
				toast.success("User access updated.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const createUser = useMutation(
		trpc.governance.createUser.mutationOptions({
			onSuccess: async () => {
				await cache.users();
				setAddOpen(false);
				toast.success("User created.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const setPassword = useMutation(
		trpc.governance.setUserPassword.mutationOptions({
			onSuccess: async () => {
				await cache.users();
				setPasswordUser(null);
				toast.success("Password updated and existing sessions revoked.");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const setStatus = useMutation(
		trpc.governance.setUserStatus.mutationOptions({
			onSuccess: async (result) => {
				await cache.users();
				setStatusUser(null);
				toast.success(
					result.status === "SUSPENDED"
						? "User suspended and sessions revoked."
						: "User reactivated.",
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const data = overview.data;
	const users = (data?.users ?? []).filter(
		(user) =>
			!deferredQ ||
			`${user.name} ${user.email} ${user.access?.role.name ?? ""}`
				.toLowerCase()
				.includes(deferredQ),
	);
	const pageSize = 10;
	const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
	const currentPageIndex = Math.min(Math.max(pageIndex, 0), totalPages - 1);
	const visibleUsers = users.slice(
		currentPageIndex * pageSize,
		(currentPageIndex + 1) * pageSize,
	);
	const isGlobalAdmin = capabilities.data?.isAdmin ?? false;
	return (
		<div className="flex flex-col gap-4">
			<div className="grid gap-3 border-b pb-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
				<Field>
					<FieldLabel htmlFor="user-search">Find a user</FieldLabel>
					<Input
						id="user-search"
						value={q}
						onChange={(event) => {
							void setQ(event.target.value);
							void setPageIndex(0);
						}}
						placeholder="Search name, email or role…"
					/>
				</Field>
				<p
					className="text-muted-foreground text-xs tabular-nums"
					aria-live="polite"
				>
					{users.length} of {data?.users.length ?? 0} users
				</p>
				{isGlobalAdmin ? (
					<Button onClick={() => setAddOpen(true)}>
						<Icon icon={Add} /> Add user
					</Button>
				) : null}
			</div>
			{data && users.length ? (
				<>
					<ul className="grid gap-2" aria-label="Workspace users">
						{visibleUsers.map((user) => (
							<li key={user.id}>
								{editingUserId === user.id ? (
									<UserAccessForm
										user={user}
										data={data}
										mutate={setUser.mutate}
										onCancel={() => setEditingUserId(null)}
										pending={setUser.isPending}
									/>
								) : (
									<UserAccessSummary
										user={user}
										onEdit={() => setEditingUserId(user.id)}
										canManageCredentials={isGlobalAdmin}
										isCurrentUser={capabilities.data?.userId === user.id}
										onPassword={() => setPasswordUser(user)}
										onStatus={() => setStatusUser(user)}
									/>
								)}
							</li>
						))}
					</ul>
					{totalPages > 1 ? (
						<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-muted-foreground text-xs">
							<span>
								Page {currentPageIndex + 1} of {totalPages}
							</span>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={currentPageIndex <= 0}
									onClick={() => void setPageIndex(currentPageIndex - 1)}
								>
									Previous
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={currentPageIndex >= totalPages - 1}
									onClick={() => void setPageIndex(currentPageIndex + 1)}
								>
									Next
								</Button>
							</div>
						</div>
					) : null}
				</>
			) : (
				<div className="border py-12 text-center text-muted-foreground text-sm">
					No users match this search.
				</div>
			)}
			{data && isGlobalAdmin ? (
				<AddUserDialog
					key={addOpen ? "add-open" : "add-closed"}
					open={addOpen}
					onOpenChange={setAddOpen}
					data={data}
					pending={createUser.isPending}
					mutate={createUser.mutate}
				/>
			) : null}
			<PasswordDialog
				user={passwordUser}
				pending={setPassword.isPending}
				onOpenChange={(open) => !open && setPasswordUser(null)}
				mutate={setPassword.mutate}
			/>
			<StatusDialog
				user={statusUser}
				pending={setStatus.isPending}
				onOpenChange={(open) => !open && setStatusUser(null)}
				mutate={setStatus.mutate}
			/>
		</div>
	);
}

function UserAccessSummary({
	user,
	onEdit,
	canManageCredentials,
	isCurrentUser,
	onPassword,
	onStatus,
}: {
	user: User;
	onEdit: () => void;
	canManageCredentials: boolean;
	isCurrentUser: boolean;
	onPassword: () => void;
	onStatus: () => void;
}) {
	const status = user.access
		? user.access.status === "SUSPENDED"
			? { tone: "warning" as const, label: "Suspended" }
			: { tone: "success" as const, label: "Active" }
		: { tone: "neutral" as const, label: "No access" };
	const workspaceAccess = user.access
		? (user.access.primaryTeam?.name ??
			user.access.primaryBusinessUnit?.name ??
			"Global")
		: "No access";
	return (
		<div className="grid gap-3 border p-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
			<div className="min-w-0">
				<p className="truncate text-sm font-medium">{user.name}</p>
				<p className="truncate text-xs text-muted-foreground">{user.email}</p>
			</div>
			<div className="min-w-0">
				<p className="text-muted-foreground text-xs">Role</p>
				<p className="truncate text-sm">
					{user.access?.role.name ?? "No role"}
				</p>
			</div>
			<div className="min-w-0">
				<p className="text-muted-foreground text-xs">Workspace access</p>
				<p className="truncate text-sm">{workspaceAccess}</p>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
				<StatusIndicator tone={status.tone} label={status.label} />
				{canManageCredentials ? (
					<Button variant="outline" size="sm" onClick={onPassword}>
						<Icon icon={Password} /> Password
					</Button>
				) : null}
				{canManageCredentials ? (
					<Button
						variant="outline"
						size="sm"
						disabled={
							!user.access ||
							(isCurrentUser && user.access.status !== "SUSPENDED")
						}
						title={
							!user.access
								? "Assign access before changing this user's status."
								: isCurrentUser
									? "You cannot suspend your own account."
									: undefined
						}
						onClick={onStatus}
					>
						<Icon
							icon={
								user.access?.status === "SUSPENDED"
									? UserAccessUnlocked
									: UserAccessLocked
							}
						/>
						{user.access?.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
					</Button>
				) : null}
				<Button
					variant="outline"
					size="sm"
					aria-label={`Edit access for ${user.name}`}
					onClick={onEdit}
				>
					<Icon icon={Edit} /> Edit
				</Button>
			</div>
		</div>
	);
}

function AddUserDialog({
	open,
	onOpenChange,
	data,
	pending,
	mutate,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	data: Overview;
	pending: boolean;
	mutate: (input: {
		name: string;
		email: string;
		password: string;
		roleId: string;
		primaryBusinessUnitId: string | null;
		primaryTeamId: string | null;
	}) => void;
}) {
	const defaultUnitId =
		data.businessUnits.find((unit) => unit.id === "business-unit-default")
			?.id ?? NONE;
	const defaultTeamId =
		data.businessUnits
			.flatMap((unit) => unit.teams)
			.find((team) => team.id === "team-default")?.id ?? NONE;
	const [unitId, setUnitId] = useState(defaultUnitId);
	const [teamId, setTeamId] = useState(defaultTeamId);
	const teams =
		data.businessUnits.find((unit) => unit.id === unitId)?.teams ?? [];
	const defaultRoleId =
		data.roles.find((role) => role.key === "read-only")?.id ??
		data.roles[0]?.id;

	return (
		<Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add workspace user</DialogTitle>
					<DialogDescription>
						Create a password login and assign the user&apos;s initial CRM
						access. The email must be included in ALLOWED_SIGN_IN.
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						const form = new FormData(event.currentTarget);
						mutate({
							name: String(form.get("name") ?? ""),
							email: String(form.get("email") ?? ""),
							password: String(form.get("password") ?? ""),
							roleId: String(form.get("roleId") ?? ""),
							primaryBusinessUnitId: unitId === NONE ? null : unitId,
							primaryTeamId: teamId === NONE ? null : teamId,
						});
					}}
				>
					<FieldGroup className="gap-3">
						<Field>
							<FieldLabel htmlFor="new-user-name">Name</FieldLabel>
							<Input
								id="new-user-name"
								name="name"
								autoComplete="off"
								disabled={pending}
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="new-user-email">Email</FieldLabel>
							<Input
								id="new-user-email"
								name="email"
								autoComplete="off"
								disabled={pending}
								type="email"
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="new-user-password">
								Initial password
							</FieldLabel>
							<Input
								id="new-user-password"
								name="password"
								autoComplete="new-password"
								disabled={pending}
								minLength={12}
								maxLength={128}
								type="password"
								required
							/>
						</Field>
						<Field>
							<FieldLabel>Role</FieldLabel>
							<Select name="roleId" defaultValue={defaultRoleId} required>
								<SelectTrigger>
									<SelectValue placeholder="Choose role" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{data.roles.map((role) => (
											<SelectItem key={role.id} value={role.id}>
												{role.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel>Business unit</FieldLabel>
							<Select
								value={unitId}
								onValueChange={(value) => {
									setUnitId(value);
									setTeamId(NONE);
								}}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value={NONE}>No unit</SelectItem>
										{data.businessUnits.map((unit) => (
											<SelectItem key={unit.id} value={unit.id}>
												{unit.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel>Team</FieldLabel>
							<Select value={teamId} onValueChange={setTeamId}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value={NONE}>No team</SelectItem>
										{teams.map((team) => (
											<SelectItem key={team.id} value={team.id}>
												{team.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="outline" disabled={pending}>
								Cancel
							</Button>
						</DialogClose>
						<Button type="submit" disabled={pending || !defaultRoleId}>
							{pending ? <Spinner data-icon="inline-start" /> : null}
							Create user
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function PasswordDialog({
	user,
	pending,
	onOpenChange,
	mutate,
}: {
	user: User | null;
	pending: boolean;
	onOpenChange: (open: boolean) => void;
	mutate: (input: { userId: string; password: string }) => void;
}) {
	return (
		<Dialog open={user !== null} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Set password</DialogTitle>
					<DialogDescription>
						Set a new password for {user?.name}. All of their existing sessions
						will be revoked.
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!user) return;
						const form = new FormData(event.currentTarget);
						const password = String(form.get("password") ?? "");
						if (password !== String(form.get("confirmation") ?? "")) {
							toast.error("The passwords do not match.");
							return;
						}
						mutate({ userId: user.id, password });
					}}
				>
					<FieldGroup className="gap-3">
						<Field>
							<FieldLabel htmlFor="user-new-password">New password</FieldLabel>
							<Input
								id="user-new-password"
								name="password"
								autoComplete="new-password"
								disabled={pending}
								minLength={12}
								maxLength={128}
								type="password"
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="user-confirm-password">
								Confirm password
							</FieldLabel>
							<Input
								id="user-confirm-password"
								name="confirmation"
								autoComplete="new-password"
								disabled={pending}
								minLength={12}
								maxLength={128}
								type="password"
								required
							/>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="outline" disabled={pending}>
								Cancel
							</Button>
						</DialogClose>
						<Button type="submit" disabled={pending}>
							{pending ? <Spinner data-icon="inline-start" /> : null}
							Set password
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function StatusDialog({
	user,
	pending,
	onOpenChange,
	mutate,
}: {
	user: User | null;
	pending: boolean;
	onOpenChange: (open: boolean) => void;
	mutate: (input: { userId: string; status: "ACTIVE" | "SUSPENDED" }) => void;
}) {
	const reactivating = user?.access?.status === "SUSPENDED";
	return (
		<Dialog open={user !== null} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{reactivating ? "Reactivate user" : "Suspend user"}
					</DialogTitle>
					<DialogDescription>
						{reactivating
							? `${user?.name} will be able to sign in and access the CRM again.`
							: `${user?.name} will be signed out and blocked from creating another session. Their ownership and audit history will be preserved.`}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button type="button" variant="outline" disabled={pending}>
							Cancel
						</Button>
					</DialogClose>
					<Button
						disabled={pending || !user}
						variant={reactivating ? "default" : "destructive"}
						onClick={() => {
							if (!user) return;
							mutate({
								userId: user.id,
								status: reactivating ? "ACTIVE" : "SUSPENDED",
							});
						}}
					>
						{pending ? <Spinner data-icon="inline-start" /> : null}
						{reactivating ? "Reactivate" : "Suspend access"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function CreateUnitForm({
	data,
	mutate,
}: {
	data?: Overview;
	mutate: (input: {
		name: string;
		key: string;
		parentId?: string | null;
	}) => void;
}) {
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const parent = String(form.get("parentId") ?? NONE);
				mutate({
					name: String(form.get("name") ?? ""),
					key: String(form.get("key") ?? ""),
					parentId: parent === NONE ? null : parent,
				});
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="unit-name">New business unit</FieldLabel>
					<Input id="unit-name" name="name" placeholder="Brazil" required />
				</Field>
				<Field>
					<FieldLabel htmlFor="unit-key">Key</FieldLabel>
					<Input id="unit-key" name="key" placeholder="brazil" required />
				</Field>
				<Field>
					<FieldLabel>Parent</FieldLabel>
					<Select name="parentId" defaultValue={NONE}>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={NONE}>Root</SelectItem>
								{data?.businessUnits.map((unit) => (
									<SelectItem key={unit.id} value={unit.id}>
										{unit.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Button type="submit">Create unit</Button>
			</FieldGroup>
		</form>
	);
}

function CreateTeamForm({
	data,
	mutate,
}: {
	data?: Overview;
	mutate: (input: {
		name: string;
		key: string;
		businessUnitId: string;
	}) => void;
}) {
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				mutate({
					name: String(form.get("name") ?? ""),
					key: String(form.get("key") ?? ""),
					businessUnitId: String(form.get("businessUnitId") ?? ""),
				});
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="team-name">New team</FieldLabel>
					<Input
						id="team-name"
						name="name"
						placeholder="Enterprise sales"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="team-key">Key</FieldLabel>
					<Input
						id="team-key"
						name="key"
						placeholder="enterprise-sales"
						required
					/>
				</Field>
				<Field>
					<FieldLabel>Business unit</FieldLabel>
					<Select name="businessUnitId" required>
						<SelectTrigger>
							<SelectValue placeholder="Select" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{data?.businessUnits.map((unit) => (
									<SelectItem key={unit.id} value={unit.id}>
										{unit.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</Field>
				<Button type="submit">Create team</Button>
			</FieldGroup>
		</form>
	);
}

function CreateRoleForm({
	mutate,
}: {
	mutate: (input: {
		name: string;
		key: string;
		description?: string | null;
	}) => void;
}) {
	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				mutate({
					name: String(form.get("name") ?? ""),
					key: String(form.get("key") ?? ""),
					description: String(form.get("description") ?? "") || null,
				});
			}}
		>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="role-name">New role</FieldLabel>
					<Input
						id="role-name"
						name="name"
						placeholder="Partner manager"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="role-key">Key</FieldLabel>
					<Input
						id="role-key"
						name="key"
						placeholder="partner-manager"
						required
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="role-description">Description</FieldLabel>
					<Input id="role-description" name="description" />
				</Field>
				<Button type="submit">Create role</Button>
			</FieldGroup>
		</form>
	);
}

function PermissionForm({
	data,
	mutate,
}: {
	data: Overview;
	mutate: (input: {
		roleId: string;
		resource: string;
		action:
			| "READ"
			| "CREATE"
			| "UPDATE"
			| "ARCHIVE"
			| "RESTORE"
			| "DESTROY"
			| "TRANSFER"
			| "MANAGE"
			| "EXPORT";
		scope:
			| "NONE"
			| "OWNED"
			| "TEAM"
			| "MANAGED_TEAMS"
			| "BUSINESS_UNIT"
			| "BUSINESS_UNIT_TREE"
			| "ALL";
	}) => void;
}) {
	return (
		<form
			className="grid gap-2 md:grid-cols-4 md:items-end"
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				mutate({
					roleId: String(form.get("roleId")),
					resource: String(form.get("resource")),
					action: String(form.get("action")) as Parameters<
						typeof mutate
					>[0]["action"],
					scope: String(form.get("scope")) as Parameters<
						typeof mutate
					>[0]["scope"],
				});
			}}
		>
			<Field>
				<FieldLabel>Role permission</FieldLabel>
				<Select name="roleId" required>
					<SelectTrigger>
						<SelectValue placeholder="Role" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{data.roles
								.filter((role) => !role.isAdmin)
								.map((role) => (
									<SelectItem key={role.id} value={role.id}>
										{role.name}
									</SelectItem>
								))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel htmlFor="permission-resource">Resource</FieldLabel>
				<Input
					id="permission-resource"
					name="resource"
					placeholder="contacts"
					required
				/>
			</Field>
			<Field>
				<FieldLabel>Action and scope</FieldLabel>
				<div className="flex gap-2">
					<Select name="action" defaultValue="READ">
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{[
									"READ",
									"CREATE",
									"UPDATE",
									"ARCHIVE",
									"RESTORE",
									"MANAGE",
									"EXPORT",
								].map((action) => (
									<SelectItem key={action} value={action}>
										{action}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Select name="scope" defaultValue="BUSINESS_UNIT">
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{[
									"NONE",
									"OWNED",
									"TEAM",
									"MANAGED_TEAMS",
									"BUSINESS_UNIT",
									"BUSINESS_UNIT_TREE",
									"ALL",
								].map((scope) => (
									<SelectItem key={scope} value={scope}>
										{scope}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			</Field>
			<Button type="submit">Save permission</Button>
		</form>
	);
}

function UserAccessForm({
	user,
	data,
	mutate,
	onCancel,
	pending,
}: {
	user: User;
	data: Overview;
	mutate: (input: {
		userId: string;
		roleId: string;
		status: "ACTIVE" | "SUSPENDED";
		primaryBusinessUnitId: string | null;
		primaryTeamId: string | null;
		businessUnitIds?: string[];
		teamIds?: string[];
		managedTeamIds?: string[];
	}) => void;
	onCancel: () => void;
	pending: boolean;
}) {
	const teams = data.businessUnits.flatMap((unit) => unit.teams);
	const fieldId = (field: string) => `user-${user.id}-${field}`;
	return (
		<form
			className="grid gap-3 border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] xl:items-end"
			onSubmit={(event) => {
				event.preventDefault();
				const form = new FormData(event.currentTarget);
				const unitId = String(form.get("unitId") ?? NONE);
				const teamId = String(form.get("teamId") ?? NONE);
				mutate({
					userId: user.id,
					roleId: String(form.get("roleId")),
					status: String(form.get("status")) as "ACTIVE" | "SUSPENDED",
					primaryBusinessUnitId: unitId === NONE ? null : unitId,
					primaryTeamId: teamId === NONE ? null : teamId,
					businessUnitIds: unitId === NONE ? [] : [unitId],
					teamIds: teamId === NONE ? [] : [teamId],
					managedTeamIds: [],
				});
			}}
		>
			<div className="self-center">
				<p className="text-sm font-medium">{user.name}</p>
				<p className="text-xs text-muted-foreground">{user.email}</p>
			</div>
			<Field>
				<FieldLabel htmlFor={fieldId("role")}>Role</FieldLabel>
				<Select name="roleId" defaultValue={user.access?.role.id} required>
					<SelectTrigger id={fieldId("role")}>
						<SelectValue placeholder="Choose role" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{data.roles.map((role) => (
								<SelectItem key={role.id} value={role.id}>
									{role.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel htmlFor={fieldId("unit")}>Business unit</FieldLabel>
				<Select
					name="unitId"
					defaultValue={user.access?.primaryBusinessUnit?.id ?? NONE}
				>
					<SelectTrigger id={fieldId("unit")}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={NONE}>No unit</SelectItem>
							{data.businessUnits.map((unit) => (
								<SelectItem key={unit.id} value={unit.id}>
									{unit.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel htmlFor={fieldId("team")}>Team</FieldLabel>
				<Select
					name="teamId"
					defaultValue={user.access?.primaryTeam?.id ?? NONE}
				>
					<SelectTrigger id={fieldId("team")}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={NONE}>No team</SelectItem>
							{teams.map((team) => (
								<SelectItem key={team.id} value={team.id}>
									{team.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<Field>
				<FieldLabel htmlFor={fieldId("status")}>Status</FieldLabel>
				<Select name="status" defaultValue={user.access?.status ?? "ACTIVE"}>
					<SelectTrigger id={fieldId("status")}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="ACTIVE">Active</SelectItem>
							<SelectItem value="SUSPENDED">Suspended</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
			<div className="flex gap-2 md:col-span-2 xl:col-span-1">
				<Button type="button" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" disabled={pending}>
					Save access
				</Button>
			</div>
		</form>
	);
}
