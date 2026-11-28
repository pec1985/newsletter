import { error } from '@sveltejs/kit';
import type { TransactionSql } from 'postgres';
import { selectionMatch, selectionSummary, type Audience } from './audiences';

export function readAudienceSelection(input: {
	audience_ids?: unknown;
	audience_id?: unknown;
	all_users?: unknown;
}) {
	const ids = input.audience_ids ?? (input.audience_id === null ? [] : [input.audience_id]);
	if (
		!Array.isArray(ids) ||
		!ids.every(
			(id: unknown) =>
				typeof id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
		) ||
		(input.all_users !== undefined && typeof input.all_users !== 'boolean') ||
		(input.all_users && ids.length)
	)
		error(400, 'Choose All users or a set of saved audiences.');
	return {
		ids: [...new Set<string>(ids.map((id) => id.toLowerCase()))].sort(),
		all: input.all_users === true
	};
}

export async function loadSelectionSummary(
	db: TransactionSql,
	selection: ReturnType<typeof readAudienceSelection>
) {
	const audiences = selection.ids.length
		? await db<
				Audience[]
			>`select * from audiences where id=any(${selection.ids}::uuid[]) order by id for share`
		: [];
	if (audiences.length !== selection.ids.length)
		error(409, 'An audience has been removed. Refresh the draft and choose again.');
	return selectionSummary(selectionMatch(selection.all, audiences), db);
}
