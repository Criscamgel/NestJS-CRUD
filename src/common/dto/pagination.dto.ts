import { IsInt, IsNumber, IsOptional, IsPositive, Min } from "class-validator";

export class PaginationDto {

    @IsOptional()
    @IsPositive()
    @IsNumber()
    @IsInt()
    @Min(1)    
    limit?: number;

    @IsOptional()
    @IsPositive()
    @IsNumber()
    @IsInt()
    offset?: number;

}