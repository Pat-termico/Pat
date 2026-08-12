export {};

declare global {
  interface Window {
    DashboardArduino?: {
      socketUrl: string;
      appVersion: string;
      platform: string;
      exportCsv?: (args: {
        csvText?: string;
        rows?: {
          ts: number;
          t1?: number | null;
          t2?: number | null;
          t3?: number | null;
          temp?: number | null;
          hum?: number | null;
          pressure?: number | null;
          voc?: number | null;
        }[];
        defaultFileName?: string;
      }) => Promise<
        | { canceled: true }
        | { canceled: false; filePath: string; rows: number }
      >;
      listSerialPorts?: () => Promise<
        { path: string; manufacturer?: string; vendorId?: string; productId?: string }[]
      >;
      setSerialPort?: (portPath: string) => Promise<{ ok: true }>;
      runBackupManual?: () => Promise<
        | { ok: true; path?: string; rows: number; baseDir?: string }
        | { ok: false; error?: string }
      >;
      getBackupInfo?: () => Promise<{ baseDir?: string; rows: number }>;
    };
  }

  interface ImportMetaEnv {
    readonly VITE_SOCKET_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
