import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginUserDto, ResetPasswordDto, RecoverPasswordDto, ChangePasswordDto } from './dto';
import { ApiResponse } from 'src/common/interfaces/api-response.interface';
import { LoginUserResponseData } from './interfaces/LoginUserResponseData';
import { JwtPayload } from './interfaces/JwtPayload';
import { EmailService } from 'src/email/email.service';
import {
  getEmailLogoAttachment,
  passwordChangedNotificationTemplate,
  recoverPasswordEmailTemplate,
} from 'src/email/email-templates.helper';
import { BlacklistedToken } from './entities/blacklisted-token.entity';
import { User } from '../users/entities/user.entity';
import { PublicUser } from '../users/interfaces/public-user.interface';
import { INACTIVE_ACCOUNT_MESSAGE } from './auth.constants';
import {
  getFrontendBaseUrl,
  isUserMarkedInactive,
  normalizeAuthEmail,
} from './auth.utils';
import { MembershipsService } from 'src/memberships/memberships.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(BlacklistedToken.name)
    private readonly blacklistedTokenModel: Model<BlacklistedToken>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => MembershipsService))
    private readonly membershipsService: MembershipsService,
  ) {}

  private getJwtToken(payload: JwtPayload) {
    const token = this.jwtService.sign(payload);
    return token;
  }

  async login(
    loginUserDto: LoginUserDto,
  ): Promise<ApiResponse<LoginUserResponseData>> {
    const { password, email } = loginUserDto;
    const emailNorm = normalizeAuthEmail(email);

    let user = await this.userModel
      .findOne({ email: emailNorm })
      .select('email password id isActive company')
      .lean();

    if (!user) throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');

    // Antes de la contraseña: si la cuenta está desactivada, mensaje claro (evita confundir con credenciales incorrectas)
    if (isUserMarkedInactive(user.isActive)) {
      if (user.company) {
        await this.membershipsService.ensureCompanyUsersActiveWhenMembershipValid(
          String(user.company),
        );
        user = await this.userModel
          .findOne({ email: emailNorm })
          .select('email password id isActive company')
          .lean();
      }
      if (!user || isUserMarkedInactive(user.isActive)) {
        throw new ForbiddenException(INACTIVE_ACCOUNT_MESSAGE);
      }
    }

    if (!bcrypt.compareSync(password, user.password))
      throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');

    const lastAccessAt = new Date();
    const updatedUser = await this.userModel
      .findOneAndUpdate(
        { id: user.id },
        { $set: { lastAccessAt } },
        { new: true },
      )
      .select('-password')
      .lean()
      .exec();

    if (!updatedUser) {
      throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');
    }

    const userPayload: PublicUser = {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      lastName: updatedUser.lastName,
      document: updatedUser.document,
      roles: updatedUser.roles,
      company: updatedUser.company,
      isActive: updatedUser.isActive,
      lastAccessAt: updatedUser.lastAccessAt
        ? new Date(updatedUser.lastAccessAt).toISOString()
        : undefined,
    };

    return {
      success: true,
      message: 'Bienvenido a Cheky!!!',
      data: {
        accessToken: this.getJwtToken({ id: user.id }),
        user: userPayload,
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
    const emailNorm = normalizeAuthEmail(email);

    const user = await this.userModel.findOne({ email: emailNorm }).lean();

    if (!user) {
      throw new NotFoundException(`No existe un usuario asociado al correo: ${email}`);
    }

    if (isUserMarkedInactive(user.isActive)) {
      throw new ForbiddenException(INACTIVE_ACCOUNT_MESSAGE);
    }

    const recoveryToken = this.getJwtToken({ id: user.id });
    const recoveryLink = `${getFrontendBaseUrl()}/auth/reset-password?token=${recoveryToken}`;

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

    if (isUserMarkedInactive(user.isActive)) {
      throw new ForbiddenException(INACTIVE_ACCOUNT_MESSAGE);
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

  async changePassword(actor: User, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.verifyPassword) {
      throw new BadRequestException('Las contraseñas nuevas no coinciden');
    }

    const user = await this.userModel
      .findOne({ id: actor.id })
      .select('id email password name lastName isActive')
      .exec();

    if (!user) {
      throw new UnauthorizedException(
        'No tiene los permisos suficientes para acceder a este recurso',
      );
    }

    if (isUserMarkedInactive(user.isActive)) {
      throw new ForbiddenException(INACTIVE_ACCOUNT_MESSAGE);
    }

    if (!bcrypt.compareSync(dto.currentPassword, user.password)) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }

    if (bcrypt.compareSync(dto.newPassword, user.password)) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta a la actual',
      );
    }

    const oldHash = user.password;
    const hashedPassword = bcrypt.hashSync(dto.newPassword, 10);
    await this.userModel.findOneAndUpdate({ id: user.id }, { password: hashedPassword });

    const displayName = [user.name, user.lastName].filter(Boolean).join(' ').trim() || user.email;
    const htmlBody = passwordChangedNotificationTemplate(displayName);
    const logoAtt = getEmailLogoAttachment();

    const emailSent = await this.emailService.sendEmail({
      to: user.email,
      subject: 'Tu contraseña en Cheky fue actualizada',
      htmlBody,
      attachements: logoAtt ? [logoAtt] : [],
    });

    if (!emailSent) {
      await this.userModel.findOneAndUpdate({ id: user.id }, { password: oldHash });
      throw new BadRequestException(
        'No se pudo enviar el correo de confirmación. Tu contraseña no fue modificada; inténtalo de nuevo más tarde.',
      );
    }

    return {
      success: true,
      message:
        'Contraseña actualizada correctamente. Te enviamos un correo de confirmación.',
      timestamp: new Date().toISOString(),
    };
  }
}

