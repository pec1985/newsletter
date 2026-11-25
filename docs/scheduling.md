# Scheduled sending

Send a campaign immediately, or schedule it for a future time.

## Campaign dates

Drafts have an optional **Deadline** button with a dropdown calendar and send time, entered in your browser’s timezone and stored as a UTC timestamp. Date-only edits preserve translations and approvals.

With a deadline set, approve every language and click **Schedule send** on the review page. Without it, **Send Now** sends immediately. A past send time must be changed or cleared before proceeding. Scheduling snapshots the approved emails and current recipients, locks editing, and shows a Scheduled status. **Cancel schedule & edit** returns it to a draft and removes the pending deliveries; approvals remain until the content changes.

## The worker

Keep `bun run worker` running for automatic delivery. At or after the scheduled time it releases the campaign’s delivery queue; a stopped worker catches up when restarted. The worker still checks recipient subscription/suppression before each delivery. Development schedules remain local simulations even when processed later. Run `bun run db:migrate` before deploying the application and restart the worker with the updated code.

## Verification

Scheduling regression: `bun scripts/test-campaign-schedule.ts` (local development server required).
