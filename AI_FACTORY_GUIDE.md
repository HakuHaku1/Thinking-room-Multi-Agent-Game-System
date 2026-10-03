# AI Factory Agent Guide

This guide explains how to use the AI Factory pattern to create and manage custom AI agents in your application.

## Overview

The AI Factory is a design pattern that allows you to:
- Define agent configurations (roles, prompts, output schemas)
- Dynamically instantiate agents from configurations
- Register and manage agents in a central registry
- Create multi-agent workflows with specialized roles

## Core Components

### 1. Agent Interface

All agents implement the `Agent<T>` interface:

```typescript
interface Agent<T = unknown> {
  id: string;              // Unique identifier
  name: string;            // Human-readable name
  systemPrompt: string;    // Role definition and behavior
  outputSchema: OllamaSchema;  // JSON schema for structured output
  execute(context: string): Promise<T>;  // Execute with context
  temperature?: number;    // Optional temperature (default: 0.2)
}
```

### 2. Agent Factory

The `AgentFactory` creates agent instances:

```typescript
import { getAgentFactory } from "@/lib/agent-factory";

const factory = getAgentFactory();

// Create an agent from a registered config
const agent = factory.create<OutputType>("agent-id");

// Create from custom config without registering
const agent = factory.createFromConfig<OutputType>(customConfig);

// Create multiple agents at once
const agents = factory.createMany<OutputType>(["agent-1", "agent-2"]);
```

### 3. Agent Registry

The `AgentRegistry` manages agent configurations:

```typescript
import { getAgentRegistry } from "@/lib/agent-factory";

const registry = getAgentRegistry();

// Register a new agent
registry.register(agentConfig);

// Check if agent exists
registry.has("agent-id");

// Get agent config
const config = registry.get("agent-id");

// List all registered agents
const ids = registry.list();

// Unregister an agent
registry.unregister("agent-id");
```

## Creating Custom Agents

### Step 1: Define the Output Type

First, define the TypeScript type for your agent's output:

```typescript
type CodeReviewOutput = {
  feedback: string;
  score: number;
  issues: string[];
};
```

### Step 2: Create the Output Schema

Define the JSON schema for structured output:

```typescript
const codeReviewSchema: OllamaSchema = {
  type: "object",
  properties: {
    feedback: { type: "string" },
    score: { type: "number", minimum: 1, maximum: 10 },
    issues: { type: "array", items: { type: "string" } },
  },
  required: ["feedback", "score", "issues"],
  additionalProperties: false,
};
```

### Step 3: Create the Agent Configuration

```typescript
import { AgentConfig } from "@/lib/agent-factory";

const codeReviewerConfig: AgentConfig<CodeReviewOutput> = {
  id: "code-reviewer",
  name: "Code Reviewer",
  systemPrompt: "You are a senior code reviewer. Analyze the provided code for bugs, security issues, and best practices. Provide constructive feedback and a quality score from 1-10.",
  outputSchema: codeReviewSchema,
  temperature: 0.3,  // Optional: higher for more creativity
};
```

### Step 4: Register the Agent (Optional)

```typescript
import { getAgentRegistry } from "@/lib/agent-factory";

const registry = getAgentRegistry();
registry.register(codeReviewerConfig);
```

### Step 5: Use the Agent

```typescript
import { getAgentFactory } from "@/lib/agent-factory";

const factory = getAgentFactory();

// Option 1: Create from registered config
const reviewer = factory.create<CodeReviewOutput>("code-reviewer");

// Option 2: Create directly from config
const reviewer = factory.createFromConfig<CodeReviewOutput>(codeReviewerConfig);

// Execute with context
const result = await reviewer.execute(
  "Review this TypeScript function:\n\n" + codeSnippet
);

console.log(result.feedback);  // "Good structure, but missing error handling"
console.log(result.score);      // 7
console.log(result.issues);     // ["Missing null check", "No try-catch"]
```

## Multi-Agent Workflows

The factory pattern excels at coordinating multiple specialized agents:

### Example: Content Creation Pipeline

```typescript
import { getAgentFactory } from "@/lib/agent-factory";

const factory = getAgentFactory();

// Define agents
const researcher = factory.createFromConfig<ResearchOutput>({
  id: "researcher",
  name: "Researcher",
  systemPrompt: "You research topics and provide key facts.",
  outputSchema: { /* schema */ },
});

const writer = factory.createFromConfig<DraftOutput>({
  id: "writer",
  name: "Writer",
  systemPrompt: "You write engaging content based on research.",
  outputSchema: { /* schema */ },
});

const editor = factory.createFromConfig<FinalOutput>({
  id: "editor",
  name: "Editor",
  systemPrompt: "You edit and polish content for clarity.",
  outputSchema: { /* schema */ },
});

// Execute workflow
const topic = "AI safety";
const research = await researcher.execute(`Research: ${topic}`);
const draft = await writer.execute(`Write article based on: ${JSON.stringify(research)}`);
const final = await editor.execute(`Edit this draft: ${draft.content}`);
```

