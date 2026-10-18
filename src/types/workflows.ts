import type { JobOptions } from './jobs.js';

export interface WorkflowStep {
  name: string;
  payload: unknown;
  options?: JobOptions;
}

export interface WorkflowNode extends WorkflowStep {
  id?: string;
  dependsOn?: string[];
}

export interface WorkflowDefinition {
  id?: string;
  nodes: WorkflowNode[];
  metadata?: Record<string, unknown>;
}

export interface BatchResult {
  id: string;
  jobIds: string[];
}
