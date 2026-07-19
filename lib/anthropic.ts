/**
 * Anthropic client for maintenance chat summaries.
 * Called when a maintenance request is closed. Uses the Messages API directly
 * via fetch to avoid an extra SDK dependency.
 *
 * IMPORTANT: callers must treat failures as non-fatal — a failed summary must
 * NOT block the maintenance status update. See app/api/maintenance/summarize.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_SUMMARY_MODEL || 'claude-sonnet-4-6';

export interface ChatLine {
  sender_role: string | null;
  message: string | null;
}

/**
 * Generate a 3–5 sentence summary of a closed maintenance thread covering:
 * (1) the issue, (2) how it was resolved, (3) which vendor handled it,
 * (4) any costs mentioned, (5) the final outcome.
 *
 * Returns the summary string, or throws — the caller is responsible for
 * catching and logging so the status update proceeds regardless.
 */
export async function summarizeMaintenanceThread(
  lines: ChatLine[],
  context?: { title?: string | null; vendor?: string | null }
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const transcript = lines
    .map((l) => `${(l.sender_role ?? 'unknown').toUpperCase()}: ${l.message ?? ''}`)
    .join('\n');

  const prompt = [
    context?.title ? `Maintenance request: ${context.title}` : null,
    context?.vendor ? `Assigned vendor: ${context.vendor}` : null,
    '',
    'Full chat thread:',
    transcript,
    '',
    'Write a 3-5 sentence summary of this closed maintenance request covering:',
    '1) what the issue was, 2) how it was resolved, 3) which vendor handled it,',
    '4) any costs mentioned, and 5) the final outcome. Plain text only.',
  ]
    .filter((l) => l !== null)
    .join('\n');

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === 'text')?.text?.trim();
  if (!text) {
    throw new Error('Anthropic API returned no text content');
  }
  return text;
}
