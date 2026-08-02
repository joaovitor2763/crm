import type { Prisma } from "@crm/db";

export type HistoryScope = {
	contactWhere?: Prisma.ContactWhereInput;
	contactIds?: string[];
	dealWhere?: Prisma.DealWhereInput;
	activityWhere?: Prisma.ActivityWhereInput;
};

export function scopedThreadWhere(
	companyId: string,
	options: HistoryScope,
): Prisma.EmailThreadWhereInput {
	const contactIds = options.contactIds ?? [];
	const contactWhere = options.contactWhere;
	const dealContactBranch = hasScope(contactWhere)
		? { AND: [{ contactId: { in: contactIds } }, { contact: contactWhere }] }
		: { contactId: { in: contactIds } };
	const contactBranches = contactIds.length > 0 ? [dealContactBranch] : [];

	if (!hasScope(options.contactWhere)) {
		return {
			OR: [...contactBranches, { companyId }, { contact: { companyId } }],
		};
	}

	return {
		OR: [
			...contactBranches,
			{
				AND: [
					{ companyId },
					{
						OR: [{ contactId: null }, { contact: options.contactWhere }],
					},
				],
			},
			{
				contact: {
					AND: [{ companyId }, options.contactWhere],
				},
			},
		],
	};
}

export function scopedMeetingWhere(
	companyId: string,
	options: HistoryScope,
): Prisma.CalendarEventWhereInput {
	const contactIds = options.contactIds ?? [];
	const contactWhere = options.contactWhere;
	const scopedContactWhere = contactWhere ?? {};
	const dealContactBranches =
		contactIds.length > 0
			? hasScope(contactWhere)
				? [
						{
							AND: [
								{ contactId: { in: contactIds } },
								{ contact: scopedContactWhere },
							],
						},
						{
							attendees: {
								some: {
									contact: {
										AND: [{ id: { in: contactIds } }, scopedContactWhere],
									},
								},
							},
						},
					]
				: [
						{ contactId: { in: contactIds } },
						{ attendees: { some: { contactId: { in: contactIds } } } },
					]
			: [];

	if (!hasScope(options.contactWhere)) {
		return {
			OR: [
				...dealContactBranches,
				{ companyId },
				{ contact: { companyId } },
				{ attendees: { some: { contact: { companyId } } } },
			],
		};
	}

	return {
		OR: [
			...dealContactBranches,
			{
				AND: [
					{ companyId },
					{ contactId: null },
					{ attendees: { none: { contactId: { not: null } } } },
				],
			},
			{ AND: [{ companyId }, { contact: scopedContactWhere }] },
			{ contact: { AND: [{ companyId }, scopedContactWhere] } },
			{
				attendees: {
					some: { contact: { AND: [{ companyId }, scopedContactWhere] } },
				},
			},
		],
	};
}

export function scopedAttendeeWhere(
	contactWhere: Prisma.ContactWhereInput | undefined,
): Prisma.CalendarAttendeeWhereInput {
	return {
		OR: [{ contactId: null }, { contact: contactWhere ?? {} }],
	};
}

export function scopedActivityWhere(
	anchor: Prisma.ActivityWhereInput,
	options: HistoryScope,
): Prisma.ActivityWhereInput {
	const predicates: Prisma.ActivityWhereInput[] = [anchor];
	if (hasScope(options.activityWhere)) {
		predicates.push(options.activityWhere);
	}
	if (hasScope(options.contactWhere)) {
		predicates.push({
			OR: [{ contactId: null }, { contact: options.contactWhere }],
		});
	}
	if (hasScope(options.dealWhere)) {
		predicates.push({ OR: [{ dealId: null }, { deal: options.dealWhere }] });
	}

	return { AND: predicates };
}

function hasScope<T extends object>(where: T | undefined): where is T {
	return where !== undefined && Object.keys(where).length > 0;
}
