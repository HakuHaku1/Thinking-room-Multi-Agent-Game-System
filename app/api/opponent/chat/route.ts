import { NextResponse } from "next/server";
import { getAgentFactory } from "@/lib/agent-factory";
import { CONVERSATIONAL_AGENT_CONFIG, type ChatResponse } from "@/lib/agent-configs";

const supportedGames = new Set(["chess", "tictactoe", "checkers", "connect4", "gomoku", "blackjack"]);
type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  let payload: { game?: unknown; board?: unknown; lastMoveExplanation?: unknown; messages?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid chat request." }, { status: 400 });
  }

  const { game, board, lastMoveExplanation, messages } = payload;
  if (
    typeof game !== "string" || !supportedGames.has(game) ||
    !Array.isArray(messages) || messages.length === 0 || messages.length > 12 ||
    !messages.every((message) =>
      typeof message === "object" && message !== null &&
      ((message as ChatMessage).role === "user" || (message as ChatMessage).role === "assistant") &&
      typeof (message as ChatMessage).content === "string" &&
      (message as ChatMessage).content.trim().length > 0 &&
      (message as ChatMessage).content.length <= 1000
    )
  ) {
    return NextResponse.json({ error: "Invalid chat history." }, { status: 400 });
  }

  const boardState = JSON.stringify(board);
  if (!boardState || boardState.length > 12000) {
    return NextResponse.json({ error: "Game state is missing or too large." }, { status: 413 });
  }
  if (lastMoveExplanation !== undefined && (typeof lastMoveExplanation !== "string" || lastMoveExplanation.length > 500)) {
    return NextResponse.json({ error: "Invalid move explanation." }, { status: 400 });
  }

  const transcript = (messages as ChatMessage[])
    .map((message) => `${message.role === "user" ? "Player" : "You"}: ${message.content}`)
    .join("\n");

  try {
    const factory = getAgentFactory();
    const conversational = factory.createFromConfig<ChatResponse>(CONVERSATIONAL_AGENT_CONFIG);
    
    const result = await conversational.execute(
      `Game: ${game}\nCurrent board: ${boardState}\nLast move explanation: ${typeof lastMoveExplanation === "string" ? lastMoveExplanation : "No AI move explanation yet."}\nConversation:\n${transcript}\nReply to the player's latest message in a few sentences.`
    );
    if (typeof result.reply !== "string" || !result.reply.trim()) {
      return NextResponse.json({ error: "The Ollama Conversational agent returned an empty response." }, { status: 502 });
    }
    return NextResponse.json({ reply: result.reply.trim().slice(0, 1200), provider: "ollama", agent: "Conversational" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ollama chat agent failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}