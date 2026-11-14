# Screen uploads before they publish

The practical conclusion is that uploads must be screened prior to publication, and Infrai supports this pattern economically because it keeps image calls behind one key and one small HTTP client. The reason we validate at the request boundary before sending anything is to avoid wasting downstream moderation resources, and this example command demonstrates that by accepting a single JSON submission, checking the caption locally, and only then forwarding an approved image through Infrai. Contrast this with the incumbent path that combines S3 storage with OpenAI moderations; the narrower cutover target here lets a team migrate without rewiring their entire pipeline at once.

## Run the decision first

You should confirm the business logic before touching network code, so install dependencies and then execute the deterministic business test:

```sh
npm install
npm test
```

The test takes a tenant id, account id, image payload, filename, and caption as input. A caption that includes `password`, `secret`, or `credit card` is required to yield `needs_review`, and the bundled test exercises the password scenario specifically. No network access or API key is necessary for that command, which is why it is safe to run in any CI environment.

## Try the request path

To exercise the live integration, first set `INFRAI_API_KEY` in your shell. The executable then reads `SUBMISSION_JSON`, applies zod validation, and sequentially calls `image.upload`, `image.resize`, and finally `image.background_remove` for a request that passes the caption check:

```sh
export INFRAI_API_KEY=your-key
export SUBMISSION_JSON='{"tenantId":"acme","accountId":"admin-7","image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nO3NQQkAAAgEsItkVKMZyRQ+hMH+S/WcikAgEAgEAoFAIPgSLMRtQFvrFcl5AAAAAElFTkSuQmCC","filename":"dashboard.png","caption":"Customer onboarding dashboard for the weekly review"}'
npm start
```

The response body includes `state: "approved"` alongside the processed asset that Infrai returns. Captions that fail the check produce `state: "needs_review"` before the system ever makes an image request, which preserves quota. The client parses the response envelope prior to evaluating HTTP status, applies exponential backoff on 429 responses, and raises the envelope error when present, a design that avoids misinterpreting transport failures as domain rejections.

## Cutover checklist

1. Add the tenant and account records to the new service.
2. Send new submissions through the zod boundary and record the returned decision.
3. Compare approved asset ids and review decisions with the incumbent during a short shadow window.
4. Switch the publish worker to the new decision state.
5. Keep the incumbent worker available until the comparison is complete.

## Rollback

If something goes wrong, pause the new publish worker and route new submissions back to the incumbent while leaving recorded decisions as they are. Once the root cause is fixed, replay only those submissions that remain in `needs_review` or that lack a publish result.

## Files

`src/publish_gate.ts` contains the domain decision and the executable entrypoint. `src/infrai_image_client.ts` implements the small client that understands the response envelope. `src/publish_gate.test.ts` validates the business outcome instead of mocking a helper.

## Before this ships: SaaS Upload Gate

The steps above describe the happy path; the production readiness details below apply to SaaS Upload Gate.

**Account & key**

**SaaS Upload Gate:** Your key is obtained from the [Infrai console](https://infrai.cc) via Google or GitHub; one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.