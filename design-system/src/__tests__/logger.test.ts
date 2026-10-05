import { logger } from '../utils/logger';

describe('design-system logger', () => {
  const originalEnv = process.env.NODE_ENV;
  let debugSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.NODE_ENV = originalEnv;
  });

  describe('non-production routing', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    it('routes debug to console.debug', () => {
      logger.debug('hello');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenCalledWith('hello');
    });

    it('routes info to console.info', () => {
      logger.info('hi');
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith('hi');
    });

    it('routes warn to console.warn', () => {
      logger.warn('careful');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith('careful');
    });

    it('routes error to console.error', () => {
      logger.error('boom');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('boom');
    });

    it('forwards metadata/object arguments unchanged', () => {
      const meta = { file: 'colors.json', count: 3 };
      logger.warn('Failed to load:', meta);
      expect(warnSpy).toHaveBeenCalledWith('Failed to load:', meta);
    });

    it('supports a no-argument call without throwing', () => {
      expect(() => logger.info()).not.toThrow();
      expect(infoSpy).toHaveBeenCalledWith();
    });
  });

  describe('production level gating', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('suppresses debug, info, and warn', () => {
      logger.debug('d');
      logger.info('i');
      logger.warn('w');
      expect(debugSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('still emits error in production', () => {
      logger.error('critical', { code: 500 });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith('critical', { code: 500 });
    });

    it('does not throw when process is unavailable', () => {
      // Cast to any to satisfy strict TypeScript: the `delete` operator requires
      // the property to be optional, but we need to temporarily remove it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const globalWithProcess = global as any;
      const originalProcess = globalWithProcess.process;

      // Temporarily hide process to simulate a non-Node runtime.
      globalWithProcess.process = undefined;

      try {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const isolatedLogger = require('../utils/logger').logger as typeof logger;
          expect(() => isolatedLogger.debug('hello')).not.toThrow();
        });
      } finally {
        globalWithProcess.process = originalProcess;
      }
    });
  });
});
