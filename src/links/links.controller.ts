import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { LinksService } from './links.service';
import { CreateLinkDto } from './dto/create-link.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Controller()
export class LinksController {
  private readonly logger = new Logger(LinksController.name);

  constructor(private readonly linksService: LinksService) {}

  @Post('links')
  async createLink(@Body() dto: CreateLinkDto, @Res() res: Response) {
    this.logger.log(`Creating short link for URL: ${dto.url}`);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const result = await this.linksService.createLink(dto.url);

    const status = result.isNew ? HttpStatus.CREATED : HttpStatus.OK;
    return res.status(status).json({
      shortUrl: `${baseUrl}/${result.shortCode}`,
      targetUrl: result.targetUrl,
    });
  }

  @Get('stats')
  async getStats(@Query() query: PaginationQueryDto) {
    this.logger.log(`Fetching stats page=${query.page} limit=${query.limit}`);
    return this.linksService.getStats(query.page, query.limit);
  }

  @Get(':shortCode')
  async redirect(@Param('shortCode') shortCode: string, @Res() res: Response) {
    this.logger.log(`Redirecting shortCode=${shortCode}`);
    const targetUrl = await this.linksService.resolve(shortCode);

    res.redirect(HttpStatus.FOUND, targetUrl);

    this.linksService
      .recordClick(shortCode)
      .catch((err) =>
        this.logger.error(`Failed to record click for ${shortCode}`, err.stack),
      );
  }
}
