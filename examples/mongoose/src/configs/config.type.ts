export type Config = {
  redisUrl: string;
  cronManager: {
    replicaId: string;
    enabled: string;
    querySecret: string;
  };
  mongo: {
    uri: string;
    dbName: string;
  };
};
