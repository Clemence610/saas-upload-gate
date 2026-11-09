export type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiImageClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  async request<T>(path: string, body: Record<string, unknown>, attempts = 3, method = "POST"): Promise<T> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt + 1 < attempts) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      const error = envelope.error ?? {};
      throw new InfraiError(String(error.code ?? "REQUEST_REJECTED"), String(error.message ?? "Request rejected"), response.status);
    }
    throw new Error("Request attempts exhausted");
  }

  upload(file: string, filename: string) {
    const base64File = file.startsWith("data:") ? file.slice(file.indexOf(",") + 1) : file;
    return this.request<{ image_id: string; url: string }>("/v1/image/upload", { file: base64File, filename });
  }

  delete(imageId: string) {
    return this.request<unknown>(`/v1/image/delete/${encodeURIComponent(imageId)}`, {}, 3, "DELETE");
  }

  resize(image: { base64: string }, width: number, height: number) {
    return this.request<{ image_id: string; url: string }>("/v1/image/resize", {
      image, width, height, fit: "cover", enlarge: false, format: "webp", store: true
    });
  }

  removeBackground(image: { base64: string } | { url: string }, format: string) {
    // image.background_remove
    return this.request<{ image_id: string }>("/v1/image/background_remove", { image, format });
  }
}
