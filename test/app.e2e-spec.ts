import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  jest.setTimeout(20000);

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('Availability Board flow (e2e)', async () => {
    const server = app.getHttpServer();

    const createUser = async (name: string, email: string) => {
      const res = await request(server)
        .post('/api/v1/users')
        .send({ name, email, tags: [] })
        .expect(201);
      return res.body as { id: string };
    };

    const u1 = await createUser('User One', 'user1@example.com');
    const u2 = await createUser('User Two', 'user2@example.com');
    const u3 = await createUser('User Three', 'user3@example.com');

    await request(server)
      .put(`/api/v1/users/${u1.id}/tags`)
      .send({ add: ['backend'], remove: [] })
      .expect(200);

    await request(server)
      .put(`/api/v1/users/${u2.id}/tags`)
      .send({ add: ['frontend'], remove: [] })
      .expect(200);

    await request(server)
      .put(`/api/v1/users/${u3.id}/tags`)
      .send({ add: ['backend'], remove: [] })
      .expect(200);

    await request(server)
      .post(`/api/v1/users/${u1.id}/busy`)
      .send({
        from: '2026-02-06T11:00:00Z',
        to: '2026-02-06T12:30:00Z',
        reason: 'User1 meeting',
      })
      .expect(201);

    await request(server)
      .post(`/api/v1/users/${u2.id}/busy`)
      .send({
        from: '2026-02-06T11:15:00Z',
        to: '2026-02-06T11:45:00Z',
        reason: 'User2 focus',
      })
      .expect(201);

    await request(server)
      .post(`/api/v1/users/${u3.id}/busy`)
      .send({
        from: '2026-02-06T12:00:00Z',
        to: '2026-02-06T13:00:00Z',
        reason: 'User3 interview',
      })
      .expect(201);

    const backend_11_12 = await request(server)
      .get('/api/v1/availability/free-users')
      .query({
        from: '2026-02-06T11:00:00Z',
        to: '2026-02-06T12:00:00Z',
        tags: 'backend',
      })
      .expect(200);

    expect(backend_11_12.body.map((u: any) => u.id).sort()).toEqual([u3.id]);

    const backend_1230_13 = await request(server)
      .get('/api/v1/availability/free-users')
      .query({
        from: '2026-02-06T12:30:00Z',
        to: '2026-02-06T13:00:00Z',
        tags: 'backend',
      })
      .expect(200);

    expect(backend_1230_13.body.map((u: any) => u.id).sort()).toEqual([u1.id]);

    const frontend_11_12 = await request(server)
      .get('/api/v1/availability/free-users')
      .query({
        from: '2026-02-06T11:00:00Z',
        to: '2026-02-06T12:00:00Z',
        tags: 'frontend',
      })
      .expect(200);

    expect(frontend_11_12.body).toEqual([]);

    const frontend_1145_1230 = await request(server)
      .get('/api/v1/availability/free-users')
      .query({
        from: '2026-02-06T11:45:00Z',
        to: '2026-02-06T12:30:00Z',
        tags: 'frontend',
      })
      .expect(200);

    expect(frontend_1145_1230.body.map((u: any) => u.id).sort()).toEqual([u2.id]);
  });
});
