import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
} from '../dto/pagination-query.dto';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function resolvePagination(query: {
  page?: number;
  limit?: number;
}): { page: number; limit: number; skip: number } {
  const page =
    query.page != null && query.page > 0 ? Math.floor(query.page) : DEFAULT_PAGE;
  const rawLimit =
    query.limit != null && query.limit > 0
      ? Math.floor(query.limit)
      : DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return { total, page, limit, totalPages };
}
