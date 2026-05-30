import pino from 'pino';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
        }
      : undefined,
});

export const logger = {
  info: (msg: string, ...args: any[]) => {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      pinoLogger.info(args[0], msg, ...args.slice(1));
    } else {
      pinoLogger.info(msg, ...args);
    }
  },
  debug: (msg: string, ...args: any[]) => {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      pinoLogger.debug(args[0], msg, ...args.slice(1));
    } else {
      pinoLogger.debug(msg, ...args);
    }
  },
  warn: (msg: string, ...args: any[]) => {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      pinoLogger.warn(args[0], msg, ...args.slice(1));
    } else {
      pinoLogger.warn(msg, ...args);
    }
  },
  error: (msg: string, ...args: any[]) => {
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      pinoLogger.error(args[0], msg, ...args.slice(1));
    } else {
      pinoLogger.error(msg, ...args);
    }
  }
};

export default logger;