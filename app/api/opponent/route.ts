import { NextResponse } from "next/server";
import { ollamaBaseUrl, ollamaModel } from "@/lib/ollama";
import { getAgentFactory, type Agent } from "@/lib/agent-factory";
import { createStrategistConfig, createChallengerConfig, createRefereeConfig, type Proposal, type RefereeDecision } from "@/lib/agent-configs";

const supportedGames = new Set(["chess", "tictactoe", "checkers", "connect4", "gomoku"]);

export async function GET() {
  try {
    const response = await fetch(`${ollamaBaseUrl()}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return NextResponse.json({ configured: false, runtimeAvailable: false, model: ollamaModel() });
    const data = await response.json() as { models?: { name?: string }[] };
    const models = data.models ?? [];
    const modelAvailable = models.some((model) =>
      model.name === ollamaModel() || model.name?.split(":")[0] === ollamaModel().split(":")[0],
    );
    return NextResponse.json({ configured: modelAvailable, runtimeAvailable: true, modelAvailable, model: ollamaModel() });
  } catch {
    return NextResponse.json({ configured: false, runtimeAvailable: false, model: ollamaModel() });
  }
}

export async function POST(request: Request) {
  let payload: { game?: unknown; board?: unknown; legalMoves?: unknown; sessionScore?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid move request." }, { status: 400 });
  }

  const { game, board, legalMoves, sessionScore } = payload;
  if (
    typeof game !== "string" || !supportedGames.has(game) ||
    !Array.isArray(legalMoves) || legalMoves.length === 0 || legalMoves.length > 300 ||
    !legalMoves.every((move) => typeof move === "string" && move.length <= 16)
  ) {
    return NextResponse.json({ error: "Invalid game state or legal-move list." }, { status: 400 });
  }

  const boardState = JSON.stringify(board);
  if (!boardState || boardState.length > 12000) {
    return NextResponse.json({ error: "Game state is missing or too large." }, { status: 413 });
  }
  const legal = legalMoves as string[];
  const context = `Game: ${game}\nBoard state: ${boardState}\nLegal moves: ${legal.join(", ")}`;
  const score = typeof sessionScore === "object" && sessionScore !== null
    ? sessionScore as { player?: unknown; opponent?: unknown; draw?: unknown }
    : {};
  const playerWins = Number.isInteger(score.player) && Number(score.player) >= 0 ? Number(score.player) : 0;
  const opponentWins = Number.isInteger(score.opponent) && Number(score.opponent) >= 0 ? Number(score.opponent) : 0;
  const draws = Number.isInteger(score.draw) && Number(score.draw) >= 0 ? Number(score.draw) : 0;
  const winDifference = playerWins - opponentWins;
  const challengeMode = winDifference >= 2 ? "increased"
    : winDifference <= -2 ? "eased"
      : "balanced";
  const balanceGuidance = challengeMode === "increased"
    ? `Balance adjustment toward a 50/50 session: the player leads ${playerWins}-${opponentWins} (${draws} draws). Increase challenge modestly: prioritize sound tactics and defenses, and do not overlook winning moves.`
    : winDifference <= -2
      ? `Balance adjustment toward a 50/50 session: the agent team leads ${opponentWins}-${playerWins} (${draws} draws). Ease challenge modestly: prefer instructive, recoverable positions and leave reasonable counterplay when safe; never choose an illegal or nonsensical move.`
      : `Balance adjustment: score is player ${playerWins}, agent ${opponentWins}, draws ${draws}. Keep standard challenge near the 50/50 target.`;
  const balancedContext = `${context}\nSession score: player ${playerWins}, agent ${opponentWins}, draws ${draws}.\n${balanceGuidance}`;

  try {
    const factory = getAgentFactory();
    
    // Create agents dynamically using the factory
    const strategist = factory.createFromConfig<Proposal>(createStrategistConfig(legal));
    const challenger = factory.createFromConfig<Proposal>(createChallengerConfig(legal));
    const referee = factory.createFromConfig<RefereeDecision>(createRefereeConfig(legal));

    const [strategy, challenge] = await Promise.all([
      strategist.execute(`${balancedContext}\nAs Strategist, choose a move at the requested challenge level and summarize its tactical purpose in one short sentence.`),
      challenger.execute(`${balancedContext}\nAs Challenger, independently choose a move at the requested challenge level and summarize the main threat or opportunity in one short sentence.`),
    ]);

    if (!legal.includes(strategy.move) || !legal.includes(challenge.move)) {
      return NextResponse.json({ error: "An Ollama agent proposed a move outside the legal-move list." }, { status: 502 });
    }

    const refereeDecision = await referee.execute(
      `${balancedContext}\nStrategist proposal: ${strategy.move} (${strategy.idea})\nChallenger proposal: ${challenge.move} (${challenge.idea})\nChoose the final move from the legal list at the requested challenge level and give one brief reason for the player.`
    );

    const move = legal.find((candidate) => candidate === refereeDecision.move);
    if (!move || typeof refereeDecision.explanation !== "string" || !refereeDecision.explanation.trim()) {
      return NextResponse.json({ error: "The Ollama Referee did not return a valid legal move." }, { status: 502 });
    }
    return NextResponse.json({
      move,
      explanation: refereeDecision.explanation.trim().slice(0, 240),
      provider: "ollama",
      agents: ["Strategist", "Challenger", "Referee"],
      challengeMode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ollama multi-agent turn failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}