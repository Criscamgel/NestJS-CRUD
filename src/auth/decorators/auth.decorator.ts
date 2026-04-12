import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ValidRoles } from '../interfaces';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { UserRoleGuard } from '../guards/user-role.guard';
import { RoleProtected } from './role-protected.decorator';

export function Auth(...roles: ValidRoles[]) {
    return applyDecorators(
        RoleProtected(...roles),
        UseGuards(JwtAuthGuard, UserRoleGuard)
    );
}