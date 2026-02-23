import { Module } from '@nestjs/common';
import { AxiosAdapter } from './adapters/axios.adapter';
import { CounterId, CounterIdSchema } from './entities/counter-id.entity';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
    imports: [
        MongooseModule.forFeature([
        { name: CounterId.name, schema: CounterIdSchema },
        ]),
    ],
    providers: [ AxiosAdapter ],
    exports: [ AxiosAdapter, MongooseModule, CommonModule ]
})
export class CommonModule {}
