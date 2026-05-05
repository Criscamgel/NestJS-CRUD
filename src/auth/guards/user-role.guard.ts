import { CanActivate, ExecutionContext, Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { META_ROLES } from '../decorators/role-protected.decorator';

@Injectable()
export class UserRoleGuard implements CanActivate {

  constructor(
    private readonly reflector: Reflector
  ) { }


  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {

    const validRoles: string[] = this.reflector.get(META_ROLES, context.getHandler());
    if (!validRoles || validRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) throw new BadRequestException('Usuario no encontrado');

    const fromArray = Array.isArray(user.roles) ? user.roles : [];
    const legacy = (user as { role?: string }).role?.trim();
    const effectiveRoles =
      legacy && !fromArray.includes(legacy) ? [...fromArray, legacy] : [...fromArray];

    for (const role of effectiveRoles) {
      if (validRoles.includes(role)) {
        return true;
      }
    }

    throw new ForbiddenException('No tiene los permisos suficientes para acceder a este recurso');

  }
}
