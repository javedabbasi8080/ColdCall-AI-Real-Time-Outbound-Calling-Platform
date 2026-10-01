import { NestFactory } from '@nestjs/core';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { MediaStreamServer } from './calls/realtime/media-stream.server';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { validationPipe } from './common/pipes/validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(validationPipe);
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.use(bodyParser.urlencoded({ extended: false }));

  app.enableCors();

  const port = process.env.PORT || 3008;
  await app.listen(port);

  // Attach Twilio Media Streams WebSocket to same HTTP server (wss via ngrok)
  const mediaStreams = app.get(MediaStreamServer);
  mediaStreams.attachToHttpServer(app.getHttpServer());

  console.log(`Cold Calling API running on port ${port}`);
  console.log(`Realtime Media Streams WS: /calls/media-stream`);
}
bootstrap();
