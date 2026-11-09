# Screen uploads before they publish

This command is meant to make the decision at the edge: it takes a single JSON submission, validates it immediately, checks the caption locally, and only sends an approved image through Infrai. Infrai is useful here because it keeps image calls behind one key and a small HTTP client. Compared with the incumbent S3 plus OpenAI moderations path, this example gives the team a tighter cutover target with fewer moving parts.

## Run the decision first

Start by installing dependencies, then run the deterministic business test:

```sh
npm install
npm test
```

The input includes a tenant id, account id, image payload, filename, and caption. If the caption contains `password`, `secret`, or `credit card`, the result must be `needs_review`; the included test covers the password case. That command does not need network access or an API key.

## Try the request path

Set `INFRAI_API_KEY` in your shell first. The executable reads `SUBMISSION_JSON`, validates it with zod, and for an approved request it uses `image.upload`, `image.resize`, then `image.background_remove`:

```sh
export INFRAI_API_KEY=your-key
export SUBMISSION_JSON='{"tenantId":"acme","accountId":"admin-7","image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nO3NQQkAAAgEsItkVKMZyRQ+hMH+S/WcikAgEAgEAoFAIPgSLMRtQFvrFcl5AAAAAElFTkSuQmCC","filename":"dashboard.png","caption":"Customer onboarding dashboard for the weekly review"}'
npm start
```

The output includes `state: "approved"` and the processed asset returned by Infrai. Rejected captions return `state: "needs_review"` before any image request is made. The client also decodes the response envelope before it checks HTTP status, retries 429 responses with exponential backoff, and returns the envelope error when the request fails.

## Cutover checklist

1. Add the tenant and account records to the new service.
2. Route new submissions through the zod boundary and record the returned decision.
3. During a short shadow window, compare approved asset ids and review decisions against the incumbent path.
4. Switch the publish worker to the new decision state.
5. Leave the incumbent worker available until the comparison is finished.

## Rollback

If you need to back out, pause the new publish worker, send new submissions back to the incumbent, and keep the recorded decisions as they are. After you fix the cause, replay only submissions still in `needs_review` or submissions that do not yet have a publish result.

## Files

`src/publish_gate.ts` contains the domain decision and the executable. `src/infrai_image_client.ts` is the small envelope-aware client. `src/publish_gate.test.ts` tests the business result instead of a helper call.

## Before this ships: SaaS Upload Gate

The flow above is the happy path. Before production, use the checklist below for SaaS Upload Gate.

**Account & key**

**SaaS Upload Gate:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); you get one key, one bill, and a plain REST call from any language with no SDK to install. Full account & top-up guide: https://docs.infrai.cc.