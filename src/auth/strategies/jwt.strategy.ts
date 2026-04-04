import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { User } from "../../users/entities/user.entity";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { JwtPayload } from "../interfaces/JwtPayload";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { BlacklistedToken } from "../entities/blacklisted-token.entity";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

    constructor(
        @InjectModel(User.name)
        private readonly userModel: Model<User>,
        @InjectModel(BlacklistedToken.name)
        private readonly blacklistedTokenModel: Model<BlacklistedToken>,
        configService: ConfigService
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: configService.get('JWT_SECRET') as string,
            passReqToCallback: true,
        });
    }

    async validate(req: any, payload: JwtPayload): Promise<User> {
        const authHeader = req.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : null;

        if (token) {
            const isBlacklisted = await this.blacklistedTokenModel.findOne({ token });
            if (isBlacklisted) {
                throw new UnauthorizedException('Su sesión ha expirado o ha sido cerrada');
            }
        }

        const { id } = payload;
        const user = await this.userModel.findOne({ id });

        if (!user) throw new UnauthorizedException('Token no válido');
        if (!user.isActive) throw new UnauthorizedException('Usuario inactivo, comuniquese con el administrador');

        return user;
    }
}