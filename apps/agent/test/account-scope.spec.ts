import { describe, expect, it } from "bun:test";
import {
	scopedActivityWhere,
	scopedMeetingWhere,
	scopedThreadWhere,
} from "../agent/lib/account-scope";

const visibleContacts = { unitStates: { some: { teamId: "team-visible" } } };

describe("account history scope", () => {
	it("preserves direct company associations when no contact scope is supplied", () => {
		expect(scopedThreadWhere("company-1", {})).toEqual({
			OR: [{ companyId: "company-1" }, { contact: { companyId: "company-1" } }],
		});
		expect(scopedMeetingWhere("company-1", {})).toEqual({
			OR: [
				{ companyId: "company-1" },
				{ contact: { companyId: "company-1" } },
				{ attendees: { some: { contact: { companyId: "company-1" } } } },
			],
		});
	});

	it("allows a direct company association only through a visible linked contact", () => {
		const threadWhere = scopedThreadWhere("company-1", {
			contactWhere: visibleContacts,
		});
		const meetingWhere = scopedMeetingWhere("company-1", {
			contactWhere: visibleContacts,
		});

		expect(threadWhere.OR).toContainEqual({
			AND: [
				{ companyId: "company-1" },
				{
					OR: [{ contactId: null }, { contact: visibleContacts }],
				},
			],
		});
		expect(meetingWhere.OR).toContainEqual({
			AND: [{ companyId: "company-1" }, { contact: visibleContacts }],
		});
	});

	it("adds visible deal contacts from another company to account history", () => {
		const threadWhere = scopedThreadWhere("company-1", {
			contactIds: ["contact-cross-company"],
			contactWhere: visibleContacts,
		});
		const meetingWhere = scopedMeetingWhere("company-1", {
			contactIds: ["contact-cross-company"],
			contactWhere: visibleContacts,
		});

		expect(threadWhere.OR).toContainEqual({
			AND: [
				{ contactId: { in: ["contact-cross-company"] } },
				{ contact: visibleContacts },
			],
		});
		expect(meetingWhere.OR).toContainEqual({
			AND: [
				{ contactId: { in: ["contact-cross-company"] } },
				{ contact: visibleContacts },
			],
		});
		expect(meetingWhere.OR).toContainEqual({
			attendees: {
				some: {
					contact: {
						AND: [{ id: { in: ["contact-cross-company"] } }, visibleContacts],
					},
				},
			},
		});
	});

	it("ands activity placement with visible anchors while allowing null anchors", () => {
		expect(
			scopedActivityWhere(
				{ dealId: "deal-1", type: "NOTE" },
				{
					activityWhere: {
						businessUnitId: { in: ["unit-visible"] },
						teamId: { in: ["team-visible"] },
					},
					contactWhere: visibleContacts,
					dealWhere: { id: "deal-visible" },
				},
			),
		).toEqual({
			AND: [
				{ dealId: "deal-1", type: "NOTE" },
				{
					businessUnitId: { in: ["unit-visible"] },
					teamId: { in: ["team-visible"] },
				},
				{ OR: [{ contactId: null }, { contact: visibleContacts }] },
				{ OR: [{ dealId: null }, { deal: { id: "deal-visible" } }] },
			],
		});
	});
});
