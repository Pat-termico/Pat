export type SensorPayload = {
  t1: number;
  t2: number;
  temp: number;
  hum: number;
  pressure?: number;
  voc: number;
  raw: string;
  ts: number;
};

export type ConnectionStatus = {
  connected: boolean;
  portPath?: string;
  manufacturer?: string;
  baudRate?: number;
  error?: string;
  lastSeenTs?: number;
};
