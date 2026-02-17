import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LinksService } from './links.service';
import { PrismaService } from '../prisma/prisma.service';
import { FraudService } from '../fraud/fraud.service';

describe('LinksService', () => {
  let service: LinksService;
  let prisma: any;
  let fraudService: any;

  beforeEach(async () => {
    const mockPrisma = {
      link: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
      },
      click: {
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    const mockFraud = {
      validate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LinksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FraudService, useValue: mockFraud },
      ],
    }).compile();

    service = module.get<LinksService>(LinksService);
    prisma = module.get(PrismaService);
    fraudService = module.get(FraudService);
  });

  describe('createLink', () => {
    it('should return existing link if targetUrl already exists', async () => {
      prisma.link.findUnique.mockResolvedValue({
        id: 1,
        shortCode: 'abc12345',
        targetUrl: 'https://fiverr.com/gig',
        createdAt: new Date(),
      });

      const result = await service.createLink('https://fiverr.com/gig');

      expect(result.shortCode).toBe('abc12345');
      expect(result.isNew).toBe(false);
      expect(prisma.link.create).not.toHaveBeenCalled();
    });

    it('should create a new link when targetUrl does not exist', async () => {
      prisma.link.findUnique.mockResolvedValue(null);
      prisma.link.create.mockResolvedValue({
        id: 1,
        shortCode: 'new12345',
        targetUrl: 'https://fiverr.com/new',
        createdAt: new Date(),
      });

      const result = await service.createLink('https://fiverr.com/new');

      expect(result.isNew).toBe(true);
      expect(result.targetUrl).toBe('https://fiverr.com/new');
      expect(prisma.link.create).toHaveBeenCalledTimes(1);
    });

    it('should retry on shortCode collision', async () => {
      prisma.link.findUnique.mockResolvedValue(null);
      const collisionError = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['short_code'] },
      });
      prisma.link.create
        .mockRejectedValueOnce(collisionError)
        .mockResolvedValueOnce({
          id: 1,
          shortCode: 'retry123',
          targetUrl: 'https://fiverr.com/retry',
          createdAt: new Date(),
        });

      const result = await service.createLink('https://fiverr.com/retry');

      expect(result.shortCode).toBe('retry123');
      expect(prisma.link.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolve', () => {
    it('should return the target URL for a valid short code', async () => {
      prisma.link.findUnique.mockResolvedValue({
        id: 1,
        shortCode: 'abc12345',
        targetUrl: 'https://fiverr.com/gig',
        createdAt: new Date(),
      });

      const result = await service.resolve('abc12345');
      expect(result).toBe('https://fiverr.com/gig');
    });

    it('should throw NotFoundException for invalid short code', async () => {
      prisma.link.findUnique.mockResolvedValue(null);

      await expect(service.resolve('nonexist')).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordClick', () => {
    it('should record a valid click with earned credit', async () => {
      prisma.link.findUnique.mockResolvedValue({
        id: 1,
        shortCode: 'abc12345',
        targetUrl: 'https://fiverr.com/gig',
        createdAt: new Date(),
      });
      fraudService.validate.mockResolvedValue(true);

      await service.recordClick('abc12345');

      expect(prisma.click.create).toHaveBeenCalledWith({
        data: {
          linkId: 1,
          isValid: true,
          earnedCredit: new Prisma.Decimal('0.05'),
        },
      });
    });

    it('should record an invalid click with zero credit', async () => {
      prisma.link.findUnique.mockResolvedValue({
        id: 1,
        shortCode: 'abc12345',
        targetUrl: 'https://fiverr.com/gig',
        createdAt: new Date(),
      });
      fraudService.validate.mockResolvedValue(false);

      await service.recordClick('abc12345');

      expect(prisma.click.create).toHaveBeenCalledWith({
        data: {
          linkId: 1,
          isValid: false,
          earnedCredit: new Prisma.Decimal('0.00'),
        },
      });
    });

    it('should silently return if link not found', async () => {
      prisma.link.findUnique.mockResolvedValue(null);

      await service.recordClick('nonexist');

      expect(fraudService.validate).not.toHaveBeenCalled();
      expect(prisma.click.create).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should return paginated stats with monthly breakdown', async () => {
      prisma.link.findMany.mockResolvedValue([
        { id: 1, shortCode: 'abc12345', targetUrl: 'https://fiverr.com/gig', createdAt: new Date() },
      ]);
      prisma.link.count.mockResolvedValue(1);
      prisma.click.aggregate.mockResolvedValue({
        _count: 5,
        _sum: { earnedCredit: new Prisma.Decimal('0.15') },
        _min: {},
        _max: {},
        _avg: {},
      });
      prisma.$queryRaw.mockResolvedValue([
        { month: new Date('2025-12-01'), clicks: BigInt(3), earnings: new Prisma.Decimal('0.10') },
        { month: new Date('2026-01-01'), clicks: BigInt(2), earnings: new Prisma.Decimal('0.05') },
      ]);

      const result = await service.getStats(1, 10);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].shortCode).toBe('abc12345');
      expect(result.data[0].totalClicks).toBe(5);
      expect(result.data[0].totalEarnings).toBe('0.15');
      expect(result.data[0].monthlyBreakdown).toEqual([
        { month: '12/2025', clicks: 3, earnings: '0.10' },
        { month: '01/2026', clicks: 2, earnings: '0.05' },
      ]);
      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        totalItems: 1,
        totalPages: 1,
      });
    });
  });
});
