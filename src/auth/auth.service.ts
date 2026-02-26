import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './entities/user.entity';
import { Model } from 'mongoose';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { isMongoDuplicateKeyError } from 'src/common/utils/mongo-errors';

@Injectable()
export class AuthService {

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<any>
  ) {}

  async create(createUserDto: CreateUserDto) {
    
    try {

      const counter = await this.counterIdModel.findByIdAndUpdate(
        'users',  // ID del contador
        { $inc: { seq: 1 } },  // Incrementa +1
        { new: true, upsert: true },  // Crea si no existe, devuelve nuevo valor
      );

        createUserDto.id = counter.seq.toString();

      const user = await this.userModel.create( createUserDto );
      return {
        message: 'Usuario creado correctamente',
        data: { user }
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
}
