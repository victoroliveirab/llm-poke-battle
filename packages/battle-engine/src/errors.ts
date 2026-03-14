export class InvalidMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoveError';
  }
}
