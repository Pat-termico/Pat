const { contextBridge, ipcRenderer } = require("electron");

function readArg(key) {
  const prefix = `--${key}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return "";
  return hit.slice(prefix.length);
}

const socketUrl = readArg("socketUrl");
const appVersion = readArg("appVersion");

contextBridge.exposeInMainWorld("DashboardArduino", {
  socketUrl,
  appVersion,
  platform: process.platform,
  exportCsv: (args) => ipcRenderer.invoke("dashboard:exportCsv", args),
  listSerialPorts: () => ipcRenderer.invoke("dashboard:listSerialPorts"),
  setSerialPort: (portPath) => ipcRenderer.invoke("dashboard:setSerialPort", { portPath }),
  runBackupManual: () => ipcRenderer.invoke("dashboard:runBackupManual"),
  getBackupInfo: () => ipcRenderer.invoke("dashboard:getBackupInfo")
});
