export type Config = {
  redisUrl: string;
  cronManager: {
    enabled: string;
    querySecret: string;
  };
};
