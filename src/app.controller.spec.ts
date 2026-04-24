import { AppController } from './app.controller';

describe('AppController', () => {
  it('should expose service health payload', () => {
    const appController = new AppController();
    const result = appController.getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('time-off-service');
    expect(typeof result.timestamp).toBe('string');
  });
});
