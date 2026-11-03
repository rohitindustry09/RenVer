import { appNetworkName, dbNetworkName } from "./network-names";

export interface IsolationInput {
  projects: { id: string; container: string | null }[];
  databases: { id: string; container: string }[];
  /** Which apps use which database. */
  links: { projectId: string; databaseId: string }[];
}

export interface IsolationPlan {
  networks: string[];
  connects: { network: string; container: string }[];
  /** Containers to take off the old shared network once everything above is in place. */
  leaveShared: string[];
}

/**
 * What it takes to give every app and database a network of its own: an app sits on its own network plus the network of
 * each database it uses, and a database sits on its own network only. Pure, so it is easy to test.
 */
export function planIsolation(input: IsolationInput): IsolationPlan {
  const networks = new Set<string>();
  const connects: IsolationPlan["connects"] = [];
  const leaveShared: string[] = [];
  const containerOf = new Map(input.projects.map((p) => [p.id, p.container]));

  for (const database of input.databases) {
    const network = dbNetworkName(database.id);
    networks.add(network);
    connects.push({ network, container: database.container });
    leaveShared.push(database.container);
  }
  for (const project of input.projects) {
    if (!project.container) continue;
    const network = appNetworkName(project.id);
    networks.add(network);
    connects.push({ network, container: project.container });
    leaveShared.push(project.container);
  }
  const databaseContainer = new Map(input.databases.map((d) => [d.id, d.container]));
  for (const link of input.links) {
    const app = containerOf.get(link.projectId);
    if (app && databaseContainer.has(link.databaseId)) connects.push({ network: dbNetworkName(link.databaseId), container: app });
  }
  return { networks: [...networks], connects, leaveShared };
}
