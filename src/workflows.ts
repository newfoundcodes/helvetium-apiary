/*
 * Helvetium Apiary - Helvetium Framework, A Newfoundcodes project.
 *
 * Copyright (C) 2026 Jonathan Eldy Baldivicio
 *
 * Author: Jonathan Eldy Baldivicio
 * Contact: jonathaneldy.baldivicio@newfoundcodes.com
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import type { Apiary } from './apiary.js';
import type { JobOptions, JobRecord } from './types/jobs.js';
import type { BatchResult, WorkflowDefinition, WorkflowStep } from './types/workflows.js';

export type { WorkflowDefinition, WorkflowNode } from './types/workflows.js';

export async function enqueueBatch(
  apiary: Apiary,
  steps: WorkflowStep[],
  options: { id?: string; queue?: string } = {},
): Promise<BatchResult> {
  const id = options.id ?? `batch-${apiary.createId()}`;
  const jobs: JobRecord[] = [];

  for (const step of steps) {
    jobs.push(
      await apiary.add(step.name, step.payload, {
        ...(step.options ?? {}),
        queue: step.options?.queue ?? options.queue,
        batchId: id,
      }),
    );
  }

  return { id, jobIds: jobs.map((job) => job.id) };
}

export async function enqueueChain(
  apiary: Apiary,
  steps: WorkflowStep[],
  options: { id?: string; queue?: string; dependencyPolicy?: JobOptions['dependencyPolicy'] } = {},
): Promise<BatchResult> {
  const id = options.id ?? `workflow-${apiary.createId()}`;
  const jobs: JobRecord[] = [];

  let previous: string | undefined;
  for (const step of steps) {
    const job = await apiary.add(step.name, step.payload, {
      ...(step.options ?? {}),
      queue: step.options?.queue ?? options.queue,
      workflowId: id,
      dependsOn: previous
        ? [...(step.options?.dependsOn ?? []), previous]
        : step.options?.dependsOn,
      dependencyPolicy: step.options?.dependencyPolicy ?? options.dependencyPolicy ?? 'all-success',
    });

    jobs.push(job);
    previous = job.id;
  }

  return { id, jobIds: jobs.map((job) => job.id) };
}

export async function enqueueWorkflow(
  apiary: Apiary,
  definition: WorkflowDefinition,
): Promise<BatchResult> {
  const workflowId = definition.id ?? `workflow-${apiary.createId()}`;
  const nodeIds = new Map<string, string>();
  const pending = new Map(
    definition.nodes.map((node, index) => [node.id ?? `node-${index}`, node]),
  );

  const jobs: JobRecord[] = [];
  while (pending.size) {
    let progressed = false;
    for (const [nodeKey, node] of [...pending]) {
      const deps = node.dependsOn ?? [];
      if (deps.some((dep) => !nodeIds.has(dep))) {
        continue;
      }

      const job = await apiary.add(node.name, node.payload, {
        ...(node.options ?? {}),
        workflowId,
        dependsOn: [...(node.options?.dependsOn ?? []), ...deps.map((dep) => nodeIds.get(dep)!)],
        metadata: {
          ...(node.options?.metadata ?? {}),
          ...(definition.metadata ?? {}),
          workflowNode: nodeKey,
        },
      });

      nodeIds.set(nodeKey, job.id);
      jobs.push(job);
      pending.delete(nodeKey);

      progressed = true;
    }

    if (!progressed) {
      throw new Error('Workflow graph contains a cycle or unknown dependency');
    }
  }

  return { id: workflowId, jobIds: jobs.map((job) => job.id) };
}

export async function batchStatus(
  apiary: Apiary,
  batchId: string,
): Promise<{
  total: number;
  completed: number;
  failed: number;
  active: number;
  pending: number;
  done: boolean;
}> {
  const jobs = await apiary.list({ batchId });
  const completed = jobs.filter((j) => j.state === 'completed').length;
  const failed = jobs.filter((j) => ['failed', 'dead', 'cancelled'].includes(j.state)).length;
  const active = jobs.filter((j) => j.state === 'active').length;
  const pending = jobs.filter((j) => ['waiting', 'scheduled'].includes(j.state)).length;
  return {
    total: jobs.length,
    completed,
    failed,
    active,
    pending,
    done: completed + failed === jobs.length,
  };
}

export async function workflowStatus(apiary: Apiary, workflowId: string) {
  const jobs = await apiary.list({ workflowId });
  return {
    id: workflowId,
    jobs,
    done:
      jobs.length > 0 &&
      jobs.every((j) => ['completed', 'failed', 'dead', 'cancelled'].includes(j.state)),
    successful: jobs.length > 0 && jobs.every((j) => j.state === 'completed'),
  };
}
