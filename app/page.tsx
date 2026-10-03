"use client";

import { Chess, type Square } from "chess.js";
import {
  ArrowDownRight,
  ArrowUpRight,
  Blocks,
  Bot,
  ChevronRight,
  CircleHelp,
  CircleDot,
  Clock3,
  Crown,
  Grid2X2,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
  Send,
  Sparkles,
  Swords,
  Target,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  applyCheckersMove,
  chooseChessMove,
  chooseCheckersMove,
  chooseConnectFourMove,
  chooseGomokuMove,
  chooseTicTacToeMove,
  createBlackjackGame,
  createCheckersBoard,
  createConnectFourBoard,
  createGomokuBoard,
  createTicTacToeBoard,
  getBlackjackWinner,
  getCheckersLegalMoves,
  getConnectFourWinner,
  getGomokuWinner,
  getHandValue,
  getTicTacToeWinner,
  hitPlayer,
  standPlayer,
  type BlackjackPlayer,
  type Card,
  type CheckersBoard,
  type CheckersMove,
  type ConnectFourBoard,
  type Mark,
} from "@/lib/games";

type GameId = "chess" | "tictactoe" | "checkers" | "connect4" | "gomoku" | "blackjack";
type Result = "player" | "opponent" | "draw" | null;
type OpponentMode = "local" | "ollama";
type ChatMessage = { role: "user" | "assistant" | "system" | "coach"; content: string };

const games: { id: GameId; name: string; detail: string; icon: LucideIcon; number: string }[] = [
  { id: "chess", name: "Chess", detail: "The long game", icon: Crown, number: "01" },
  { id: "tictactoe", name: "Tic-tac-toe", detail: "Three in a row", icon: Grid2X2, number: "02" },
  { id: "checkers", name: "Checkers", detail: "Take the middle", icon: Blocks, number: "03" },
  { id: "connect4", name: "Connect four", detail: "Four, before four", icon: CircleDot, number: "04" },
  { id: "gomoku", name: "Gomoku", detail: "Five in a line", icon: Target, number: "05" },
  { id: "blackjack", name: "Blackjack", detail: "Beat the dealer", icon: Swords, number: "06" },
];

const pieceGlyphs: Record<string, string> = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};

type AgentMove = { move: string; explanation: string };
type AgentScore = { player: number; opponent: number; draw: number };

async function askOllamaAgents(game: GameId, board: unknown, legalMoves: string[], sessionScore: AgentScore): Promise<AgentMove | null> {
  const response = await fetch("/api/opponent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game, board, legalMoves, sessionScore }),
  });
  if (!response.ok) {
    const data = await response.json() as { error?: unknown };
    throw new Error(typeof data.error === "string" ? data.error : "Ollama agents could not return a move.");
  }
  const data = (await response.json()) as { move?: unknown; explanation?: unknown };
  if (
    typeof data.move !== "string" || !legalMoves.includes(data.move) ||
    typeof data.explanation !== "string" || !data.explanation.trim()
  ) return null;
  return { move: data.move, explanation: data.explanation.trim() };
}

function checkersMoveKey(move: CheckersMove): string {
  return `${move.from}:${move.to}`;
}

function checkersCoordinate(index: number): string {
  return `${"abcdefgh"[index % 8]}${8 - Math.floor(index / 8)}`;
}

