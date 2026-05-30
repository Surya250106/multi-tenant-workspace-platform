import { logger } from '../../src/utils/logger';
import pino from 'pino';

jest.mock('pino', () => {
  const mPino = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return jest.fn(() => mPino);
});

describe('Structured JSON Logger Tests', () => {
  const mockPino = pino() as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should forward info logs with metadata to pino', () => {
    logger.info('Test Info Message', { metaKey: 'metaVal' });
    expect(mockPino.info).toHaveBeenCalledWith({ metaKey: 'metaVal' }, 'Test Info Message');
  });

  it('should correctly capture and forward error instances to pino', () => {
    const errorInstance = new Error('Database connection reset');
    logger.error('Database connection failure', errorInstance, { context: 'seeding' });
    expect(mockPino.error).toHaveBeenCalledWith(errorInstance, 'Database connection failure', { context: 'seeding' });
  });
});
