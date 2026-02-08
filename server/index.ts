// Load environment variables from .env file FIRST
// This must happen before any other imports that might use process.env
import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Get the directory of the current file and resolve .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, "..", ".env");

// Explicitly load .env file to ensure it's loaded from the correct path
// (dotenv/config already loaded it, but this ensures the path is correct)
const envResult = config({ path: envPath, override: false });

if (envResult.error) {
  console.warn("⚠️  Could not load .env file:", envResult.error.message);
} else {
  const keyCount = Object.keys(envResult.parsed || {}).length;
  if (keyCount > 0) {
    console.log(`✅ Loaded ${keyCount} environment variable(s) from .env file`);
  }
  if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    console.log("✅ OpenAI API key detected");
  }
}

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { networkInterfaces } from "os";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// CORS middleware - allow requests from the same origin and handle preflight requests
// Updated to allow network access from other devices on the same network
app.use((req, res, next) => {
  // Allow requests from the same origin (localhost with any port) or from network IPs
  const origin = req.headers.origin;
  if (origin) {
    // Allow requests from localhost, 127.0.0.1, or any IP on the local network
    const allowedOrigins = [
      /^http:\/\/localhost(:\d+)?$/,
      /^http:\/\/127\.0\.0\.1(:\d+)?$/,
      /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/, // Local network IPs (192.168.x.x)
      /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,  // Private network IPs (10.x.x.x)
      /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+(:\d+)?$/, // Private network IPs (172.16-31.x.x)
    ];
    
    const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
    if (isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Get the local IP address for network access.
 * Returns the first non-internal IPv4 address found.
 */
function getLocalIPAddress(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (!nets) continue;
    
    for (const net of nets) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  // Fallback to localhost if no network IP found
  return "localhost";
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  // Listen on 0.0.0.0 to allow network access (not just localhost)
  // This makes the server accessible from other devices on the same network
  const host = process.env.HOST || "0.0.0.0";
  httpServer.listen(
    port,
    host,
    () => {
      log(`serving on http://localhost:${port}`);
      log(`Network access: http://${getLocalIPAddress()}:${port}`);
      log(`Share this URL with others on your network`);
    },
  );
})();
