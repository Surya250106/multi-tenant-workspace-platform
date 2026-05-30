export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details: any[] = []
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
