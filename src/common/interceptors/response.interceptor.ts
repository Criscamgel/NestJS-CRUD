
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data: any) => {
        // Si tus handlers ya devuelven { data, message, meta } lo respetas;
        // si no, lo envuelves directo en data.
        const payload = {
          success: true,
          message: data?.message ?? 'Request successful',
          data: data?.data ?? data,
          meta: data?.meta,
          timestamp: new Date().toISOString(),
        };

        return payload;
      }),
    );
  }
}
