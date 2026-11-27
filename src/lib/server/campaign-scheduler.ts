import { selectionMatch, type Audience } from './audiences';
import { sql } from './db';

export async function releaseDueCampaigns() {
	const due =
		await sql`select id from campaigns where status='scheduled' and scheduled_at<=now() order by scheduled_at,id`;
	const released: { id: string }[] = [];
	for (const { id } of due) {
		const changed = await sql.begin(async (tx) => {
			const [campaign] = await tx`select * from campaigns where id=${id} and status='scheduled'
				and scheduled_at<=now() for update skip locked`;
			if (!campaign) return false;
			const audiences = await tx<Audience[]>`select a.* from audiences a join campaign_audiences ca
				on a.id=ca.audience_id where ca.campaign_id=${id} for share of a`;
			// Older scheduled campaigns already have a queue built from the scheduling-time audience.
			await tx`delete from deliveries where campaign_id=${id} and status='queued'`;
			const [batch] = await tx`with added as (
				insert into deliveries(campaign_id,contact_id,email,name,locale,subject,body,token,mode,status,error)
				select ${id},c.id,c.email,c.name,c.locale,coalesce(v.subject,''),coalesce(v.body,''),
					encode(sha256(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid())),'hex'),${campaign.mode},
					case when v.id is null then 'failed' else 'queued' end,
					case when v.id is null then 'No approved email for this language.' end
				from contacts c left join versions v on v.campaign_id=${id} and v.locale=c.locale
					and v.status='ready' and v.approved_at is not null
				where ${selectionMatch(campaign.all_users, audiences)}
				returning status
			) select count(*) filter(where status='queued')::int as queued,count(*)::int as total from added`;
			const status = batch.queued ? 'sending' : batch.total ? 'attention' : 'sent';
			await tx`update campaigns set status=${status},updated_at=now(),
				sent_at=case when ${status}='sent' then now() else null end where id=${id}`;
			return true;
		});
		if (changed) released.push({ id });
	}
	return released;
}
