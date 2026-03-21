import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { User } from "../entities/user.entity";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ConfigService } from "@nestjs/config";
import { JwtPayload } from "../interfaces/JwtPayload";
import { Injectable, UnauthorizedException } from "@nestjs/common";

@Injectable()
export class JwtStrategy extends PassportStrategy( Strategy ) {

    constructor(
        @InjectModel( User.name )
        private readonly userModel: Model<User>,
        configService: ConfigService 
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            //ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET') as string,
        });
    }


    async validate( payload: JwtPayload ): Promise<User> {

        const { email } = payload;
        const user = await this.userModel.findOne({ email });

        if( !user ) throw new UnauthorizedException( 'Token no válido' );
        if( !user.isActive ) throw new UnauthorizedException( 'Usuario inactivo, comuniquese con el administrador' );

        return user;
    }

}