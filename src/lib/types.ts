export type SensorPayload = {
  t1: number | null;
  t2: number | null;
  t3: number | null;
  temp: number | null;
  hum: number | null;
  pressure: number | null;
  voc: number | null;
  raw: string;
  ts: number;
  legacy?: boolean;
};

export type ConnectionStatus = {
  connected: boolean;
  portPath?: string;
  manufacturer?: string;
  baudRate?: number;
  error?: string;
  lastSeenTs?: number;
};
