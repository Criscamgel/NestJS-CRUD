import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './entities/user.entity';
import { Company } from '../company/entities/company.entity';
import { Model } from 'mongoose';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { isMongoDuplicateKeyError } from 'src/common/utils/mongo-errors';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<any>,
    private readonly jwtService: JwtService,
  ) {}

  async create(createUserDto: CreateUserDto, creator: User) {
    if (creator.roles?.includes('admin')) {
      if (createUserDto.role !== 'user') {
        throw new UnauthorizedException(
          'Los admin solo pueden crear usuarios de tipo user',
        );
      }
      
      // Inherit the company from the admin creator
      if (!creator.company) {
        throw new BadRequestException('El usuario administrador no está vinculado a una compañía válida');
      }
      createUserDto.company = creator.company;
      
      // Verify that the inherited company actually exists
      const companyExists = await this.companyModel.findOne({ id: creator.company });
      if (!companyExists) {
        throw new NotFoundException(`La compañía con id ${creator.company} asociada al administrador no existe`);
      }

    } else if (creator.roles?.includes('superAdmin')) {
      if (createUserDto.role !== 'admin' && createUserDto.role !== 'user') {
        throw new UnauthorizedException(
          'Los superAdmin solo pueden crear usuarios de tipo admin o user',
        );
      }
      
      if (!createUserDto.company) {
        throw new BadRequestException(
          'Debe especificar la propiedad "company" (empresa) al crear el usuario',
        );
      }

      // Convert to string safely in case an integer was sent by mistake, though the DTO enforces strings
      const companyId = String(createUserDto.company);
      
      if (!/^\d+$/.test(companyId)) {
        throw new BadRequestException('El id de la compañía no es válido, debe ser un valor entero (ej. "1", "2")');
      }

      const companyExists = await this.companyModel.findOne({ id: companyId });
      if (!companyExists) {
        throw new NotFoundException(`La compañía con id ${companyId} no existe`);
      }

      createUserDto.company = companyId;

    } else {
      throw new UnauthorizedException(
        'No tienes permisos suficientes para crear usuarios',
      );
    }

    try {
      const counter = await this.counterIdModel.findByIdAndUpdate(
        'users',
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
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
          accessToken: this.jwtService.sign({ id: user.id }),
          user: safeUser,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      if (isMongoDuplicateKeyError(error)) {
        const field = error?.keyValue ? Object.keys(error.keyValue)[0] : 'campo';
        throw new ConflictException(`Ya existe un usuario con ese ${field}`);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message ?? 'Error al crear usuario');
      }
      throw new BadRequestException('Error desconocido al crear usuario');
    }
  }

  async findAllUsers() {
    return this.userModel.find().select('-password').exec();
  }

  async toggleUserStatus(id: string) {
    const user = await this.userModel.findOne({ id });
    if (!user) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }
    
    user.isActive = !user.isActive;
    await user.save();
    
    return { message: `Usuario ${user.isActive ? 'activado' : 'desactivado'} exitosamente` };
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto, editor: User) {
    const targetUser = await this.userModel.findOne({ id });
    if (!targetUser) {
      throw new NotFoundException(`Usuario con id ${id} no encontrado`);
    }

    if (editor.roles?.includes('admin')) {
      if (!targetUser.roles?.includes('user')) {
        throw new UnauthorizedException('Los admin solo pueden editar usuarios de tipo user');
      }
    } else if (editor.roles?.includes('superAdmin')) {
      if (!targetUser.roles?.includes('admin') && !targetUser.roles?.includes('user')) {
        throw new UnauthorizedException('Los superAdmin solo pueden editar usuarios de tipo admin o user');
      }
    } else {
      throw new UnauthorizedException('No tienes permisos suficientes para editar usuarios');
    }

    const asAny = updateUserDto as any;

    if (asAny.password) {
      asAny.password = bcrypt.hashSync(asAny.password, 10);
    }

    if (asAny.role) {
      asAny['roles'] = [asAny.role];
    }
    
    const { role, ...updatePayload } = asAny;

    const updatedUser = await this.userModel.findOneAndUpdate(
      { id },
      updatePayload,
      { new: true }
    ).select('-password').exec();

    return {
      message: 'Usuario actualizado exitosamente',
      user: updatedUser
    };
  }
}
