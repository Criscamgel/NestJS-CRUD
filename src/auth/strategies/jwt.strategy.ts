import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { User } from "../../users/entities/user.entity";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { JwtPayload } from "../interfaces/JwtPayload";
import { Inject, Injectable, UnauthorizedException, forwardRef } from "@nestjs/common";
import { BlacklistedToken } from "../entities/blacklisted-token.entity";
import { MembershipsService } from "src/memberships/memberships.service";
import { isUserMarkedInactive } from "../auth.utils";
import { isUserDeactivatedByAdmin, isCompanyAdminActor } from "src/users/user-account.constants";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

    constructor(
        @InjectModel(User.name)
        private readonly userModel: Model<User>,
        @InjectModel(BlacklistedToken.name)
        private readonly blacklistedTokenModel: Model<BlacklistedToken>,
        @Inject(forwardRef(() => MembershipsService))
        private readonly membershipsService: MembershipsService,
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
                throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');
            }
        }

        const { id } = payload;
        let user = await this.userModel.findOne({ id });

        if (!user) throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');

        if (isUserMarkedInactive(user.isActive)) {
          if (isUserDeactivatedByAdmin(user.deactivationReason)) {
            throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');
          }
          if (user.company && isCompanyAdminActor(user)) {
            await this.membershipsService.reactivateCompanyAdminsDeactivatedByMembership(
              String(user.company),
            );
            user = await this.userModel.findOne({ id });
          }
          if (user?.company) {
            await this.membershipsService.ensureCompanyUsersActiveWhenMembershipValid(
              String(user.company),
            );
            user = await this.userModel.findOne({ id });
          }
        }

        if (!user || isUserMarkedInactive(user.isActive)) {
          throw new UnauthorizedException('No tiene los permisos suficientes para acceder a este recurso');
        }

        return user;
    }
}