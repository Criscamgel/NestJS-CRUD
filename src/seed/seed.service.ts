import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from 'src/users/entities/user.entity';
import { CounterId } from 'src/common/entities/counter-id.entity';
import { SeedUser } from './interfaces/seed-users.interface';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<any>,
  ) {}

  async executedSeed(): Promise<object> {
    // ── 1. Leer datos sensibles desde variables de entorno ──────────────────
    const superAdmins = this.buildSuperAdminsFromEnv();

    // ── 2. Verificar si ya existe algún superAdmin en la BD ──────────────────
    const existingSuperAdmins = await this.userModel.find({
      roles: { $in: ['superAdmin'] },
    });

    if (existingSuperAdmins.length > 0) {
      this.logger.warn('El seed ya fue ejecutado: superAdmins ya existen en la BD.');
      return {
        message: 'El seed ya fue ejecutado anteriormente. No se realizaron cambios.',
        existingSuperAdmins: existingSuperAdmins.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          lastName: u.lastName,
        })),
      };
    }

    // ── 3. Crear los superAdmins ─────────────────────────────────────────────
    const createdUsers: Partial<User>[] = [];

    for (const adminData of superAdmins) {
      const counter = await this.counterIdModel.findByIdAndUpdate(
        'users',
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
      );

      const user = await this.userModel.create({
        id: counter.seq.toString(),
        email: adminData.email,
        document: adminData.document,
        password: bcrypt.hashSync(adminData.password, 10),
        name: adminData.name,
        lastName: adminData.lastName,
        roles: adminData.roles,
        isActive: adminData.isActive,
      });

      const { password: _p, __v, _id, ...safeUser } = user.toObject();
      createdUsers.push(safeUser);

      this.logger.log(`SuperAdmin creado: ${user.email}`);
    }

    return {
      message: `Seed ejecutado correctamente. Se crearon ${createdUsers.length} superAdmin(s).`,
      data: {
        users: createdUsers,
      },
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Construye los datos de los superAdmins exclusivamente desde variables de entorno.
   * - Admin 1: OBLIGATORIO. Lanza error si falta alguna de sus variables.
   * - Admin 2: OPCIONAL. Si no se define ninguna de sus variables, se omite.
   *   Si se define alguna pero no todas, lanza error indicando cuáles faltan.
   */
  private buildSuperAdminsFromEnv(): SeedUser[] {
    // ── Admin 1: obligatorio ─────────────────────────────────────────────────
    const admin1Keys = [
      'SEED_ADMIN1_EMAIL',
      'SEED_ADMIN1_DOCUMENT',
      'SEED_ADMIN1_PASSWORD',
      'SEED_ADMIN1_NAME',
      'SEED_ADMIN1_LASTNAME',
    ];
    const missingAdmin1 = admin1Keys.filter((key) => !process.env[key]);
    if (missingAdmin1.length > 0) {
      throw new BadRequestException(
        `Faltan variables de entorno del superAdmin 1: ${missingAdmin1.join(', ')}`,
      );
    }

    const admins: SeedUser[] = [
      {
        id: '',
        email: process.env.SEED_ADMIN1_EMAIL!,
        document: process.env.SEED_ADMIN1_DOCUMENT!,
        password: process.env.SEED_ADMIN1_PASSWORD!,
        name: process.env.SEED_ADMIN1_NAME!,
        lastName: process.env.SEED_ADMIN1_LASTNAME!,
        roles: ['superAdmin'],
        isActive: true,
      },
    ];

    // ── Admin 2: opcional ────────────────────────────────────────────────────
    const admin2Keys = [
      'SEED_ADMIN2_EMAIL',
      'SEED_ADMIN2_DOCUMENT',
      'SEED_ADMIN2_PASSWORD',
      'SEED_ADMIN2_NAME',
      'SEED_ADMIN2_LASTNAME',
    ];
    const definedAdmin2Keys = admin2Keys.filter((key) => !!process.env[key]);

    if (definedAdmin2Keys.length > 0) {
      // Si al menos una variable del admin 2 está definida, todas deben estarlo
      const missingAdmin2 = admin2Keys.filter((key) => !process.env[key]);
      if (missingAdmin2.length > 0) {
        throw new BadRequestException(
          `Faltan variables de entorno del superAdmin 2 (o elimínalas todas para omitirlo): ${missingAdmin2.join(', ')}`,
        );
      }

      admins.push({
        id: '',
        email: process.env.SEED_ADMIN2_EMAIL!,
        document: process.env.SEED_ADMIN2_DOCUMENT!,
        password: process.env.SEED_ADMIN2_PASSWORD!,
        name: process.env.SEED_ADMIN2_NAME!,
        lastName: process.env.SEED_ADMIN2_LASTNAME!,
        roles: ['superAdmin'],
        isActive: true,
      });
    }

    return admins;
  }
}
