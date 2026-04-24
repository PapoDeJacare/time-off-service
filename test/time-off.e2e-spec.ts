import { randomUUID } from 'node:crypto';
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { AddressInfo } from 'node:net';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

class MockHcmServer {
  private readonly balances = new Map<string, number>();
  private readonly invalidLocations = new Set<string>();
  private readonly server: Server;
  private port = 0;

  constructor() {
    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server.address() as AddressInfo;
        this.port = address.port;
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  reset(): void {
    this.balances.clear();
    this.invalidLocations.clear();
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  setBalance(
    employeeId: string,
    locationId: string,
    availableDays: number,
  ): void {
    this.balances.set(
      this.key(employeeId, locationId),
      this.round(availableDays),
    );
  }

  getBalance(employeeId: string, locationId: string): number | undefined {
    return this.balances.get(this.key(employeeId, locationId));
  }

  setInvalidLocation(locationId: string): void {
    this.invalidLocations.add(locationId);
  }

  private key(employeeId: string, locationId: string): string {
    return `${employeeId}::${locationId}`;
  }

  private round(value: number): number {
    return Number.parseFloat(value.toFixed(2));
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (method === 'POST' && url.pathname === '/time-off/validate-deduction') {
      const body = await this.readJsonBody(req);
      const employeeId = this.getString(body, 'employeeId');
      const locationId = this.getString(body, 'locationId');
      const daysRequested = this.getNumber(body, 'daysRequested');

      if (!employeeId || !locationId || daysRequested === undefined) {
        this.writeJson(res, 400, { message: 'Invalid HCM deduction payload.' });
        return;
      }

      if (this.invalidLocations.has(locationId)) {
        this.writeJson(res, 400, {
          message: 'Invalid employee/location dimension.',
        });
        return;
      }

      const balanceKey = this.key(employeeId, locationId);
      const currentBalance = this.balances.get(balanceKey);

      if (currentBalance === undefined) {
        this.writeJson(res, 404, {
          message: 'No HCM balance found for employee/location.',
        });
        return;
      }

      if (currentBalance < daysRequested) {
        this.writeJson(res, 409, { message: 'Insufficient HCM balance.' });
        return;
      }

      const nextBalance = this.round(currentBalance - daysRequested);
      this.balances.set(balanceKey, nextBalance);

      this.writeJson(res, 200, {
        transactionId: `hcm-${randomUUID()}`,
        remainingBalance: nextBalance,
      });
      return;
    }

    const match = url.pathname.match(/^\/balances\/([^/]+)\/([^/]+)$/);

    if (method === 'GET' && match) {
      const employeeId = decodeURIComponent(match[1]);
      const locationId = decodeURIComponent(match[2]);
      const currentBalance = this.balances.get(
        this.key(employeeId, locationId),
      );

      if (currentBalance === undefined) {
        this.writeJson(res, 404, {
          message: 'No HCM balance found for employee/location.',
        });
        return;
      }

      this.writeJson(res, 200, {
        employeeId,
        locationId,
        availableDays: currentBalance,
      });
      return;
    }

    this.writeJson(res, 404, { message: 'Not found' });
  }

  private async readJsonBody(
    req: IncomingMessage,
  ): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
        continue;
      }

      if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      }
    }

    if (chunks.length === 0) {
      return {};
    }

    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<
        string,
        unknown
      >;
    } catch {
      return {};
    }
  }

  private getString(
    body: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = body[key];

    return typeof value === 'string' ? value : undefined;
  }

  private getNumber(
    body: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const value = body[key];

    return typeof value === 'number' ? value : undefined;
  }

  private writeJson(
    res: ServerResponse,
    statusCode: number,
    payload: Record<string, unknown>,
  ): void {
    res.statusCode = statusCode;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(payload));
  }
}

