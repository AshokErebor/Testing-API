const fs = require("fs");
const path = require("path");

const logsDir = process.env.RAILWAY_ENVIRONMENT
  ? "/tmp/logs"
  : path.join(__dirname, "logs");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace("T", " ").substring(0, 19);
}

function addLog(level, message) {
  const date = new Date();
  const logFileName = `${date.toISOString().slice(0, 10).replace(/-/g, "")}.log`; // e.g. 2025-07-16.log
  const logFilePath = path.join(logsDir, logFileName);

  const timestamp = getTimestamp();
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

  fs.appendFile(logFilePath, logEntry, (err) => {
    if (err) {
      console.error("Failed to write log:", err);
    }
  });
}

function requestLogger(req, res, next) {
  const msg = `${req.method} ${req.originalUrl}`;
  addLog("info", msg);
  next();
}

// Log type shortcuts
const logger = {
  info: (msg) => addLog("info", msg),
  warn: (msg) => addLog("warn", msg),
  error: (msg) => addLog("error", msg),
  debug: (msg) => addLog("debug", msg),
};

module.exports = {
  logger,
  requestLogger,
};
