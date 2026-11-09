import { z } from "zod";
import { InfraiImageClient } from "./infrai_image_client.ts";

export const submissionBody = z.object({
  tenantId: z.string().min(1),
  accountId: z.string().min(1),
  image: z.string().min(1),
  filename: z.string().min(1),
  caption: z.string().trim().min(10).max(280)
});

export type Submission = z.infer<typeof submissionBody>;

export function decidePublish(input: Submission) {
  const caption = input.caption.toLowerCase();
  const blocked = ["password", "secret", "credit card"].some((term) => caption.includes(term));
  return blocked
    ? { state: "needs_review" as const, reason: "caption_policy" as const }
    : { state: "approved" as const, reason: "caption_policy" as const };
}

export async function screenSubmission(input: unknown) {
  const submission = submissionBody.parse(input);
  const decision = decidePublish(submission);
  if (decision.state !== "approved") return { submission, decision };
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required for image processing");
  const infrai = new InfraiImageClient(key);
  const uploaded = await infrai.upload(submission.image, submission.filename);
  try {
    const base64Image = submission.image.startsWith("data:")
      ? submission.image.slice(submission.image.indexOf(",") + 1)
      : submission.image;
    const resized = await infrai.resize({ base64: base64Image }, 1600, 1200);
    try {
      const resizedImage = resized.url.startsWith("data:")
        ? { base64: resized.url.slice(resized.url.indexOf(",") + 1) }
        : { url: resized.url };
      const clean = await infrai.removeBackground(resizedImage, "webp");
      return { submission, decision, asset: clean };
    } finally {
      await infrai.delete(resized.image_id);
    }
  } finally {
    await infrai.delete(uploaded.image_id);
  }
}

if (process.argv[1]?.endsWith("publish_gate.ts")) {
  const body = JSON.parse(process.env.SUBMISSION_JSON ?? "{}");
  screenSubmission(body).then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
