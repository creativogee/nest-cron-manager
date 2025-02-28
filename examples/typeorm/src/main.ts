import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(8080, () => {
    Logger.log('Server is running on http://localhost:8080', 'CronManager');
  });
}
bootstrap();
