import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateCheckDto } from './dto/create-check.dto';
import { UpdateCheckDto } from './dto/update-check.dto';
import { Model } from 'mongoose';
import { Check } from './entities/check.entity';
import { AxiosAdapter } from 'src/common/adapters/axios.adapter';
import { FootPrint } from './interfaces/footPrint.interface';
import { InjectModel } from '@nestjs/mongoose';
import { CounterId } from 'src/common/entities/counter-id.entity';

@Injectable()
export class CheckService {

  constructor(
    @InjectModel(Check.name)
    private readonly checkModel: Model<Check>,
    @InjectModel(CounterId.name)
    private readonly counterIdModel: Model<any>,
    private readonly http: AxiosAdapter
  ){}
  
  async create(createCheckDto: CreateCheckDto) {
      try {

        const counter = await this.counterIdModel.findByIdAndUpdate(
        'checks',  // ID del contador
        { $inc: { seq: 1 } },  // Incrementa +1
        { new: true, upsert: true },  // Crea si no existe, devuelve nuevo valor
      );

        createCheckDto.id = counter.seq.toString();


        const data = await this.http.post<FootPrint>(process.env.REQUEST_RISKSEAL!, createCheckDto, {
          headers: {
            'X-API-KEY': process.env.KEY_RISKSEAL!
          }
        });

        const check = await this.checkModel.create( createCheckDto );
        return {
          message: 'Check creado exitosamente',
          data: { check, data } 
        };

      } catch (error) {
       throw new BadRequestException(`Error externo: ${error}`); 
      }
  }

  findAll() {
    return `This action returns all check`;
  }

  findOne(id: number) {
    return `This action returns a #${id} check`;
  }

  update(id: number, updateCheckDto: UpdateCheckDto) {
    return `This action updates a #${id} check`;
  }

  remove(id: number) {
    return `This action removes a #${id} check`;
  }

  private handleExceptions( error: any ) {
  
      if( error.code === 11000 ) throw new BadRequestException(`Pokemon already exist in db ${ JSON.stringify( error.keyValue ) }`);
        console.log(error);
        throw new InternalServerErrorException(`Can't create Pokemon - Check Server logs`);
  
    }
}
