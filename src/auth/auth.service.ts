import {
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { SettingsService } from '../settings/settings.service';
import { RegisterDto } from './dto/register.dto';
import { User, UserDocument, UserRole } from './schemas/user.schema';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit() {
    const count = await this.userModel.countDocuments().exec();
    if (count === 0) {
      const password = await bcrypt.hash('admin123', 10);
      await this.userModel.create({
        email: 'admin@coldcalling.local',
        password,
        name: 'System Admin',
        role: UserRole.ADMIN,
      });
    }
  }

  async validateUser(email: string, password: string): Promise<UserDocument | null> {
    const user = await this.userModel.findOne({ email: email.toLowerCase() }).exec();
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.password);
    return valid ? user : null;
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const secret = (await this.settingsService.get('JWT_SECRET')) ||
      this.configService.get<string>('jwtSecret');
    const payload = { sub: user._id.toString(), email: user.email, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload, { secret }),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() }).exec();
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      password,
      name: dto.name,
      role: dto.role,
    });
    return {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }
}
