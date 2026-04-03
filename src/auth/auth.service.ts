import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserSchema } from './entities/user.entity';
import { Model } from 'mongoose';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { isMongoDuplicateKeyError } from 'src/common/utils/mongo-errors';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto';
import { ApiResponse } from 'src/common/interfaces/api-response.interface';
import { LoginUserResponseData } from './interfaces/LoginUserResponseData';
import { JwtPayload } from './interfaces/JwtPayload';
import { RecoverPasswordDto } from './dto/recover-password.dto';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<any>,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    try {
      const counter = await this.counterIdModel.findByIdAndUpdate(
        'users', // ID del contador
        { $inc: { seq: 1 } }, // Incrementa +1
        { new: true, upsert: true }, // Crea si no existe, devuelve nuevo valor
      );

      createUserDto.id = counter.seq.toString();

      const { password, role, ...userData } = createUserDto;

      const user = await this.userModel.create({
        ...userData,
        roles: [role],
        password: bcrypt.hashSync(password, 10),
      });

      const { password: _p, __v, _id, ...safeUser } = user.toObject();

      return {
        message: 'Usuario creado correctamente',
        data: {
          accessToken: this.getJwtToken({ id: user.id }),
          user: safeUser,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        // normalmente viene: error.keyValue o error.keyPattern
        const field = error?.keyValue
          ? Object.keys(error.keyValue)[0]
          : 'campo';
        throw new ConflictException(`Ya existe un usuario con ese ${field}`);
      }
      if (error instanceof Error) {
        throw new BadRequestException(
          error.message ?? 'Error al crear usuario',
        );
      }
      throw new BadRequestException('Error desconocido al crear usuario');
    }
  }

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
      .select('email password id') // ← SOLO estos 3 campos
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

  async recoverPassword(recoverPasswordDto: RecoverPasswordDto) {
    const { email } = recoverPasswordDto;

    const user = await this.userModel.findOne({ email }).lean();

    if (!user) {
      throw new NotFoundException(
        `No existe un usuario asociado al correo: ${email}`,
      );
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
      throw new BadRequestException(
        'Ha ocurrido un error interno al intentar enviar el correo. Por favor intente más tarde.',
      );
    }

    return {
      success: true,
      message:
        'Correo de recuperación enviado exitosamente. Verifica tu bandeja de entrada o spam.',
      timestamp: new Date().toISOString(),
    };
  }
}