### Example: Parallel Processing

```typescript
// Run multiple agents in parallel
const [analysis1, analysis2, analysis3] = await Promise.all([
  agent1.execute(context),
  agent2.execute(context),
  agent3.execute(context),
]);

// Combine results
const combined = {
  perspectives: [analysis1, analysis2, analysis3],
  consensus: findConsensus([analysis1, analysis2, analysis3]),
};
```

## Dynamic Agent Creation

Some agents need dynamic schemas based on runtime data:

```typescript
function createMultipleChoiceAgent(options: string[]): AgentConfig {
  return {
    id: "multiple-choice",
    name: "Multiple Choice Agent",
    systemPrompt: "Select the best option from the provided choices.",
    outputSchema: {
      type: "object",
      properties: {
        selected: { type: "string", enum: options },
        reasoning: { type: "string" },
      },
      required: ["selected", "reasoning"],
      additionalProperties: false,
    },
  };
}

// Use with dynamic options
const options = ["A", "B", "C", "D"];
const agent = factory.createFromConfig(createMultipleChoiceAgent(options));
```

## Built-in Game Agents

The project includes pre-configured game agents:

- **Conversational**: Chat about game state and moves
- **Coach**: Post-game analysis and feedback
- **Strategist**: Proposes attacking moves (dynamic schema)
- **Challenger**: Identifies threats and defenses (dynamic schema)
- **Referee**: Selects final move from proposals (dynamic schema)

See `lib/agent-configs.ts` for examples of these configurations.

## Best Practices

1. **Specific Prompts**: Make system prompts specific and role-focused
2. **Structured Output**: Always use JSON schemas for reliable parsing
3. **Temperature Tuning**: Lower (0.1-0.3) for factual tasks, higher (0.5-0.8) for creative tasks
4. **Error Handling**: Wrap agent execution in try-catch blocks
5. **Context Management**: Keep context concise to avoid token limits
6. **Agent Specialization**: Create focused agents with single responsibilities
7. **Registry Usage**: Register reusable agents, create ephemeral ones for one-off tasks

## Example: Complete Custom Agent

```typescript
// lib/custom-agents.ts
import { AgentConfig, getAgentRegistry } from "@/lib/agent-factory";

type SentimentOutput = {
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
  keyPhrases: string[];
};

export const SENTIMENT_AGENT: AgentConfig<SentimentOutput> = {
  id: "sentiment-analyzer",
  name: "Sentiment Analyzer",
  systemPrompt: "Analyze the sentiment of the provided text. Identify whether it's positive, negative, or neutral, your confidence level (0-1), and key phrases that influenced your decision.",
  outputSchema: {
    type: "object",
    properties: {
      sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      keyPhrases: { type: "array", items: { type: "string" } },
    },
    required: ["sentiment", "confidence", "keyPhrases"],
    additionalProperties: false,
  },
};

// Register on app initialization
export function registerCustomAgents() {
  const registry = getAgentRegistry();
  registry.register(SENTIMENT_AGENT);
}

// Usage
import { getAgentFactory } from "@/lib/agent-factory";

const factory = getAgentFactory();
const analyzer = factory.create<SentimentOutput>("sentiment-analyzer");
const result = await analyzer.execute("I love this product! It's amazing!");
// { sentiment: "positive", confidence: 0.95, keyPhrases: ["love", "amazing"] }
```

## API Integration

To use custom agents in API routes:

```typescript
// app/api/custom/route.ts
import { NextResponse } from "next/server";
import { getAgentFactory } from "@/lib/agent-factory";
import { SENTIMENT_AGENT } from "@/lib/custom-agents";

export async function POST(request: Request) {
  const { text } = await request.json();
  
  const factory = getAgentFactory();
  const analyzer = factory.createFromConfig(SENTIMENT_AGENT);
  
  try {
    const result = await analyzer.execute(text);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
```

## Advanced: Agent Composition

Create higher-level agents that orchestrate other agents:

```typescript
class OrchestratorAgent implements Agent<FinalOutput> {
  constructor(
    private factory: AgentFactory,
    private subAgents: string[]
  ) {}

  async execute(context: string): Promise<FinalOutput> {
    const agents = this.factory.createMany<SubOutput>(this.subAgents);
    
    // Run sub-agents
    const results = await Promise.all(
      agents.map(agent => agent.execute(context))
    );
    
    // Synthesize results
    return this.synthesize(results);
  }

  private synthesize(results: SubOutput[]): FinalOutput {
    // Custom synthesis logic
    return { /* combined result */ };
  }
}
```

## Troubleshooting

**Agent returns invalid JSON**: Ensure your output schema matches the LLM's response format. Try a more permissive schema or adjust the system prompt.

**Agent ignores constraints**: Make constraints explicit in the system prompt, not just the schema. Use phrases like "You MUST return only the required JSON format."

**Registry conflicts**: Use unique IDs for each agent. Unregister before re-registering if needed.

**Performance issues**: Run agents in parallel where possible. Keep context concise. Consider caching results for repeated queries.
