import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SettingsService } from '../settings/settings.service';
import { AuthService } from './auth.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: async (_request, _rawJwtToken, done) => {
        try {
          const secret =
            (await settingsService.get('JWT_SECRET')) ||
            configService.get<string>('jwtSecret');
          done(null, secret);
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.authService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }
}
