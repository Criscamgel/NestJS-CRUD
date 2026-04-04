import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto';
import { ApiResponse } from 'src/common/interfaces/api-response.interface';
import { LoginUserResponseData } from './interfaces/LoginUserResponseData';
import { JwtPayload } from './interfaces/JwtPayload';
import { RecoverPasswordDto } from './dto/recover-password.dto';
import { EmailService } from 'src/email/email.service';
import { BlacklistedToken } from './entities/blacklisted-token.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(BlacklistedToken.name)
    private readonly blacklistedTokenModel: Model<BlacklistedToken>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  private getJwtToken(payload: JwtPayload) {
    const token = this.jwtService.sign(payload);
    return token;
  }

  async login(
    loginUserDto: LoginUserDto,
  ): Promise<ApiResponse<LoginUserResponseData>> {
    const { password, email } = loginUserDto;

    const user = await this.userModel
      .findOne({ email })
      .select('email password id')
      .lean();

    if (!user) throw new UnauthorizedException('Usuario no encontrado (email)');
    if (!bcrypt.compareSync(password, user.password))
      throw new UnauthorizedException('Contraseña invalida o incorrecta');

    return {
      success: true,
      message: 'Bienvenido a Cheky!!!',
      data: {
        accessToken: this.getJwtToken({ id: user.id }),
        user: {
          id: user.id,
          email: user.email,
          password: user.password,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  async logout(token: string) {
    if (!token) {
      throw new BadRequestException('Falta enviar el token a invalidar');
    }

    try {
      const decoded: any = this.jwtService.decode(token);
      if (decoded && decoded.exp) {
        await this.blacklistedTokenModel.create({
          token,
          expiresAt: new Date(decoded.exp * 1000)
        });
      }
    } catch (e) {
      // Ignorar si el token no se pudo decodificar (por ejemplo, es inválido o corrupto)
    }

    return { message: 'Sesión cerrada exitosamente' };
  }

  async recoverPassword(recoverPasswordDto: RecoverPasswordDto) {
    const { email } = recoverPasswordDto;

    const user = await this.userModel.findOne({ email }).lean();

    if (!user) {
      throw new NotFoundException(`No existe un usuario asociado al correo: ${email}`);
    }

    const recoveryToken = this.getJwtToken({ id: user.id });
    const recoveryLink = `http://localhost:${process.env.PORT}/auth/reset-password?token=${recoveryToken}`;

    const htmlBody = `
      <h3>Recuperación de Contraseña</h3>
      <p>Has solicitado recuperar tu contraseña. Haz clic en el siguiente enlace para continuar:</p>
      <br>
      <a href="${recoveryLink}" style="padding: 10px 15px; background-color: #007BFF; color: white; text-decoration: none; border-radius: 5px;">Recuperar Contraseña</a>
      <br><br>
      <p>Si no has solicitado este cambio, puedes ignorar este correo de forma segura.</p>
    `;

    const emailSent = await this.emailService.sendEmail({
      to: email,
      subject: 'Recuperación de Contraseña - Cheky',
      htmlBody: htmlBody,
    });

    if (!emailSent) {
      throw new BadRequestException('Ha ocurrido un error interno al intentar enviar el correo. Por favor intente más tarde.');
    }

    return {
      success: true,
      message: 'Correo de recuperación enviado exitosamente. Verifica tu bandeja de entrada o spam.',
      timestamp: new Date().toISOString(),
    };
  }
}
