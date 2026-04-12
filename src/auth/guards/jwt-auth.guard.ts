import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard JWT personalizado que sobreescribe el mensaje genérico de Passport
 * ("Unauthorized") con el mensaje estándar de la aplicación.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw new UnauthorizedException(
        'No tiene los permisos suficientes para acceder a este recurso',
      );
    }
    return user;
  }
}
