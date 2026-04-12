import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginUserDto, ResetPasswordDto, RecoverPasswordDto } from './dto';
import { ApiResponse } from 'src/common/interfaces/api-response.interface';
import { LoginUserResponseData } from './interfaces/LoginUserResponseData';
import { JwtPayload } from './interfaces/JwtPayload';
import { EmailService } from 'src/email/email.service';
import {
  getEmailLogoAttachment,
  recoverPasswordEmailTemplate,
} from 'src/email/email-templates.helper';
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

    if (!user) throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');
    if (!bcrypt.compareSync(password, user.password))
      throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');

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
      // Ignorar
    }

    return { message: 'Sesión cerrada exitosamente' };
  }

  async recoverPassword(recoverPasswordDto: RecoverPasswordDto) {
    const { email } = recoverPasswordDto;

    const user = await this.userModel.findOne({ email }).lean();

    if (!user) {
      throw new NotFoundException(`No existe un usuario asociado al correo: ${email}`);
    }

    if (user.isActive === false) {
      throw new ForbiddenException(
        'Cuenta inactiva. Un administrador debe reactivarla.',
      );
    }

    const recoveryToken = this.getJwtToken({ id: user.id });
    const recoveryLink = `http://${process.env.FRONTEND_PATH}/auth/reset-password?token=${recoveryToken}`;

    const htmlBody = recoverPasswordEmailTemplate(recoveryLink);
    const logoAtt = getEmailLogoAttachment();

    const emailSent = await this.emailService.sendEmail({
      to: email,
      subject: 'Recuperación de Contraseña - Cheky',
      htmlBody: htmlBody,
      attachements: logoAtt ? [logoAtt] : [],
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

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { password, token } = resetPasswordDto;

    // Verificar en la blacklist primero
    const isBlacklisted = await this.blacklistedTokenModel.findOne({ token });
    if (isBlacklisted) {
      throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');
    }

    let decoded: any;
    try {
      decoded = this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');
    }

    const userId = decoded.id;
    const user = await this.userModel.findOne({ id: userId });

    if (!user) {
      throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');
    }

    if (user.isActive === false) {
      throw new ForbiddenException(
        'Cuenta inactiva. Un administrador debe reactivarla.',
      );
    }

    // Encriptar la nueva clave
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    // Actualizar clave en BD
    await this.userModel.findOneAndUpdate({ id: user.id }, { password: hashedPassword });
    
    // Invalidar el token para que no se pueda volver a usar
    await this.logout(token);

    return {
      success: true,
      message: '¡Tu contraseña ha sido actualizada exitosamente!',
    };
  }
}

