import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
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


@Injectable()
export class AuthService {

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<any>,
    private readonly jwtService: JwtService,
  ) { }

  async create(createUserDto: CreateUserDto) {

    try {

      const counter = await this.counterIdModel.findByIdAndUpdate(
        'users',  // ID del contador
        { $inc: { seq: 1 } },  // Incrementa +1
        { new: true, upsert: true },  // Crea si no existe, devuelve nuevo valor
      );

      createUserDto.id = counter.seq.toString();

      const { password, ...userData } = createUserDto;

      const user = await this.userModel.create({
        ...userData,
        password: bcrypt.hashSync(password, 10)
      });

      const { password: _p, __v, _id, ...safeUser } = user.toObject();

      return {
        message: 'Usuario creado correctamente',
        data: {
          accessToken: this.getJwtToken({ id: user.id }),
          user: safeUser
        },
        timestamp: new Date().toISOString()
      }
    } catch (error: unknown) {

      if (isMongoDuplicateKeyError(error)) {
        // normalmente viene: error.keyValue o error.keyPattern
        const field = error?.keyValue ? Object.keys(error.keyValue)[0] : 'campo';
        throw new ConflictException(`Ya existe un usuario con ese ${field}`);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message ?? 'Error al crear usuario');
      }
      throw new BadRequestException('Error desconocido al crear usuario');
    }

  }

  private getJwtToken(payload: JwtPayload) {

    const token = this.jwtService.sign(payload);
    return token;
  }

  async login(loginUserDto: LoginUserDto): Promise<ApiResponse<LoginUserResponseData>> {

    const { password, email } = loginUserDto;

    const user = await this.userModel.findOne({ email })
      .select('email password id')  // ← SOLO estos 3 campos
      .lean();

    if (!user) throw new UnauthorizedException('Usuario no encontrado (email)');
    if (!bcrypt.compareSync(password, user.password)) throw new UnauthorizedException('Contraseña invalida o incorrecta');

    return {
      success: true,
      message: 'Bienvenido a Cheky!!!',
      data: {
        accessToken: this.getJwtToken({ id: user.id }),
        user: {
          id: user.id,
          email: user.email,
          password: user.password
        }
      },
      timestamp: new Date().toISOString()
    };
  }
}
