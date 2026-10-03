import { NextResponse } from "next/server";
import { getAgentFactory } from "@/lib/agent-factory";
import {
  BLACKJACK_AGGRESSIVE_AGENT_CONFIG,
  BLACKJACK_CONSERVATIVE_AGENT_CONFIG,
  BLACKJACK_STRATEGIC_AGENT_CONFIG,
  type BlackjackDecision,
} from "@/lib/agent-configs";
import {
  createBlackjackGame,
  getHandValue,
  hitPlayer,
  standPlayer,
  type BlackjackPlayer,
  type Card,
} from "@/lib/games";

export async function POST(request: Request) {
  let payload: {
    action?: unknown;
    deck?: unknown;
    players?: unknown;
    currentPlayerIndex?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid blackjack request." }, { status: 400 });
  }

  const { action, deck, players, currentPlayerIndex } = payload;

  // Initialize new game
  if (action === "new") {
    const game = createBlackjackGame();
    return NextResponse.json(game);
  }

  // Validate existing game state
  if (
    !Array.isArray(deck) ||
    !Array.isArray(players) ||
    typeof currentPlayerIndex !== "number"
  ) {
    return NextResponse.json({ error: "Invalid game state." }, { status: 400 });
  }

  const currentDeck = deck as Card[];
  const currentPlayers = players as BlackjackPlayer[];
  const currentIndex = currentPlayerIndex as number;

  // Player action (hit or stand)
  if (action === "hit" || action === "stand") {
    let updatedPlayers = [...currentPlayers];
    let updatedDeck = [...currentDeck];
    let nextIndex = currentIndex;
    let aiReasoning = "";

    // Process current player's action
    const currentPlayer = currentPlayers[currentIndex];
    if (!currentPlayer) {
      return NextResponse.json({ error: "Invalid player index." }, { status: 400 });
    }

    if (currentPlayer.id === "player") {
      // Human player action
      if (action === "hit") {
        const { updatedDeck: newDeck, updatedPlayer } = hitPlayer(updatedDeck, currentPlayer);
        updatedDeck = newDeck;
        updatedPlayers[currentIndex] = updatedPlayer;
        
        // If player busted, move to next player
        if (updatedPlayer.busted) {
          nextIndex = currentIndex + 1;
        }
        // Otherwise, keep player as current (allow multiple hits)
      } else {
        updatedPlayers[currentIndex] = standPlayer(currentPlayer);
        // Player stood, move to next player
        nextIndex = currentIndex + 1;
      }
    } else {
      // AI player action - use agent factory
      try {
        const factory = getAgentFactory();
        const agentConfig =
          currentPlayer.id === "ai1"
            ? BLACKJACK_AGGRESSIVE_AGENT_CONFIG
            : currentPlayer.id === "ai2"
            ? BLACKJACK_CONSERVATIVE_AGENT_CONFIG
            : BLACKJACK_STRATEGIC_AGENT_CONFIG;

        const agent = factory.createFromConfig<BlackjackDecision>(agentConfig);

        const handValue = getHandValue(currentPlayer.hand);
        const handDescription = currentPlayer.hand
          .map((card) => `${card.rank}${card.suit[0].toUpperCase()}`)
          .join(", ");

        const decision = await agent.execute(
          `Your current hand: ${handDescription} (value: ${handValue}). Legal actions: hit, stand. Choose your action and explain your reasoning in one short sentence.`
        );

        if (decision.action === "hit" && handValue < 21) {
          const { updatedDeck: newDeck, updatedPlayer } = hitPlayer(updatedDeck, currentPlayer);
          updatedDeck = newDeck;
          updatedPlayers[currentIndex] = updatedPlayer;
        } else {
          updatedPlayers[currentIndex] = standPlayer(currentPlayer);
        }
        aiReasoning = decision.reasoning;
      } catch (error) {
        // Fallback to simple strategy if AI agent fails
        console.error("AI agent failed, using fallback:", error);
        const handValue = getHandValue(currentPlayer.hand);
        
        let shouldHit = false;
        if (currentPlayer.id === "ai1") {
          shouldHit = handValue < 18;
        } else if (currentPlayer.id === "ai2") {
          shouldHit = handValue < 16;
        } else {
          shouldHit = handValue < 17;
        }

        if (shouldHit && handValue < 21) {
          const { updatedDeck: newDeck, updatedPlayer } = hitPlayer(updatedDeck, currentPlayer);
          updatedDeck = newDeck;
          updatedPlayers[currentIndex] = updatedPlayer;
        } else {
          updatedPlayers[currentIndex] = standPlayer(currentPlayer);
        }
        aiReasoning = "Using fallback strategy (Ollama unavailable)";
      }
    }

    // Move to next player (only if player stood or busted)
    // If player hit and didn't bust, nextIndex remains currentIndex (player can hit again)
    if (currentPlayer.id === "player" && action === "hit" && !updatedPlayers[currentIndex].busted) {
      // Player stays as current
      nextIndex = currentIndex;
    } else {
      // Move to next player
      nextIndex = currentIndex + 1;
    }

    // Process all remaining AI players automatically
    while (nextIndex < updatedPlayers.length) {
      const nextPlayer = updatedPlayers[nextIndex];
      if (nextPlayer.id === "player") {
        // Stop at human player
        break;
      }

      const handValue = getHandValue(nextPlayer.hand);
      try {
        const factory = getAgentFactory();
        const agentConfig =
          nextPlayer.id === "ai1"
            ? BLACKJACK_AGGRESSIVE_AGENT_CONFIG
            : nextPlayer.id === "ai2"
            ? BLACKJACK_CONSERVATIVE_AGENT_CONFIG
            : BLACKJACK_STRATEGIC_AGENT_CONFIG;

        const agent = factory.createFromConfig<BlackjackDecision>(agentConfig);

        const handDescription = nextPlayer.hand
          .map((card) => `${card.rank}${card.suit[0].toUpperCase()}`)
          .join(", ");

        const decision = await agent.execute(
          `Your current hand: ${handDescription} (value: ${handValue}). Legal actions: hit, stand. Choose your action and explain your reasoning in one short sentence.`
        );

        if (decision.action === "hit" && handValue < 21) {
          const { updatedDeck: newDeck, updatedPlayer } = hitPlayer(updatedDeck, nextPlayer);
          updatedDeck = newDeck;
          updatedPlayers[nextIndex] = updatedPlayer;
        } else {
          updatedPlayers[nextIndex] = standPlayer(nextPlayer);
        }
        aiReasoning += `\n${nextPlayer.name}: ${decision.reasoning}`;
      } catch (error) {
        // Fallback strategy
        let shouldHit = false;
        if (nextPlayer.id === "ai1") {
          shouldHit = handValue < 18;
        } else if (nextPlayer.id === "ai2") {
          shouldHit = handValue < 16;
        } else {
          shouldHit = handValue < 17;
        }

        if (shouldHit && handValue < 21) {
          const { updatedDeck: newDeck, updatedPlayer } = hitPlayer(updatedDeck, nextPlayer);
          updatedDeck = newDeck;
          updatedPlayers[nextIndex] = updatedPlayer;
        } else {
          updatedPlayers[nextIndex] = standPlayer(nextPlayer);
        }
        aiReasoning += `\n${nextPlayer.name}: Using fallback strategy`;
      }

      nextIndex++;
    }

    // Check if game ended
    if (nextIndex >= updatedPlayers.length) {
      return NextResponse.json({
        deck: updatedDeck,
        players: updatedPlayers,
        currentPlayerIndex: nextIndex,
        gameEnded: true,
        aiReasoning,
      });
    }

    return NextResponse.json({
      deck: updatedDeck,
      players: updatedPlayers,
      currentPlayerIndex: nextIndex,
      aiReasoning,
    });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
