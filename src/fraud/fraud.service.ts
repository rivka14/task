import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  async validate(): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const isValid = Math.random() < 0.5;
    this.logger.log(`Fraud validation result: ${isValid ? 'valid' : 'invalid'}`);
    return isValid;
  }
}