describe('Time-Off service (e2e)', () => {
  let app: INestApplication<App>;
  let hcmServer: MockHcmServer;

  beforeAll(async () => {
    hcmServer = new MockHcmServer();
    await hcmServer.start();
  });

  beforeEach(async () => {
    hcmServer.reset();

    process.env.DB_PATH = ':memory:';
    process.env.DB_SYNCHRONIZE = 'true';
    process.env.HCM_BASE_URL = hcmServer.baseUrl;
    process.env.HCM_TIMEOUT_MS = '1500';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await hcmServer.stop();
  });

  it('approves a request when local and HCM balances are valid', async () => {
    hcmServer.setBalance('emp-1', 'loc-1', 10);

    await request(app.getHttpServer())
      .post('/api/v1/hcm/sync/realtime')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        availableDays: 10,
      })
      .expect(201);

    const createdRequest = await request(app.getHttpServer())
      .post('/api/v1/time-off/requests')
      .send({
        employeeId: 'emp-1',
        locationId: 'loc-1',
        startDate: '2026-05-10',
        endDate: '2026-05-11',
        daysRequested: 2,
        reason: 'Vacation',
        idempotencyKey: 'idem-approve-1',
      })
      .expect(201);

    const createdRequestBody = createdRequest.body as { id: string };
    const requestId = createdRequestBody.id;

    const approvedRequest = await request(app.getHttpServer())
      .post(`/api/v1/time-off/requests/${requestId}/approve`)
      .send({ managerId: 'mgr-1' })
      .expect(201);

    const approvedRequestBody = approvedRequest.body as {
      status?: string;
    };

    expect(approvedRequestBody.status).toBe('APPROVED');

    const localBalance = await request(app.getHttpServer())
      .get('/api/v1/balances/emp-1/loc-1')
      .expect(200);

    const localBalanceBody = localBalance.body as {
      availableDays?: number;
    };

    expect(localBalanceBody.availableDays).toBe(8);
    expect(hcmServer.getBalance('emp-1', 'loc-1')).toBe(8);
  });

  it('rejects creation when local balance is insufficient', async () => {
    hcmServer.setBalance('emp-2', 'loc-1', 1);

    await request(app.getHttpServer())
      .post('/api/v1/hcm/sync/realtime')
      .send({
        employeeId: 'emp-2',
        locationId: 'loc-1',
        availableDays: 1,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/time-off/requests')
      .send({
        employeeId: 'emp-2',
        locationId: 'loc-1',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        daysRequested: 2,
      })
      .expect(409);
  });

  it('marks request as rejected when HCM rejects approval', async () => {
    hcmServer.setBalance('emp-3', 'loc-1', 1);

    await request(app.getHttpServer())
      .post('/api/v1/hcm/sync/realtime')
      .send({
        employeeId: 'emp-3',
        locationId: 'loc-1',
        availableDays: 10,
      })
      .expect(201);

    const createdRequest = await request(app.getHttpServer())
      .post('/api/v1/time-off/requests')
      .send({
        employeeId: 'emp-3',
        locationId: 'loc-1',
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        daysRequested: 2,
      })
      .expect(201);

    const createdRequestBody = createdRequest.body as { id: string };
    const requestId = createdRequestBody.id;

    await request(app.getHttpServer())
      .post(`/api/v1/time-off/requests/${requestId}/approve`)
      .send({ managerId: 'mgr-3' })
      .expect(409);

    const storedRequest = await request(app.getHttpServer())
      .get(`/api/v1/time-off/requests/${requestId}`)
      .expect(200);

    const storedRequestBody = storedRequest.body as {
      status?: string;
      rejectionReason?: string;
    };

    expect(storedRequestBody.status).toBe('REJECTED');
    expect(storedRequestBody.rejectionReason).toContain(
      'HCM rejected approval',
    );
  });

  it('supports idempotent request creation', async () => {
    hcmServer.setBalance('emp-4', 'loc-2', 5);

    await request(app.getHttpServer())
      .post('/api/v1/hcm/sync/realtime')
      .send({
        employeeId: 'emp-4',
        locationId: 'loc-2',
        availableDays: 5,
      })
      .expect(201);

    const payload = {
      employeeId: 'emp-4',
      locationId: 'loc-2',
      startDate: '2026-08-10',
      endDate: '2026-08-10',
      daysRequested: 1,
      idempotencyKey: 'idem-create-1',
    };

    const firstRequest = await request(app.getHttpServer())
      .post('/api/v1/time-off/requests')
      .send(payload)
      .expect(201);

    const secondRequest = await request(app.getHttpServer())
      .post('/api/v1/time-off/requests')
      .send(payload)
      .expect(201);

    const firstRequestBody = firstRequest.body as { id: string };
    const secondRequestBody = secondRequest.body as { id: string };

    expect(firstRequestBody.id).toBe(secondRequestBody.id);
  });

  it('processes batch sync and reconciliation against HCM', async () => {
    hcmServer.setBalance('emp-5', 'loc-1', 20);

    const batchResponse = await request(app.getHttpServer())
      .post('/api/v1/hcm/sync/batch')
      .send({
        snapshotId: 'snapshot-2026-01',
        balances: [
          {
            employeeId: 'emp-5',
            locationId: 'loc-1',
            availableDays: 12,
          },
          {
            employeeId: 'emp-6',
            locationId: 'loc-2',
            availableDays: 9,
          },
        ],
      })
      .expect(201);

    const batchResponseBody = batchResponse.body as {
      updatedCount?: number;
    };

    expect(batchResponseBody.updatedCount).toBe(2);

    const localBeforeReconcile = await request(app.getHttpServer())
      .get('/api/v1/balances/emp-5/loc-1')
      .expect(200);

    const localBeforeReconcileBody = localBeforeReconcile.body as {
      availableDays?: number;
    };

    expect(localBeforeReconcileBody.availableDays).toBe(12);

    await request(app.getHttpServer())
      .post('/api/v1/hcm/sync/reconcile/emp-5/loc-1')
      .expect(201);

    const localAfterReconcile = await request(app.getHttpServer())
      .get('/api/v1/balances/emp-5/loc-1')
      .expect(200);

    const localAfterReconcileBody = localAfterReconcile.body as {
      availableDays?: number;
    };

    expect(localAfterReconcileBody.availableDays).toBe(20);
  });
});
