/** Each app and each database gets a Docker network of its own, so containers can only reach what they are linked to. */
export const appNetworkName = (projectId: string): string => `renver-app-${projectId}`;
export const dbNetworkName = (databaseId: string): string => `renver-db-${databaseId}`;
