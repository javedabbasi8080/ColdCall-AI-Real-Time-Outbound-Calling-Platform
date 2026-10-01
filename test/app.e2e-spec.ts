import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validationPipe } from './../src/common/pipes/validation.pipe';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(validationPipe);
    await app.init();
  });

  it('/auth/login (POST) requires credentials', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'invalid@test.com', password: 'wrong' })
      .expect(401);
  });
});
