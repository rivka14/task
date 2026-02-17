import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Links (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    prisma = app.get(PrismaService);
    await app.init();

    // Clean DB before tests
    await prisma.click.deleteMany();
    await prisma.link.deleteMany();
  });

  afterAll(async () => {
    await prisma.click.deleteMany();
    await prisma.link.deleteMany();
    await app.close();
  });

  describe('POST /links', () => {
    it('should create a new short link (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/links')
        .send({ url: 'https://fiverr.com/signup' })
        .expect(201);

      expect(res.body.shortUrl).toBeDefined();
      expect(res.body.targetUrl).toBe('https://fiverr.com/signup');
    });

    it('should return existing link for duplicate URL (200)', async () => {
      const res = await request(app.getHttpServer())
        .post('/links')
        .send({ url: 'https://fiverr.com/signup' })
        .expect(200);

      expect(res.body.targetUrl).toBe('https://fiverr.com/signup');
    });

    it('should reject invalid URL (400)', async () => {
      await request(app.getHttpServer())
        .post('/links')
        .send({ url: 'not-a-url' })
        .expect(400);
    });

    it('should reject missing body (400)', async () => {
      await request(app.getHttpServer())
        .post('/links')
        .send({})
        .expect(400);
    });

    it('should reject empty URL (400)', async () => {
      await request(app.getHttpServer())
        .post('/links')
        .send({ url: '' })
        .expect(400);
    });
  });

  describe('GET /:shortCode', () => {
    it('should redirect to target URL (302)', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/links')
        .send({ url: 'https://fiverr.com/redirect-test' });

      const shortCode = createRes.body.shortUrl.split('/').pop();

      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .expect(302)
        .expect('Location', 'https://fiverr.com/redirect-test');
    });

    it('should return 404 for nonexistent short code', async () => {
      await request(app.getHttpServer())
        .get('/nonexist')
        .expect(404);
    });
  });

  describe('GET /stats', () => {
    it('should return paginated stats', async () => {
      const res = await request(app.getHttpServer())
        .get('/stats')
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(10);
    });

    it('should respect pagination params', async () => {
      const res = await request(app.getHttpServer())
        .get('/stats?page=1&limit=5')
        .expect(200);

      expect(res.body.meta.limit).toBe(5);
    });

    it('should reject invalid pagination', async () => {
      await request(app.getHttpServer())
        .get('/stats?page=0')
        .expect(400);
    });
  });

  describe('Full flow', () => {
    it('should create link, click it, and see stats', async () => {
      // Create a link
      const createRes = await request(app.getHttpServer())
        .post('/links')
        .send({ url: 'https://fiverr.com/full-flow-test' })
        .expect(201);

      const shortCode = createRes.body.shortUrl.split('/').pop();

      // Click it (redirect)
      await request(app.getHttpServer())
        .get(`/${shortCode}`)
        .expect(302);

      // Wait for async click recording
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check stats
      const statsRes = await request(app.getHttpServer())
        .get('/stats')
        .expect(200);

      const linkStats = statsRes.body.data.find(
        (item: any) => item.shortCode === shortCode,
      );

      expect(linkStats).toBeDefined();
      expect(linkStats.totalClicks).toBeGreaterThanOrEqual(1);
      expect(linkStats.monthlyBreakdown.length).toBeGreaterThanOrEqual(1);
    });
  });
});
