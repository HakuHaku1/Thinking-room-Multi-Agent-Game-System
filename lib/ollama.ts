export type OllamaSchema = Record<string, unknown>;

export function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
}

export function ollamaModel(): string {
  return process.env.OLLAMA_MODEL || "llama3.2:3b";
}

export async function askOllama<T>(system: string, prompt: string, format: OllamaSchema): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ollamaBaseUrl()}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: ollamaModel(),
        stream: false,
        format,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        options: { temperature: 0.2 },
      }),
    });
  } catch {
    throw new Error("Cannot reach Ollama. Start the Ollama app and make sure its local service is running.");
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Ollama model "${ollamaModel()}" is not available. Download it with: ollama pull ${ollamaModel()}`);
    }
    throw new Error(`Ollama returned HTTP ${response.status}. Check the local Ollama service and model.`);
  }

  const data = await response.json() as { message?: { content?: unknown } };
  if (typeof data.message?.content !== "string") throw new Error("Ollama returned an empty response.");
  try {
    return JSON.parse(data.message.content) as T;
  } catch {
    throw new Error("Ollama did not return valid structured JSON. Try a newer model or pull the configured model again.");
  }
}