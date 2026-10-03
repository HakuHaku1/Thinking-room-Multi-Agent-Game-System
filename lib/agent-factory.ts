import { askOllama, type OllamaSchema } from "./ollama";

/**
 * Core Agent interface for the AI Factory
 * All agents must implement this interface
 */
export interface Agent<T = unknown> {
  /** Unique identifier for this agent */
  id: string;
  /** Human-readable name for this agent */
  name: string;
  /** System prompt that defines the agent's role and behavior */
  systemPrompt: string;
  /** JSON schema for structured output */
  outputSchema: OllamaSchema;
  /** Execute the agent with given context and return structured result */
  execute(context: string): Promise<T>;
  /** Optional: Temperature for this agent (defaults to 0.2) */
  temperature?: number;
}

/**
 * Agent configuration for factory instantiation
 */
export interface AgentConfig<T = unknown> {
  id: string;
  name: string;
  systemPrompt: string;
  outputSchema: OllamaSchema;
  temperature?: number;
}

/**
 * Base implementation of an Agent using Ollama
 */
export class OllamaAgent<T = unknown> implements Agent<T> {
  public readonly id: string;
  public readonly name: string;
  public readonly systemPrompt: string;
  public readonly outputSchema: OllamaSchema;
  public readonly temperature: number;

  constructor(config: AgentConfig<T>) {
    this.id = config.id;
    this.name = config.name;
    this.systemPrompt = config.systemPrompt;
    this.outputSchema = config.outputSchema;
    this.temperature = config.temperature ?? 0.2;
  }

  async execute(context: string): Promise<T> {
    return askOllama<T>(
      this.systemPrompt,
      context,
      this.outputSchema,
    );
  }
}

/**
 * Agent Registry - manages available agent configurations
 * Allows dynamic registration and retrieval of agent types
 */
export class AgentRegistry {
  private static instance: AgentRegistry;
  private configs: Map<string, AgentConfig> = new Map();

  private constructor() {}

  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  /**
   * Register an agent configuration
   */
  register(config: AgentConfig): void {
    if (this.configs.has(config.id)) {
      throw new Error(`Agent with id "${config.id}" is already registered`);
    }
    this.configs.set(config.id, config);
  }

  /**
   * Get an agent configuration by id
   */
  get(id: string): AgentConfig | undefined {
    return this.configs.get(id);
  }

  /**
   * Check if an agent is registered
   */
  has(id: string): boolean {
    return this.configs.has(id);
  }

  /**
   * Get all registered agent ids
   */
  list(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Unregister an agent
   */
  unregister(id: string): boolean {
    return this.configs.delete(id);
  }

  /**
   * Clear all registered agents
   */
  clear(): void {
    this.configs.clear();
  }
}

/**
 * Agent Factory - creates agent instances from configurations
 */
export class AgentFactory {
  private registry: AgentRegistry;

  constructor(registry: AgentRegistry = AgentRegistry.getInstance()) {
    this.registry = registry;
  }

  /**
   * Create an agent instance by id
   */
  create<T = unknown>(id: string): Agent<T> {
    const config = this.registry.get(id);
    if (!config) {
      throw new Error(`Agent configuration "${id}" not found in registry`);
    }
    return new OllamaAgent<T>(config);
  }

  /**
   * Create multiple agent instances in parallel
   */
  createMany<T = unknown>(ids: string[]): Agent<T>[] {
    return ids.map((id) => this.create<T>(id));
  }

  /**
   * Create an agent with custom configuration (without registering)
   */
  createFromConfig<T = unknown>(config: AgentConfig<T>): Agent<T> {
    return new OllamaAgent<T>(config);
  }
}

/**
 * Convenience function to get the global agent factory
 */
export function getAgentFactory(): AgentFactory {
  return new AgentFactory(AgentRegistry.getInstance());
}

/**
 * Convenience function to get the global agent registry
 */
export function getAgentRegistry(): AgentRegistry {
  return AgentRegistry.getInstance();
}
