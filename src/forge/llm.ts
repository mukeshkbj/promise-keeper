// Forge-hosted LLM call for promise proposals. Data stays on Atlassian.
// Kept behind one function so the model can be swapped without touching the rest.

import { chat } from '@forge/llm';
import { buildProposalMessages, extractJson, validateProposals, type Proposal } from '../engine';

// Check the models enabled for your site in the developer console; update if needed.
export const MODEL = 'claude-sonnet-4-5-20250929';

export async function proposePromises(replyText: string): Promise<Proposal[]> {
  try {
    const res: any = await chat({ model: MODEL, messages: buildProposalMessages(replyText) } as any);
    const msg = res?.choices?.[0]?.message?.content;
    const text = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.map((m: any) => m.text ?? '').join('') : '';
    if (!text) console.log('[pk] LLM returned no text', JSON.stringify(res)?.slice(0, 400));
    return validateProposals(extractJson(text), replyText);
  } catch (err) {
    console.error('Promise proposal failed', (err as any)?.code ?? err);
    return []; // never block the agent; nothing is proposed
  }
}
