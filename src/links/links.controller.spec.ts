import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

describe('LinksController', () => {
  let controller: LinksController;
  let linksService: jest.Mocked<LinksService>;

  beforeEach(async () => {
    const mockLinksService = {
      createLink: jest.fn(),
      resolve: jest.fn(),
      recordClick: jest.fn(),
      getStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LinksController],
      providers: [{ provide: LinksService, useValue: mockLinksService }],
    }).compile();

    controller = module.get<LinksController>(LinksController);
    linksService = module.get(LinksService);
  });

  describe('POST /links', () => {
    it('should return 201 for a new link', async () => {
      linksService.createLink.mockResolvedValue({
        shortCode: 'abc12345',
        targetUrl: 'https://fiverr.com/gig',
        isNew: true,
      });

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      process.env.BASE_URL = 'http://localhost:3000';
      await controller.createLink({ url: 'https://fiverr.com/gig' }, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.CREATED);
      expect(res.json).toHaveBeenCalledWith({
        shortUrl: 'http://localhost:3000/abc12345',
        targetUrl: 'https://fiverr.com/gig',
      });
    });

    it('should return 200 for an existing link', async () => {
      linksService.createLink.mockResolvedValue({
        shortCode: 'abc12345',
        targetUrl: 'https://fiverr.com/gig',
        isNew: false,
      });

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await controller.createLink({ url: 'https://fiverr.com/gig' }, res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });
  });

  describe('GET /:shortCode', () => {
    it('should redirect with 302', async () => {
      linksService.resolve.mockResolvedValue('https://fiverr.com/gig');
      linksService.recordClick.mockResolvedValue(undefined);

      const res = {
        redirect: jest.fn(),
      } as any;

      await controller.redirect('abc12345', res);

      expect(res.redirect).toHaveBeenCalledWith(HttpStatus.FOUND, 'https://fiverr.com/gig');
    });
  });

  describe('GET /stats', () => {
    it('should return paginated stats', async () => {
      const mockStats = {
        data: [],
        meta: { page: 1, limit: 10, totalItems: 0, totalPages: 0 },
      };
      linksService.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats({ page: 1, limit: 10 });

      expect(result).toEqual(mockStats);
      expect(linksService.getStats).toHaveBeenCalledWith(1, 10);
    });
  });
});
