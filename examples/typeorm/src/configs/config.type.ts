export type Config = {
  redisUrl: string;
  cronManager: {
    replicaId: string;
    enabled: string;
    querySecret: string;
  };
};
