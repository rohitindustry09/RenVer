import { dockerNetworkConnect, dockerNetworkDisconnect, ensureNetwork, APP_NETWORK } from "./docker";
import { listDatabaseRecords, listProjects } from "./db";
import { linkedProjectsFor } from "./databases";
import { planIsolation } from "./isolation-plan";
import { appNetworkName, dbNetworkName } from "./network-names";

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Gives every existing app and database a network of its own, and takes them off the old shared one. Safe to run again:
 * adding to a network is idempotent, and the old network is only left when every connection succeeded, so nothing is
 * cut off half way. Containers that no longer exist are skipped.
 */
export async function isolateNetworks(log: (line: string) => void = () => undefined): Promise<{ moved: number; complete: boolean }> {
  const databases = listDatabaseRecords().filter((d) => d.status !== "creating" && d.status !== "failed");
  const plan = planIsolation({
    projects: listProjects().map((p) => ({ id: p.id, container: p.container })),
    databases: databases.map((d) => ({ id: d.id, container: d.container })),
    links: databases.flatMap((d) => linkedProjectsFor(d).map((l) => ({ projectId: l.projectId, databaseId: d.id }))),
  });

  try {
    for (const network of plan.networks) await ensureNetwork(network);
  } catch (error) {
    log(`Could not create the isolated networks: ${message(error)}`);
    return { moved: 0, complete: false };
  }

  let complete = true;
  for (const { network, container } of plan.connects) {
    if (!(await dockerNetworkConnect(network, container))) {
      complete = false;
      log(`Could not connect ${container} to ${network} (it may have been removed).`);
    }
  }
  if (!complete) return { moved: 0, complete };

  for (const container of plan.leaveShared) await dockerNetworkDisconnect(APP_NETWORK, container);
  return { moved: plan.leaveShared.length, complete };
}

/** After an app starts, joins it to the network of every database it uses (the databases' own networks stay private). */
export async function joinLinkedDatabases(projectId: string, container: string, log: (line: string) => void): Promise<void> {
  for (const database of listDatabaseRecords()) {
    if (!linkedProjectsFor(database).some((l) => l.projectId === projectId)) continue;
    const network = dbNetworkName(database.id);
    await ensureNetwork(network);
    await dockerNetworkConnect(network, database.container);
    if (!(await dockerNetworkConnect(network, container))) log(`Could not connect the app to database ${database.name}.`);
  }
}

export { appNetworkName };
