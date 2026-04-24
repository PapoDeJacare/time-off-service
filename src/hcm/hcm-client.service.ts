import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { roundDays } from '../common/day-math.util';
import { HcmClientError } from './hcm-client.error';

export type HcmDeductionRequest = {
  requestId: string;
  employeeId: string;
  locationId: string;
  daysRequested: number;
};

export type HcmDeductionResult = {
  transactionId: string;
  remainingBalance?: number;
};

export type HcmBalanceResult = {
  employeeId: string;
  locationId: string;
  availableDays: number;
};

@Injectable()
export class HcmClientService {
  constructor(private readonly configService: ConfigService) {}

  async validateAndDeduct(
    request: HcmDeductionRequest,
  ): Promise<HcmDeductionResult> {
    const payload = await this.request<HcmDeductionResult>(
      '/time-off/validate-deduction',
      {
        method: 'POST',
        headers: {
          'x-request-id': request.requestId,
        },
        body: JSON.stringify(request),
      },
    );

    return {
      transactionId: payload.transactionId,
      remainingBalance:
        typeof payload.remainingBalance === 'number'
          ? roundDays(payload.remainingBalance)
          : undefined,
    };
  }

  async getBalance(
    employeeId: string,
    locationId: string,
  ): Promise<HcmBalanceResult> {
    const path = `/balances/${encodeURIComponent(employeeId)}/${encodeURIComponent(
      locationId,
    )}`;

    const payload = await this.request<HcmBalanceResult>(path, {
      method: 'GET',
    });

    return {
      employeeId,
      locationId,
      availableDays: roundDays(Number(payload.availableDays)),
    };
  }

  private get timeoutMs(): number {
    const configured = Number(this.configService.get<string>('HCM_TIMEOUT_MS'));

    return Number.isFinite(configured) && configured > 0 ? configured : 3000;
  }

  private get baseUrl(): string {
    return (
      this.configService.get<string>('HCM_BASE_URL') ?? 'http://127.0.0.1:4001'
    );
  }

  private async request<T extends Record<string, unknown>>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
    } catch {
      throw new HcmClientError('HCM API is unavailable.', 503);
    } finally {
      clearTimeout(timeout);
    }

    const body = await this.parseBody(response);

    if (!response.ok) {
      const message =
        typeof body.message === 'string'
          ? body.message
          : `HCM request failed with status ${response.status}.`;

      throw new HcmClientError(message, response.status);
    }

    return body as T;
  }

  private async parseBody(
    response: Response,
  ): Promise<Record<string, unknown>> {
    const contentType = response.headers.get('content-type') ?? '';

    if (!contentType.includes('application/json')) {
      const text = await response.text();

      return text ? { message: text } : {};
    }

    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
