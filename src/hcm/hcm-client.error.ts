export class HcmClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }

  isValidationError(): boolean {
    return [400, 404, 409, 422].includes(this.statusCode);
  }
}
