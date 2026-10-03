import { NextResponse } from "next/server";
import { getAgentFactory } from "@/lib/agent-factory";
import { COACH_AGENT_CONFIG, type CoachReview } from "@/lib/agent-configs";

const supportedGames = new Set(["chess", "tictactoe", "checkers", "connect4", "gomoku"]);
const outcomes = new Set(["player", "opponent", "draw"]);

export async function POST(request: Request) {
  let payload: { game?: unknown; outcome?: unknown; history?: unknown; finalBoard?: unknown; score?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid coach request." }, { status: 400 });
  }

  const { game, outcome, history, finalBoard, score } = payload;
  if (
    typeof game !== "string" || !supportedGames.has(game) ||
    typeof outcome !== "string" || !outcomes.has(outcome) ||
    !Array.isArray(history) || history.length > 160 ||
    !history.every((entry) => typeof entry === "string" && entry.length <= 180)
  ) {
    return NextResponse.json({ error: "Invalid game review data." }, { status: 400 });
  }

  const boardState = JSON.stringify(finalBoard);
  if (!boardState || boardState.length > 12000) {
    return NextResponse.json({ error: "Final board state is missing or too large." }, { status: 413 });
  }

  try {
    const factory = getAgentFactory();
    const coach = factory.createFromConfig<CoachReview>(COACH_AGENT_CONFIG);
    
    const review = await coach.execute(
      `Game: ${game}\nResult: ${outcome}\nSession record: ${JSON.stringify(score)}\nMove log:\n${(history as string[]).join("\n")}\nFinal board: ${boardState}\nGive concise feedback in four fields.`
    );

    const fields = [review.summary, review.strength, review.improve, review.nextTip];
    if (!fields.every((field) => typeof field === "string" && field.trim())) {
      return NextResponse.json({ error: "Coach returned incomplete feedback." }, { status: 502 });
    }
    return NextResponse.json({
      review: {
        summary: review.summary.trim().slice(0, 240),
        strength: review.strength.trim().slice(0, 240),
        improve: review.improve.trim().slice(0, 240),
        nextTip: review.nextTip.trim().slice(0, 240),
      },
      agent: "Coach",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ollama Coach agent failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}