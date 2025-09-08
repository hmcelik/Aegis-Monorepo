import { NodeSDK } from '@opentelemetry/sdk-node';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import winston from 'winston';

export interface TelemetryConfig {
  serviceName: string;
  jaegerEndpoint?: string;
  logLevel?: string;
}

export class TelemetryService {
  private sdk: NodeSDK;
  private tracer: any;
  public logger: winston.Logger;

  constructor(config: TelemetryConfig) {
    // Initialize OpenTelemetry
    this.sdk = new NodeSDK({
      serviceName: config.serviceName,
      traceExporter: config.jaegerEndpoint
        ? new JaegerExporter({ endpoint: config.jaegerEndpoint })
        : undefined,
    });

    this.sdk.start();
    this.tracer = trace.getTracer(config.serviceName);

    // Initialize Winston logger
    this.logger = winston.createLogger({
      level: config.logLevel || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          // Redact sensitive information
          const sanitizedMeta = this.redactSensitiveData(meta);
          return JSON.stringify({
            timestamp,
            level,
            message,
            ...sanitizedMeta,
          });
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
      ],
    });
  }

  private redactSensitiveData(data: any): any {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization'];
    const redacted = { ...data };

    const redactRecursive = (obj: any): any => {
      if (typeof obj !== 'object' || obj === null) return obj;

      const result: any = Array.isArray(obj) ? [] : {};

      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
          result[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          result[key] = redactRecursive(value);
        } else {
          result[key] = value;
        }
      }

      return result;
    };

    return redactRecursive(redacted);
  }

  createSpan(name: string, attributes?: Record<string, string | number>) {
    const span = this.tracer.startSpan(name, { attributes });

    return {
      setAttributes: (attrs: Record<string, string | number>) => span.setAttributes(attrs),
      setStatus: (status: { code: SpanStatusCode; message?: string }) => span.setStatus(status),
      recordException: (error: Error) => span.recordException(error),
      end: () => span.end(),
      span, // For advanced usage
    };
  }

  async shutdown(): Promise<void> {
    await this.sdk.shutdown();
  }
}

// Global telemetry instance
let globalTelemetry: TelemetryService | null = null;

export function initializeTelemetry(config: TelemetryConfig): TelemetryService {
  globalTelemetry = new TelemetryService(config);
  return globalTelemetry;
}

export function getTelemetry(): TelemetryService {
  if (!globalTelemetry) {
    throw new Error('Telemetry not initialized. Call initializeTelemetry() first.');
  }
  return globalTelemetry;
}
