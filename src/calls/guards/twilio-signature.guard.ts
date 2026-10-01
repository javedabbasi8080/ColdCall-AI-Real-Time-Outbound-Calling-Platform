import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { validateRequest } from 'twilio';
import { SettingsService } from '../../settings/settings.service';

@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  private readonly logger = new Logger(TwilioSignatureGuard.name);

  constructor(private readonly settingsService: SettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-twilio-signature'] as string;
    if (!signature) {
      this.logger.warn(`Rejected Twilio request: missing signature path=${request.url}`);
      throw new UnauthorizedException('Missing Twilio signature');
    }

    const authToken = await this.settingsService.get('TWILIO_AUTH_TOKEN');
    const webhookBase = await this.settingsService.get('TWILIO_WEBHOOK_BASE_URL');
    if (!authToken || !webhookBase) {
      this.logger.error('Twilio auth token or webhook base URL not configured');
      throw new UnauthorizedException('Twilio not configured');
    }

    const url = `${webhookBase.replace(/\/$/, '')}${request.url}`;
    const params = request.method === 'POST' ? request.body : {};

    const valid = validateRequest(authToken, signature, url, params);
    if (!valid) {
      this.logger.warn(
        `Invalid Twilio signature for url=${url} (check TWILIO_WEBHOOK_BASE_URL matches ngrok URL exactly)`,
      );
      throw new UnauthorizedException('Invalid Twilio signature');
    }
    return true;
  }
}
