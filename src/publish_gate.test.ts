import { decidePublish, screenSubmission, submissionBody } from "./publish_gate.ts";
import assert from "node:assert/strict";

const input = submissionBody.parse({
  tenantId: "acme", accountId: "admin-7", image: "data:image/png;base64,AA", filename: "dashboard.png",
  caption: "Customer onboarding dashboard for the weekly review"
});
const result = decidePublish({ ...input, caption: "Customer password export for the weekly review" });
if (result.state !== "needs_review") throw new Error(`Expected review, got ${result.state}`);
console.log("PASS: credential-bearing captions are held for review");

const originalFetch = globalThis.fetch;
const originalKey = process.env.INFRAI_API_KEY;
process.env.INFRAI_API_KEY = "test-key";
try {
  for (const resizedUrl of ["https://example.com/resized.webp", "data:image/webp;base64,AA"]) {
  for (const failBackground of [false, true]) {
    const requests: { path: string; method: string; body: unknown }[] = [];
    globalThis.fetch = async (url, init) => {
      const path = new URL(String(url)).pathname;
      requests.push({ path, method: String(init?.method), body: init?.body });
      const data = path.endsWith("upload")
        ? { image_id: "uploaded-image", url: "unused" }
        : path.endsWith("resize")
          ? { image_id: "resized-image", url: resizedUrl }
          : {};
      return Response.json(failBackground && path.endsWith("background_remove")
        ? { ok: false, error: { message: "background failed" } }
        : { ok: true, data });
    };
    if (failBackground) await assert.rejects(screenSubmission(input), /background failed/);
    else await screenSubmission(input);
    const backgroundRequest = requests.find((request) => request.path.endsWith("background_remove"));
    assert.deepEqual(JSON.parse(String(backgroundRequest?.body)), {
      image: resizedUrl.startsWith("data:") ? { base64: "AA" } : { url: resizedUrl },
      format: "webp"
    });
    assert.deepEqual(requests.slice(-2), [
      { path: "/v1/image/delete/resized-image", method: "DELETE", body: undefined },
      { path: "/v1/image/delete/uploaded-image", method: "DELETE", body: undefined }
    ]);
  }
  }
} finally {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.INFRAI_API_KEY;
  else process.env.INFRAI_API_KEY = originalKey;
}
console.log("PASS: uploaded and resized images are deleted on success and failure");