export default function Home() {
  const [activeGame, setActiveGame] = useState<GameId>("chess");
  const [chessFen, setChessFen] = useState(() => new Chess().fen());
  const [chessSelection, setChessSelection] = useState<Square | null>(null);
  const [lastChessMove, setLastChessMove] = useState<[Square, Square] | null>(null);
  const [ticBoard, setTicBoard] = useState<Mark[]>(createTicTacToeBoard);
  const [checkersBoard, setCheckersBoard] = useState<CheckersBoard>(createCheckersBoard);
  const [checkersTurn, setCheckersTurn] = useState<"r" | "b">("r");
  const [checkersSelection, setCheckersSelection] = useState<number | null>(null);
  const [checkersForcedFrom, setCheckersForcedFrom] = useState<number | null>(null);
  const [connectBoard, setConnectBoard] = useState<ConnectFourBoard>(createConnectFourBoard);
  const [gomokuBoard, setGomokuBoard] = useState<Mark[]>(createGomokuBoard);
  const [blackjackDeck, setBlackjackDeck] = useState<Card[]>([]);
  const [blackjackPlayers, setBlackjackPlayers] = useState<BlackjackPlayer[]>([]);
  const [blackjackCurrentIndex, setBlackjackCurrentIndex] = useState(0);
  const [blackjackGameEnded, setBlackjackGameEnded] = useState(false);
  const [blackjackWinner, setBlackjackWinner] = useState<string | null>(null);
  const [dealtCard, setDealtCard] = useState<Card | null>(null);
  const [showDealAnimation, setShowDealAnimation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [opponentMode, setOpponentMode] = useState<OpponentMode>("local");
  const [ollamaReady, setOllamaReady] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState("Checking local Ollama...");
  const [opponentCommentary, setOpponentCommentary] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [coachBusy, setCoachBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [score, setScore] = useState({ player: 0, opponent: 0, draw: 0 });
  const session = useRef(0);
  const resultRecorded = useRef(false);
  const coachRequestedForSession = useRef(-1);
  const moveHistory = useRef<string[]>([]);

  const getChatBoardState = useCallback((): unknown => {
    if (activeGame === "chess") return { fen: chessFen };
    if (activeGame === "tictactoe") return ticBoard;
    if (activeGame === "checkers") return { board: checkersBoard, turn: checkersTurn, forcedFrom: checkersForcedFrom };
    if (activeGame === "connect4") return connectBoard;
    return gomokuBoard;
  }, [activeGame, chessFen, ticBoard, checkersBoard, checkersTurn, checkersForcedFrom, connectBoard, gomokuBoard]);

  useEffect(() => {
    void fetch("/api/opponent")
      .then((response) => response.json() as Promise<{ configured?: boolean; runtimeAvailable?: boolean; modelAvailable?: boolean; model?: string }>)
      .then((data) => {
        const configured = Boolean(data.configured);
        setOllamaReady(configured);
        setOpponentMode(configured ? "ollama" : "local");
        setOllamaStatus(configured
          ? `Ollama ready · ${data.model ?? "local model"}`
          : data.runtimeAvailable
            ? `Model missing · run ollama pull ${data.model ?? "llama3.2:3b"}`
            : "Ollama is not running · start Ollama locally");
      })
      .catch(() => {
        setOllamaReady(false);
        setOllamaStatus("Ollama is not running · start Ollama locally");
        setOpponentMode("local");
      });
  }, []);

  // Auto-start blackjack when game is selected
  useEffect(() => {
    if (activeGame === "blackjack" && blackjackPlayers.length === 0) {
      void startBlackjackGame();
    }
  }, [activeGame]);

  useEffect(() => {
    if (!result || coachRequestedForSession.current === session.current) return;
    const reviewSession = session.current;
    coachRequestedForSession.current = reviewSession;
    setCoachBusy(true);
    void fetch("/api/opponent/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game: activeGame,
        outcome: result,
        history: moveHistory.current,
        finalBoard: getChatBoardState(),
        score,
      }),
    })
      .then(async (response) => {
        const data = await response.json() as {
          review?: { summary?: string; strength?: string; improve?: string; nextTip?: string };
          error?: string;
        };
        if (!response.ok || !data.review) throw new Error(data.error || "Coach review failed.");
        const review = data.review;
        const message = [
          `Match review: ${review.summary ?? "Game complete."}`,
          `Strength: ${review.strength ?? "Keep practicing."}`,
          `Improve: ${review.improve ?? "Review the key positions."}`,
          `Next game: ${review.nextTip ?? "Look for your opponent's threats before moving."}`,
        ].join("\n");
        if (reviewSession === session.current) {
          setChatMessages((messages) => [...messages, { role: "coach" as const, content: message }].slice(-12));
        }
      })
      .catch((error: unknown) => {
        if (reviewSession === session.current) {
          const message = error instanceof Error ? error.message : "Coach review could not be generated.";
          setChatMessages((messages) => [...messages, { role: "system" as const, content: `Coach unavailable: ${message}` }].slice(-12));
        }
      })
      .finally(() => {
        if (reviewSession === session.current) setCoachBusy(false);
      });
  }, [activeGame, getChatBoardState, result, score]);

  const currentGame = games.find((game) => game.id === activeGame)!;
  const chess = new Chess(chessFen);
  const chessBoard = chess.board();
  const chessLegal = chessSelection
    ? chess.moves({ square: chessSelection, verbose: true }).map((move) => move.to)
    : [];
  const chessEnded = chess.isGameOver();
  const ticWinner = getTicTacToeWinner(ticBoard);
  const connectWinner = getConnectFourWinner(connectBoard);
  const gomokuWinner = getGomokuWinner(gomokuBoard);
  const gameOver = activeGame === "chess" ? chessEnded
    : activeGame === "tictactoe" ? ticWinner !== null
      : activeGame === "connect4" ? connectWinner !== null || connectBoard[0].every(Boolean)
        : activeGame === "gomoku" ? gomokuWinner !== null || gomokuBoard.every(Boolean)
          : result !== null;
    const decisiveGames = score.player + score.opponent;
    const playerWinRate = decisiveGames ? Math.round(score.player / decisiveGames * 100) : null;
    const balanceDifference = score.player - score.opponent;
    const challengeLabel = opponentMode !== "ollama" ? "OLLAMA REQUIRED"
      : balanceDifference >= 2 ? "CHALLENGE RISING"
        : balanceDifference <= -2 ? "CHALLENGE EASING"
          : "CHALLENGE BALANCED";

  function finish(outcome: Exclude<Result, null>) {
    if (resultRecorded.current) return;
    resultRecorded.current = true;
    setResult(outcome);
    setScore((current) => ({
      ...current,
      player: current.player + Number(outcome === "player"),
      opponent: current.opponent + Number(outcome === "opponent"),
      draw: current.draw + Number(outcome === "draw"),
    }));
  }

  function recordMove(description: string) {
    moveHistory.current = [...moveHistory.current, description].slice(-160);
  }

  function resetGame(nextGame = activeGame) {
    session.current += 1;
    resultRecorded.current = false;
    setActiveGame(nextGame);
    setChessFen(new Chess().fen());
    setChessSelection(null);
    setLastChessMove(null);
    setTicBoard(createTicTacToeBoard());
    setCheckersBoard(createCheckersBoard());
    setCheckersTurn("r");
    setCheckersSelection(null);
    setCheckersForcedFrom(null);
    setConnectBoard(createConnectFourBoard());
    setGomokuBoard(createGomokuBoard());
    setBlackjackDeck([]);
    setBlackjackPlayers([]);
    setBlackjackCurrentIndex(0);
    setBlackjackGameEnded(false);
    setBlackjackWinner(null);
    setDealtCard(null);
    setShowDealAnimation(false);
    setBusy(false);
    setOpponentCommentary("");
    setChatMessages([]);
    setChatInput("");
    setChatBusy(false);
    setCoachBusy(false);
    moveHistory.current = [];
    setResult(null);
  }

  function appendAgentMessage(content: string) {
    setChatMessages((messages) => [...messages, { role: "assistant" as const, content }].slice(-12));
  }

  function appendSystemMessage(content: string) {
    setChatMessages((messages) => [...messages, { role: "system" as const, content }].slice(-12));
  }

  async function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = chatInput.trim();
    if (!question || !ollamaReady || chatBusy || busy) return;

    const requestSession = session.current;
    const nextMessages = [
      ...chatMessages
        .filter((message) => message.role !== "system")
        .map((message) => ({ role: message.role === "user" ? "user" as const : "assistant" as const, content: message.content })),
      { role: "user" as const, content: question },
    ].slice(-12);
    setChatMessages(nextMessages);
    setChatInput("");
    setChatBusy(true);

    try {
      const response = await fetch("/api/opponent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: activeGame,
          board: getChatBoardState(),
          lastMoveExplanation: opponentCommentary,
          messages: nextMessages,
        }),
      });
      const data = await response.json() as { reply?: unknown; error?: unknown };
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Ollama chat agent could not reply.");
      }
      if (typeof data.reply !== "string" || !data.reply.trim()) {
        throw new Error("Ollama chat agent returned an empty reply.");
      }
      if (requestSession !== session.current) return;
      appendAgentMessage(data.reply.trim());
    } catch (error) {
      if (requestSession === session.current) {
        appendSystemMessage(error instanceof Error ? error.message : "Ollama chat agent failed. Check the local Ollama setup and try again.");
      }
    } finally {
      if (requestSession === session.current) setChatBusy(false);
    }
  }

  function runOpponentTurn(
    game: GameId,
    board: unknown,
    legalMoves: string[],
    fallback: () => string | null,
    apply: (move: string) => void,
  ) {
    const turnSession = session.current;
    setBusy(true);
    setOpponentCommentary("");
    void (async () => {
      let move: string | null = null;
      let explanation = "";
      let usedOllama = false;
      let apiError = "";
      if (opponentMode === "ollama") {
        const response = await askOllamaAgents(game, board, legalMoves, {
          player: score.player,
          opponent: score.opponent,
          draw: score.draw,
        }).catch((error: unknown) => {
          apiError = error instanceof Error ? error.message : "Ollama agent team could not return a move.";
          return null;
        });
        if (response) {
          move = response.move;
          explanation = response.explanation;
          usedOllama = true;
        }
      }
      if (!move) {
        setOpponentMode("local");
        move = fallback();
        explanation = "This move was selected by the built-in local strategy. Start Ollama with the configured model to use the Strategist, Challenger, and Referee agents.";
        if (apiError) appendSystemMessage(`${apiError} The game continued with the local opponent.`);
      }
      if (turnSession !== session.current) return;
      if (move && legalMoves.includes(move)) {
        setOpponentCommentary(explanation);
        if (usedOllama) appendAgentMessage(explanation);
        apply(move);
      }
      setBusy(false);
    })();
  }

  function playTicTacToe(index: number) {
    if (busy || gameOver || ticBoard[index]) return;
    const next = [...ticBoard];
    next[index] = "X";
    recordMove(`You placed X at row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}.`);
    setTicBoard(next);
    const winner = getTicTacToeWinner(next);
    if (winner) {
      finish(winner === "X" ? "player" : winner === "O" ? "opponent" : "draw");
      return;
    }
    const legal = next.flatMap((mark, move) => mark ? [] : [String(move)]);
    runOpponentTurn("tictactoe", next, legal, () => String(chooseTicTacToeMove(next)), (move) => {
      const after = [...next];
      after[Number(move)] = "O";
      recordMove(`Opponent placed O at row ${Math.floor(Number(move) / 3) + 1}, column ${(Number(move) % 3) + 1}.`);
      setTicBoard(after);
      const outcome = getTicTacToeWinner(after);
      if (outcome) finish(outcome === "X" ? "player" : outcome === "O" ? "opponent" : "draw");
    });
  }

  function playChessSquare(square: Square) {
    if (busy || gameOver) return;
    const move = chessSelection
      ? chess.moves({ square: chessSelection, verbose: true }).find((candidate) => candidate.to === square)
      : undefined;
    if (move) {
      const next = new Chess(chessFen);
      const playedMove = next.move({ from: move.from, to: move.to, promotion: "q" });
      recordMove(`You played ${playedMove.san}.`);
      const nextFen = next.fen();
      setChessFen(nextFen);
      setLastChessMove([move.from, move.to]);
      setChessSelection(null);
      if (next.isCheckmate()) {
        finish("player");
        return;
      }
      if (next.isDraw()) {
        finish("draw");
        return;
      }
      const legal = next.moves({ verbose: true }).map((candidate) => `${candidate.from}${candidate.to}${candidate.promotion ?? ""}`);
      runOpponentTurn("chess", nextFen, legal, () => chooseChessMove(nextFen), (chosen) => {
        const after = new Chess(nextFen);
        const agentMove = after.move({ from: chosen.slice(0, 2), to: chosen.slice(2, 4), promotion: chosen[4] ?? "q" });
        recordMove(`Ollama team played ${agentMove.san}.`);
        setChessFen(after.fen());
        setLastChessMove([chosen.slice(0, 2) as Square, chosen.slice(2, 4) as Square]);
        if (after.isCheckmate()) finish("opponent");
        else if (after.isDraw()) finish("draw");
      });
      return;
    }
    const piece = chess.get(square);
    if (piece?.color === "w" && chess.turn() === "w") setChessSelection(square);
    else setChessSelection(null);
  }

  function runCheckersOpponent(initialBoard: CheckersBoard) {
    const turnSession = session.current;
    setBusy(true);
    setOpponentCommentary("");
    void (async () => {
      let board = initialBoard;
      let forcedFrom: number | undefined;
      let explanation = "";
      let usedLocalMove = false;
      let apiError = "";
      for (let step = 0; step < 12; step += 1) {
        const legal = getCheckersLegalMoves(board, "b", forcedFrom);
        if (!legal.length) break;
        const keys = legal.map(checkersMoveKey);
        const agentResponse = opponentMode === "ollama" && !usedLocalMove
          ? await askOllamaAgents("checkers", { board, turn: "b", forcedFrom }, keys, {
            player: score.player,
            opponent: score.opponent,
            draw: score.draw,
          }).catch((error: unknown) => {
            apiError = error instanceof Error ? error.message : "Ollama agent team could not return a move.";
            return null;
          })
          : null;
        let chosen = agentResponse?.move ?? null;
        if (agentResponse) explanation = agentResponse.explanation;
        if (!chosen) {
          usedLocalMove = true;
          setOpponentMode("local");
          const local = chooseCheckersMove(board, "b", forcedFrom);
          chosen = local ? checkersMoveKey(local) : null;
          explanation = "This move was selected by the built-in checkers strategy. Start Ollama with the configured model to use the agent team.";
        }
        if (!chosen || turnSession !== session.current) break;
        const [from, to] = chosen.split(":").map(Number);
        const move = legal.find((candidate) => candidate.from === from && candidate.to === to);
        if (!move) break;
        recordMove(`${usedLocalMove ? "Local opponent" : "Ollama team"} moved ${checkersCoordinate(move.from)} to ${checkersCoordinate(move.to)}${move.captured === null ? "" : " and captured a piece"}.`);
        board = applyCheckersMove(board, move);
        const chain = move.captured === null ? [] : getCheckersLegalMoves(board, "b", move.to);
        if (!chain.length) break;
        forcedFrom = move.to;
      }
      if (turnSession !== session.current) return;
      setCheckersBoard(board);
      setCheckersSelection(null);
      setCheckersForcedFrom(null);
      setCheckersTurn("r");
      setOpponentCommentary(explanation);
      if (!usedLocalMove && explanation) appendAgentMessage(explanation);
      if (apiError) appendSystemMessage(`${apiError} The game continued with the local opponent.`);
      if (!getCheckersLegalMoves(board, "r").length) finish("opponent");
      setBusy(false);
    })();
  }

  function playCheckersSquare(index: number) {
    if (busy || result || checkersTurn !== "r") return;
    const legal = getCheckersLegalMoves(checkersBoard, "r", checkersForcedFrom ?? undefined);
    const move = checkersSelection === null ? undefined : legal.find((candidate) => candidate.from === checkersSelection && candidate.to === index);
    if (move) {
      const next = applyCheckersMove(checkersBoard, move);
      recordMove(`You moved ${checkersCoordinate(move.from)} to ${checkersCoordinate(move.to)}${move.captured === null ? "" : " and captured a piece"}.`);
      setCheckersBoard(next);
      const chain = move.captured === null ? [] : getCheckersLegalMoves(next, "r", move.to);
      if (chain.length) {
        setCheckersSelection(move.to);
        setCheckersForcedFrom(move.to);
        return;
      }
      setCheckersTurn("b");
      setCheckersSelection(null);
      setCheckersForcedFrom(null);
      if (!getCheckersLegalMoves(next, "b").length) finish("player");
      else runCheckersOpponent(next);
      return;
    }
    const piece = checkersBoard[index];
    if (piece?.toLowerCase() === "r" && (checkersForcedFrom === null || index === checkersForcedFrom)) {
      setCheckersSelection(index);
    } else if (checkersForcedFrom === null) {
      setCheckersSelection(null);
    }
  }

  function playConnectFour(col: number) {
    if (busy || gameOver || connectBoard[0][col]) return;
    const next = connectBoard.map((row) => [...row]);
    let playerRow = -1;
    for (let row = 5; row >= 0; row -= 1) {
      if (!next[row][col]) {
        next[row][col] = "X";
        playerRow = row;
        break;
      }
    }
    recordMove(`You dropped a disc in column ${col + 1}, row ${playerRow + 1}.`);
    setConnectBoard(next);
    const winner = getConnectFourWinner(next);
    if (winner) {
      finish(winner === "X" ? "player" : "opponent");
      return;
    }
    if (next[0].every(Boolean)) {
      finish("draw");
      return;
    }
    const legal = next[0].flatMap((mark, index) => mark ? [] : [String(index)]);
    runOpponentTurn("connect4", next, legal, () => String(chooseConnectFourMove(next)), (chosen) => {
      const after = next.map((row) => [...row]);
      let agentRow = -1;
      for (let row = 5; row >= 0; row -= 1) {
        if (!after[row][Number(chosen)]) {
          after[row][Number(chosen)] = "O";
          agentRow = row;
          break;
        }
      }
      recordMove(`Ollama team dropped a disc in column ${Number(chosen) + 1}, row ${agentRow + 1}.`);
      setConnectBoard(after);
      const outcome = getConnectFourWinner(after);
      if (outcome) finish(outcome === "X" ? "player" : "opponent");
      else if (after[0].every(Boolean)) finish("draw");
    });
  }

  function playGomoku(index: number) {
    if (busy || gameOver || gomokuBoard[index]) return;
    const next = [...gomokuBoard];
    next[index] = "X";
    recordMove(`You placed X at row ${Math.floor(index / 15) + 1}, column ${(index % 15) + 1}.`);
    setGomokuBoard(next);
    if (getGomokuWinner(next) === "X") {
      finish("player");
      return;
    }
    if (next.every(Boolean)) {
      finish("draw");
      return;
    }
    const legal = next.flatMap((mark, move) => mark ? [] : [String(move)]);
    runOpponentTurn("gomoku", next, legal, () => String(chooseGomokuMove(next)), (chosen) => {
      const after = [...next];
      after[Number(chosen)] = "O";
      recordMove(`Ollama team placed O at row ${Math.floor(Number(chosen) / 15) + 1}, column ${(Number(chosen) % 15) + 1}.`);
      setGomokuBoard(after);
      if (getGomokuWinner(after) === "O") finish("opponent");
      else if (after.every(Boolean)) finish("draw");
    });
  }

  async function startBlackjackGame() {
    setBusy(true);
    try {
      const response = await fetch("/api/blackjack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "new" }),
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to start blackjack game");
      }
      
      const data = await response.json() as { deck?: Card[]; players?: BlackjackPlayer[] };
      if (!data.deck || !data.players) {
        throw new Error("Invalid response from server");
      }
      
      setBlackjackDeck(data.deck);
      setBlackjackPlayers(data.players);
      setBlackjackCurrentIndex(0);
      setBlackjackGameEnded(false);
      setBlackjackWinner(null);
      setDealtCard(null);
      setShowDealAnimation(false);
      setBusy(false);
    } catch (error) {
      appendSystemMessage(error instanceof Error ? error.message : "Failed to start blackjack game");
      setBusy(false);
    }
  }

  async function playBlackjackAction(action: "hit" | "stand") {
    if (busy || blackjackGameEnded) return;
    setBusy(true);
    try {
      const response = await fetch("/api/blackjack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          deck: blackjackDeck,
          players: blackjackPlayers,
          currentPlayerIndex: blackjackCurrentIndex,
        }),
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to play blackjack action");
      }
      
      const data = await response.json() as {
        deck?: Card[];
        players?: BlackjackPlayer[];
        currentPlayerIndex?: number;
        gameEnded?: boolean;
        aiReasoning?: string;
      };
      
      if (data.deck && data.players && data.currentPlayerIndex !== undefined) {
        setBlackjackDeck(data.deck);
        setBlackjackPlayers(data.players);
        setBlackjackCurrentIndex(data.currentPlayerIndex);
        
        // Only reset animation if turn moved to AI (player still can hit)
        if (data.players[data.currentPlayerIndex]?.id !== "player") {
          setShowDealAnimation(false);
          setDealtCard(null);
        }
        
        if (data.gameEnded) {
          setBlackjackGameEnded(true);
          const winner = getBlackjackWinner(data.players);
          setBlackjackWinner(winner.result);
          if (winner.winner?.id === "player") {
            finish("player");
          } else if (winner.winner?.id !== "player") {
            finish("opponent");
          }
        }
        if (data.aiReasoning) {
          appendAgentMessage(data.aiReasoning);
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      appendSystemMessage(error instanceof Error ? error.message : "Failed to play blackjack action");
    } finally {
      setBusy(false);
    }
  }

  const turnLabel = result === "player" ? "You took the match"
    : result === "opponent" ? "Ollama team wins this one"
      : result === "draw" ? "A clean draw"
        : busy ? "Ollama agents are working"
          : activeGame === "chess" ? (chess.turn() === "w" ? "Your move" : "Ollama team to move")
            : activeGame === "checkers" ? (checkersTurn === "r" ? "Your move" : "Ollama team to move")
              : activeGame === "blackjack" ? (blackjackGameEnded ? blackjackWinner : blackjackPlayers[blackjackCurrentIndex]?.name + "'s turn")
                : "Your move";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="The Thinking Room home" onClick={(event) => { event.preventDefault(); resetGame("chess"); }}>
          <span className="brand-mark"><Swords size={19} strokeWidth={2.4} /></span>
          <span className="brand-name">THE THINKING<br />ROOM<span className="brand-period">.</span></span>
        </a>

        <div className="sidebar-kicker">PICK YOUR GAME</div>
        <nav className="game-nav" aria-label="Choose a game">
          {games.map(({ id, name, detail, icon: Icon, number }) => (
            <button key={id} className={`game-nav-item ${activeGame === id ? "is-active" : ""}`} onClick={() => resetGame(id)} aria-current={activeGame === id ? "page" : undefined}>
              <span className="game-nav-icon"><Icon size={18} strokeWidth={1.9} /></span>
              <span className="game-nav-copy"><span>{name}</span><small>{detail}</small></span>
              <span className="game-nav-number">{number}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status"><span className="online-dot" /> {opponentMode === "ollama" ? "OLLAMA AGENTS READY" : "LOCAL MODE ACTIVE"}</div>
          <div className="sidebar-rule" />
          <div className="sidebar-note"><span className="note-icon"><Sparkles size={15} /></span><span>One move can change<br />everything.</span></div>
          <div className="sidebar-version">ARENA / 01.26</div>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="breadcrumb"><span>ARCADE</span><ChevronRight size={13} /><span className="breadcrumb-current">THE THINKING ROOM</span></div>
          <div className="topbar-right">
            <div className="round-status"><span className="online-dot" />{opponentMode === "ollama" ? "OLLAMA MULTI-AGENT" : "PRACTICE MODE"}</div>
            <button className="icon-button help-button" aria-label="Game rules" title="Game rules" onClick={() => window.alert(`${currentGame.name}: ${currentGame.detail}. You play first. Make a move on the board to challenge the Ollama agent team.`)}><CircleHelp size={17} /></button>
          </div>
        </header>

        <section className="intro-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-dash" /> ONE BOARD. ONE OPPONENT.</div>
            <h1>Make your <em>move.</em></h1>
            <p className="intro-copy">Five games. One local agent team. How far can you get?</p>
          </div>
          <div className="record-box" aria-label="Match record">
            <span className="record-label">SESSION · 50/50 TARGET</span>
            <div className="record-values"><span className="record-you">{String(score.player).padStart(2, "0")}</span><span className="record-separator">:</span><span className="record-opponent">{String(score.opponent).padStart(2, "0")}</span></div>
            <span className="record-caption">{playerWinRate === null ? "NO DECISIVE GAMES · 50% TARGET" : `YOU · ${playerWinRate}% WIN RATE · 50% TARGET`}{score.draw ? ` · ${score.draw} DRAW${score.draw === 1 ? "" : "S"}` : ""}</span>
          </div>
        </section>

        <section className="arena" aria-label={`${currentGame.name} game` }>
          <div className="arena-header">
            <div className="arena-title-group"><span className="arena-index">{games.find((game) => game.id === activeGame)?.number}</span><div><h2>{currentGame.name}</h2><span className="arena-subtitle">{currentGame.detail.toUpperCase()}</span></div></div>
            <div className={`turn-pill ${result ? "turn-finished" : ""}`}><span className={busy ? "turn-spinner" : "turn-dot"}>{busy ? <LoaderCircle size={14} /> : null}</span>{turnLabel}</div>
            <button className="reset-button" onClick={() => resetGame()} title="Start a new game"><RotateCcw size={15} /><span>New game</span></button>
          </div>

          <div className={`play-area game-${activeGame}`}>
            <div className="board-column">
              <div className="player-bar player-top">
                <div className="player-info"><span className="avatar opponent-avatar"><Bot size={18} /></span><span className="player-name">Ollama team<span className="player-label">{opponentMode === "ollama" ? "3 LOCAL AGENTS" : "LOCAL GAME AI"}</span></span></div>
                <span className="player-piece-label">{activeGame === "chess" ? "BLACK" : "O"}</span>
              </div>

              {activeGame === "chess" && (
                <div className="chess-wrap">
                  <div className="chess-coordinates chess-files-top">{"abcdefgh".split("").map((file) => <span key={file}>{file}</span>)}</div>
                  <div className="chess-board" role="grid" aria-label="Chess board">
                    {chessBoard.map((row, rowIndex) => row.map((piece, colIndex) => {
                      const square = `${"abcdefgh"[colIndex]}${8 - rowIndex}` as Square;
                      const isDark = (rowIndex + colIndex) % 2 === 1;
                      const isLegal = chessLegal.includes(square);
                      const isSelected = chessSelection === square;
                      const isLastMove = lastChessMove?.includes(square) ?? false;
                      return (
                        <button key={square} role="gridcell" aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${piece.type}` : " empty"}`} className={`chess-square ${isDark ? "square-dark" : "square-light"} ${isSelected ? "selected" : ""} ${isLastMove ? "last-move" : ""}`} onClick={() => playChessSquare(square)}>
                          {piece && <span className={`chess-piece ${piece.color === "w" ? "piece-white" : "piece-black"}`}>{pieceGlyphs[`${piece.color}${piece.type}`]}</span>}
                          {isLegal && <span className={`legal-marker ${piece ? "legal-capture" : ""}`} />}
                          {colIndex === 0 && <span className="rank-label">{8 - rowIndex}</span>}
                        </button>
                      );
                    }))}
                  </div>
                  <div className="chess-coordinates chess-files-bottom">{"abcdefgh".split("").map((file) => <span key={file}>{file}</span>)}</div>
                </div>
              )}

              {activeGame === "tictactoe" && <div className="tic-board" role="grid" aria-label="Tic-tac-toe board">{ticBoard.map((mark, index) => <button key={index} className={`tic-cell ${mark ? `mark-${mark.toLowerCase()}` : ""}`} aria-label={`Square ${index + 1}${mark ? ` ${mark}` : " empty"}`} disabled={Boolean(mark) || busy || gameOver} onClick={() => playTicTacToe(index)}>{mark && <span>{mark}</span>}</button>)}</div>}

              {activeGame === "checkers" && <div className="checkers-board" role="grid" aria-label="Checkers board">{checkersBoard.map((piece, index) => {
                const darkSquare = (Math.floor(index / 8) + index % 8) % 2 === 1;
                const legal = checkersTurn === "r" && getCheckersLegalMoves(checkersBoard, "r", checkersForcedFrom ?? undefined).some((move) => move.from === checkersSelection && move.to === index);
                return <button key={index} className={`checkers-square ${darkSquare ? "checkers-dark" : "checkers-light"} ${checkersSelection === index ? "selected" : ""} ${legal ? "can-move" : ""}`} aria-label={`Row ${Math.floor(index / 8) + 1}, column ${index % 8 + 1}${piece ? ` ${piece.toLowerCase() === "r" ? "red" : "black"} piece` : ""}`} onClick={() => playCheckersSquare(index)}><span className={piece ? `checker-piece checker-${piece.toLowerCase()} ${piece === piece.toUpperCase() ? "is-king" : ""}` : ""}>{piece === "R" || piece === "B" ? <Crown size={16} /> : null}</span></button>;
              })}</div>}

              {activeGame === "connect4" && <div className="connect-board" role="grid" aria-label="Connect four board">{connectBoard.flatMap((row, rowIndex) => row.map((mark, colIndex) => <button key={`${rowIndex}-${colIndex}`} className={`connect-cell ${mark ? `mark-${mark.toLowerCase()}` : ""}`} aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}${mark ? ` ${mark}` : " empty"}`} disabled={busy || gameOver || Boolean(connectBoard[0][colIndex])} onClick={() => playConnectFour(colIndex)}>{mark && <span />}</button>))}</div>}

              {activeGame === "gomoku" && <div className="gomoku-board" role="grid" aria-label="Gomoku board">{gomokuBoard.map((mark, index) => <button key={index} className={`gomoku-point ${mark ? `mark-${mark.toLowerCase()}` : ""}`} aria-label={`Intersection ${Math.floor(index / 15) + 1}, ${index % 15 + 1}${mark ? ` ${mark}` : " empty"}`} disabled={busy || gameOver || Boolean(mark)} onClick={() => playGomoku(index)}>{mark && <span />}</button>)}</div>}

              {activeGame === "blackjack" && (
                <div className="blackjack-table">
                  {blackjackPlayers.length === 0 ? (
                    <div className="blackjack-start">
                      <LoaderCircle size={24} className="spin" />
                    </div>
                  ) : (
                    <div className="blackjack-game">
                      <div className="dealer-section">
                        <span className="dealer-label">DEALER</span>
                        <div className={`dealer-card ${showDealAnimation ? "dealing" : ""}`}>
                          {dealtCard && showDealAnimation ? (
                            <div className="playing-card dealt-card-face">
                              <span className="card-rank">{dealtCard.rank}</span>
                              <span className={`card-suit ${dealtCard.suit === "hearts" || dealtCard.suit === "diamonds" ? "red" : "black"}`}>
                                {dealtCard.suit === "hearts" ? "♥" : dealtCard.suit === "diamonds" ? "♦" : dealtCard.suit === "clubs" ? "♣" : "♠"}
                              </span>
                            </div>
                          ) : (
                            <div className="playing-card card-back" />
                          )}
                        </div>
                      </div>
                      <div className="blackjack-players">
                        {blackjackPlayers.map((player, index) => (
                          <div key={player.id} className={`blackjack-player ${index === blackjackCurrentIndex ? "current-turn" : ""} ${player.busted ? "busted" : ""} ${player.stood ? "stood" : ""}`}>
                            <div className="player-header">
                              <span className="player-name">{player.name}</span>
                              <span className="player-value">{getHandValue(player.hand)}</span>
                            </div>
                            <div className="player-cards">
                              {player.hand.map((card, cardIndex) => (
                                <div key={cardIndex} className="playing-card">
                                  <span className="card-rank">{card.rank}</span>
                                  <span className={`card-suit ${card.suit === "hearts" || card.suit === "diamonds" ? "red" : "black"}`}>
                                    {card.suit === "hearts" ? "♥" : card.suit === "diamonds" ? "♦" : card.suit === "clubs" ? "♣" : "♠"}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {player.busted && <span className="status-label busted-label">BUSTED</span>}
                            {player.stood && <span className="status-label stood-label">STOOD</span>}
                            {index === blackjackCurrentIndex && !blackjackGameEnded && <span className="status-label current-label">PLAYING</span>}
                          </div>
                        ))}
                      </div>
                      {blackjackGameEnded && (
                        <div className="blackjack-result">
                          <span className="result-text">{blackjackWinner}</span>
                          <button className="primary-button" onClick={() => startBlackjackGame()}>New Game</button>
                        </div>
                      )}
                      {!blackjackGameEnded && blackjackPlayers[blackjackCurrentIndex]?.id === "player" && (
                        <div className="blackjack-actions">
                          <button className="action-button hit-button" onClick={() => {
                            const nextCard = blackjackDeck.length > 0 ? blackjackDeck[blackjackDeck.length - 1] : null;
                            setDealtCard(nextCard);
                            setShowDealAnimation(true);
                            setTimeout(() => {
                              void playBlackjackAction("hit");
                            }, 600);
                          }} disabled={busy}>
                            Hit
                          </button>
                          <button className="action-button stand-button" onClick={() => playBlackjackAction("stand")} disabled={busy}>
                            Stand
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="player-bar player-bottom">
                <div className="player-info"><span className="avatar user-avatar"><UserRound size={17} /></span><span className="player-name">You<span className="player-label">PLAYER 01</span></span></div>
                <span className="player-piece-label">{activeGame === "chess" ? "WHITE" : "X"}</span>
              </div>
            </div>

            <aside className="match-panel">
              <div className="match-panel-top"><span className="panel-overline">THE MATCH</span><span className="match-number">NO. {games.find((game) => game.id === activeGame)?.number}</span></div>
              <div className="versus-card">
                <div className="versus-player"><span className="avatar user-avatar"><UserRound size={17} /></span><span><b>You</b><small>HUMAN PLAYER</small></span><strong className="versus-symbol">{activeGame === "chess" ? "♙" : "X"}</strong></div>
                <div className="versus-divider"><span>VS</span></div>
                <div className="versus-player"><span className="avatar opponent-avatar"><Bot size={17} /></span><span><b>Ollama team</b><small>{opponentMode === "ollama" ? "STRATEGIST · CHALLENGER · REFEREE" : "LOCAL GAME ENGINE"}</small></span><strong className="versus-symbol opponent-symbol">{activeGame === "chess" ? "♟" : "O"}</strong></div>
              </div>
              <div className="match-detail-row balance-detail"><span><Target size={14} /> SESSION BALANCE</span><b>{playerWinRate === null ? "AWAITING RESULTS · 50% TARGET" : `${playerWinRate}% YOU · 50% TARGET`}</b></div>
              <div className="match-detail-row balance-detail"><span><Sparkles size={14} /> ADAPTIVE LEVEL</span><b>{challengeLabel}</b></div>
              <div className="panel-rule" />
              <div className="match-detail-row"><span><Clock3 size={14} /> STATUS</span><b className={result ? "status-result" : ""}>{busy ? "THINKING..." : result ? result.toUpperCase() : "IN PROGRESS"}</b></div>
              <div className="match-detail-row"><span><Sparkles size={14} /> AGENTS</span><b>{opponentMode === "ollama" ? "3 OLLAMA ROLES" : "LOCAL GAME AI"}</b></div>
              <div className="panel-rule" />
              <section className="chat-interface" aria-label="Chat with Ollama about the game">
                <div className="chat-heading">
                  <span><MessageSquareText size={15} /> CHAT WITH OLLAMA</span>
                  <small className={ollamaReady ? "chat-connected" : "chat-disconnected"}>{ollamaReady ? "MODEL READY" : "OLLAMA OFFLINE"}</small>
                </div>
                <div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
                  {chatMessages.length === 0
                    ? <p className="chat-empty">{ollamaReady ? "Ask about the board or why the agent team chose its move." : ollamaStatus}</p>
                    : chatMessages.map((message, index) => (
                        <div key={`${message.role}-${index}`} className={`chat-message ${message.role === "user" ? "chat-user" : message.role === "system" ? "chat-system" : message.role === "coach" ? "chat-coach" : "chat-assistant"}`}>
                        <span>{message.role === "user" ? "YOU" : message.role === "system" ? "NOTICE" : message.role === "coach" ? "COACH" : "OLLAMA"}</span>
                        <p>{message.content}</p>
                      </div>
                    ))}
                  {(chatBusy || coachBusy) && <p className="chat-typing">{coachBusy ? "Coach is reviewing your match..." : "Ollama Conversational agent is replying..."}</p>}
                </div>
                <form className="chat-form" onSubmit={sendChatMessage}>
                  <input
                    aria-label="Message Ollama"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder={ollamaReady ? "Ask the agent team about the game..." : "Start Ollama and load the model"}
                    maxLength={1000}
                    disabled={!ollamaReady || chatBusy || busy}
                  />
                  <button type="submit" aria-label="Send message" title="Send message" disabled={!chatInput.trim() || !ollamaReady || chatBusy || busy}>
                    {chatBusy ? <LoaderCircle size={15} className="chat-send-spinner" /> : <Send size={15} />}
                  </button>
                </form>
              </section>
              <button className="panel-new-game" onClick={() => resetGame()}><RotateCcw size={15} /> Reset this board</button>
              <div className="panel-footnote"><span className="footnote-line" /> STRATEGY IS A CONVERSATION.</div>
            </aside>
          </div>

          <div className="arena-footer"><span><span className="footer-indicator" />{opponentMode === "ollama" ? "OLLAMA AGENTS · STRATEGY / CHALLENGE / REFEREE" : ollamaStatus}</span><span>MAKE IT INTERESTING <ArrowUpRight size={13} /></span></div>
        </section>

        <footer className="page-footer"><span>THE THINKING ROOM <b>·</b> A FRIENDLY TEST OF WITS</span><span>BUILT FOR THE NEXT MOVE <ArrowDownRight size={13} /></span></footer>
      </main>
    </div>
  );
}